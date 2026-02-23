import test from "node:test";
import assert from "node:assert/strict";
import { aggregateIndexPairs } from "../src/predict/dirtPairs.js";
import type { DirtFeatureRow } from "../src/predict/requiredMetrics.js";

function makeRow(matchUrl: string, base: number): DirtFeatureRow {
  return {
    matchUrl,
    first_serve: base,
    first_serve_points_won: base,
    second_serve_points_won: base,
    break_points_saved: base,
    double_faults: Math.max(0, 100 - base),
    first_serve_return_points_won: base,
    second_serve_return_points_won: base,
    break_points_converted: base,
    total_service_points_won: base,
    return_points_won: base,
    total_points_won: base,
    service_games_won: base,
    return_games_won: base,
    total_games_won: base,
  };
}

test("model reliability decreases with high per-pair volatility", () => {
  const stableHome = Array.from({ length: 5 }, (_, i) => makeRow(`https://stable/home/${i}`, 62));
  const stableAway = Array.from({ length: 5 }, (_, i) => makeRow(`https://stable/away/${i}`, 52));
  const stable = aggregateIndexPairs(stableHome, stableAway, 5);

  const volatileHome = [90, 35, 88, 33, 87].map((value, i) =>
    makeRow(`https://volatile/home/${i}`, value),
  );
  const volatileAway = [40, 80, 42, 82, 43].map((value, i) =>
    makeRow(`https://volatile/away/${i}`, value),
  );
  const volatile = aggregateIndexPairs(volatileHome, volatileAway, 5);

  assert.ok((stable.reliabilities.logReg || 0) > (volatile.reliabilities.logReg || 0));
  assert.ok((stable.reliabilities.markov || 0) > (volatile.reliabilities.markov || 0));
  assert.ok((stable.reliabilities.bradley || 0) > (volatile.reliabilities.bradley || 0));
});
