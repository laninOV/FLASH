import type { Page } from "playwright";
import { closeBrowserSession, createBrowserSession } from "../browser.js";
import { extractDayMatches } from "../extract/dayMatches.js";
import { extractMatchPageRef } from "../extract/matchPage.js";
import { extractRecentMatchesFromProfile, isSinglesMatch } from "../extract/playerProfile.js";
import { extractTechStatsFromMatch } from "../extract/techStats.js";
import { Logger } from "../logger.js";
import { scanTechHistoryCandidates } from "../orchestrator.js";
import { aggregateIndexPairs } from "../predict/dirtPairs.js";
import { extractDirtFeatureRow, type DirtFeatureRow } from "../predict/requiredMetrics.js";
import { predict } from "../predictor.js";
import type {
  DayMatchRef,
  PlayerRecentStats,
  RunConfig,
} from "../types.js";
import { oracleAggregateIndexPairs } from "./oracleDirt.js";

const REQUIRED_HISTORY_COUNT = 5;
const DEFAULT_LIVE_LIMIT = 30;
const TOLERANCE_PP = 1.0;

type ModelName = "logReg" | "markov" | "bradley" | "pca" | "final";

interface DiffAccumulator {
  values: number[];
  mismatches: number;
}

interface MatchAuditRecord {
  matchLabel: string;
  matchUrl: string;
  status: string;
  maxAbsDiff: number;
  failingModels: string[];
  notes: string[];
}

export interface CalcAuditSummary {
  startedAt: string;
  finishedAt: string;
  tolerancePp: number;
  requestedMatches: number;
  scannedMatches: number;
  verifiedMatches: number;
  passedMatches: number;
  failedMatches: number;
  skipped: {
    strict5NotReached: number;
    nonSinglesTarget: number;
    parserError: number;
  };
  historyRejections: {
    techMissing: number;
    metricsIncomplete: number;
    parseError: number;
  };
  modelDiffs: Record<ModelName, DiffAccumulator>;
  invariantViolations: number;
  topDivergences: MatchAuditRecord[];
}

