import { readFile } from "node:fs/promises";
import { formatOutcomeAudit, runOutcomeAudit, type OutcomePredictionInput } from "./audit/outcomeAudit.js";
import { Logger } from "./logger.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const matchUrlsArg = readArg(argv, "match-urls");
  if (!matchUrlsArg) {
    throw new Error(
      "Usage: npm run audit:outcome -- --match-urls https://www.flashscore.com.ua/match/.../?mid=...[,https://...] [--predictions-file ./predictions.json]",
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
  return parsed.filter((item): item is OutcomePredictionInput => isPredictionInput(item));
}

function isPredictionInput(value: unknown): value is OutcomePredictionInput {
  if (!value || typeof value !== "object") {
    return false;
  }
  const matchUrl = (value as { matchUrl?: unknown }).matchUrl;
  return typeof matchUrl === "string" && matchUrl.trim().length > 0;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Fatal error: ${message}\n`);
  process.exit(1);
});
