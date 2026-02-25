import { mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { closeBrowserSession, createBrowserSession } from "../../src/browser.js";
import { extractDayMatches } from "../../src/extract/dayMatches.js";
import { extractMatchPageRef } from "../../src/extract/matchPage.js";
import { isSinglesMatch } from "../../src/extract/playerProfile.js";
import { Logger } from "../../src/logger.js";
import { collectPlayerStats } from "../../src/orchestrator/playerHistory.js";
import { hasRequiredHistoryCoverage } from "../../src/orchestrator/historyScan.js";
import { REQUIRED_HISTORY_COUNT } from "../../src/orchestrator/constants.js";
import { predict } from "../../src/predictor.js";
import { runOutcomeAudit, type OutcomePredictionInput, type OutcomeMatchRecord } from "../../src/audit/outcomeAudit.js";
import type { PredictionResult, RunConfig } from "../../src/types.js";

const ENTRY_URL = "https://www.flashscore.co.ke/tennis/";
const DEFAULT_TARGET_PREDICTIONS = 30;
const DEFAULT_ARTIFACT_PREFIX = "hybrid-shadow-30";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_GOTO_RETRIES = 4;
const DEFAULT_HISTORY_STATS_MISS_BUDGET = 3;
const DEFAULT_OUTCOME_TIMEOUT_MS = 25_000;
const DEFAULT_OUTCOME_RETRIES = 2;
const DEFAULT_CANDIDATE_SCAN_LIMIT_MIN = 120;
const DEFAULT_DAYS_BACK = 0;
const PREV_DAY_BUTTON_SELECTOR =
  'button[aria-label*="Предыдущий день"], button[aria-label*="Попередній день"], button[aria-label*="Previous day"]';

async function main(): Promise<void> {
  const logger = new Logger({ debugEnabled: false });
  const argv = process.argv.slice(2);
  const seedPredictionsFile = readArg(argv, "seed-predictions-file");
  const entryUrl = (readArg(argv, "entry-url") || ENTRY_URL).trim() || ENTRY_URL;
  const targetPredictions = readIntArg(argv, "target-predictions") ?? DEFAULT_TARGET_PREDICTIONS;
  const artifactPrefix = (readArg(argv, "artifact-prefix") || DEFAULT_ARTIFACT_PREFIX).trim();
  const timeoutMs = readIntArg(argv, "timeout-ms") ?? DEFAULT_TIMEOUT_MS;
  const maxGotoRetries = readIntArg(argv, "max-goto-retries") ?? DEFAULT_MAX_GOTO_RETRIES;
  const historyStatsMissBudget =
    readIntArg(argv, "history-stats-miss-budget") ?? DEFAULT_HISTORY_STATS_MISS_BUDGET;
  const outcomeTimeoutMs = readIntArg(argv, "outcome-timeout-ms") ?? DEFAULT_OUTCOME_TIMEOUT_MS;
  const outcomeRetries = readIntArg(argv, "outcome-retries") ?? DEFAULT_OUTCOME_RETRIES;
  const daysBack = readIntArg(argv, "days-back") ?? DEFAULT_DAYS_BACK;
  const candidateScanLimit =
    readIntArg(argv, "candidate-scan-limit") ??
    Math.max(DEFAULT_CANDIDATE_SCAN_LIMIT_MIN, targetPredictions * 6);

  if (targetPredictions <= 0) {
    throw new Error("--target-predictions must be > 0");
  }
  if (!artifactPrefix) {
    throw new Error("--artifact-prefix must not be empty");
  }
  if (timeoutMs <= 0) throw new Error("--timeout-ms must be > 0");
  if (maxGotoRetries < 0) throw new Error("--max-goto-retries must be >= 0");
  if (historyStatsMissBudget < 0) throw new Error("--history-stats-miss-budget must be >= 0");
  if (outcomeTimeoutMs <= 0) throw new Error("--outcome-timeout-ms must be > 0");
  if (outcomeRetries < 0) throw new Error("--outcome-retries must be >= 0");
  if (candidateScanLimit <= 0) throw new Error("--candidate-scan-limit must be > 0");
  if (daysBack < 0) throw new Error("--days-back must be >= 0");

  const artifacts = {
    predictions: `tmp/${artifactPrefix}-predictions.json`,
    outcomeInput: `tmp/${artifactPrefix}-outcome-input.json`,
    joined: `tmp/${artifactPrefix}-joined.json`,
    report: `tmp/${artifactPrefix}-report.json`,
  } as const;

  const config: RunConfig = {
    entryUrl: entryUrl,
    status: "finished",
    limit: undefined,
    recentCount: 5,
    headed: false,
    slowMo: 0,
    timeoutMs,
    telegram: false,
    console: false,
    maxGotoRetries,
    historyStatsMissBudget,
    tgSendMaxRpm: 18,
    telegramToken: undefined,
    telegramChatId: undefined,
  };

  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  const session = await createBrowserSession(config);
  const seededMatches = seedPredictionsFile
    ? await loadSeedMatches(seedPredictionsFile)
    : undefined;

  const predictions: PredictionResult[] = [];
  let processed = 0;
  let parserErrors = 0;
  let skippedDoubles = 0;
  let skippedStrict5 = 0;
  let skippedFastStrict5 = 0;
  let dayCollectionDaysVisited = 0;
  let dayCollectionUniqueCandidates = 0;

  try {
    let scoped:
      | Array<{
          id: string;
          url: string;
          playerAName: string;
          playerBName: string;
          status: "finished";
        }>
      | ReturnType<typeof toSeedDayMatchList>;

    if (seededMatches && seededMatches.length > 0) {
      scoped = toSeedDayMatchList(seededMatches);
      dayCollectionDaysVisited = 0;
      dayCollectionUniqueCandidates = scoped.length;
      logger.info(
        `Using seeded benchmark set from ${seedPredictionsFile}: ${scoped.length} matches (finished singles).`,
      );
    } else {
      if (daysBack > 0) {
        const multiDay = await collectFinishedCandidatesAcrossDays(
          session.page,
          config,
          logger,
          daysBack,
          candidateScanLimit,
        );
        dayCollectionDaysVisited = multiDay.daysVisited;
        dayCollectionUniqueCandidates = multiDay.uniqueCandidates;
        logger.info(
          `Multi-day collection: days_visited=${multiDay.daysVisited}, unique_finished=${multiDay.uniqueCandidates}, ` +
            `scoped=${multiDay.matches.length}, target=${targetPredictions}`,
        );
        scoped = multiDay.matches;
      } else {
        logger.info(`Loading day page: ${config.entryUrl}`);
        const dayMatches = await extractDayMatches(session.page, config, logger);
        const finishedMatches = prioritizeFinishedMatches(dayMatches.filter((m) => m.status === "finished"));
        dayCollectionDaysVisited = 1;
        dayCollectionUniqueCandidates = finishedMatches.length;
        logger.info(
          `Day matches total=${dayMatches.length}, finished=${finishedMatches.length}. ` +
            `Target predictions=${targetPredictions}`,
        );
        scoped = finishedMatches.slice(0, candidateScanLimit);
      }
    }

    for (let i = 0; i < scoped.length; i += 1) {
      if (predictions.length >= targetPredictions) {
        break;
      }
      const dayMatch = scoped[i]!;
      processed += 1;
      logger.info(
        `[${processed}/${scoped.length}] ${dayMatch.playerAName} vs ${dayMatch.playerBName} (${dayMatch.status})`,
      );

      try {
        const matchRef = await extractMatchPageRef(session.page, dayMatch, config, logger);
        const [playerA, playerB] = matchRef.players;

        if (matchRef.isDoublesHint === true || !isSinglesMatch(playerA.name, playerB.name)) {
          skippedDoubles += 1;
          continue;
        }

        const playerAStats = await collectPlayerStats({
          page: session.page,
          player: playerA,
          targetMatchUrl: matchRef.url,
          config,
          logger,
          requiredHistoryCount: REQUIRED_HISTORY_COUNT,
        });

        if (
          playerAStats.parsedMatches.length < REQUIRED_HISTORY_COUNT &&
          playerAStats.historyScanStats?.earlyStopReason === "stats_miss_budget_reached"
        ) {
          skippedFastStrict5 += 1;
          continue;
        }

        const playerBStats = await collectPlayerStats({
          page: session.page,
          player: playerB,
          targetMatchUrl: matchRef.url,
          config,
          logger,
          requiredHistoryCount: REQUIRED_HISTORY_COUNT,
        });

        if (!hasRequiredHistoryCoverage(playerAStats, playerBStats, REQUIRED_HISTORY_COUNT)) {
          skippedStrict5 += 1;
          continue;
        }

        const prediction = predict(
          {
            matchUrl: matchRef.url,
            matchLabel: `${playerA.name} vs ${playerB.name}`,
            tournament: matchRef.tournament,
            status: matchRef.status,
            scheduledStartText: matchRef.scheduledStartText,
            playerAName: playerA.name,
            playerBName: playerB.name,
            marketOdds: matchRef.marketOdds,
            pclass: matchRef.pclass,
          },
          playerAStats,
          playerBStats,
          REQUIRED_HISTORY_COUNT,
        );

        predictions.push(prediction);
        logger.info(
          `Accepted #${predictions.length}: ${prediction.matchLabel} | ` +
            `HISTORY=${prediction.predictedWinner} NOVA=${prediction.modelSummary?.novaEdge?.winner || "-"} ` +
            `HYBRID=${prediction.modelSummary?.hybridShadow?.winner || "-"} ` +
            `MAHAL=${prediction.modelSummary?.mahalShadow?.winner || "-"} ` +
            `MATCHUP=${prediction.modelSummary?.matchupShadow?.winner || "-"} ` +
            `MROA=${prediction.modelSummary?.marketResidualShadow?.winner || "-"}`,
        );
      } catch (error) {
        parserErrors += 1;
        logger.warn(
          `Failed ${dayMatch.playerAName} vs ${dayMatch.playerBName}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  } finally {
    await closeBrowserSession(session);
  }

  if (predictions.length === 0) {
    throw new Error("No finished singles predictions collected.");
  }

  const outcomeInput: OutcomePredictionInput[] = predictions.map((prediction) => ({
    matchUrl: prediction.matchUrl,
    mainPick: prediction.predictedWinner,
    novaPick: prediction.modelSummary?.novaEdge?.winner,
    hybridShadowPick: prediction.modelSummary?.hybridShadow?.winner,
    hybridShadowP1: prediction.modelSummary?.hybridShadow?.p1,
    mahalShadowPick: prediction.modelSummary?.mahalShadow?.winner,
    mahalShadowP1: prediction.modelSummary?.mahalShadow?.p1,
    matchupShadowPick: prediction.modelSummary?.matchupShadow?.winner,
    matchupShadowP1: prediction.modelSummary?.matchupShadow?.p1,
    marketResidualShadowPick: prediction.modelSummary?.marketResidualShadow?.winner,
    marketResidualShadowP1: prediction.modelSummary?.marketResidualShadow?.p1,
    mainOdds: inferMainOdd(prediction),
    mainModelProbabilities: prediction.modelSummary?.dirt?.modelProbabilities
      ? {
          logRegP1: prediction.modelSummary.dirt.modelProbabilities.logRegP1,
          markovP1: prediction.modelSummary.dirt.modelProbabilities.markovP1,
          bradleyP1: prediction.modelSummary.dirt.modelProbabilities.bradleyP1,
          pcaP1: prediction.modelSummary.dirt.modelProbabilities.pcaP1,
        }
      : undefined,
  }));

  await mkdir("tmp", { recursive: true });
  await writeFile(artifacts.predictions, JSON.stringify(predictions, null, 2), "utf8");
  await writeFile(artifacts.outcomeInput, JSON.stringify(outcomeInput, null, 2), "utf8");

  logger.info(`Running outcome audit for ${predictions.length} matches...`);
  const outcome = await runOutcomeAudit({
    matchUrls: predictions.map((p) => p.matchUrl),
    predictions: outcomeInput,
    timeoutMs: outcomeTimeoutMs,
    retries: outcomeRetries,
    logger,
  });

  const joined = joinPredictionsWithOutcomes(predictions, outcome.matches);
  const disagreements = summarizeDisagreements(joined);
  await writeFile(artifacts.joined, JSON.stringify(joined, null, 2), "utf8");

  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    durationSec: round2((performance.now() - t0) / 1000),
    config: {
      entryUrl: config.entryUrl,
      status: config.status,
      seedPredictionsFile,
      historyStatsMissBudget: config.historyStatsMissBudget,
      timeoutMs: config.timeoutMs,
      maxGotoRetries: config.maxGotoRetries,
      outcomeTimeoutMs,
      outcomeRetries,
      requiredHistoryCount: REQUIRED_HISTORY_COUNT,
      targetPredictions,
      candidateScanLimit,
      artifactPrefix,
      daysBack,
    },
    collection: {
      daysVisited: dayCollectionDaysVisited,
      uniqueFinishedCandidates: dayCollectionUniqueCandidates,
      processedFinishedCandidates: processed,
      acceptedPredictions: predictions.length,
      parserErrors,
      skippedDoubles,
      skippedStrict5,
      skippedFastStrict5,
    },
    hitRate: outcome.hitRate,
    outcomeSummary: {
      fetchedMatches: outcome.matches.length,
      singles: outcome.matches.filter((m) => m.singles).length,
      unmatchedPredictionMatchUrls: outcome.unmatchedPredictionMatchUrls.length,
    },
    disagreements,
    sampleDivergences: joined
      .filter(
        (row) =>
          row.mainPick !== row.hybridPick ||
          row.novaPick !== row.hybridPick ||
          row.mainPick !== row.mahalPick ||
          row.novaPick !== row.mahalPick ||
          row.mainPick !== row.matchupPick ||
          row.novaPick !== row.matchupPick ||
          row.mainPick !== row.mroaPick ||
          row.novaPick !== row.mroaPick,
      )
      .slice(0, 12),
  };

  await writeFile(artifacts.report, JSON.stringify(report, null, 2), "utf8");

  process.stdout.write(formatReport(report));
}

function readArg(argv: string[], key: string): string | undefined {
  const token = `--${key}`;
  const index = argv.findIndex((value) => value === token);
  if (index < 0) return undefined;
  const next = argv[index + 1];
  if (!next || next.startsWith("--")) return undefined;
  return next;
}

async function collectFinishedCandidatesAcrossDays(
  page: import("playwright").Page,
  config: RunConfig,
  logger: Logger,
  daysBack: number,
  totalLimit: number,
): Promise<{
  daysVisited: number;
  uniqueCandidates: number;
  matches: Array<{
    id: string;
    url: string;
    playerAName: string;
    playerBName: string;
    tournament?: string;
    status: "finished";
  }>;
}> {
  const out: Array<{
    id: string;
    url: string;
    playerAName: string;
    playerBName: string;
    tournament?: string;
    status: "finished";
  }> = [];
  const seen = new Set<string>();
  let daysVisited = 0;

  logger.info(`Loading base day page for multi-day collection: ${config.entryUrl}`);
  let currentDayMatches = await extractDayMatches(page, config, logger);
  for (let dayOffset = 0; dayOffset <= daysBack; dayOffset += 1) {
    const calendarLabel = await readCalendarLabel(page);
    const finished = prioritizeFinishedMatches(currentDayMatches.filter((m) => m.status === "finished"));
    let addedToday = 0;
    for (const match of finished) {
      const key = canonicalizeMatchUrl(match.url) || match.url;
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push({
        id: match.id,
        url: match.url,
        playerAName: match.playerAName,
        playerBName: match.playerBName,
        tournament: match.tournament,
        status: "finished",
      });
      addedToday += 1;
    }
    daysVisited += 1;
    logger.info(
      `Multi-day day#${dayOffset + 1} (${calendarLabel || "-"}) finished=${finished.length}, added=${addedToday}, total=${out.length}`,
    );
    if (dayOffset >= daysBack) {
      break;
    }
    const moved = await goToPreviousCalendarDay(page, config.timeoutMs, logger);
    if (!moved) {
      logger.warn(`Multi-day collection stopped: failed to switch to previous day at offset=${dayOffset + 1}`);
      break;
    }
    currentDayMatches = await extractDayMatches(page, config, logger, { skipNavigation: true });
  }

  const prioritized = prioritizeFinishedMatches(out);

  return {
    daysVisited,
    uniqueCandidates: seen.size,
    matches: prioritized.slice(0, totalLimit),
  };
}

async function readCalendarLabel(page: import("playwright").Page): Promise<string> {
  try {
    return await page.evaluate(() => {
      const text = (document.querySelector(".calendarContainer")?.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      return text;
    });
  } catch {
    return "";
  }
}

async function goToPreviousCalendarDay(
  page: import("playwright").Page,
  timeoutMs: number,
  logger: Logger,
): Promise<boolean> {
  const before = await readCalendarLabel(page);
  try {
    await page.waitForSelector(PREV_DAY_BUTTON_SELECTOR, {
      timeout: Math.min(timeoutMs, 8_000),
      state: "visible",
    });
  } catch (error) {
    logger.warn(
      `Multi-day prev-day button not found: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
  try {
    await page.click(PREV_DAY_BUTTON_SELECTOR, { timeout: Math.min(timeoutMs, 8_000) });
  } catch {
    try {
      await page.evaluate((selector) => {
        const btn = document.querySelector<HTMLElement>(selector);
        btn?.click();
      }, PREV_DAY_BUTTON_SELECTOR);
    } catch (error) {
      logger.warn(
        `Multi-day prev-day click failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
  try {
    await page.waitForFunction(
      (prev) => {
        const current = (document.querySelector(".calendarContainer")?.textContent || "")
          .replace(/\s+/g, " ")
          .trim();
        return Boolean(current) && current !== prev;
      },
      before,
      { timeout: Math.min(timeoutMs, 10_000) },
    );
  } catch {
    // Calendar text may stay same format briefly; continue with a short delay and let parsing validate.
  }
  await page.waitForTimeout(700);
  return true;
}

function prioritizeFinishedMatches<
  T extends {
    tournament?: string;
    playerAName?: string;
    playerBName?: string;
  },
>(matches: T[]): T[] {
  return [...matches].sort((a, b) => {
    const qa = tournamentQualityRank(a.tournament);
    const qb = tournamentQualityRank(b.tournament);
    if (qa !== qb) {
      return qa - qb;
    }
    const labelA = `${a.playerAName || ""} ${a.playerBName || ""}`.trim();
    const labelB = `${b.playerAName || ""} ${b.playerBName || ""}`.trim();
    return labelA.localeCompare(labelB, "en");
  });
}

function tournamentQualityRank(tournament: string | undefined): number {
  const text = String(tournament || "").toLowerCase();
  if (!text) return 50;
  if (
    /\b(atp|wta)\b/.test(text) ||
    /grand slam|masters|olympic|davis cup|billie jean king|federation cup/.test(text)
  ) {
    return 0;
  }
  if (/challenger/.test(text)) return 1;
  if (/united cup|hopman cup|atp cup/.test(text)) return 2;
  if (/\bitf\b/.test(text) || /\bm\d{2}\b/.test(text) || /\bw\d{2,3}\b/.test(text)) return 4;
  if (/junior|boys|girls|u18|u16/.test(text)) return 6;
  if (/exhibition|league|club/.test(text)) return 7;
  return 3;
}

function readIntArg(argv: string[], key: string): number | undefined {
  const raw = readArg(argv, key);
  if (typeof raw !== "string") return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || !Number.isFinite(value)) {
    throw new Error(`--${key} must be an integer`);
  }
  return value;
}

async function loadSeedMatches(path: string): Promise<
  Array<{ matchUrl: string; matchLabel?: string; playerAName?: string; playerBName?: string }>
> {
  const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error(`seed-predictions-file must contain JSON array: ${path}`);
  }
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      matchUrl: typeof item.matchUrl === "string" ? item.matchUrl : "",
      matchLabel: typeof item.matchLabel === "string" ? item.matchLabel : undefined,
      playerAName: typeof item.playerAName === "string" ? item.playerAName : undefined,
      playerBName: typeof item.playerBName === "string" ? item.playerBName : undefined,
    }))
    .filter((item) => item.matchUrl.trim().length > 0);
}

function toSeedDayMatchList(
  seeds: Array<{ matchUrl: string; matchLabel?: string; playerAName?: string; playerBName?: string }>,
) {
  return seeds.map((seed, index) => {
    const [aFromLabel, bFromLabel] = splitMatchLabel(seed.matchLabel);
    return {
      id: `seed-${index + 1}`,
      url: seed.matchUrl,
      playerAName: seed.playerAName || aFromLabel || `PlayerA#${index + 1}`,
      playerBName: seed.playerBName || bFromLabel || `PlayerB#${index + 1}`,
      status: "finished" as const,
    };
  });
}

function splitMatchLabel(label: string | undefined): [string | undefined, string | undefined] {
  const text = String(label || "").trim();
  if (!text) return [undefined, undefined];
  const parts = text.split(/\s+vs\s+/i);
  if (parts.length !== 2) return [undefined, undefined];
  const a = parts[0]?.trim() || undefined;
  const b = parts[1]?.trim() || undefined;
  return [a, b];
}

function inferMainOdd(prediction: PredictionResult): number | undefined {
  const winner = normalizeLooseName(prediction.predictedWinner);
  const a = normalizeLooseName(prediction.playerAName);
  const b = normalizeLooseName(prediction.playerBName);
  const home = prediction.marketOdds?.home;
  const away = prediction.marketOdds?.away;
  if (winner && a && winner === a && Number.isFinite(home)) {
    return home;
  }
  if (winner && b && winner === b && Number.isFinite(away)) {
    return away;
  }
  return undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function joinPredictionsWithOutcomes(predictions: PredictionResult[], matches: OutcomeMatchRecord[]) {
  const predictionByUrl = new Map<string, PredictionResult>();
  for (const prediction of predictions) {
    const key = canonicalizeMatchUrl(prediction.matchUrl);
    if (key) {
      predictionByUrl.set(key, prediction);
    }
  }

  const rows: Array<{
    matchUrl: string;
    label: string;
    actualWinner?: string;
    actualWinnerName?: string;
    winnerName?: string;
    winnerSide?: "A" | "B";
    historyPick?: string;
    mainPick?: string;
    novaPick?: string;
    hybridPick?: string;
    mahalPick?: string;
    matchupPick?: string;
    mroaPick?: string;
    agreementHN?: boolean;
    novaP1?: number;
    novaP2?: number;
    novaMargin?: number;
    mainConfidence?: number;
    confidencePct?: number;
    mainProbP1?: number;
    logRegP1?: number;
    markovP1?: number;
    bradleyP1?: number;
    pcaP1?: number;
    modelSpreadCore?: number;
    pcaDeviation?: number;
    historyCorrect?: boolean;
    mainCorrect?: boolean;
    novaCorrect?: boolean;
    hybridCorrect?: boolean;
    mahalCorrect?: boolean;
    matchupCorrect?: boolean;
    mroaCorrect?: boolean;
  }> = [];

  for (const match of matches) {
    const key = canonicalizeMatchUrl(match.url);
    if (!key || !match.singles || match.winnerSide === "-") {
      continue;
    }
    const prediction = predictionByUrl.get(key);
    if (!prediction) {
      continue;
    }
    const mainSide = normalizePickToSide(prediction.predictedWinner, match);
    const novaSide = normalizePickToSide(prediction.modelSummary?.novaEdge?.winner, match);
    const hybridSide = normalizePickToSide(prediction.modelSummary?.hybridShadow?.winner, match);
    const mahalSide = normalizePickToSide(prediction.modelSummary?.mahalShadow?.winner, match);
    const matchupSide = normalizePickToSide(prediction.modelSummary?.matchupShadow?.winner, match);
    const mroaSide = normalizePickToSide(prediction.modelSummary?.marketResidualShadow?.winner, match);
    const historyPick = prediction.predictedWinner;
    const novaPick = prediction.modelSummary?.novaEdge?.winner;
    const modelProbabilities = prediction.modelSummary?.dirt?.modelProbabilities;
    const logRegP1 = isFiniteNumber(modelProbabilities?.logRegP1) ? modelProbabilities.logRegP1 : undefined;
    const markovP1 = isFiniteNumber(modelProbabilities?.markovP1) ? modelProbabilities.markovP1 : undefined;
    const bradleyP1 = isFiniteNumber(modelProbabilities?.bradleyP1) ? modelProbabilities.bradleyP1 : undefined;
    const pcaP1 = isFiniteNumber(modelProbabilities?.pcaP1) ? modelProbabilities.pcaP1 : undefined;
    const mainProbP1 = isFiniteNumber(modelProbabilities?.finalP1) ? modelProbabilities.finalP1 : undefined;
    const coreValues = [logRegP1, markovP1, bradleyP1, pcaP1].filter(isFiniteNumber);
    const modelSpreadCore =
      coreValues.length >= 2 ? round3(Math.max(...coreValues) - Math.min(...coreValues)) : undefined;
    const pcaDeviation =
      isFiniteNumber(pcaP1) && isFiniteNumber(logRegP1) && isFiniteNumber(markovP1) && isFiniteNumber(bradleyP1)
        ? round3(Math.abs(pcaP1 - (logRegP1 + markovP1 + bradleyP1) / 3))
        : undefined;
    const novaP1 = isFiniteNumber(prediction.modelSummary?.novaEdge?.p1) ? prediction.modelSummary?.novaEdge?.p1 : undefined;
    const novaP2 = isFiniteNumber(prediction.modelSummary?.novaEdge?.p2) ? prediction.modelSummary?.novaEdge?.p2 : undefined;
    const novaMargin = isFiniteNumber(novaP1) ? round3(Math.abs(novaP1 - 50)) : undefined;
    const agreementHN =
      normalizeLooseName(historyPick) && normalizeLooseName(novaPick)
        ? normalizeLooseName(historyPick) === normalizeLooseName(novaPick)
        : undefined;
    const mainConfidence = isFiniteNumber(prediction.confidence) ? prediction.confidence : undefined;
    const confidencePct = isFiniteNumber(mainConfidence) ? round3(mainConfidence * 100) : undefined;
    const historyCorrect = mainSide ? mainSide === match.winnerSide : undefined;
    const mainCorrect = historyCorrect;
    rows.push({
      matchUrl: key,
      label: prediction.matchLabel,
      actualWinner: match.winnerName,
      actualWinnerName: match.winnerName,
      winnerName: match.winnerName,
      winnerSide: match.winnerSide,
      historyPick,
      mainPick: historyPick,
      novaPick,
      hybridPick: prediction.modelSummary?.hybridShadow?.winner,
      mahalPick: prediction.modelSummary?.mahalShadow?.winner,
      matchupPick: prediction.modelSummary?.matchupShadow?.winner,
      mroaPick: prediction.modelSummary?.marketResidualShadow?.winner,
      agreementHN,
      novaP1: isFiniteNumber(novaP1) ? round3(novaP1) : undefined,
      novaP2: isFiniteNumber(novaP2) ? round3(novaP2) : undefined,
      novaMargin,
      mainConfidence: isFiniteNumber(mainConfidence) ? round3(mainConfidence) : undefined,
      confidencePct,
      mainProbP1: isFiniteNumber(mainProbP1) ? round3(mainProbP1) : undefined,
      logRegP1: isFiniteNumber(logRegP1) ? round3(logRegP1) : undefined,
      markovP1: isFiniteNumber(markovP1) ? round3(markovP1) : undefined,
      bradleyP1: isFiniteNumber(bradleyP1) ? round3(bradleyP1) : undefined,
      pcaP1: isFiniteNumber(pcaP1) ? round3(pcaP1) : undefined,
      modelSpreadCore,
      pcaDeviation,
      historyCorrect,
      mainCorrect,
      novaCorrect: novaSide ? novaSide === match.winnerSide : undefined,
      hybridCorrect: hybridSide ? hybridSide === match.winnerSide : undefined,
      mahalCorrect: mahalSide ? mahalSide === match.winnerSide : undefined,
      matchupCorrect: matchupSide ? matchupSide === match.winnerSide : undefined,
      mroaCorrect: mroaSide ? mroaSide === match.winnerSide : undefined,
    });
  }
  return rows;
}

function summarizeDisagreements(rows: ReturnType<typeof joinPredictionsWithOutcomes>) {
  let hybridVsHistoryDiff = 0;
  let hybridVsNovaDiff = 0;
  let mahalVsHistoryDiff = 0;
  let mahalVsNovaDiff = 0;
  let matchupVsHistoryDiff = 0;
  let matchupVsNovaDiff = 0;
  let mroaVsHistoryDiff = 0;
  let mroaVsNovaDiff = 0;
  let allThreeDifferent = 0;
  let allFourDifferent = 0;
  let allFiveDifferent = 0;
  let allSixDifferent = 0;
  let hybridOnlyCorrect = 0;
  let mahalOnlyCorrect = 0;
  let matchupOnlyCorrect = 0;
  let mroaOnlyCorrect = 0;
  let historyOnlyCorrect = 0;
  let novaOnlyCorrect = 0;
  let hybridAndHistoryCorrectNovaWrong = 0;
  let hybridAndNovaCorrectHistoryWrong = 0;
  let mahalAndHistoryCorrectNovaWrong = 0;
  let mahalAndNovaCorrectHistoryWrong = 0;
  let matchupAndHistoryCorrectNovaWrong = 0;
  let matchupAndNovaCorrectHistoryWrong = 0;
  let mroaAndHistoryCorrectNovaWrong = 0;
  let mroaAndNovaCorrectHistoryWrong = 0;
  let compared = 0;

  for (const row of rows) {
    compared += 1;
    if (row.hybridPick && row.mainPick && row.hybridPick !== row.mainPick) {
      hybridVsHistoryDiff += 1;
    }
    if (row.hybridPick && row.novaPick && row.hybridPick !== row.novaPick) {
      hybridVsNovaDiff += 1;
    }
    if (row.mahalPick && row.mainPick && row.mahalPick !== row.mainPick) {
      mahalVsHistoryDiff += 1;
    }
    if (row.mahalPick && row.novaPick && row.mahalPick !== row.novaPick) {
      mahalVsNovaDiff += 1;
    }
    if (row.matchupPick && row.mainPick && row.matchupPick !== row.mainPick) {
      matchupVsHistoryDiff += 1;
    }
    if (row.matchupPick && row.novaPick && row.matchupPick !== row.novaPick) {
      matchupVsNovaDiff += 1;
    }
    if (row.mroaPick && row.mainPick && row.mroaPick !== row.mainPick) {
      mroaVsHistoryDiff += 1;
    }
    if (row.mroaPick && row.novaPick && row.mroaPick !== row.novaPick) {
      mroaVsNovaDiff += 1;
    }

    const picks = [row.mainPick, row.novaPick, row.hybridPick].filter(Boolean);
    if (new Set(picks).size === 3) {
      allThreeDifferent += 1;
    }
    const picksWithMahal = [row.mainPick, row.novaPick, row.hybridPick, row.mahalPick].filter(Boolean);
    if (new Set(picksWithMahal).size === 4) {
      allFourDifferent += 1;
    }
    const picksWithMatchup = [
      row.mainPick,
      row.novaPick,
      row.hybridPick,
      row.mahalPick,
      row.matchupPick,
    ].filter(Boolean);
    if (new Set(picksWithMatchup).size === 5) {
      allFiveDifferent += 1;
    }
    const picksWithMroa = [row.mainPick, row.novaPick, row.hybridPick, row.mahalPick, row.matchupPick, row.mroaPick]
      .filter(Boolean);
    if (new Set(picksWithMroa).size === 6) {
      allSixDifferent += 1;
    }

    const mainC = row.mainCorrect === true;
    const novaC = row.novaCorrect === true;
    const hybridC = row.hybridCorrect === true;
    const mahalC = row.mahalCorrect === true;
    const matchupC = row.matchupCorrect === true;
    const mroaC = row.mroaCorrect === true;
    if (hybridC && !mainC && !novaC) hybridOnlyCorrect += 1;
    if (mahalC && !mainC && !novaC) mahalOnlyCorrect += 1;
    if (matchupC && !mainC && !novaC) matchupOnlyCorrect += 1;
    if (mroaC && !mainC && !novaC) mroaOnlyCorrect += 1;
    if (mainC && !hybridC && !novaC) historyOnlyCorrect += 1;
    if (novaC && !hybridC && !mainC) novaOnlyCorrect += 1;
    if (hybridC && mainC && !novaC) hybridAndHistoryCorrectNovaWrong += 1;
    if (hybridC && novaC && !mainC) hybridAndNovaCorrectHistoryWrong += 1;
    if (mahalC && mainC && !novaC) mahalAndHistoryCorrectNovaWrong += 1;
    if (mahalC && novaC && !mainC) mahalAndNovaCorrectHistoryWrong += 1;
    if (matchupC && mainC && !novaC) matchupAndHistoryCorrectNovaWrong += 1;
    if (matchupC && novaC && !mainC) matchupAndNovaCorrectHistoryWrong += 1;
    if (mroaC && mainC && !novaC) mroaAndHistoryCorrectNovaWrong += 1;
    if (mroaC && novaC && !mainC) mroaAndNovaCorrectHistoryWrong += 1;
  }

  return {
    compared,
    hybridVsHistoryDiff,
    hybridVsNovaDiff,
    mahalVsHistoryDiff,
    mahalVsNovaDiff,
    matchupVsHistoryDiff,
    matchupVsNovaDiff,
    mroaVsHistoryDiff,
    mroaVsNovaDiff,
    allThreeDifferent,
    allFourDifferent,
    allFiveDifferent,
    allSixDifferent,
    hybridOnlyCorrect,
    mahalOnlyCorrect,
    matchupOnlyCorrect,
    mroaOnlyCorrect,
    historyOnlyCorrect,
    novaOnlyCorrect,
    hybridAndHistoryCorrectNovaWrong,
    hybridAndNovaCorrectHistoryWrong,
    mahalAndHistoryCorrectNovaWrong,
    mahalAndNovaCorrectHistoryWrong,
    matchupAndHistoryCorrectNovaWrong,
    matchupAndNovaCorrectHistoryWrong,
    mroaAndHistoryCorrectNovaWrong,
    mroaAndNovaCorrectHistoryWrong,
  };
}

function normalizePickToSide(
  rawPick: string | undefined,
  match: OutcomeMatchRecord,
): "A" | "B" | undefined {
  const pick = normalizeLooseName(rawPick);
  const home = normalizeLooseName(match.homeName);
  const away = normalizeLooseName(match.awayName);
  if (!pick) return undefined;
  if (matchesLooseName(pick, home)) return "A";
  if (matchesLooseName(pick, away)) return "B";
  return undefined;
}

function matchesLooseName(pick: string, target: string): boolean {
  if (!pick || !target) return false;
  if (pick === target || pick.includes(target) || target.includes(pick)) return true;
  const pickTokens = pick.split(" ").filter(Boolean);
  const targetTokens = target.split(" ").filter(Boolean);
  const pickLast = pickTokens[pickTokens.length - 1] || "";
  const targetLast = targetTokens[targetTokens.length - 1] || "";
  return Boolean(
    pickLast &&
      targetLast &&
      pickLast.length >= 3 &&
      targetLast.length >= 3 &&
      pickLast === targetLast,
  );
}

function normalizeLooseName(value: string | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function canonicalizeMatchUrl(value: string | undefined): string | undefined {
  const text = String(value || "").trim();
  if (!text) return undefined;
  try {
    const parsed = new URL(text);
    const mid = (parsed.searchParams.get("mid") || "").trim();
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    parsed.search = "";
    if (mid) parsed.searchParams.set("mid", mid);
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatRate(block: { hit: number; total: number; rate?: number } | undefined): string {
  if (!block) return "-";
  const rate = typeof block.rate === "number" ? `${block.rate.toFixed(1)}%` : "-";
  return `${block.hit}/${block.total} (${rate})`;
}

function formatReport(report: any): string {
  const lines: string[] = [];
  lines.push(
    `=== SHADOW VALIDATION (${report.config?.targetPredictions ?? "?"} finished singles target) ===`,
  );
  lines.push(`Started: ${report.startedAt}`);
  lines.push(`Finished: ${report.finishedAt}`);
  lines.push(`Duration: ${report.durationSec}s`);
  lines.push(
    `Policy: status=${report.config.status}, strict_history=${report.config.requiredHistoryCount}, ` +
      `history_stats_miss_budget=${report.config.historyStatsMissBudget}`,
  );
  lines.push(
    `Collection: processed_finished=${report.collection.processedFinishedCandidates}, ` +
      `accepted=${report.collection.acceptedPredictions}, parser_errors=${report.collection.parserErrors}, ` +
      `skipped_doubles=${report.collection.skippedDoubles}, strict5=${report.collection.skippedStrict5}, ` +
      `strict5_fast=${report.collection.skippedFastStrict5}`,
  );
  lines.push(
    `Outcome fetched: matches=${report.outcomeSummary.fetchedMatches}, singles=${report.outcomeSummary.singles}, ` +
      `unmatched_predictions=${report.outcomeSummary.unmatchedPredictionMatchUrls}`,
  );
  lines.push("");
  lines.push("Hit-rate:");
  lines.push(`- HISTORY-5: ${formatRate(report.hitRate?.main)}`);
  lines.push(`- NOVA: ${formatRate(report.hitRate?.nova)}`);
  lines.push(`- HYBRID (shadow): ${formatRate(report.hitRate?.hybridShadow)}`);
  lines.push(`- MAHAL (shadow): ${formatRate(report.hitRate?.mahalShadow)}`);
  lines.push(`- MATCHUP (shadow): ${formatRate(report.hitRate?.matchupShadow)}`);
  lines.push(`- MROA (shadow): ${formatRate(report.hitRate?.marketResidualShadow)}`);
  lines.push("");
  lines.push("Disagreements / usefulness:");
  lines.push(`- Compared matches: ${report.disagreements.compared}`);
  lines.push(`- HYBRID vs HISTORY picks differ: ${report.disagreements.hybridVsHistoryDiff}`);
  lines.push(`- HYBRID vs NOVA picks differ: ${report.disagreements.hybridVsNovaDiff}`);
  lines.push(`- MAHAL vs HISTORY picks differ: ${report.disagreements.mahalVsHistoryDiff}`);
  lines.push(`- MAHAL vs NOVA picks differ: ${report.disagreements.mahalVsNovaDiff}`);
  lines.push(`- MATCHUP vs HISTORY picks differ: ${report.disagreements.matchupVsHistoryDiff}`);
  lines.push(`- MATCHUP vs NOVA picks differ: ${report.disagreements.matchupVsNovaDiff}`);
  lines.push(`- MROA vs HISTORY picks differ: ${report.disagreements.mroaVsHistoryDiff}`);
  lines.push(`- MROA vs NOVA picks differ: ${report.disagreements.mroaVsNovaDiff}`);
  lines.push(`- All three picks differ: ${report.disagreements.allThreeDifferent}`);
  lines.push(`- All four picks differ: ${report.disagreements.allFourDifferent}`);
  lines.push(`- All five picks differ: ${report.disagreements.allFiveDifferent}`);
  lines.push(`- All six picks differ: ${report.disagreements.allSixDifferent}`);
  lines.push(`- HYBRID only correct: ${report.disagreements.hybridOnlyCorrect}`);
  lines.push(`- MAHAL only correct: ${report.disagreements.mahalOnlyCorrect}`);
  lines.push(`- MATCHUP only correct: ${report.disagreements.matchupOnlyCorrect}`);
  lines.push(`- MROA only correct: ${report.disagreements.mroaOnlyCorrect}`);
  lines.push(`- HISTORY only correct: ${report.disagreements.historyOnlyCorrect}`);
  lines.push(`- NOVA only correct: ${report.disagreements.novaOnlyCorrect}`);
  lines.push(
    `- HYBRID+HISTORY correct, NOVA wrong: ${report.disagreements.hybridAndHistoryCorrectNovaWrong}`,
  );
  lines.push(
    `- HYBRID+NOVA correct, HISTORY wrong: ${report.disagreements.hybridAndNovaCorrectHistoryWrong}`,
  );
  lines.push(
    `- MAHAL+HISTORY correct, NOVA wrong: ${report.disagreements.mahalAndHistoryCorrectNovaWrong}`,
  );
  lines.push(
    `- MAHAL+NOVA correct, HISTORY wrong: ${report.disagreements.mahalAndNovaCorrectHistoryWrong}`,
  );
  lines.push(
    `- MATCHUP+HISTORY correct, NOVA wrong: ${report.disagreements.matchupAndHistoryCorrectNovaWrong}`,
  );
  lines.push(
    `- MATCHUP+NOVA correct, HISTORY wrong: ${report.disagreements.matchupAndNovaCorrectHistoryWrong}`,
  );
  lines.push(`- MROA+HISTORY correct, NOVA wrong: ${report.disagreements.mroaAndHistoryCorrectNovaWrong}`);
  lines.push(`- MROA+NOVA correct, HISTORY wrong: ${report.disagreements.mroaAndNovaCorrectHistoryWrong}`);
  lines.push("");
  lines.push("Artifacts:");
  const prefix = String(report.config?.artifactPrefix || DEFAULT_ARTIFACT_PREFIX);
  lines.push(`- tmp/${prefix}-report.json`);
  lines.push(`- tmp/${prefix}-predictions.json`);
  lines.push(`- tmp/${prefix}-outcome-input.json`);
  lines.push(`- tmp/${prefix}-joined.json`);
  lines.push("");
  lines.push("Sample divergences (up to 12):");
  for (const row of report.sampleDivergences || []) {
    lines.push(
      `- ${row.label} | outcome=${row.winnerName || "-"} | ` +
        `H=${row.mainPick || "-"}${flag(row.mainCorrect)} ` +
        `N=${row.novaPick || "-"}${flag(row.novaCorrect)} ` +
        `HY=${row.hybridPick || "-"}${flag(row.hybridCorrect)} ` +
        `MA=${row.mahalPick || "-"}${flag(row.mahalCorrect)} ` +
        `MU=${row.matchupPick || "-"}${flag(row.matchupCorrect)} ` +
        `MR=${row.mroaPick || "-"}${flag(row.mroaCorrect)}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function flag(value: boolean | undefined): string {
  if (value === true) return "✓";
  if (value === false) return "✗";
  return "";
}

main().catch((error) => {
  const msg = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${msg}\n`);
  process.exit(1);
});
