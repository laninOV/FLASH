import test from "node:test";
import assert from "node:assert/strict";
import { computeMatchupCrossShadow } from "../src/predict/matchupCross.js";
import { REQUIRED_DIRT_METRIC_KEYS } from "../src/predict/requiredMetrics.js";
import type { HistoricalMatchTechStats, PlayerRecentStats, TechStatRow } from "../src/types.js";

const REQUIRED_DIRT_METRICS = [...REQUIRED_DIRT_METRIC_KEYS];

function makeTechMatch(url: string, values: Record<string, number>): HistoricalMatchTechStats {
  const rows: TechStatRow[] = REQUIRED_DIRT_METRICS.map((key) => ({
    section: "Service",
    metricLabel: key,
    metricKey: key,
    playerValue: { raw: String(values[key] ?? 50), percent: values[key] ?? 50 },
    opponentValue: { raw: "-" },
  }));
  return {
    matchUrl: url,
    playerName: "P",
    sourcePlayerSide: "left",
    rows,
    warnings: [],
  };
}

function makePlayer(name: string, rows: Array<Record<string, number>>): PlayerRecentStats {
  return {
    playerName: name,
    parsedMatches: rows.map((values, index) => makeTechMatch(`https://x/${name}/${index + 1}`, values)),
    stateFeatures: [],
    missingStatsCount: 0,
    errors: [],
  };
}

function rowsRepeat(base: Record<string, number>, count = 5): Array<Record<string, number>> {
  return Array.from({ length: count }, () => ({ ...base }));
}

function withDelta(
  base: Record<string, number>,
  patch: Partial<Record<string, number>>,
): Record<string, number> {
  const out: Record<string, number> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
    }
  }
  return out;
}

function baseStrong(): Record<string, number> {
  return {
    first_serve: 66,
    first_serve_points_won: 76,
    second_serve_points_won: 57,
    break_points_saved: 64,
    double_faults: 1,
    first_serve_return_points_won: 34,
    second_serve_return_points_won: 48,
    break_points_converted: 45,
    total_service_points_won: 71,
    return_points_won: 41,
    total_points_won: 56,
    service_games_won: 82,
    return_games_won: 23,
    total_games_won: 58,
  };
}

function baseWeak(): Record<string, number> {
  return {
    first_serve: 60,
    first_serve_points_won: 67,
    second_serve_points_won: 47,
    break_points_saved: 54,
    double_faults: 5,
    first_serve_return_points_won: 27,
    second_serve_return_points_won: 39,
    break_points_converted: 31,
    total_service_points_won: 64,
    return_points_won: 33,
    total_points_won: 47,
    service_games_won: 73,
    return_games_won: 14,
    total_games_won: 46,
  };
}

test("stronger serve+return matchup -> p1 > 50", () => {
  const result = computeMatchupCrossShadow({
    playerAStats: makePlayer("A", rowsRepeat(baseStrong())),
    playerBStats: makePlayer("B", rowsRepeat(baseWeak())),
    playerAName: "A",
    playerBName: "B",
    requestedPerPlayer: 5,
    seed: "matchup-1",
  });

  assert.equal(result.source, "stable14_matchup_cross_v1");
  assert.ok(result.p1 > 50);
  assert.equal(result.winner, "A");
  assert.ok((result.components?.scoreS || 0) > 0);
});

test("symmetry -> 50/50 + deterministic tiebreak", () => {
  const neutral = {
    first_serve: 50,
    first_serve_points_won: 50,
    second_serve_points_won: 50,
    break_points_saved: 50,
    double_faults: 1,
    first_serve_return_points_won: 50,
    second_serve_return_points_won: 50,
    break_points_converted: 50,
    total_service_points_won: 50,
    return_points_won: 50,
    total_points_won: 50,
    service_games_won: 50,
    return_games_won: 50,
    total_games_won: 50,
  } satisfies Record<string, number>;
  const sameRows = rowsRepeat(neutral);
  const result = computeMatchupCrossShadow({
    playerAStats: makePlayer("A", sameRows),
    playerBStats: makePlayer("B", sameRows),
    playerAName: "A",
    playerBName: "B",
    requestedPerPlayer: 5,
    homeOdd: 2.2,
    awayOdd: 1.7,
    seed: "matchup-2",
  });

  assert.equal(result.p1, 50);
  assert.equal(result.p2, 50);
  assert.equal(result.winner, "B");
  assert.ok(result.warnings.includes("matchup_neutral_tiebreak"));
});

