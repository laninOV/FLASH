import type { Logger } from "../logger.js";
import { extractDirtFeatureRow } from "../predict/requiredMetrics.js";
import type {
  HistoricalMatchTechStats,
  PlayerRecentStats,
  RecentMatchRef,
} from "../types.js";
import { stringifyError, throwIfAborted } from "./utils.js";

export type HistoryMatchSkipReason = "tech_missing" | "non_singles_history";

export type ParsedHistoryMatchResult =
  | HistoricalMatchTechStats
  | null
  | {
      status: "ok";
      parsed: HistoricalMatchTechStats;
    }
  | {
      status: "skip";
      reason: HistoryMatchSkipReason;
    };

export interface TechHistoryScanInput {
  playerName: string;
  candidates: RecentMatchRef[];
  needCount: number;
  logger?: Pick<Logger, "debug" | "warn">;
  signal?: AbortSignal;
  parseMatch: (
    candidate: RecentMatchRef,
    index: number,
  ) => Promise<ParsedHistoryMatchResult>;
}

export interface TechHistoryScanOutput {
  parsedMatches: HistoricalMatchTechStats[];
  scanned: number;
  techMissing: number;
  nonSinglesHistory: number;
  metricsIncomplete: number;
  parseErrors: number;
  errors: string[];
}

export async function scanTechHistoryCandidates(
  input: TechHistoryScanInput,
): Promise<TechHistoryScanOutput> {
  const parsedMatches: HistoricalMatchTechStats[] = [];
  const errors: string[] = [];
  let scanned = 0;
  let techMissing = 0;
  let nonSinglesHistory = 0;
  let metricsIncomplete = 0;
  let parseErrors = 0;

  for (let index = 0; index < input.candidates.length; index += 1) {
    throwIfAborted(input.signal);
    if (parsedMatches.length >= input.needCount) {
      break;
    }

    const recent = input.candidates[index];
    scanned += 1;
    input.logger?.debug(
      `Player ${input.playerName}: candidate ${index + 1}/${input.candidates.length}, ` +
        `accepted ${parsedMatches.length}/${input.needCount}, url=${recent.url}`,
    );

    try {
      const parsedResult = await input.parseMatch(recent, index);
      if (!parsedResult) {
        techMissing += 1;
        errors.push(`Recent match skipped (tech_missing): ${recent.url}`);
        input.logger?.warn(`Player ${input.playerName}: tech_missing for ${recent.url}`);
        continue;
      }
      if (typeof parsedResult === "object" && "status" in parsedResult) {
        if (parsedResult.status === "skip") {
          if (parsedResult.reason === "non_singles_history") {
            nonSinglesHistory += 1;
            errors.push(`Recent match skipped (non_singles_history): ${recent.url}`);
            input.logger?.warn(`Player ${input.playerName}: non_singles_history for ${recent.url}`);
            continue;
          }
          techMissing += 1;
          errors.push(`Recent match skipped (tech_missing): ${recent.url}`);
          input.logger?.warn(`Player ${input.playerName}: tech_missing for ${recent.url}`);
          continue;
        }

        const parsed = parsedResult.parsed;
        if (!extractDirtFeatureRow(parsed)) {
          metricsIncomplete += 1;
          errors.push(`Recent match skipped (metrics_incomplete): ${recent.url}`);
          input.logger?.warn(`Player ${input.playerName}: metrics_incomplete for ${recent.url}`);
          continue;
        }

        parsedMatches.push(parsed);
        input.logger?.debug(
          `Player ${input.playerName}: accepted ${parsedMatches.length}/${input.needCount} ` +
            `from ${recent.url}`,
        );
        continue;
      }

      const parsed = parsedResult;
      if (!extractDirtFeatureRow(parsed)) {
        metricsIncomplete += 1;
        errors.push(`Recent match skipped (metrics_incomplete): ${recent.url}`);
        input.logger?.warn(`Player ${input.playerName}: metrics_incomplete for ${recent.url}`);
        continue;
      }

      parsedMatches.push(parsed);
      input.logger?.debug(
        `Player ${input.playerName}: accepted ${parsedMatches.length}/${input.needCount} ` +
          `from ${recent.url}`,
      );
    } catch (error) {
      parseErrors += 1;
      errors.push(`Recent match parse failed (${recent.url}): ${stringifyError(error)}`);
      input.logger?.warn(`Player ${input.playerName}: parse_error for ${recent.url}`);
    }
  }

  return {
    parsedMatches,
    scanned,
    techMissing,
    nonSinglesHistory,
    metricsIncomplete,
    parseErrors,
    errors,
  };
}

export function hasRequiredHistoryCoverage(
  playerAStats: PlayerRecentStats,
  playerBStats: PlayerRecentStats,
  needCount: number,
): boolean {
  return (
    playerAStats.parsedMatches.length >= needCount && playerBStats.parsedMatches.length >= needCount
  );
}
