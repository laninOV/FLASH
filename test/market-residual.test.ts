import test from "node:test";
import assert from "node:assert/strict";
import { computeMarketResidualShadow } from "../src/predict/marketResidual.js";
import { REQUIRED_DIRT_METRIC_KEYS } from "../src/predict/requiredMetrics.js";
import type { HistoricalMatchTechStats, PlayerRecentStats, TechStatRow } from "../src/types.js";

const METRICS = [...REQUIRED_DIRT_METRIC_KEYS];

function makeTechMatch(
  url: string,
  playerValues: Record<string, number>,
  opponentValues: Record<string, number>,
): HistoricalMatchTechStats {
  const rows: TechStatRow[] = METRICS.map((key) => {
    const pv = playerValues[key] ?? 50;
    const ov = opponentValues[key] ?? 50;
    return {
      section: "Stats",
      metricLabel: key,
      metricKey: key,
      playerValue: { raw: String(pv), percent: pv },
      opponentValue: { raw: String(ov), percent: ov },
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
  matches: Array<{ player: Record<string, number>; opponent: Record<string, number> }>,
): PlayerRecentStats {
  return {
    playerName: name,
    parsedMatches: matches.map((match, index) =>
      makeTechMatch(`https://x/${name}/${index + 1}`, match.player, match.opponent),
    ),
    missingStatsCount: 0,
    errors: [],
  };
}

function cloneValues(values: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v]));
}

function withPatch(base: Record<string, number>, patch: Partial<Record<string, number>>): Record<string, number> {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
    }
  }
  return out;
}

function repeatPair(
  player: Record<string, number>,
  opponent: Record<string, number>,
  count = 5,
): Array<{ player: Record<string, number>; opponent: Record<string, number> }> {
  return Array.from({ length: count }, () => ({
    player: cloneValues(player),
    opponent: cloneValues(opponent),
  }));
}

function strongPlayer(): Record<string, number> {
  return {
    first_serve: 66,
    first_serve_points_won: 76,
    second_serve_points_won: 57,
    break_points_saved: 65,
    double_faults: 2,
    first_serve_return_points_won: 34,
    second_serve_return_points_won: 47,
    break_points_converted: 44,
    total_service_points_won: 71,
    return_points_won: 41,
    total_points_won: 56,
    service_games_won: 81,
    return_games_won: 22,
    total_games_won: 57,
  };
}

function weakPlayer(): Record<string, number> {
  return {
    first_serve: 61,
    first_serve_points_won: 68,
    second_serve_points_won: 49,
    break_points_saved: 56,
    double_faults: 4,
    first_serve_return_points_won: 28,
    second_serve_return_points_won: 40,
    break_points_converted: 34,
    total_service_points_won: 65,
    return_points_won: 35,
    total_points_won: 49,
    service_games_won: 74,
    return_games_won: 16,
    total_games_won: 48,
  };
}

function oppMedium(): Record<string, number> {
  return {
    first_serve: 62,
    first_serve_points_won: 69,
    second_serve_points_won: 50,
    break_points_saved: 57,
    double_faults: 3,
    first_serve_return_points_won: 29,
    second_serve_return_points_won: 41,
    break_points_converted: 35,
    total_service_points_won: 66,
    return_points_won: 36,
    total_points_won: 50,
    service_games_won: 75,
    return_games_won: 17,
    total_games_won: 49,
  };
}

function flatPlayer(): Record<string, number> {
  return {
    first_serve: 60,
    first_serve_points_won: 60,
    second_serve_points_won: 50,
    break_points_saved: 50,
    double_faults: 3,
    first_serve_return_points_won: 30,
    second_serve_return_points_won: 40,
    break_points_converted: 35,
    total_service_points_won: 60,
    return_points_won: 40,
    total_points_won: 50,
    service_games_won: 75,
    return_games_won: 15,
    total_games_won: 50,
  };
}

function marketP1(homeOdd: number, awayOdd: number): number {
  const ih = 1 / homeOdd;
  const ia = 1 / awayOdd;
  return (100 * ih) / (ih + ia);
}

function liftPairQuality(
  pair: { player: Record<string, number>; opponent: Record<string, number> },
  lift: number,
): { player: Record<string, number>; opponent: Record<string, number> } {
  const keys = [
    "total_points_won",
    "return_points_won",
    "total_games_won",
    "service_games_won",
    "return_games_won",
  ] as const;
  const out = {
    player: cloneValues(pair.player),
    opponent: cloneValues(pair.opponent),
  };
  for (const key of keys) {
    out.player[key] = Math.min(99, out.player[key] + lift);
    out.opponent[key] = Math.min(99, out.opponent[key] + lift);
  }
  return out;
}

test("market prior dominates when stats weak", () => {
  const flat = flatPlayer();
  const opp = oppMedium();
  const result = computeMarketResidualShadow({
    playerAStats: makePlayer("A", repeatPair(flat, opp)),
    playerBStats: makePlayer("B", repeatPair(flat, opp)),
    playerAName: "A",
    playerBName: "B",
    requestedPerPlayer: 5,
    homeOdd: 1.5,
    awayOdd: 2.8,
    seed: "mroa-1",
  });

  const prior = marketP1(1.5, 2.8);
  assert.ok(Math.abs(result.p1 - prior) < 1.0);
  assert.equal(result.winner, "A");
});