export async function runCalculationAudit(config: RunConfig): Promise<CalcAuditSummary> {
  const logger = new Logger({ debugEnabled: true });
  const startedAt = new Date().toISOString();

  const effectiveLimit = typeof config.limit === "number" ? config.limit : DEFAULT_LIVE_LIMIT;
  const runConfig: RunConfig = {
    ...config,
    limit: effectiveLimit,
    telegram: false,
    console: false,
  };
  logger.info(
    `Audit config: scope=active_pipeline, metrics_policy=stable14, ` +
      `pairing=index, strict_history=5, tolerance=${TOLERANCE_PP.toFixed(1)}pp, ` +
      `live_limit=${effectiveLimit}`,
  );

  const summary: CalcAuditSummary = {
    startedAt,
    finishedAt: startedAt,
    tolerancePp: TOLERANCE_PP,
    requestedMatches: effectiveLimit,
    scannedMatches: 0,
    verifiedMatches: 0,
    passedMatches: 0,
    failedMatches: 0,
    skipped: {
      strict5NotReached: 0,
      nonSinglesTarget: 0,
      parserError: 0,
    },
    historyRejections: {
      techMissing: 0,
      metricsIncomplete: 0,
      parseError: 0,
    },
    modelDiffs: {
      logReg: emptyDiffAccumulator(),
      markov: emptyDiffAccumulator(),
      bradley: emptyDiffAccumulator(),
      pca: emptyDiffAccumulator(),
      final: emptyDiffAccumulator(),
    },
    invariantViolations: 0,
    topDivergences: [],
  };

  const session = await createBrowserSession(runConfig);
  try {
    const allMatches = await extractDayMatches(session.page, runConfig, logger);
    const scopedMatches = limitMatches(filterByStatus(allMatches, runConfig.status), effectiveLimit);
    logger.info(
      `Audit live sampling: selected ${scopedMatches.length} matches ` +
        `(status=${runConfig.status}, singles_only=true).`,
    );

    for (let index = 0; index < scopedMatches.length; index += 1) {
      const dayMatch = scopedMatches[index];
      summary.scannedMatches += 1;
      logger.info(
        `[AUDIT ${index + 1}/${scopedMatches.length}] ${dayMatch.playerAName} vs ${dayMatch.playerBName}`,
      );

      try {
        const matchRef = await extractMatchPageRef(session.page, dayMatch, runConfig, logger);
        const [playerA, playerB] = matchRef.players;
        if (!isSinglesMatch(playerA.name, playerB.name)) {
          summary.skipped.nonSinglesTarget += 1;
          continue;
        }

        const playerAStats = await collectPlayerStatsForAudit(
          session.page,
          playerA,
          matchRef.url,
          runConfig,
          logger,
        );
        const playerBStats = await collectPlayerStatsForAudit(
          session.page,
          playerB,
          matchRef.url,
          runConfig,
          logger,
        );
        accumulateHistoryRejections(summary, playerAStats, playerBStats);

        if (
          playerAStats.parsedMatches.length < REQUIRED_HISTORY_COUNT ||
          playerBStats.parsedMatches.length < REQUIRED_HISTORY_COUNT
        ) {
          summary.skipped.strict5NotReached += 1;
          continue;
        }

        const featureA = collectFeatureRows(playerAStats);
        const featureB = collectFeatureRows(playerBStats);
        const prod = aggregateIndexPairs(featureA, featureB, REQUIRED_HISTORY_COUNT);
        const oracle = oracleAggregateIndexPairs(featureA, featureB, REQUIRED_HISTORY_COUNT);
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

        const perMatchIssues: string[] = [];
        const perMatchModelFailures: string[] = [];
        const perMatchMaxDiff = compareProdOracle({
          prod,
          oracle,
          tolerance: TOLERANCE_PP,
          summary,
          issues: perMatchIssues,
          failingModels: perMatchModelFailures,
        });
        validateInvariants({
          summary,
          issues: perMatchIssues,
          prod,
          prediction,
          expectedCoverageA: featureA.length,
          expectedCoverageB: featureB.length,
        });

        summary.verifiedMatches += 1;
        if (perMatchIssues.length === 0 && perMatchModelFailures.length === 0) {
          summary.passedMatches += 1;
        } else {
          summary.failedMatches += 1;
        }
        summary.topDivergences.push({
          matchLabel: `${playerA.name} vs ${playerB.name}`,
          matchUrl: matchRef.url,
          status: matchRef.status,
          maxAbsDiff: perMatchMaxDiff,
          failingModels: perMatchModelFailures,
          notes: perMatchIssues,
        });

        // Memory hygiene: do not keep raw history between matches.
        playerAStats.parsedMatches.length = 0;
        playerBStats.parsedMatches.length = 0;
      } catch (error) {
        summary.skipped.parserError += 1;
        logger.warn(
          `Audit parser error for ${dayMatch.playerAName} vs ${dayMatch.playerBName}: ${stringifyError(
            error,
          )}`,
        );
      }
    }
  } finally {
    summary.finishedAt = new Date().toISOString();
    await closeBrowserSession(session);
  }

  summary.topDivergences.sort((a, b) => b.maxAbsDiff - a.maxAbsDiff);
  summary.topDivergences = summary.topDivergences.slice(0, 10);
  return summary;
}

