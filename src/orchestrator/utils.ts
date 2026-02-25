import { isAbortError as isAbortErrorBase, stringifyError as stringifyErrorBase } from "../common/errors.js";
import type { DayMatchRef, PlayerRecentStats, RunConfig } from "../types.js";

export function filterByStatus(matches: DayMatchRef[], status: RunConfig["status"]): DayMatchRef[] {
  if (status === "all") {
    return matches;
  }
  return matches.filter((match) => match.status === status);
}

export function limitMatches(matches: DayMatchRef[], limit?: number): DayMatchRef[] {
  if (typeof limit !== "number") {
    return matches;
  }
  return matches.slice(0, limit);
}

export function orderMatchesForProcessing(
  matches: DayMatchRef[],
  status: RunConfig["status"],
): DayMatchRef[] {
  if (status !== "upcoming") {
    return matches;
  }

  return matches
    .map((match, index) => ({
      match,
      index,
      startMs: toSortableStartMs(match.scheduledStartText),
    }))
    .sort((a, b) => {
      const aKnown = typeof a.startMs === "number";
      const bKnown = typeof b.startMs === "number";
      if (aKnown && bKnown) {
        if ((a.startMs as number) !== (b.startMs as number)) {
          return (a.startMs as number) - (b.startMs as number);
        }
        return a.index - b.index;
      }
      if (aKnown) {
        return -1;
      }
      if (bKnown) {
        return 1;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.match);
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }
  const error = new Error("Run aborted");
  error.name = "AbortError";
  throw error;
}

export function isAbortError(value: unknown): boolean {
  return isAbortErrorBase(value);
}

export function stringifyError(value: unknown): string {
  return stringifyErrorBase(value);
}

export function formatHistoryScanStats(stats: PlayerRecentStats): string {
  const scan = stats.historyScanStats;
  if (!scan) {
    return "n/a";
  }
  return (
    `pool=${scan.candidatePool}, scanned=${scan.scanned}, accepted=${scan.accepted}, ` +
    `stats_miss_budget=${scan.statsMissBudget ?? "-"}, stats_misses=${scan.statsMissesForBudget ?? "-"}, ` +
    `early_stop=${scan.earlyStopReason ?? "none"}, ` +
    `filtered[same_match=${scan.filtered.sameAsTargetMatch}, ` +
    `doubles=${scan.filtered.nonSingles}, non_singles_history=${scan.filtered.nonSinglesHistory}, ` +
    `not_finished=${scan.filtered.notFinished}, ` +
    `future=${scan.filtered.future}, invalid=${scan.filtered.invalid}, ` +
    `tech_missing=${scan.filtered.techMissing}, metrics_incomplete=${scan.filtered.metricsIncomplete}, ` +
    `parse_error=${scan.filtered.parseError}]`
  );
}

export function toSeconds(ms: number): number {
  if (!Number.isFinite(ms)) {
    return 0;
  }
  return Math.max(0, ms / 1000);
}

export function toSortableStartMs(value: string | undefined): number | undefined {
  const text = String(value || "").trim();
  if (!text) {
    return undefined;
  }

  const ddmmyyyy = text.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/);
  if (ddmmyyyy) {
    const day = Number(ddmmyyyy[1]);
    const month = Number(ddmmyyyy[2]);
    const year = Number(ddmmyyyy[3]);
    const hour = Number(ddmmyyyy[4]);
    const minute = Number(ddmmyyyy[5]);
    return Date.UTC(year, month - 1, day, hour, minute, 0);
  }

  const yyyymmdd = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (yyyymmdd) {
    const year = Number(yyyymmdd[1]);
    const month = Number(yyyymmdd[2]);
    const day = Number(yyyymmdd[3]);
    const hour = Number(yyyymmdd[4]);
    const minute = Number(yyyymmdd[5]);
    return Date.UTC(year, month - 1, day, hour, minute, 0);
  }

  const dots = text.match(/^(\d{2})[./](\d{2})[./](\d{4})\s+(\d{2}):(\d{2})$/);
  if (dots) {
    const day = Number(dots[1]);
    const month = Number(dots[2]);
    const year = Number(dots[3]);
    const hour = Number(dots[4]);
    const minute = Number(dots[5]);
    return Date.UTC(year, month - 1, day, hour, minute, 0);
  }

  const hhmm = text.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const hour = Number(hhmm[1]);
    const minute = Number(hhmm[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return undefined;
    }
    const now = new Date();
    return Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hour,
      minute,
      0,
    );
  }

  return undefined;
}