test("stats residual moves posterior when confidence is high", () => {
  const result = computeMarketResidualShadow({
    playerAStats: makePlayer("A", repeatPair(strongPlayer(), oppMedium())),
    playerBStats: makePlayer("B", repeatPair(weakPlayer(), oppMedium())),
    playerAName: "A",
    playerBName: "B",
    requestedPerPlayer: 5,
    homeOdd: 1.95,
    awayOdd: 1.95,
    seed: "mroa-2",
  });

  assert.ok(result.p1 > 50);
  assert.ok((result.components?.residualAdjRaw || 0) > 0);
  assert.ok((result.components?.gate || 0) > 0);
  assert.ok(!result.warnings.includes("mroa_market_unavailable"));
});

test("missing odds falls back to residual-only", () => {
  const result = computeMarketResidualShadow({
    playerAStats: makePlayer("A", repeatPair(strongPlayer(), oppMedium())),
    playerBStats: makePlayer("B", repeatPair(weakPlayer(), oppMedium())),
    playerAName: "A",
    playerBName: "B",
    requestedPerPlayer: 5,
    seed: "mroa-3",
  });

  assert.ok(result.p1 > 50);
  assert.ok(result.warnings.includes("mroa_market_unavailable"));
  assert.ok((result.components?.marketRel || 0) === 0);
});

test("double_faults inversion is correct in residual dominance", () => {
  const sharedP = withPatch(flatPlayer(), { total_points_won: 50, total_games_won: 50 });
  const sharedO = withPatch(oppMedium(), { total_points_won: 50, total_games_won: 50 });
  const aPairs = repeatPair(withPatch(sharedP, { double_faults: 1 }), withPatch(sharedO, { double_faults: 6 }));
  const bPairs = repeatPair(withPatch(sharedP, { double_faults: 6 }), withPatch(sharedO, { double_faults: 1 }));
  const result = computeMarketResidualShadow({
    playerAStats: makePlayer("A", aPairs),
    playerBStats: makePlayer("B", bPairs),
    playerAName: "A",
    playerBName: "B",
    requestedPerPlayer: 5,
    seed: "mroa-4",
  });

  assert.ok(result.p1 > 50);
  assert.equal(result.winner, "A");
});

test("low coverage -> weak output plus warning", () => {
  const result = computeMarketResidualShadow({
    playerAStats: makePlayer("A", repeatPair(strongPlayer(), oppMedium(), 2)),
    playerBStats: makePlayer("B", repeatPair(weakPlayer(), oppMedium(), 2)),
    playerAName: "A",
    playerBName: "B",
    requestedPerPlayer: 5,
    homeOdd: 2.0,
    awayOdd: 2.0,
    seed: "mroa-5",
  });

  assert.ok(result.warnings.includes("mroa_low_pair_coverage"));
  assert.ok(Number.isFinite(result.p1));
  assert.ok(Number.isFinite(result.p2));
});

test("high market-stats conflict reduces gate", () => {
  const strongVsWeakA = makePlayer("A", repeatPair(strongPlayer(), oppMedium()));
  const strongVsWeakB = makePlayer("B", repeatPair(weakPlayer(), oppMedium()));

  const aligned = computeMarketResidualShadow({
    playerAStats: strongVsWeakA,
    playerBStats: strongVsWeakB,
    playerAName: "A",
    playerBName: "B",
    requestedPerPlayer: 5,
    homeOdd: 1.75,
    awayOdd: 2.2,
    seed: "mroa-6a",
  });
  const conflict = computeMarketResidualShadow({
    playerAStats: strongVsWeakA,
    playerBStats: strongVsWeakB,
    playerAName: "A",
    playerBName: "B",
    requestedPerPlayer: 5,
    homeOdd: 3.2,
    awayOdd: 1.35,
    seed: "mroa-6b",
  });

  assert.ok((conflict.components?.gate || 0) < (aligned.components?.gate || 1));
  assert.ok(typeof conflict.components?.marketStatsDisagreement === "number");
});

test("no NaN/Infinity on flat equal rows", () => {
  const flat = flatPlayer();
  const pairs = repeatPair(flat, flat);
  const result = computeMarketResidualShadow({
    playerAStats: makePlayer("A", pairs),
    playerBStats: makePlayer("B", pairs),
    playerAName: "A",
    playerBName: "B",
    requestedPerPlayer: 5,
    seed: "mroa-7",
  });

  assert.ok(Number.isFinite(result.p1));
  assert.ok(Number.isFinite(result.p2));
  assert.ok(Math.abs(result.p1 + result.p2 - 100) <= 0.2);
});

test("opponent quality reweight changes result vs pure recency baseline", () => {
  const player = strongPlayer();
  const opp = oppMedium();
  const baselineA = repeatPair(player, opp);
  const baselineB = repeatPair(player, opp);
  const liftedA = baselineA.map((pair) => liftPairQuality(pair, 8));

  const baseline = computeMarketResidualShadow({
    playerAStats: makePlayer("A", baselineA),
    playerBStats: makePlayer("B", baselineB),
    playerAName: "A",
    playerBName: "B",
    requestedPerPlayer: 5,
    seed: "mroa-8a",
  });
  const lifted = computeMarketResidualShadow({
    playerAStats: makePlayer("A", liftedA),
    playerBStats: makePlayer("B", baselineB),
    playerAName: "A",
    playerBName: "B",
    requestedPerPlayer: 5,
    seed: "mroa-8b",
  });

  assert.ok(Math.abs((baseline.components?.serveEdge || 0) - (lifted.components?.serveEdge || 0)) < 0.01);
  assert.ok((lifted.components?.oppQualityEdge || 0) > (baseline.components?.oppQualityEdge || 0));
  assert.ok(lifted.p1 >= baseline.p1);
});