test("cross-term effect favors coherent serve-return matchup at similar control", () => {
  const aRows = rowsRepeat(baseStrong());
  const bCoherentBad = rowsRepeat(
    withDelta(baseWeak(), {
      total_points_won: 50,
      total_games_won: 50,
      first_serve_return_points_won: 24,
      second_serve_return_points_won: 35,
      return_points_won: 30,
      return_games_won: 12,
      first_serve_points_won: 64,
      second_serve_points_won: 45,
      total_service_points_won: 61,
      service_games_won: 70,
    }),
  );
  const bMixed = rowsRepeat(
    withDelta(baseWeak(), {
      total_points_won: 50,
      total_games_won: 50,
      // Strong return blocks A serve, but weak service still gives A return edge.
      first_serve_return_points_won: 38,
      second_serve_return_points_won: 53,
      return_points_won: 45,
      return_games_won: 27,
      first_serve_points_won: 64,
      second_serve_points_won: 45,
      total_service_points_won: 61,
      service_games_won: 70,
    }),
  );

  const coherent = computeMatchupCrossShadow({
    playerAStats: makePlayer("A", aRows),
    playerBStats: makePlayer("B1", bCoherentBad),
    playerAName: "A",
    playerBName: "B1",
    requestedPerPlayer: 5,
    seed: "matchup-3a",
  });
  const mixed = computeMatchupCrossShadow({
    playerAStats: makePlayer("A", aRows),
    playerBStats: makePlayer("B2", bMixed),
    playerAName: "A",
    playerBName: "B2",
    requestedPerPlayer: 5,
    seed: "matchup-3b",
  });

  assert.ok(Math.abs((coherent.components?.controlMatch || 0) - (mixed.components?.controlMatch || 0)) < 0.02);
  assert.ok((coherent.components?.scoreS || 0) > (mixed.components?.scoreS || 0));
  assert.ok(coherent.p1 > mixed.p1);
});

test("component conflict lowers reliability", () => {
  const coherentA = rowsRepeat(baseStrong());
  const coherentB = rowsRepeat(baseWeak());

  const conflictA = rowsRepeat(
    withDelta(baseStrong(), {
      // keep serve side strong
      first_serve_points_won: 78,
      second_serve_points_won: 59,
      total_service_points_won: 74,
      service_games_won: 84,
      // but worsen control/pressure to create conflict
      break_points_converted: 24,
      break_points_saved: 46,
      return_points_won: 31,
      return_games_won: 12,
      total_points_won: 47,
      total_games_won: 45,
    }),
  );
  const conflictB = rowsRepeat(
    withDelta(baseWeak(), {
      // poorer service/return compatibility against A serve
      first_serve_points_won: 66,
      second_serve_points_won: 47,
      total_service_points_won: 63,
      service_games_won: 72,
      // but stronger control/pressure -> conflict with serve/return picture
      break_points_converted: 48,
      break_points_saved: 66,
      return_points_won: 43,
      return_games_won: 24,
      total_points_won: 56,
      total_games_won: 57,
    }),
  );

  const coherent = computeMatchupCrossShadow({
    playerAStats: makePlayer("A", coherentA),
    playerBStats: makePlayer("B", coherentB),
    playerAName: "A",
    playerBName: "B",
    requestedPerPlayer: 5,
    seed: "matchup-4a",
  });
  const conflict = computeMatchupCrossShadow({
    playerAStats: makePlayer("A", conflictA),
    playerBStats: makePlayer("B", conflictB),
    playerAName: "A",
    playerBName: "B",
    requestedPerPlayer: 5,
    seed: "matchup-4b",
  });

  assert.ok((conflict.components?.componentAgreement || 0) < (coherent.components?.componentAgreement || 1));
  assert.ok((conflict.components?.reliability || 0) < (coherent.components?.reliability || 1));
});

test("low coverage fallback -> neutral + warning", () => {
  const result = computeMatchupCrossShadow({
    playerAStats: makePlayer("A", rowsRepeat(baseStrong(), 2)),
    playerBStats: makePlayer("B", rowsRepeat(baseWeak(), 2)),
    playerAName: "A",
    playerBName: "B",
    requestedPerPlayer: 5,
    seed: "matchup-5",
  });

  assert.equal(result.p1, 50);
  assert.equal(result.p2, 50);
  assert.ok(result.warnings.includes("matchup_low_pair_coverage"));
  assert.ok(result.warnings.includes("matchup_neutral_tiebreak"));
});

test("no NaN/Infinity on flat equal rows", () => {
  const flat = rowsRepeat(withDelta(baseStrong(), {
    first_serve: 60,
    first_serve_points_won: 65,
    second_serve_points_won: 50,
    break_points_saved: 55,
    double_faults: 3,
    first_serve_return_points_won: 30,
    second_serve_return_points_won: 40,
    break_points_converted: 35,
    total_service_points_won: 65,
    return_points_won: 35,
    total_points_won: 50,
    service_games_won: 75,
    return_games_won: 15,
    total_games_won: 50,
  }));

  const result = computeMatchupCrossShadow({
    playerAStats: makePlayer("A", flat),
    playerBStats: makePlayer("B", flat),
    playerAName: "A",
    playerBName: "B",
    requestedPerPlayer: 5,
    seed: "matchup-6",
  });

  assert.ok(Number.isFinite(result.p1));
  assert.ok(Number.isFinite(result.p2));
  assert.ok(Number.isFinite(result.components?.scoreS ?? Number.NaN));
  assert.ok(Number.isFinite(result.components?.reliability ?? Number.NaN));
});
