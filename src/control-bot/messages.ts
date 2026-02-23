import type { DayMatchRef, RunSummary } from "../types.js";
import { toSortableStartMs } from "../orchestrator/utils.js";

export function formatSummary(label: string, summary: RunSummary): string {
  return (
    `${label} завершён.\n` +
    `processed=${summary.processedMatches}, predicted=${summary.predictedMatches}, ` +
    `skipped=${summary.skippedMatches}, errors=${summary.parserErrors}, ` +
    `telegram_failures=${summary.telegramFailures}`
  );
}

export function chunkLines(lines: string[], maxLen: number): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length <= maxLen) {
      current = next;
      continue;
    }
    if (current) {
      chunks.push(current);
      current = line;
      continue;
    }
    chunks.push(line.slice(0, maxLen));
    current = "";
  }

  if (current) {
    chunks.push(current);
  }
  return chunks;
}

export function formatMatchListEntry(index: number, match: DayMatchRef): string {
  const timeLabel = resolveTimeLabel(match);
  const base = `${index + 1}. ${match.playerAName} vs ${match.playerBName}`;
  return timeLabel ? `${base} | ${timeLabel}` : base;
}

function resolveTimeLabel(match: DayMatchRef): string | undefined {
  if (match.status === "live") {
    return "LIVE";
  }
  const scheduled = String(match.scheduledStartText || "").trim();
  if (!scheduled) {
    return undefined;
  }

  const startMs = toSortableStartMs(scheduled);
  if (typeof startMs !== "number") {
    return undefined;
  }

  const start = new Date(startMs);
  return (
    `${pad2(start.getUTCDate())}.${pad2(start.getUTCMonth() + 1)} ` +
    `${pad2(start.getUTCHours())}:${pad2(start.getUTCMinutes())}`
  );
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}