export function formatCalculationAuditSummary(summary: CalcAuditSummary): string {
  const lines: string[] = [];
  lines.push("=== Calculation Audit Report (active pipeline) ===");
  lines.push(`Started: ${summary.startedAt}`);
  lines.push(`Finished: ${summary.finishedAt}`);
  lines.push(`Tolerance: ±${summary.tolerancePp.toFixed(1)} pp`);
  lines.push(
    `Matches: requested=${summary.requestedMatches} scanned=${summary.scannedMatches} ` +
      `verified=${summary.verifiedMatches} passed=${summary.passedMatches} failed=${summary.failedMatches}`,
  );
  lines.push(
    `Skipped: strict_5_not_reached=${summary.skipped.strict5NotReached}, ` +
      `non_singles_target=${summary.skipped.nonSinglesTarget}, parser_error=${summary.skipped.parserError}`,
  );
  lines.push(
    `History rejections: tech_missing=${summary.historyRejections.techMissing}, ` +
      `metrics_incomplete=${summary.historyRejections.metricsIncomplete}, ` +
      `parse_error=${summary.historyRejections.parseError}`,
  );
  lines.push(`Invariant violations: ${summary.invariantViolations}`);
  lines.push("");
  lines.push("Model diff stats (prod vs oracle):");
  lines.push(formatDiffRow("logReg", summary.modelDiffs.logReg, summary.tolerancePp));
  lines.push(formatDiffRow("markov", summary.modelDiffs.markov, summary.tolerancePp));
  lines.push(formatDiffRow("bradley", summary.modelDiffs.bradley, summary.tolerancePp));
  lines.push(formatDiffRow("pca", summary.modelDiffs.pca, summary.tolerancePp));
  lines.push(formatDiffRow("final", summary.modelDiffs.final, summary.tolerancePp));
  lines.push("");

  if (summary.topDivergences.length === 0) {
    lines.push("Top divergences: n/a");
  } else {
    lines.push("Top divergences:");
    for (const item of summary.topDivergences) {
      const fail = item.failingModels.length > 0 ? item.failingModels.join(",") : "-";
      const notes = item.notes.length > 0 ? item.notes.slice(0, 3).join(" | ") : "-";
      lines.push(
        `- ${item.matchLabel} [${item.status}] max_diff=${item.maxAbsDiff.toFixed(3)} ` +
          `failing_models=${fail} notes=${notes} url=${item.matchUrl}`,
      );
    }
  }

  lines.push("");
  lines.push(
    `PASS/FAIL: ${summary.failedMatches === 0 ? "PASS" : "FAIL"} ` +
      `(failed_matches=${summary.failedMatches}, invariant_violations=${summary.invariantViolations})`,
  );
  return lines.join("\n");
}

interface CompareInput {
  prod: ReturnType<typeof aggregateIndexPairs>;
  oracle: ReturnType<typeof oracleAggregateIndexPairs>;
  tolerance: number;
  summary: CalcAuditSummary;
  issues: string[];
  failingModels: string[];
}

function compareProdOracle(input: CompareInput): number {
  let maxAbsDiff = 0;
  maxAbsDiff = Math.max(
    maxAbsDiff,
    compareModel("logReg", input.prod.modelProbabilities.logRegP1, input.oracle.modelProbabilities.logRegP1, input),
    compareModel("markov", input.prod.modelProbabilities.markovP1, input.oracle.modelProbabilities.markovP1, input),
    compareModel("bradley", input.prod.modelProbabilities.bradleyP1, input.oracle.modelProbabilities.bradleyP1, input),
    compareModel("pca", input.prod.modelProbabilities.pcaP1, input.oracle.modelProbabilities.pcaP1, input),
    compareModel("final", input.prod.modelProbabilities.finalP1, input.oracle.modelProbabilities.finalP1, input),
  );
  return maxAbsDiff;
}

function compareModel(
  name: ModelName,
  prodValue: number | undefined,
  oracleValue: number | undefined,
  input: CompareInput,
): number {
  const acc = input.summary.modelDiffs[name];
  if (!acc) {
    return 0;
  }
  if (!Number.isFinite(prodValue) && !Number.isFinite(oracleValue)) {
    return 0;
  }
  if (!Number.isFinite(prodValue) || !Number.isFinite(oracleValue)) {
    acc.mismatches += 1;
    input.failingModels.push(name);
    input.issues.push(`${name}: availability mismatch (prod=${valueOrDash(prodValue)} oracle=${valueOrDash(oracleValue)})`);
    return input.tolerance + 100;
  }

  const diff = Math.abs((prodValue as number) - (oracleValue as number));
  acc.values.push(diff);
  if (diff > input.tolerance) {
    input.failingModels.push(name);
    input.issues.push(
      `${name}: abs_diff=${diff.toFixed(3)} (prod=${(prodValue as number).toFixed(3)} ` +
        `oracle=${(oracleValue as number).toFixed(3)})`,
    );
  }
  return diff;
}

