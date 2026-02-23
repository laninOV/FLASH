import { chromium } from "playwright";
import type { Logger } from "../logger.js";

type WinnerSide = "A" | "B";
type OptionalWinnerSide = WinnerSide | "-";

export interface OutcomeMatchRecord {
  id: string;
  url: string;
  mid?: string;
  homeName: string;
  awayName: string;
  homeSets?: number;
  awaySets?: number;
  setScores: string[];
  winnerSide: OptionalWinnerSide;
  winnerName?: string;
  statusText?: string;
  singles: boolean;
}

export interface OutcomePredictionInput {
  matchUrl: string;
  mainPick?: string;
  novaPick?: string;
  mainOdds?: number;
  mainModelProbabilities?: {
    logRegP1?: number;
    markovP1?: number;
    bradleyP1?: number;
    pcaP1?: number;
  };
}

interface AccuracySummary {
  hit: number;
  total: number;
  rate?: number;
}

interface RoiSummary {
  bets: number;
  profit: number;
  roi?: number;
}

export interface OutcomeAuditResult {
  requestedMatchUrls: string[];
  matches: OutcomeMatchRecord[];
  unmatchedPredictionMatchUrls: string[];
  hitRate?: {
    main: AccuracySummary;
    nova: AccuracySummary;
  };
  componentHitRate?: {
    main: Record<"logistic" | "markov" | "bradley" | "pca", AccuracySummary>;
  };
  roi?: {
    main: RoiSummary;
  };
}

export interface OutcomeAuditOptions {
  matchUrls: string[];
  predictions?: OutcomePredictionInput[];
  timeoutMs?: number;
  retries?: number;
  logger?: Logger;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRIES = 2;

export async function runOutcomeAudit(options: OutcomeAuditOptions): Promise<OutcomeAuditResult> {
  const matchUrls = uniqueCanonicalMatchUrls(options.matchUrls);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const logger = options.logger;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);

  const matches: OutcomeMatchRecord[] = [];
  try {
    for (const url of matchUrls) {
      logger?.debug(`outcome-audit: fetching match ${url}`);
      const parsed = await fetchFlashscoreOutcomeWithRetry(page, url, timeoutMs, retries, logger);
      matches.push(parsed);
    }
  } finally {
    await context.close();
    await browser.close();
  }

  if (!options.predictions || options.predictions.length === 0) {
    return {
      requestedMatchUrls: matchUrls,
      matches,
      unmatchedPredictionMatchUrls: [],
    };
  }

  const predictionByKey = new Map<string, OutcomePredictionInput>();
  for (const raw of options.predictions) {
    const key = canonicalizeMatchUrl(raw.matchUrl);
    if (!key) {
      continue;
    }
    predictionByKey.set(key, raw);
  }

  const matchKeys = new Set(matches.map((m) => canonicalizeMatchUrl(m.url)).filter(Boolean) as string[]);
  const unmatchedPredictionMatchUrls = Array.from(predictionByKey.keys()).filter((k) => !matchKeys.has(k));

  const mainHit = createAccuracySummary();
  const novaHit = createAccuracySummary();
  const mainComponent = createComponentSummary();
  const mainRoi = createRoiSummary();

  for (const match of matches) {
    const key = canonicalizeMatchUrl(match.url);
    if (!key || match.winnerSide === "-") {
      continue;
    }
    const prediction = predictionByKey.get(key);
    if (!prediction) {
      continue;
    }

    applyPickSummary(mainHit, prediction.mainPick, match);
    applyPickSummary(novaHit, prediction.novaPick, match);
    applyComponentSummary(mainComponent, prediction.mainModelProbabilities, match);
    applyRoiSummary(mainRoi, prediction.mainPick, prediction.mainOdds, match);
  }

  return {
    requestedMatchUrls: matchUrls,
    matches,
    unmatchedPredictionMatchUrls,
    hitRate: {
      main: finalizeAccuracy(mainHit),
      nova: finalizeAccuracy(novaHit),
    },
    componentHitRate: {
      main: finalizeComponentSummary(mainComponent),
    },
    roi: {
      main: finalizeRoi(mainRoi),
    },
  };
}

