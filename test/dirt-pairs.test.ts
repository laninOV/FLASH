import test from "node:test";
import assert from "node:assert/strict";
import {
  DIRT_PAIR_INVERTED_METRICS,
  DIRT_PAIR_PCA_FEATURES,
  DIRT_PAIR_STABLE14_METRICS,
  aggregateIndexPairs,
  buildIndexPairs,
  computePairModelOutput,
} from "../src/predict/dirtPairs.js";
import {
  REQUIRED_DIRT_METRIC_KEYS,
  type DirtFeatureRow,
} from "../src/predict/requiredMetrics.js";

function makeRow(matchUrl: string, base: number): DirtFeatureRow {
  return {
    matchUrl,
    first_serve: base,
    first_serve_points_won: base + 3,
    second_serve_points_won: base + 1,
    break_points_saved: base + 2,
    double_faults: Math.max(1, base - 10),
    first_serve_return_points_won: base - 8,
    second_serve_return_points_won: base - 4,
    break_points_converted: base - 6,
    total_service_points_won: base + 2,
    return_points_won: base - 6,
    total_points_won: base - 1,
    service_games_won: base + 2,
    return_games_won: base - 8,
    total_games_won: base - 2,
  };
}

test("dirtPairs comparison and PCA feature sets are stable14", () => {
  assert.deepEqual(DIRT_PAIR_STABLE14_METRICS, REQUIRED_DIRT_METRIC_KEYS);
  assert.deepEqual(DIRT_PAIR_PCA_FEATURES, REQUIRED_DIRT_METRIC_KEYS);
});

test("dirtPairs inverted metrics contains only double_faults", () => {
  assert.deepEqual(Array.from(DIRT_PAIR_INVERTED_METRICS), ["double_faults"]);
});

test("buildIndexPairs creates exactly 5 A#i/B#i pairs in order", () => {
  const home = Array.from({ length: 5 }, (_, i) => makeRow(`https://home/${i}`, 65 - i));
  const away = Array.from({ length: 5 }, (_, i) => makeRow(`https://away/${i}`, 52 - i));

  const pairs = buildIndexPairs(home, away, 5);
  assert.equal(pairs.length, 5);
  assert.equal(pairs[0]?.home.matchUrl, "https://home/0");
  assert.equal(pairs[0]?.away.matchUrl, "https://away/0");
  assert.equal(pairs[4]?.home.matchUrl, "https://home/4");
  assert.equal(pairs[4]?.away.matchUrl, "https://away/4");
});

test("aggregateIndexPairs averages per-pair probabilities and keeps weighted final", () => {
  const home = Array.from({ length: 5 }, (_, i) => makeRow(`https://home/${i}`, 67 - i));
  const away = Array.from({ length: 5 }, (_, i) => makeRow(`https://away/${i}`, 51 - i));

  const pairs = buildIndexPairs(home, away, 5);
  const individual = pairs.map((pair) => computePairModelOutput(pair));
  const aggregate = aggregateIndexPairs(home, away, 5);

  const logRegValues = individual
    .map((item) => item.logRegP1)
    .filter((value): value is number => Number.isFinite(value));
  const avgLogReg = logRegValues.reduce((sum, value) => sum + value, 0) / logRegValues.length;

  assert.equal(aggregate.validPairs, 5);
  assert.ok((aggregate.modelProbabilities.logRegP1 || 0) > 50);
  assert.ok((aggregate.modelProbabilities.finalP1 || 0) > 50);
  assert.ok(Math.abs((aggregate.modelProbabilities.logRegP1 || 0) - avgLogReg) < 1e-9);
  assert.ok(aggregate.weights.logReg >= 0);
  assert.ok(aggregate.weights.markov >= 0);
  assert.ok(aggregate.weights.bradley >= 0);
  assert.ok(aggregate.weights.pca >= 0);
  assert.ok(
    Math.abs(
      aggregate.weights.logReg +
        aggregate.weights.markov +
        aggregate.weights.bradley +
        aggregate.weights.pca -
        1,
    ) < 1e-9,
  );
});

test("logistic keeps zero metric values instead of dropping them", () => {
  const home = Array.from({ length: 5 }, (_, i) => makeRow(`https://home/zero/${i}`, 60));
  const away = Array.from({ length: 5 }, (_, i) => makeRow(`https://away/zero/${i}`, 60));

  for (let i = 0; i < 5; i += 1) {
    home[i] = { ...home[i]!, first_serve_return_points_won: 0 };
    away[i] = { ...away[i]!, first_serve_return_points_won: 0 };
  }

  const aggregate = aggregateIndexPairs(home, away, 5);
  assert.equal(aggregate.modelProbabilities.logRegP1, 50);
});

test("history-mode PCA stays near 50 on symmetric history", () => {
  const home = Array.from({ length: 5 }, (_, i) => makeRow(`https://home/pca/${i}`, 58 - i));
  const away = Array.from({ length: 5 }, (_, i) => makeRow(`https://away/pca/${i}`, 58 - i));
  const aggregate = aggregateIndexPairs(home, away, 5);

  assert.ok(typeof aggregate.modelProbabilities.pcaP1 === "number");
  assert.ok(Math.abs((aggregate.modelProbabilities.pcaP1 || 0) - 50) < 1e-9);
  assert.equal(aggregate.validPairOutputs.pca, 5);
});