function validateInvariants(input: {
  summary: CalcAuditSummary;
  issues: string[];
  prod: ReturnType<typeof aggregateIndexPairs>;
  prediction: ReturnType<typeof predict>;
  expectedCoverageA: number;
  expectedCoverageB: number;
}): void {
  const probs = input.prod.modelProbabilities;
  checkRangeInvariant(input, "logRegP1", probs.logRegP1);
  checkRangeInvariant(input, "markovP1", probs.markovP1);
  checkRangeInvariant(input, "bradleyP1", probs.bradleyP1);
  checkRangeInvariant(input, "pcaP1", probs.pcaP1);
  checkRangeInvariant(input, "finalP1", probs.finalP1);

  const w = input.prod.weights;
  const sumWeights = w.logReg + w.markov + w.bradley + w.pca;
  if (Math.abs(sumWeights - 1) > 1e-9) {
    registerInvariantIssue(input, `weights_sum=${sumWeights.toFixed(12)} (expected 1)`);
  }
  if (w.logReg < 0 || w.markov < 0 || w.bradley < 0 || w.pca < 0) {
    registerInvariantIssue(input, "weights contain negative value");
  }

  const hasAnyModel =
    Number.isFinite(probs.logRegP1) ||
    Number.isFinite(probs.markovP1) ||
    Number.isFinite(probs.bradleyP1) ||
    Number.isFinite(probs.pcaP1);
  if (!hasAnyModel && probs.finalP1 !== 50) {
    registerInvariantIssue(input, "all_models_unavailable but finalP1 != 50");
  }

  if (input.prediction.confidence < 0.5 || input.prediction.confidence > 0.95) {
    registerInvariantIssue(
      input,
      `confidence=${input.prediction.confidence.toFixed(6)} out of [0.5,0.95]`,
    );
  }
  if (input.prediction.statsCoverage.playerACollected !== input.expectedCoverageA) {
    registerInvariantIssue(
      input,
      `coverage mismatch A: prediction=${input.prediction.statsCoverage.playerACollected} expected=${input.expectedCoverageA}`,
    );
  }
  if (input.prediction.statsCoverage.playerBCollected !== input.expectedCoverageB) {
    registerInvariantIssue(
      input,
      `coverage mismatch B: prediction=${input.prediction.statsCoverage.playerBCollected} expected=${input.expectedCoverageB}`,
    );
  }

  const modelSummary = input.prediction.modelSummary?.dirt;
  if (!modelSummary) {
    registerInvariantIssue(input, "prediction.modelSummary.dirt missing");
  } else if (modelSummary.validPairs !== input.prod.validPairs) {
    registerInvariantIssue(
      input,
      `validPairs mismatch: prediction=${modelSummary.validPairs} prod=${input.prod.validPairs}`,
    );
  }

  if (!input.prediction.dataStatus?.includes("metrics_policy=stable14")) {
    registerInvariantIssue(input, "dataStatus missing metrics_policy=stable14");
  }
}

function checkRangeInvariant(
  input: { summary: CalcAuditSummary; issues: string[] },
  name: string,
  value: number | undefined,
): void {
  if (!Number.isFinite(value)) {
    return;
  }
  if ((value as number) < 0 || (value as number) > 100) {
    registerInvariantIssue(input, `${name} out of range: ${(value as number).toFixed(6)}`);
  }
}

function registerInvariantIssue(
  input: { summary: CalcAuditSummary; issues: string[] },
  message: string,
): void {
  input.summary.invariantViolations += 1;
  input.issues.push(`invariant: ${message}`);
}