export function formatOutcomeAudit(result: OutcomeAuditResult): string {
  const lines: string[] = [];
  lines.push("=== Outcome Audit ===");
  lines.push(`Requested match URLs: ${result.requestedMatchUrls.length}`);
  lines.push(`Fetched matches: ${result.matches.length}`);
  lines.push(`Singles: ${result.matches.filter((m) => m.singles).length}/${result.matches.length}`);

  if (result.unmatchedPredictionMatchUrls.length > 0) {
    lines.push(`Unmatched prediction matchUrls: ${result.unmatchedPredictionMatchUrls.join(", ")}`);
  }

  if (result.hitRate) {
    lines.push("");
    lines.push("Hit-rate:");
    lines.push(`- HISTORY-5: ${formatAccuracy(result.hitRate.main)}`);
    lines.push(`- NOVA: ${formatAccuracy(result.hitRate.nova)}`);
  } else {
    lines.push("");
    lines.push("Hit-rate: n/a (predictions file not provided)");
  }

  if (result.componentHitRate) {
    lines.push("");
    lines.push("Component hit-rate:");
    lines.push(
      `- MAIN Logistic/Markov/Bradley/PCA: ` +
        `${formatAccuracy(result.componentHitRate.main.logistic)} | ` +
        `${formatAccuracy(result.componentHitRate.main.markov)} | ` +
        `${formatAccuracy(result.componentHitRate.main.bradley)} | ` +
        `${formatAccuracy(result.componentHitRate.main.pca)}`,
    );
  }

  if (result.roi) {
    lines.push("");
    lines.push("ROI:");
    lines.push(`- HISTORY-5: ${formatRoi(result.roi.main)}`);
  }

  lines.push("");
  lines.push("Matches:");
  for (const match of result.matches) {
    const winner = match.winnerName || "-";
    const score = formatMatchScore(match);
    const type = match.singles ? "singles" : "doubles";
    lines.push(`- ${match.id}: ${match.homeName} vs ${match.awayName} | ${score} | ${winner} | ${type}`);
  }

  return lines.join("\n");
}

function formatMatchScore(match: OutcomeMatchRecord): string {
  if (!Number.isFinite(match.homeSets) || !Number.isFinite(match.awaySets)) {
    return "-";
  }
  const sets = match.setScores.length > 0 ? ` (${match.setScores.join(",")})` : "";
  return `${match.homeSets}-${match.awaySets}${sets}`;
}

