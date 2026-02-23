import test from "node:test";
import assert from "node:assert/strict";
import { aggregateIndexPairs } from "../src/predict/dirtPairs.js";
import type { DirtFeatureRow } from "../src/predict/requiredMetrics.js";
import {
  oracleAggregateIndexPairs,
  oracleComputePairModelOutput,
} from "../src/audit/oracleDirt.js";

function makeRow(matchUrl: string, overrides: Partial<DirtFeatureRow> = {}): DirtFeatureRow {
  return {
    matchUrl,
    first_serve: 50,
    first_serve_points_won: 50,
    second_serve_points_won: 50,
    break_points_saved: 50,
    double_faults: 3,
    first_serve_return_points_won: 50,
    second_serve_return_points_won: 50,
    break_points_converted: 50,
    total_service_points_won: 50,
    return_points_won: 50,
    total_points_won: 50,
    service_games_won: 50,
    return_games_won: 50,
    total_games_won: 50,
    ...overrides,
  };
}

test("oracle golden: LogReg exact case with only double_faults edge", () => {
  const home = makeRow("https://h/1", { double_faults: 2 });
  const away = makeRow("https://a/1", { double_faults: 4 });
  const pair = oracleComputePairModelOutput({ index: 0, home, away });
  assert.ok(typeof pair.logRegP1 === "number");
  assert.ok(Math.abs((pair.logRegP1 || 0) - 51.19025128376735) < 1e-9);
});

test("oracle golden: Markov and Bradley exact case", () => {
  const home = makeRow("https://h/1", { double_faults: 2 });
  const away = makeRow("https://a/1", { double_faults: 4 });
  const pair = oracleComputePairModelOutput({ index: 0, home, away });
  assert.ok(typeof pair.markovP1 === "number");
  assert.ok(typeof pair.bradleyP1 === "number");
  assert.ok(Math.abs((pair.markovP1 || 0) - 50.714285714285715) < 1e-9);
  assert.ok(Math.abs((pair.bradleyP1 || 0) - 53.57142857142857) < 1e-9);
});

test("oracle deterministic aggregate: PCA is capped and weights remain normalized", () => {
  const homeRows = Array.from({ length: 5 }, (_, i) =>
    makeRow(`https://h/${i}`, {
      first_serve: 66 - i,
      first_serve_points_won: 70 - i,
      second_serve_points_won: 58 - i,
      break_points_saved: 74 - i,
      double_faults: 2,
      first_serve_return_points_won: 38 - i,
      second_serve_return_points_won: 49 - i,
      break_points_converted: 44 - i,
      total_service_points_won: 64 - i,
      return_points_won: 40 - i,
      total_points_won: 55 - i,
      service_games_won: 82 - i,
      return_games_won: 34 - i,
      total_games_won: 59 - i,
    }),
  );
  const awayRows = Array.from({ length: 5 }, (_, i) =>
    makeRow(`https://a/${i}`, {
      first_serve: 58 - i,
      first_serve_points_won: 63 - i,
      second_serve_points_won: 49 - i,
      break_points_saved: 64 - i,
      double_faults: 5,
      first_serve_return_points_won: 31 - i,
      second_serve_return_points_won: 40 - i,
      break_points_converted: 35 - i,
      total_service_points_won: 57 - i,
      return_points_won: 33 - i,
      total_points_won: 47 - i,
      service_games_won: 70 - i,
      return_games_won: 22 - i,
      total_games_won: 45 - i,
    }),
  );

  const oracle = oracleAggregateIndexPairs(homeRows, awayRows, 5);
  assert.equal(oracle.validPairs, 5);
  assert.ok(typeof oracle.modelProbabilities.pcaP1 === "number");
  assert.ok((oracle.modelProbabilities.pcaP1 || 0) <= 97);
  assert.ok((oracle.modelProbabilities.pcaP1 || 0) >= 3);
  assert.ok(oracle.modelProbabilities.finalP1 >= 0 && oracle.modelProbabilities.finalP1 <= 100);
  assert.ok(Math.abs(oracle.weights.logReg + oracle.weights.markov + oracle.weights.bradley + oracle.weights.pca - 1) < 1e-12);
});

test("differential synthetic: prod vs oracle within 1.0 pp", () => {
  let seed = 12345;
  const next = (): number => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const pick = (min: number, max: number): number => min + next() * (max - min);
  const diffs: number[] = [];

  for (let scenario = 0; scenario < 120; scenario += 1) {
    const homeRows = Array.from({ length: 5 }, (_, i) =>
      makeRow(`https://h/${scenario}/${i}`, {
        first_serve: pick(52, 74),
        first_serve_points_won: pick(52, 78),
        second_serve_points_won: pick(40, 70),
        break_points_saved: pick(35, 90),
        double_faults: pick(1, 8),
        first_serve_return_points_won: pick(20, 55),
        second_serve_return_points_won: pick(20, 60),
        break_points_converted: pick(20, 60),
        total_service_points_won: pick(48, 74),
        return_points_won: pick(20, 58),
        total_points_won: pick(40, 62),
        service_games_won: pick(35, 95),
        return_games_won: pick(10, 65),
        total_games_won: pick(35, 70),
      }),
    );
    const awayRows = Array.from({ length: 5 }, (_, i) =>
      makeRow(`https://a/${scenario}/${i}`, {
        first_serve: pick(52, 74),
        first_serve_points_won: pick(52, 78),
        second_serve_points_won: pick(40, 70),
        break_points_saved: pick(35, 90),
        double_faults: pick(1, 8),
        first_serve_return_points_won: pick(20, 55),
        second_serve_return_points_won: pick(20, 60),
        break_points_converted: pick(20, 60),
        total_service_points_won: pick(48, 74),
        return_points_won: pick(20, 58),
        total_points_won: pick(40, 62),
        service_games_won: pick(35, 95),
        return_games_won: pick(10, 65),
        total_games_won: pick(35, 70),
      }),
    );

    const prod = aggregateIndexPairs(homeRows, awayRows, 5);
    const oracle = oracleAggregateIndexPairs(homeRows, awayRows, 5);

    const pairs: Array<[number | undefined, number | undefined]> = [
      [prod.modelProbabilities.logRegP1, oracle.modelProbabilities.logRegP1],
      [prod.modelProbabilities.markovP1, oracle.modelProbabilities.markovP1],
      [prod.modelProbabilities.bradleyP1, oracle.modelProbabilities.bradleyP1],
      [prod.modelProbabilities.pcaP1, oracle.modelProbabilities.pcaP1],
      [prod.modelProbabilities.finalP1, oracle.modelProbabilities.finalP1],
    ];
    for (const [p, o] of pairs) {
      if (!Number.isFinite(p) || !Number.isFinite(o)) {
        continue;
      }
      const diff = Math.abs((p as number) - (o as number));
      diffs.push(diff);
      assert.ok(diff <= 1.0);
    }
  }

  assert.ok(diffs.length > 0);
});

test("oracle weights fallback: no available models -> uniform weights and final=50", () => {
  const oracle = oracleAggregateIndexPairs([], [], 5);
  assert.equal(oracle.validPairs, 0);
  assert.equal(oracle.modelProbabilities.finalP1, 50);
  assert.equal(oracle.weights.logReg, 0.25);
  assert.equal(oracle.weights.markov, 0.25);
  assert.equal(oracle.weights.bradley, 0.25);
  assert.equal(oracle.weights.pca, 0.25);
});