async function collectPlayerStatsForAudit(
  page: Page,
  player: { name: string; profileUrl?: string },
  targetMatchUrl: string,
  config: RunConfig,
  logger: Logger,
): Promise<PlayerRecentStats> {
  const stats: PlayerRecentStats = {
    playerName: player.name,
    profileUrl: player.profileUrl,
    parsedMatches: [],
    missingStatsCount: 0,
    errors: [],
  };
  const scanLimit = Math.max(REQUIRED_HISTORY_COUNT * 6, 30);
  const profileHistory = await extractRecentMatchesFromProfile(page, player, config, logger, {
    excludeMatchUrl: targetMatchUrl,
    needCount: REQUIRED_HISTORY_COUNT,
    scanLimit,
  });
  stats.historyScanStats = {
    candidatePool: profileHistory.candidatePool,
    scanned: 0,
    accepted: 0,
    filtered: {
      sameAsTargetMatch: profileHistory.filtered.sameAsTargetMatch,
      nonSingles: profileHistory.filtered.nonSingles,
      nonSinglesHistory: 0,
      notFinished: profileHistory.filtered.notFinished,
      future: profileHistory.filtered.future,
      invalid: profileHistory.filtered.invalid,
      techMissing: 0,
      metricsIncomplete: 0,
      parseError: 0,
    },
  };

  if (profileHistory.matches.length === 0) {
    stats.errors.push("No valid finished singles candidates found on profile.");
    return stats;
  }

  const scanResult = await scanTechHistoryCandidates({
    playerName: player.name,
    candidates: profileHistory.matches,
    needCount: REQUIRED_HISTORY_COUNT,
    logger,
    parseMatch: async (candidate) =>
      extractTechStatsFromMatch(page, candidate.url, player.name, config, logger),
  });
  stats.parsedMatches.push(...scanResult.parsedMatches);
  stats.missingStatsCount = scanResult.techMissing;
  stats.errors.push(...scanResult.errors);
  stats.historyScanStats.scanned = scanResult.scanned;
  stats.historyScanStats.accepted = scanResult.parsedMatches.length;
  stats.historyScanStats.filtered.techMissing = scanResult.techMissing;
  stats.historyScanStats.filtered.nonSinglesHistory = scanResult.nonSinglesHistory;
  stats.historyScanStats.filtered.metricsIncomplete = scanResult.metricsIncomplete;
  stats.historyScanStats.filtered.parseError = scanResult.parseErrors;
  return stats;
}

function collectFeatureRows(stats: PlayerRecentStats): DirtFeatureRow[] {
  const out: DirtFeatureRow[] = [];
  for (const match of stats.parsedMatches) {
    const row = extractDirtFeatureRow(match);
    if (row) {
      out.push(row);
    }
  }
  return out;
}

function accumulateHistoryRejections(
  summary: CalcAuditSummary,
  playerAStats: PlayerRecentStats,
  playerBStats: PlayerRecentStats,
): void {
  const a = playerAStats.historyScanStats?.filtered;
  const b = playerBStats.historyScanStats?.filtered;
  summary.historyRejections.techMissing += (a?.techMissing || 0) + (b?.techMissing || 0);
  summary.historyRejections.metricsIncomplete +=
    (a?.metricsIncomplete || 0) + (b?.metricsIncomplete || 0);
  summary.historyRejections.parseError += (a?.parseError || 0) + (b?.parseError || 0);
}

function filterByStatus(matches: DayMatchRef[], status: RunConfig["status"]): DayMatchRef[] {
  if (status === "all") {
    return matches;
  }
  return matches.filter((match) => match.status === status);
}

function limitMatches(matches: DayMatchRef[], limit?: number): DayMatchRef[] {
  if (typeof limit !== "number") {
    return matches;
  }
  return matches.slice(0, limit);
}

function emptyDiffAccumulator(): DiffAccumulator {
  return { values: [], mismatches: 0 };
}

function formatDiffRow(name: string, acc: DiffAccumulator, tolerance: number): string {
  const stats = summarizeDiffs(acc.values);
  const failByDiff = stats.max > tolerance;
  const failByMismatch = acc.mismatches > 0;
  const status = failByDiff || failByMismatch ? "FAIL" : "PASS";
  return (
    `- ${name}: ${status} ` +
    `count=${stats.count} mean=${stats.mean.toFixed(3)} p95=${stats.p95.toFixed(3)} max=${stats.max.toFixed(
      3,
    )} mismatches=${acc.mismatches}`
  );
}

function summarizeDiffs(values: number[]): {
  count: number;
  mean: number;
  p95: number;
  max: number;
} {
  if (values.length === 0) {
    return { count: 0, mean: 0, p95: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const max = sorted[sorted.length - 1] || 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1));
  const p95 = sorted[idx] || 0;
  return { count: sorted.length, mean, p95, max };
}

function valueOrDash(value: number | undefined): string {
  if (!Number.isFinite(value)) {
    return "-";
  }
  return (value as number).toFixed(4);
}

function stringifyError(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  return String(value);
}