async function fetchFlashscoreOutcomeWithRetry(
  page: import("playwright").Page,
  url: string,
  timeoutMs: number,
  retries: number,
  logger?: Logger,
): Promise<OutcomeMatchRecord> {
  let lastError: unknown;
  const attempts = Math.max(1, retries + 1);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      try {
        await page.waitForSelector(".duelParticipant, .duelParticipant__container", { timeout: 5000 });
      } catch {
        // Allow fallback parsing from static HTML if selector appears slowly/unavailable.
      }
      await page.waitForTimeout(250);
      const parsed = await page.evaluate((currentUrl) => {
        const normalize = (value: string): string => value.replace(/\s+/g, " ").trim();
        const text = (sel: string): string =>
          normalize((document.querySelector<HTMLElement>(sel)?.textContent || "") as string);

        const parseIntSafe = (raw: string | undefined): number | undefined => {
          const value = normalize(raw || "");
          if (!/^\d+$/.test(value)) {
            return undefined;
          }
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : undefined;
        };

        const cleanName = (raw: string): string => normalize(raw).replace(/\s*\([^)]*\)\s*$/, "").trim();

        const homeName =
          cleanName(
            text(".duelParticipant__home .participant__participantName") ||
              text(".smh__participantName.smh__home"),
          ) || "-";
        const awayName =
          cleanName(
            text(".duelParticipant__away .participant__participantName") ||
              text(".smh__participantName.smh__away"),
          ) || "-";

        const statusText =
          text(".detailScore__status") || text(".fixedHeaderDuel__detailStatus") || undefined;

        const detailScoreSpans = Array.from(document.querySelectorAll<HTMLElement>(".detailScore__wrapper span"))
          .map((el) => normalize(el.textContent || ""))
          .filter(Boolean);
        let homeSets = parseIntSafe(detailScoreSpans[0]);
        let awaySets = parseIntSafe(detailScoreSpans[detailScoreSpans.length - 1]);

        if (!Number.isFinite(homeSets)) {
          homeSets = parseIntSafe(text(".smh__part.smh__score.smh__home"));
        }
        if (!Number.isFinite(awaySets)) {
          awaySets = parseIntSafe(text(".smh__part.smh__score.smh__away"));
        }

        const parseSetCell = (side: "home" | "away", index: number): { games?: number; tb?: number } => {
          const sel = `.smh__part--${index}.smh__${side}`;
          const el = document.querySelector<HTMLElement>(sel);
          if (!el) {
            return {};
          }
          const html = el.innerHTML || "";
          const baseHtml = html.replace(/<sup[^>]*>[\s\S]*?<\/sup>/i, "");
          const baseText = normalize(baseHtml.replace(/<[^>]+>/g, " "));
          const supText = normalize((html.match(/<sup[^>]*>([\s\S]*?)<\/sup>/i)?.[1] || "").replace(/<[^>]+>/g, " "));
          return {
            games: /^\d+$/.test(baseText) ? Number(baseText) : undefined,
            tb: /^\d+$/.test(supText) ? Number(supText) : undefined,
          };
        };

        const setScores: string[] = [];
        for (let i = 1; i <= 5; i += 1) {
          const h = parseSetCell("home", i);
          const a = parseSetCell("away", i);
          if (!Number.isFinite(h.games) || !Number.isFinite(a.games)) {
            continue;
          }
          const tbPart =
            Number.isFinite(h.tb) || Number.isFinite(a.tb)
              ? `(${Number.isFinite(h.tb) ? h.tb : 0}-${Number.isFinite(a.tb) ? a.tb : 0})`
              : "";
          setScores.push(`${h.games}-${a.games}${tbPart}`);
        }

        const homeWinnerClass = !!document.querySelector(".duelParticipant__home.duelParticipant--winner");
        const awayWinnerClass = !!document.querySelector(".duelParticipant__away.duelParticipant--winner");

        const breadcrumbText = Array.from(
          document.querySelectorAll<HTMLElement>("[class*='breadcrumbItemLabel']"),
        )
          .map((el) => normalize(el.textContent || ""))
          .filter(Boolean)
          .join(" ");
        const tournamentContext = normalize(
          `${text(".headerLeague__titleWrapper")} ${text(".headerLeague__meta")} ${breadcrumbText}`,
        );
        const singles = !/(парн|дубл|doubles|mixed)/i.test(tournamentContext);

        const parsedUrl = (() => {
          try {
            return new URL(currentUrl, location.href);
          } catch {
            return new URL(location.href);
          }
        })();
        const mid = normalize(parsedUrl.searchParams.get("mid") || "") || undefined;

        return {
          url: parsedUrl.toString(),
          mid,
          homeName,
          awayName,
          homeSets,
          awaySets,
          setScores,
          statusText,
          singles,
          homeWinnerClass,
          awayWinnerClass,
        };
      }, url);

      const canonical = canonicalizeMatchUrl(parsed.url || url) || url;
      const id = parsed.mid || canonical;
      const hasSetScore = Number.isFinite(parsed.homeSets) && Number.isFinite(parsed.awaySets);
      let winnerSide: OptionalWinnerSide = "-";
      if (hasSetScore) {
        if ((parsed.homeSets as number) > (parsed.awaySets as number)) {
          winnerSide = "A";
        } else if ((parsed.awaySets as number) > (parsed.homeSets as number)) {
          winnerSide = "B";
        }
      } else if (parsed.homeWinnerClass && !parsed.awayWinnerClass) {
        winnerSide = "A";
      } else if (parsed.awayWinnerClass && !parsed.homeWinnerClass) {
        winnerSide = "B";
      }

      const winnerName = winnerSide === "A" ? parsed.homeName : winnerSide === "B" ? parsed.awayName : undefined;
      return {
        id,
        url: canonical,
        mid: parsed.mid,
        homeName: parsed.homeName || "-",
        awayName: parsed.awayName || "-",
        homeSets: parsed.homeSets,
        awaySets: parsed.awaySets,
        setScores: parsed.setScores || [],
        winnerSide,
        winnerName,
        statusText: parsed.statusText,
        singles: parsed.singles !== false,
      } satisfies OutcomeMatchRecord;
    } catch (error) {
      lastError = error;
      logger?.warn(
        `outcome-audit: fetch failed for ${url} (attempt ${attempt}/${attempts}): ${error instanceof Error ? error.message : String(error)}`,
      );
      if (attempt < attempts) {
        await sleep(300 * attempt);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function uniqueCanonicalMatchUrls(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = canonicalizeMatchUrl(value);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(key);
  }
  return out;
}

function canonicalizeMatchUrl(value: string | undefined): string | undefined {
  const text = String(value || "").trim();
  if (!text) {
    return undefined;
  }
  try {
    const parsed = new URL(text);
    const mid = (parsed.searchParams.get("mid") || "").trim();
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    parsed.search = "";
    if (mid) {
      parsed.searchParams.set("mid", mid);
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function createAccuracySummary(): AccuracySummary {
  return { hit: 0, total: 0 };
}

function createRoiSummary(): RoiSummary {
  return { bets: 0, profit: 0 };
}

function createComponentSummary(): Record<"logistic" | "markov" | "bradley" | "pca", AccuracySummary> {
  return {
    logistic: createAccuracySummary(),
    markov: createAccuracySummary(),
    bradley: createAccuracySummary(),
    pca: createAccuracySummary(),
  };
}

function applyPickSummary(summary: AccuracySummary, rawPick: string | undefined, match: OutcomeMatchRecord): void {
  const side = normalizePickToSide(rawPick, match);
  if (!side || match.winnerSide === "-") {
    return;
  }
  summary.total += 1;
  if (side === match.winnerSide) {
    summary.hit += 1;
  }
}

function applyComponentSummary(
  summary: Record<"logistic" | "markov" | "bradley" | "pca", AccuracySummary>,
  probabilities:
    | {
        logRegP1?: number;
        markovP1?: number;
        bradleyP1?: number;
        pcaP1?: number;
      }
    | undefined,
  match: OutcomeMatchRecord,
): void {
  if (!probabilities || match.winnerSide === "-") {
    return;
  }
  applyProbabilitySummary(summary.logistic, probabilities.logRegP1, match.winnerSide);
  applyProbabilitySummary(summary.markov, probabilities.markovP1, match.winnerSide);
  applyProbabilitySummary(summary.bradley, probabilities.bradleyP1, match.winnerSide);
  applyProbabilitySummary(summary.pca, probabilities.pcaP1, match.winnerSide);
}

function applyProbabilitySummary(summary: AccuracySummary, p1: number | undefined, winnerSide: WinnerSide): void {
  if (!Number.isFinite(p1)) {
    return;
  }
  const pickSide: WinnerSide = (p1 as number) >= 50 ? "A" : "B";
  summary.total += 1;
  if (pickSide === winnerSide) {
    summary.hit += 1;
  }
}

function applyRoiSummary(
  summary: RoiSummary,
  rawPick: string | undefined,
  odd: number | undefined,
  match: OutcomeMatchRecord,
): void {
  const side = normalizePickToSide(rawPick, match);
  if (!side || match.winnerSide === "-" || !Number.isFinite(odd)) {
    return;
  }
  summary.bets += 1;
  if (side === match.winnerSide) {
    summary.profit += (odd as number) - 1;
  } else {
    summary.profit -= 1;
  }
}

function normalizePickToSide(rawPick: string | undefined, match: OutcomeMatchRecord): WinnerSide | undefined {
  const value = String(rawPick || "").trim();
  if (!value) {
    return undefined;
  }
  const upper = value.toUpperCase();
  if (upper === "A" || upper === "HOME" || upper === "PLAYER_A" || upper === "P1") {
    return "A";
  }
  if (upper === "B" || upper === "AWAY" || upper === "PLAYER_B" || upper === "P2") {
    return "B";
  }

  const normalizedPick = normalizeLooseName(value);
  if (!normalizedPick) {
    return undefined;
  }
  const normalizedHome = normalizeLooseName(match.homeName);
  const normalizedAway = normalizeLooseName(match.awayName);
  if (matchesLooseName(normalizedPick, normalizedHome)) {
    return "A";
  }
  if (matchesLooseName(normalizedPick, normalizedAway)) {
    return "B";
  }
  return undefined;
}

function matchesLooseName(pick: string, target: string): boolean {
  if (!pick || !target) {
    return false;
  }
  if (pick === target || pick.includes(target) || target.includes(pick)) {
    return true;
  }
  const pickTokens = pick.split(" ").filter(Boolean);
  const targetTokens = target.split(" ").filter(Boolean);
  const pickLast = pickTokens[pickTokens.length - 1] || "";
  const targetLast = targetTokens[targetTokens.length - 1] || "";
  return Boolean(pickLast && targetLast && pickLast === targetLast);
}

function finalizeAccuracy(summary: AccuracySummary): AccuracySummary {
  return {
    ...summary,
    rate: summary.total > 0 ? (summary.hit / summary.total) * 100 : undefined,
  };
}

function finalizeComponentSummary(
  summary: Record<"logistic" | "markov" | "bradley" | "pca", AccuracySummary>,
): Record<"logistic" | "markov" | "bradley" | "pca", AccuracySummary> {
  return {
    logistic: finalizeAccuracy(summary.logistic),
    markov: finalizeAccuracy(summary.markov),
    bradley: finalizeAccuracy(summary.bradley),
    pca: finalizeAccuracy(summary.pca),
  };
}

function finalizeRoi(summary: RoiSummary): RoiSummary {
  return {
    ...summary,
    roi: summary.bets > 0 ? (summary.profit / summary.bets) * 100 : undefined,
  };
}

function formatAccuracy(summary: AccuracySummary): string {
  const rateText = typeof summary.rate === "number" ? `${summary.rate.toFixed(1)}%` : "-";
  return `${summary.hit}/${summary.total} (${rateText})`;
}

function formatRoi(summary: RoiSummary): string {
  if (summary.bets <= 0) {
    return "n/a";
  }
  const roi = typeof summary.roi === "number" ? `${summary.roi.toFixed(1)}%` : "-";
  return `bets=${summary.bets}, profit=${summary.profit.toFixed(2)}, ROI=${roi}`;
}

function normalizeLooseName(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
