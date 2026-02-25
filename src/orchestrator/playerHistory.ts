import type { Page } from "playwright";
import type { Logger } from "../logger.js";
import { extractRecentMatchesFromProfile } from "../extract/playerProfile.js";
import { extractTechStatsFromMatch } from "../extract/techStats.js";
import type { PlayerRecentStats, RunConfig } from "../types.js";
import { scanTechHistoryCandidates } from "./historyScan.js";
import { buildPlayerRecentFormSummary } from "./playerForm.js";
import { throwIfAborted } from "./utils.js";

export interface CollectPlayerStatsInput {
  page: Page;
  player: { name: string; profileUrl?: string };
  targetMatchUrl: string;
  config: RunConfig;
  logger: Logger;
  signal?: AbortSignal;
  requiredHistoryCount: number;
}

export async function collectPlayerStats(input: CollectPlayerStatsInput): Promise<PlayerRecentStats> {
  const { page, player, targetMatchUrl, config, logger, signal, requiredHistoryCount } = input;
  throwIfAborted(signal);

  const stats: PlayerRecentStats = {
    playerName: player.name,
    profileUrl: player.profileUrl,
    parsedMatches: [],
    missingStatsCount: 0,
    errors: [],
  };

  const scanLimit = Math.max(requiredHistoryCount * 6, 30);
  throwIfAborted(signal);
  const profileHistory = await extractRecentMatchesFromProfile(page, player, config, logger, {
    excludeMatchUrl: targetMatchUrl,
    needCount: requiredHistoryCount,
    scanLimit,
  });
  const recentMatches = profileHistory.matches;
  stats.recentForm = buildPlayerRecentFormSummary(recentMatches);
  stats.historyScanStats = {
    candidatePool: profileHistory.candidatePool,
    scanned: 0,
    accepted: 0,
    statsMissBudget: config.historyStatsMissBudget,
    statsMissesForBudget: 0,
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

  if (recentMatches.length === 0) {
    stats.errors.push("No valid finished singles candidates found on profile.");
    return stats;
  }

  const scanResult = await scanTechHistoryCandidates({
    playerName: player.name,
    candidates: recentMatches,
    needCount: requiredHistoryCount,
    statsMissBudget: config.historyStatsMissBudget,
    logger,
    signal,
    parseMatch: async (candidate) =>
      extractTechStatsFromMatch(page, candidate.url, player.name, config, logger),
  });
  stats.parsedMatches.push(...scanResult.parsedMatches);
  stats.missingStatsCount = scanResult.techMissing;
  stats.errors.push(...scanResult.errors);
  if (stats.historyScanStats) {
    stats.historyScanStats.scanned = scanResult.scanned;
    stats.historyScanStats.accepted = scanResult.parsedMatches.length;
    stats.historyScanStats.statsMissesForBudget = scanResult.statsMissesForBudget;
    stats.historyScanStats.earlyStopReason = scanResult.earlyStopReason;
    stats.historyScanStats.filtered.techMissing = scanResult.techMissing;
    stats.historyScanStats.filtered.nonSinglesHistory = scanResult.nonSinglesHistory;
    stats.historyScanStats.filtered.metricsIncomplete = scanResult.metricsIncomplete;
    stats.historyScanStats.filtered.parseError = scanResult.parseErrors;
  }

  if (scanResult.earlyStopReason === "stats_miss_budget_reached") {
    logger.warn(
      `Player ${player.name}: early stop (${scanResult.earlyStopReason} ` +
        `${scanResult.statsMissesForBudget}/${scanResult.earlyStopBudget ?? config.historyStatsMissBudget}), ` +
        `accepted=${scanResult.parsedMatches.length}/${requiredHistoryCount}.`,
    );
  }

  if (stats.parsedMatches.length < requiredHistoryCount) {
    logger.warn(
      `Player ${player.name}: insufficient valid Tech history ` +
        `(${stats.parsedMatches.length}/${requiredHistoryCount}).`,
    );
  } else {
    logger.debug(
      `Player ${player.name}: collected ${stats.parsedMatches.length}/${requiredHistoryCount} ` +
        `valid Tech matches.`,
    );
  }

  return stats;
}
