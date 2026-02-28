import test from "node:test";
import assert from "node:assert/strict";
import { computeFormStatsHybrid } from "../src/predict/formStatsHybrid.js";
import { REQUIRED_DIRT_METRIC_KEYS } from "../src/predict/requiredMetrics.js";
import type {
  HistoricalMatchTechStats,
  PlayerRecentFormSummary,
  PlayerRecentStats,
  TechStatRow,
} from "../src/types.js";

function makeTechMatch(url: string, values: Record<string, number>): HistoricalMatchTechStats {
  const rows: TechStatRow[] = REQUIRED_DIRT_METRIC_KEYS.map((key) => {
    const value = values[key] ?? 50;
    return {
      section: "Service",
      metricLabel: key,
      metricKey: key,
      playerValue: { raw: String(value), percent: value },
      opponentValue: { raw: "-" },
    };
  });
  return {
    matchUrl: url,
    playerName: "P",
    sourcePlayerSide: "left",
    rows,
    warnings: [],
  };
}

function makePlayer(
  name: string,
  metricValues: Record<string, number>,
  count = 5,
  recentForm?: Partial<PlayerRecentFormSummary>,
): PlayerRecentStats {
  return {
    playerName: name,
    parsedMatches: Array.from({ length: count }, (_, index) =>
      makeTechMatch(`https://x/${name}/${index + 1}`, metricValues),
    ),
    stateFeatures: [],
    recentForm: recentForm
      ? ({
          windowRequested: 8,
          windowUsed: recentForm.windowUsed ?? recentForm.usableMatches ?? 8,
          wins: recentForm.wins ?? 4,
          losses: recentForm.losses ?? 4,
          weightedScore: recentForm.weightedScore ?? 0,
          usableMatches: recentForm.usableMatches ?? recentForm.windowUsed ?? 8,
          unparsedScoreRows: recentForm.unparsedScoreRows ?? 0,
          source: "profile_results_flashscore_v1",
        } satisfies PlayerRecentFormSummary)
      : undefined,
    missingStatsCount: 0,
    errors: [],
  };
}

function strongMetrics(): Record<string, number> {
  return {
    first_serve: 67,
    first_serve_points_won: 78,
    second_serve_points_won: 58,
    break_points_saved: 64,
    double_faults: 1,
    first_serve_return_points_won: 35,
    second_serve_return_points_won: 49,
    break_points_converted: 46,
    total_service_points_won: 71,
    return_points_won: 41,
    total_points_won: 57,
    service_games_won: 82,
    return_games_won: 24,
    total_games_won: 59,
  };
}

function weakMetrics(): Record<string, number> {
  return {
    first_serve: 59,
    first_serve_points_won: 66,
    second_serve_points_won: 46,
    break_points_saved: 52,
    double_faults: 5,
    first_serve_return_points_won: 25,
    second_serve_return_points_won: 38,
    break_points_converted: 31,
    total_service_points_won: 63,
    return_points_won: 32,
    total_points_won: 47,
    service_games_won: 71,
    return_games_won: 14,
    total_games_won: 45,
  };
}

test("computeFormStatsHybrid uses stats component and points to stronger player", () => {
  const result = computeFormStatsHybrid({
    playerAStats: makePlayer("Player A", strongMetrics(), 5, { weightedScore: 0 }),
    playerBStats: makePlayer("Player B", weakMetrics(), 5, { weightedScore: 0 }),
    playerAName: "Player A",
    playerBName: "Player B",
    requestedPerPlayer: 5,
    seed: "seed-1",
  });

  assert.equal(result.source, "form_stats_hybrid_v2");
  assert.ok((result.components.statsP1 || 0) > 50);
  assert.ok(result.p1 > 50);
  assert.equal(result.winner, "Player A");
});

test("computeFormStatsHybrid uses form component when tech stats are equal", () => {
  const same = strongMetrics();
  const result = computeFormStatsHybrid({
    playerAStats: makePlayer("Player A", same, 5, { weightedScore: 0.8, usableMatches: 8, wins: 7, losses: 1 }),
    playerBStats: makePlayer("Player B", same, 5, { weightedScore: -0.6, usableMatches: 8, wins: 2, losses: 6 }),
    playerAName: "Player A",
    playerBName: "Player B",
    requestedPerPlayer: 5,
    seed: "seed-2",
  });

  assert.ok((result.components.formP1 || 0) > 50);
  assert.ok(result.p1 > 50);
  assert.equal(result.winner, "Player A");
});

test("computeFormStatsHybrid applies reliability shrink toward 50", () => {
  const result = computeFormStatsHybrid({
    playerAStats: makePlayer("Player A", strongMetrics(), 1, { weightedScore: 1, usableMatches: 1, wins: 1, losses: 0 }),
    playerBStats: makePlayer("Player B", weakMetrics(), 1, { weightedScore: -1, usableMatches: 1, wins: 0, losses: 1 }),
    playerAName: "Player A",
    playerBName: "Player B",
    requestedPerPlayer: 5,
    seed: "seed-3",
  });

  assert.ok((result.components.hybridReliability || 0) < 1);
  assert.ok(typeof result.components.hybridRawP1 === "number");
  assert.ok(Math.abs(result.p1 - 50) < Math.abs((result.components.hybridRawP1 || 50) - 50));
});

test("computeFormStatsHybrid uses odds/seed tiebreak when hybrid probability is neutral", () => {
  const same = strongMetrics();
  const result = computeFormStatsHybrid({
    playerAStats: makePlayer("Player A", same, 5, { weightedScore: 0 }),
    playerBStats: makePlayer("Player B", same, 5, { weightedScore: 0 }),
    playerAName: "Player A",
    playerBName: "Player B",
    requestedPerPlayer: 5,
    homeOdd: 2.4,
    awayOdd: 1.5,
    seed: "seed-4",
  });

  assert.equal(result.p1, 50);
  assert.equal(result.p2, 50);
  assert.equal(result.winner, "Player B");
});
