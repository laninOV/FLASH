import type { Logger } from "../logger.js";
import {
  extractDirtFeatureRow,
  extractDirtFeatureRowDiagnostics,
} from "../predict/requiredMetrics.js";
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
  budgetNeedCount?: number;
  statsMissBudget?: number;
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
  statsMissesForBudget: number;
  earlyStopReason?: "stats_miss_budget_reached";
  earlyStopBudget?: number;
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
  let statsMissesForBudget = 0;
  let earlyStopReason: "stats_miss_budget_reached" | undefined;
  let earlyStopBudget: number | undefined;
  let metricsIncompleteDiagnosticsLogged = 0;
  const statsMissBudget = Math.max(0, Number(input.statsMissBudget || 0));
  const budgetNeedCount = Math.max(
    0,
    Number.isFinite(input.budgetNeedCount)
      ? Math.trunc(input.budgetNeedCount as number)
      : Math.trunc(input.needCount),
  );

  const shouldStopForBudget = (): boolean =>
    statsMissBudget > 0 &&
    parsedMatches.length < budgetNeedCount &&
    statsMissesForBudget >= statsMissBudget;

  const logMetricsIncompleteDetails = (parsed: HistoricalMatchTechStats, recentUrl: string): void => {
    if (metricsIncompleteDiagnosticsLogged >= 2) {
      return;
    }
    const diagnostics = extractDirtFeatureRowDiagnostics(parsed);
    if (!diagnostics.missingKeys.length) {
      return;
    }
    metricsIncompleteDiagnosticsLogged += 1;
    const presentKeys = Array.from(new Set(parsed.rows.map((row) => row.metricKey).filter(Boolean))).slice(0, 20);
    input.logger?.warn(
      `Player ${input.playerName}: metrics_incomplete missing=[${diagnostics.missingKeys.join(", ")}] ` +
        `for ${recentUrl} (present_metric_keys_sample=[${presentKeys.join(", ")}])`,
    );
  };

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
        statsMissesForBudget += 1;
        errors.push(`Recent match skipped (tech_missing): ${recent.url}`);
        input.logger?.warn(`Player ${input.playerName}: tech_missing for ${recent.url}`);
        if (shouldStopForBudget()) {
          earlyStopReason = "stats_miss_budget_reached";
          earlyStopBudget = statsMissBudget;
          input.logger?.warn(
            `Player ${input.playerName}: early_stop=stats_miss_budget_reached ` +
              `(${statsMissesForBudget}/${statsMissBudget}), accepted=${parsedMatches.length}/${input.needCount}`,
          );
          break;
        }
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
          statsMissesForBudget += 1;
          errors.push(`Recent match skipped (tech_missing): ${recent.url}`);
          input.logger?.warn(`Player ${input.playerName}: tech_missing for ${recent.url}`);
          if (shouldStopForBudget()) {
            earlyStopReason = "stats_miss_budget_reached";
            earlyStopBudget = statsMissBudget;
            input.logger?.warn(
              `Player ${input.playerName}: early_stop=stats_miss_budget_reached ` +
                `(${statsMissesForBudget}/${statsMissBudget}), accepted=${parsedMatches.length}/${input.needCount}`,
            );
            break;
          }
          continue;
        }

        const parsed = parsedResult.parsed;
        if (!extractDirtFeatureRow(parsed)) {
          metricsIncomplete += 1;
          statsMissesForBudget += 1;
          errors.push(`Recent match skipped (metrics_incomplete): ${recent.url}`);
          input.logger?.warn(`Player ${input.playerName}: metrics_incomplete for ${recent.url}`);
          logMetricsIncompleteDetails(parsed, recent.url);
          if (shouldStopForBudget()) {
            earlyStopReason = "stats_miss_budget_reached";
            earlyStopBudget = statsMissBudget;
            input.logger?.warn(
              `Player ${input.playerName}: early_stop=stats_miss_budget_reached ` +
                `(${statsMissesForBudget}/${statsMissBudget}), accepted=${parsedMatches.length}/${input.needCount}`,
            );
            break;
          }
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
        statsMissesForBudget += 1;
        errors.push(`Recent match skipped (metrics_incomplete): ${recent.url}`);
        input.logger?.warn(`Player ${input.playerName}: metrics_incomplete for ${recent.url}`);
        logMetricsIncompleteDetails(parsed, recent.url);
        if (shouldStopForBudget()) {
          earlyStopReason = "stats_miss_budget_reached";
          earlyStopBudget = statsMissBudget;
          input.logger?.warn(
            `Player ${input.playerName}: early_stop=stats_miss_budget_reached ` +
              `(${statsMissesForBudget}/${statsMissBudget}), accepted=${parsedMatches.length}/${input.needCount}`,
          );
          break;
        }
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
    statsMissesForBudget,
    earlyStopReason,
    earlyStopBudget,
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
