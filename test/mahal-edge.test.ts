import test from "node:test";
import assert from "node:assert/strict";
import { computeMahalEdgeShadow } from "../src/predict/mahalEdge.js";
import { REQUIRED_DIRT_METRIC_KEYS } from "../src/predict/requiredMetrics.js";
import type { HistoricalMatchTechStats, PlayerRecentStats, TechStatRow } from "../src/types.js";

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

const REQUIRED_DIRT_METRICS = [...REQUIRED_DIRT_METRIC_KEYS];

function makePlayer(name: string, rows: Array<Record<string, number>>): PlayerRecentStats {
  return {
    playerName: name,
    parsedMatches: rows.map((values, index) => makeTechMatch(`https://x/${name}/${index + 1}`, values)),
    stateFeatures: [],
    missingStatsCount: 0,
    errors: [],
  };
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

test("stronger stats -> p1 > 50", () => {
  const result = computeMahalEdgeShadow({
    playerAStats: makePlayer("A", rowsRepeat(baseStrong())),
    playerBStats: makePlayer("B", rowsRepeat(baseWeak())),
    playerAName: "A",
    playerBName: "B",
    requestedPerPlayer: 5,
    seed: "seed-1",
  });

  assert.equal(result.source, "stable14_mahal_edge_v2");
  assert.ok(result.p1 > 50);
  assert.equal(result.winner, "A");
  assert.ok((result.components?.scoreS || 0) > 0);
});

test("symmetric stats -> near 50 and deterministic tie-break", () => {
  const sameRows = rowsRepeat(baseStrong());
  const result = computeMahalEdgeShadow({
    playerAStats: makePlayer("A", sameRows),
    playerBStats: makePlayer("B", sameRows),
    playerAName: "A",
    playerBName: "B",
    requestedPerPlayer: 5,
    homeOdd: 2.4,
    awayOdd: 1.7,
    seed: "seed-2",
  });

  assert.equal(result.p1, 50);
  assert.equal(result.p2, 50);
  assert.equal(result.winner, "B");
  assert.ok(result.warnings.includes("mahal_neutral_tiebreak"));
});

test("double_faults inversion works", () => {
  const shared = baseStrong();
  const aRows = rowsRepeat(withDelta(shared, { double_faults: 1 }));
  const bRows = rowsRepeat(withDelta(shared, { double_faults: 8 }));
  const result = computeMahalEdgeShadow({
    playerAStats: makePlayer("A", aRows),
    playerBStats: makePlayer("B", bRows),
    playerAName: "A",
    playerBName: "B",
    requestedPerPlayer: 5,
    seed: "seed-3",
  });

  assert.ok(result.p1 > 50);
  assert.equal(result.winner, "A");
});

test("high variance reduces reliability", () => {
  const aStable = rowsRepeat(baseStrong());
  const aNoisy = [
    withDelta(baseStrong(), { total_points_won: 70, return_points_won: 55 }),
    withDelta(baseStrong(), { total_points_won: 40, return_points_won: 20 }),
    withDelta(baseStrong(), { total_points_won: 68, return_points_won: 54 }),
    withDelta(baseStrong(), { total_points_won: 42, return_points_won: 22 }),
    withDelta(baseStrong(), { total_points_won: 56, return_points_won: 41 }),
  ];
  const bRows = rowsRepeat(baseWeak());

  const stable = computeMahalEdgeShadow({
    playerAStats: makePlayer("A", aStable),
    playerBStats: makePlayer("B", bRows),
    playerAName: "A",
    playerBName: "B",
    requestedPerPlayer: 5,
    seed: "seed-4-stable",
  });
  const noisy = computeMahalEdgeShadow({
    playerAStats: makePlayer("A", aNoisy),
    playerBStats: makePlayer("B", bRows),
    playerAName: "A",
    playerBName: "B",
    requestedPerPlayer: 5,
    seed: "seed-4-noisy",
  });

  assert.ok((noisy.components?.reliability || 0) <= (stable.components?.reliability || 0));
});

test("shrunk variance prevents exploding z-score on tiny dispersion", () => {
  const aRows = rowsRepeat(withDelta(baseStrong(), { total_points_won: 58 }));
  const bRows = rowsRepeat(withDelta(baseStrong(), { total_points_won: 52 }));
  const result = computeMahalEdgeShadow({
    playerAStats: makePlayer("A", aRows),
    playerBStats: makePlayer("B", bRows),
    playerAName: "A",
    playerBName: "B",
    requestedPerPlayer: 5,
    seed: "seed-5",
  });

  assert.ok(result.p1 < 99);
  assert.ok((result.components?.distanceD || 0) < 3.5);
});

test("missing/insufficient rows -> neutral fallback + warning", () => {
  const result = computeMahalEdgeShadow({
    playerAStats: makePlayer("A", []),
    playerBStats: makePlayer("B", []),
    playerAName: "A",
    playerBName: "B",
    requestedPerPlayer: 5,
    seed: "seed-6",
  });

  assert.equal(result.p1, 50);
  assert.equal(result.p2, 50);
  assert.ok(result.warnings.includes("mahal_stats_unavailable"));
  assert.ok(result.warnings.includes("mahal_low_pair_coverage"));
});
