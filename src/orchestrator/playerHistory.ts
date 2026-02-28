import type { Page } from "playwright";
import type { Logger } from "../logger.js";
import { extractRecentMatchesFromProfile } from "../extract/playerProfile.js";
import { extractFlashscoreMid } from "../extract/shared.js";
import { extractTechStatsFromMatch } from "../extract/techStats.js";
import { buildPlayerStateFeature } from "../predict/playerStateIndices.js";
import type {
  HistoricalMatchTechStats,
  PlayerRecentStats,
  RecentMatchRef,
  RunConfig,
} from "../types.js";
import { STATE_HISTORY_TARGET } from "./constants.js";
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
    stateFeatures: [],
    missingStatsCount: 0,
    errors: [],
  };

  const scanNeedCount = Math.max(requiredHistoryCount, STATE_HISTORY_TARGET);
  const scanLimit = Math.max(scanNeedCount * 8, 80);
  throwIfAborted(signal);
  const profileHistory = await extractRecentMatchesFromProfile(page, player, config, logger, {
    excludeMatchUrl: targetMatchUrl,
    needCount: scanNeedCount,
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
    needCount: scanNeedCount,
    budgetNeedCount: requiredHistoryCount,
    statsMissBudget: config.historyStatsMissBudget,
    logger,
    signal,
    parseMatch: async (candidate) =>
      extractTechStatsFromMatch(page, candidate.url, player.name, config, logger),
  });
  stats.parsedMatches.push(...scanResult.parsedMatches);
  stats.stateFeatures = buildStateFeatures(scanResult.parsedMatches, recentMatches);
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
        `accepted=${scanResult.parsedMatches.length}/${scanNeedCount}.`,
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

interface RecentMatchMeta {
  candidateIndex: number;
  tournament?: string;
  resultText?: string;
  scoreText?: string;
}

function buildStateFeatures(
  parsedMatches: HistoricalMatchTechStats[],
  recentMatches: RecentMatchRef[],
): PlayerRecentStats["stateFeatures"] {
  const byKey = new Map<string, RecentMatchMeta>();
  for (let index = 0; index < recentMatches.length; index += 1) {
    const recent = recentMatches[index];
    const meta: RecentMatchMeta = {
      candidateIndex: index,
      tournament: recent.tournament,
      resultText: recent.resultText,
      scoreText: recent.scoreText,
    };
    for (const key of resolveHistoryUrlKeys(recent.url)) {
      if (!byKey.has(key)) {
        byKey.set(key, meta);
      }
    }
  }

  const out: PlayerRecentStats["stateFeatures"] = [];
  for (let index = 0; index < parsedMatches.length; index += 1) {
    const parsed = parsedMatches[index];
    let meta: RecentMatchMeta | undefined;
    for (const key of resolveHistoryUrlKeys(parsed.matchUrl)) {
      const found = byKey.get(key);
      if (found) {
        meta = found;
        break;
      }
    }
    const feature = buildPlayerStateFeature(parsed, {
      candidateIndex: meta?.candidateIndex ?? index,
      tournament: meta?.tournament,
      resultText: meta?.resultText,
      scoreText: meta?.scoreText,
    });
    if (feature) {
      out.push(feature);
    }
  }

  out.sort((a, b) => a.candidateIndex - b.candidateIndex);
  return out;
}

function resolveHistoryUrlKeys(url: string | undefined): string[] {
  const keys: string[] = [];
  const text = String(url || "").trim();
  if (!text) {
    return keys;
  }
  const mid = extractFlashscoreMid(text);
  if (mid) {
    keys.push(`mid:${mid}`);
  }
  const normalized = normalizeUrl(text);
  if (normalized) {
    keys.push(`url:${normalized}`);
  }
  return keys;
}

function normalizeUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const mid = extractFlashscoreMid(url);
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
