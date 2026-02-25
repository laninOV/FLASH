import { readFile } from "node:fs/promises";
import { formatOutcomeAudit, runOutcomeAudit, type OutcomePredictionInput } from "./audit/outcomeAudit.js";
import { Logger } from "./logger.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const matchUrlsArg = readArg(argv, "match-urls");
  if (!matchUrlsArg) {
    throw new Error(
      "Usage: npm run audit:outcome -- --match-urls https://www.flashscore.co.ke/match/.../?mid=...[,https://...] [--predictions-file ./predictions.json]",
    );
  }

  const matchUrls = matchUrlsArg
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (matchUrls.length === 0) {
    throw new Error("No valid match URLs provided in --match-urls.");
  }

  const timeoutMs = readInt(argv, "timeout-ms");
  const retries = readInt(argv, "retries");
  const predictionsFile = readArg(argv, "predictions-file");
  const predictions = predictionsFile ? await readPredictionsFile(predictionsFile) : undefined;
  const logger = new Logger({ debugEnabled: true });

  const result = await runOutcomeAudit({
    matchUrls,
    predictions,
    timeoutMs,
    retries,
    logger,
  });
  process.stdout.write(`${formatOutcomeAudit(result)}\n`);
}

function readArg(argv: string[], key: string): string | undefined {
  const token = `--${key}`;
  const index = argv.findIndex((value) => value === token);
  if (index < 0) {
    return undefined;
  }
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    return undefined;
  }
  return value;
}

function readInt(argv: string[], key: string): number | undefined {
  const value = readArg(argv, key);
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
}

async function readPredictionsFile(path: string): Promise<OutcomePredictionInput[]> {
  const body = await readFile(path, "utf8");
  const parsed = JSON.parse(body) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`predictions-file must contain a JSON array: ${path}`);
  }
  return parsed
    .map((item) => normalizePredictionInput(item))
    .filter((item): item is OutcomePredictionInput => Boolean(item));
}

function isPredictionInput(value: unknown): value is OutcomePredictionInput {
  if (!value || typeof value !== "object") {
    return false;
  }
  const matchUrl = (value as { matchUrl?: unknown }).matchUrl;
  return typeof matchUrl === "string" && matchUrl.trim().length > 0;
}

function normalizePredictionInput(value: unknown): OutcomePredictionInput | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const matchUrl = stringOrUndefined(record.matchUrl);
  if (!matchUrl) {
    return undefined;
  }

  const looksLikeFullPrediction =
    typeof record.predictedWinner === "string" || typeof record.modelSummary === "object";
  if (!looksLikeFullPrediction && isPredictionInput(value)) {
    return {
      matchUrl,
      mainPick: stringOrUndefined(record.mainPick),
      novaPick: stringOrUndefined(record.novaPick),
      hybridShadowPick: stringOrUndefined(record.hybridShadowPick),
      mahalShadowPick: stringOrUndefined(record.mahalShadowPick),
      matchupShadowPick: stringOrUndefined(record.matchupShadowPick),
      marketResidualShadowPick: stringOrUndefined(record.marketResidualShadowPick),
      mainOdds: numberOrUndefined(record.mainOdds),
      hybridShadowP1: numberOrUndefined(record.hybridShadowP1),
      mahalShadowP1: numberOrUndefined(record.mahalShadowP1),
      matchupShadowP1: numberOrUndefined(record.matchupShadowP1),
      marketResidualShadowP1: numberOrUndefined(record.marketResidualShadowP1),
      mainModelProbabilities: normalizeMainModelProbabilities(record.mainModelProbabilities),
    };
  }

  const modelSummary = asRecord(record.modelSummary);
  const dirt = asRecord(modelSummary?.dirt);
  const modelProbabilities = asRecord(dirt?.modelProbabilities);
  const novaEdge = asRecord(modelSummary?.novaEdge);
  const hybridShadow = asRecord(modelSummary?.hybridShadow);
  const mahalShadow = asRecord(modelSummary?.mahalShadow);
  const matchupShadow = asRecord(modelSummary?.matchupShadow);
  const marketResidualShadow = asRecord(modelSummary?.marketResidualShadow);

  return {
    matchUrl,
    mainPick: stringOrUndefined(record.predictedWinner),
    novaPick: stringOrUndefined(novaEdge?.winner),
    hybridShadowPick: stringOrUndefined(hybridShadow?.winner),
    mahalShadowPick: stringOrUndefined(mahalShadow?.winner),
    matchupShadowPick: stringOrUndefined(matchupShadow?.winner),
    marketResidualShadowPick: stringOrUndefined(marketResidualShadow?.winner),
    hybridShadowP1: numberOrUndefined(hybridShadow?.p1),
    mahalShadowP1: numberOrUndefined(mahalShadow?.p1),
    matchupShadowP1: numberOrUndefined(matchupShadow?.p1),
    marketResidualShadowP1: numberOrUndefined(marketResidualShadow?.p1),
    mainOdds: inferMainOdd(record),
    mainModelProbabilities: normalizeMainModelProbabilities(modelProbabilities),
  };
}

function normalizeMainModelProbabilities(value: unknown): OutcomePredictionInput["mainModelProbabilities"] {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  const out = {
    logRegP1: numberOrUndefined(record.logRegP1),
    markovP1: numberOrUndefined(record.markovP1),
    bradleyP1: numberOrUndefined(record.bradleyP1),
    pcaP1: numberOrUndefined(record.pcaP1),
  };
  if (
    out.logRegP1 === undefined &&
    out.markovP1 === undefined &&
    out.bradleyP1 === undefined &&
    out.pcaP1 === undefined
  ) {
    return undefined;
  }
  return out;
}

function inferMainOdd(record: Record<string, unknown>): number | undefined {
  const predictedWinner = normalizeLooseName(stringOrUndefined(record.predictedWinner));
  if (!predictedWinner) {
    return undefined;
  }
  const playerA = normalizeLooseName(stringOrUndefined(record.playerAName));
  const playerB = normalizeLooseName(stringOrUndefined(record.playerBName));
  const marketOdds = asRecord(record.marketOdds);
  const home = numberOrUndefined(marketOdds?.home);
  const away = numberOrUndefined(marketOdds?.away);

  if (playerA && predictedWinner === playerA) {
    return home;
  }
  if (playerB && predictedWinner === playerB) {
    return away;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeLooseName(value: string | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Fatal error: ${message}\n`);
  process.exit(1);
});
