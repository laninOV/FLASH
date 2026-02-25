import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { Logger } from "../../src/logger.js";
import { runOutcomeAudit, type OutcomeMatchRecord, type OutcomePredictionInput } from "../../src/audit/outcomeAudit.js";
import type { PredictionResult } from "../../src/types.js";

const DEFAULT_PREDICTIONS_FILE = "tmp/hybrid-shadow-30-predictions.json";
const PREVIOUS_REPORT_FILE = "tmp/hybrid-shadow-30-report.json";
const OUTPUT_REPORT_FILE = "tmp/hybrid-shadow-30-report.recomputed.json";

async function main(): Promise<void> {
  const predictionsFile = readArg(process.argv.slice(2), "predictions-file") || DEFAULT_PREDICTIONS_FILE;
  const logger = new Logger({ debugEnabled: false });
  const startedAt = new Date().toISOString();
  const t0 = performance.now();

  const predictions = (JSON.parse(await readFile(predictionsFile, "utf8")) as unknown[]) as PredictionResult[];
  if (!Array.isArray(predictions) || predictions.length === 0) {
    throw new Error(`No predictions in ${predictionsFile}`);
  }

  const outcomeInput: OutcomePredictionInput[] = predictions.map((prediction) => ({
    matchUrl: prediction.matchUrl,
    mainPick: prediction.predictedWinner,
    novaPick: prediction.modelSummary?.novaEdge?.winner,
    hybridShadowPick: prediction.modelSummary?.hybridShadow?.winner,
    hybridShadowP1: prediction.modelSummary?.hybridShadow?.p1,
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

  logger.info(`Recomputing outcome audit for ${predictions.length} predictions from ${predictionsFile}`);
  const outcome = await runOutcomeAudit({
    matchUrls: predictions.map((p) => p.matchUrl),
    predictions: outcomeInput,
    timeoutMs: 25_000,
    retries: 2,
    logger,
  });

  const joined = joinPredictionsWithOutcomes(predictions, outcome.matches);
  const disagreements = summarizeDisagreements(joined);
  const previousReport = await readPreviousReportSafe(PREVIOUS_REPORT_FILE);

  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    durationSec: round2((performance.now() - t0) / 1000),
    recomputedFromPredictionsFile: predictionsFile,
    collection:
      previousReport?.collection || {
        processedFinishedCandidates: undefined,
        acceptedPredictions: predictions.length,
        parserErrors: undefined,
        skippedDoubles: undefined,
        skippedStrict5: undefined,
        skippedFastStrict5: undefined,
      },
    originalConfig: previousReport?.config,
    hitRate: outcome.hitRate,
    outcomeSummary: {
      fetchedMatches: outcome.matches.length,
      singles: outcome.matches.filter((m) => m.singles).length,
      unmatchedPredictionMatchUrls: outcome.unmatchedPredictionMatchUrls.length,
    },
    disagreements,
    sampleDivergences: joined
      .filter((row) => row.mainPick !== row.hybridPick || row.novaPick !== row.hybridPick)
      .slice(0, 12),
  };

  await writeFile(OUTPUT_REPORT_FILE, JSON.stringify(report, null, 2), "utf8");
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

async function readPreviousReportSafe(path: string): Promise<any | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

function inferMainOdd(prediction: PredictionResult): number | undefined {
  const winner = normalizeLooseName(prediction.predictedWinner);
  const a = normalizeLooseName(prediction.playerAName);
  const b = normalizeLooseName(prediction.playerBName);
  const home = prediction.marketOdds?.home;
  const away = prediction.marketOdds?.away;
  if (winner && a && winner === a && Number.isFinite(home)) return home;
  if (winner && b && winner === b && Number.isFinite(away)) return away;
  return undefined;
}

function joinPredictionsWithOutcomes(predictions: PredictionResult[], matches: OutcomeMatchRecord[]) {
  const predictionByUrl = new Map<string, PredictionResult>();
  for (const prediction of predictions) {
    const key = canonicalizeMatchUrl(prediction.matchUrl);
    if (key) predictionByUrl.set(key, prediction);
  }

  const rows: Array<{
    matchUrl: string;
    label: string;
    winnerName?: string;
    winnerSide?: "A" | "B";
    mainPick?: string;
    novaPick?: string;
    hybridPick?: string;
    mainCorrect?: boolean;
    novaCorrect?: boolean;
    hybridCorrect?: boolean;
  }> = [];

  for (const match of matches) {
    const key = canonicalizeMatchUrl(match.url);
    if (!key || !match.singles || match.winnerSide === "-") continue;
    const prediction = predictionByUrl.get(key);
    if (!prediction) continue;
    const mainSide = normalizePickToSide(prediction.predictedWinner, match);
    const novaSide = normalizePickToSide(prediction.modelSummary?.novaEdge?.winner, match);
    const hybridSide = normalizePickToSide(prediction.modelSummary?.hybridShadow?.winner, match);
    rows.push({
      matchUrl: key,
      label: prediction.matchLabel,
      winnerName: match.winnerName,
      winnerSide: match.winnerSide,
      mainPick: prediction.predictedWinner,
      novaPick: prediction.modelSummary?.novaEdge?.winner,
      hybridPick: prediction.modelSummary?.hybridShadow?.winner,
      mainCorrect: mainSide ? mainSide === match.winnerSide : undefined,
      novaCorrect: novaSide ? novaSide === match.winnerSide : undefined,
      hybridCorrect: hybridSide ? hybridSide === match.winnerSide : undefined,
    });
  }
  return rows;
}

function summarizeDisagreements(rows: ReturnType<typeof joinPredictionsWithOutcomes>) {
  let hybridVsHistoryDiff = 0;
  let hybridVsNovaDiff = 0;
  let allThreeDifferent = 0;
  let hybridOnlyCorrect = 0;
  let historyOnlyCorrect = 0;
  let novaOnlyCorrect = 0;
  let hybridAndHistoryCorrectNovaWrong = 0;
  let hybridAndNovaCorrectHistoryWrong = 0;
  let compared = 0;

  for (const row of rows) {
    compared += 1;
    if (row.hybridPick && row.mainPick && row.hybridPick !== row.mainPick) hybridVsHistoryDiff += 1;
    if (row.hybridPick && row.novaPick && row.hybridPick !== row.novaPick) hybridVsNovaDiff += 1;
    const picks = [row.mainPick, row.novaPick, row.hybridPick].filter(Boolean);
    if (new Set(picks).size === 3) allThreeDifferent += 1;

    const mainC = row.mainCorrect === true;
    const novaC = row.novaCorrect === true;
    const hybridC = row.hybridCorrect === true;
    if (hybridC && !mainC && !novaC) hybridOnlyCorrect += 1;
    if (mainC && !hybridC && !novaC) historyOnlyCorrect += 1;
    if (novaC && !hybridC && !mainC) novaOnlyCorrect += 1;
    if (hybridC && mainC && !novaC) hybridAndHistoryCorrectNovaWrong += 1;
    if (hybridC && novaC && !mainC) hybridAndNovaCorrectHistoryWrong += 1;
  }

  return {
    compared,
    hybridVsHistoryDiff,
    hybridVsNovaDiff,
    allThreeDifferent,
    hybridOnlyCorrect,
    historyOnlyCorrect,
    novaOnlyCorrect,
    hybridAndHistoryCorrectNovaWrong,
    hybridAndNovaCorrectHistoryWrong,
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
  lines.push("=== HYBRID SHADOW VALIDATION (30 finished singles, recomputed outcome) ===");
  lines.push(`Started: ${report.startedAt}`);
  lines.push(`Finished: ${report.finishedAt}`);
  lines.push(`Duration: ${report.durationSec}s`);
  lines.push(`Predictions source: ${report.recomputedFromPredictionsFile}`);
  if (report.originalConfig) {
    lines.push(
      `Original policy: status=${report.originalConfig.status}, strict_history=${report.originalConfig.requiredHistoryCount}, ` +
        `history_stats_miss_budget=${report.originalConfig.historyStatsMissBudget}`,
    );
  }
  if (report.collection) {
    lines.push(
      `Collection(prev): processed_finished=${report.collection.processedFinishedCandidates ?? "-"}, ` +
        `accepted=${report.collection.acceptedPredictions ?? "-"}, parser_errors=${report.collection.parserErrors ?? "-"}, ` +
        `skipped_doubles=${report.collection.skippedDoubles ?? "-"}, strict5=${report.collection.skippedStrict5 ?? "-"}, ` +
        `strict5_fast=${report.collection.skippedFastStrict5 ?? "-"}`,
    );
  }
  lines.push(
    `Outcome fetched: matches=${report.outcomeSummary.fetchedMatches}, singles=${report.outcomeSummary.singles}, ` +
      `unmatched_predictions=${report.outcomeSummary.unmatchedPredictionMatchUrls}`,
  );
  lines.push("");
  lines.push("Hit-rate:");
  lines.push(`- HISTORY-5: ${formatRate(report.hitRate?.main)}`);
  lines.push(`- NOVA: ${formatRate(report.hitRate?.nova)}`);
  lines.push(`- HYBRID (shadow): ${formatRate(report.hitRate?.hybridShadow)}`);
  lines.push("");
  lines.push("Disagreements / usefulness:");
  lines.push(`- Compared matches: ${report.disagreements.compared}`);
  lines.push(`- HYBRID vs HISTORY picks differ: ${report.disagreements.hybridVsHistoryDiff}`);
  lines.push(`- HYBRID vs NOVA picks differ: ${report.disagreements.hybridVsNovaDiff}`);
  lines.push(`- All three picks differ: ${report.disagreements.allThreeDifferent}`);
  lines.push(`- HYBRID only correct: ${report.disagreements.hybridOnlyCorrect}`);
  lines.push(`- HISTORY only correct: ${report.disagreements.historyOnlyCorrect}`);
  lines.push(`- NOVA only correct: ${report.disagreements.novaOnlyCorrect}`);
  lines.push(`- HYBRID+HISTORY correct, NOVA wrong: ${report.disagreements.hybridAndHistoryCorrectNovaWrong}`);
  lines.push(`- HYBRID+NOVA correct, HISTORY wrong: ${report.disagreements.hybridAndNovaCorrectHistoryWrong}`);
  lines.push("");
  lines.push(`Artifact: ${OUTPUT_REPORT_FILE}`);
  lines.push("");
  lines.push("Sample divergences (up to 12):");
  for (const row of report.sampleDivergences || []) {
    lines.push(
      `- ${row.label} | outcome=${row.winnerName || "-"} | ` +
        `H=${row.mainPick || "-"}${flag(row.mainCorrect)} ` +
        `N=${row.novaPick || "-"}${flag(row.novaCorrect)} ` +
        `HY=${row.hybridPick || "-"}${flag(row.hybridCorrect)}`,
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

