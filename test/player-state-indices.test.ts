import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlayerStateSeries,
  type PlayerStateSeriesResult,
} from "../src/predict/playerStateIndices.js";
import type { PlayerStateFeature } from "../src/types.js";

function makeFeature(
  index: number,
  overrides: Partial<PlayerStateFeature> = {},
): PlayerStateFeature {
  return {
    matchUrl: `https://www.flashscore.co.ke/match/${index}`,
    candidateIndex: index,
    tournament: "ATP 250 Doha Men Singles",
    resultText: index % 2 === 0 ? "W" : "L",
    scoreText: index % 2 === 0 ? "2-0" : "1-2",
    serveCore: 0.58 - index * 0.008,
    returnCore: 0.52 - index * 0.007,
    controlCore: 0.54 - index * 0.007,
    disciplineCore: 0.6 - index * 0.006,
    tpwCore: 0.53 - index * 0.007,
    oppStatsQ01: 0.55 - index * 0.01,
    oppStrengthComposite: 0.58 - index * 0.01,
    tierScore: 0.7,
    qualifying: false,
    ...overrides,
  };
}

function assertMetricBounds(
  series: PlayerStateSeriesResult,
  metric: "stability" | "formTech" | "formPlus" | "strength",
): void {
  for (const value of [series[metric].w10, series[metric].w5, series[metric].w3]) {
    assert.ok(typeof value === "number");
    assert.ok((value as number) >= 0 && (value as number) <= 100);
  }
}

test("buildPlayerStateSeries computes finite 0..100 metrics on full 10-match window", () => {
  const features = Array.from({ length: 10 }, (_, index) => makeFeature(index));
  const series = buildPlayerStateSeries(features);

  assert.equal(series.nTech, 10);
  assert.equal(series.hasW10, true);
  assert.equal(series.hasW5, true);
  assert.equal(series.hasW3, true);
  assert.equal(series.degradedW10, false);
  assert.equal(series.degradedW5, false);
  assert.equal(series.degradedW3, false);

  assertMetricBounds(series, "stability");
  assertMetricBounds(series, "formTech");
  assertMetricBounds(series, "formPlus");
  assertMetricBounds(series, "strength");
});

test("Strength differentiates strong vs weak synthetic profiles", () => {
  const strong = Array.from({ length: 10 }, (_, index) =>
    makeFeature(index, {
      serveCore: 0.72 - index * 0.004,
      returnCore: 0.66 - index * 0.003,
      controlCore: 0.69 - index * 0.003,
      disciplineCore: 0.8 - index * 0.003,
      tpwCore: 0.68 - index * 0.003,
      oppStrengthComposite: 0.62,
    }),
  );
  const weak = Array.from({ length: 10 }, (_, index) =>
    makeFeature(index, {
      serveCore: 0.46 - index * 0.003,
      returnCore: 0.41 - index * 0.002,
      controlCore: 0.43 - index * 0.002,
      disciplineCore: 0.45 - index * 0.002,
      tpwCore: 0.42 - index * 0.002,
      oppStrengthComposite: 0.48,
    }),
  );

  const strongSeries = buildPlayerStateSeries(strong);
  const weakSeries = buildPlayerStateSeries(weak);
  assert.ok(typeof strongSeries.strength.w10 === "number");
  assert.ok(typeof weakSeries.strength.w10 === "number");
  assert.ok((strongSeries.strength.w10 as number) - (weakSeries.strength.w10 as number) >= 8);
});

test("Stability differentiates smooth and noisy profiles", () => {
  const smooth = Array.from({ length: 10 }, (_, index) =>
    makeFeature(index, {
      serveCore: 0.57 - index * 0.0015,
      returnCore: 0.52 - index * 0.001,
      controlCore: 0.54 - index * 0.0012,
      tpwCore: 0.53 - index * 0.001,
    }),
  );
  const noisy = Array.from({ length: 10 }, (_, index) =>
    makeFeature(index, {
      serveCore: index % 2 === 0 ? 0.8 : 0.2,
      returnCore: index % 2 === 0 ? 0.8 : 0.2,
      controlCore: index % 2 === 0 ? 0.8 : 0.2,
      tpwCore: index % 2 === 0 ? 0.8 : 0.2,
      disciplineCore: index % 2 === 0 ? 0.8 : 0.2,
    }),
  );

  const smoothSeries = buildPlayerStateSeries(smooth);
  const noisySeries = buildPlayerStateSeries(noisy);
  assert.ok(typeof smoothSeries.stability.w10 === "number");
  assert.ok(typeof noisySeries.stability.w10 === "number");
  assert.ok((smoothSeries.stability.w10 as number) - (noisySeries.stability.w10 as number) >= 10);
});

test("buildPlayerStateSeries keeps W10 enabled but degraded for 8 matches", () => {
  const features = Array.from({ length: 8 }, (_, index) => makeFeature(index));
  const series = buildPlayerStateSeries(features);

  assert.equal(series.nTech, 8);
  assert.equal(series.hasW10, true);
  assert.equal(series.hasW5, true);
  assert.equal(series.hasW3, true);
  assert.equal(series.degradedW10, true);
  assert.equal(series.degradedW5, false);
  assert.equal(series.degradedW3, false);
  assert.ok(typeof series.strength.w10 === "number");
});

test("buildPlayerStateSeries exposes only W3 when only 3 matches are available", () => {
  const features = Array.from({ length: 3 }, (_, index) => makeFeature(index));
  const series = buildPlayerStateSeries(features);

  assert.equal(series.nTech, 3);
  assert.equal(series.hasW10, false);
  assert.equal(series.hasW5, false);
  assert.equal(series.hasW3, true);
  assert.equal(series.stability.w10, undefined);
  assert.equal(series.stability.w5, undefined);
  assert.ok(typeof series.stability.w3 === "number");
  assert.ok(typeof series.formPlus.w3 === "number");
});

test("Form-PLUS diverges from Form-TECH on score-shifted sample", () => {
  const features = Array.from({ length: 8 }, (_, index) =>
    makeFeature(index, {
      // keep tech cores mostly flat so score layer can move Form-PLUS
      serveCore: 0.56,
      returnCore: 0.5,
      controlCore: 0.54,
      tpwCore: 0.52,
      resultText: index < 3 ? "W" : "L",
      scoreText: index < 3 ? "2-0" : "0-2",
    }),
  );
  const series = buildPlayerStateSeries(features);

  assert.ok(typeof series.formTech.w10 === "number");
  assert.ok(typeof series.formPlus.w10 === "number");
  assert.notEqual(series.formTech.w10, series.formPlus.w10);
});

test("W3 Form-TECH does not stick to 50 on monotonic trends", () => {
  const improving = Array.from({ length: 3 }, (_, index) =>
    makeFeature(index, {
      controlCore: 0.66 - index * 0.05,
      returnCore: 0.62 - index * 0.045,
      tpwCore: 0.61 - index * 0.04,
      resultText: "W",
      scoreText: "2-0",
    }),
  );
  const declining = Array.from({ length: 3 }, (_, index) =>
    makeFeature(index, {
      controlCore: 0.48 + index * 0.05,
      returnCore: 0.46 + index * 0.045,
      tpwCore: 0.45 + index * 0.04,
      resultText: "L",
      scoreText: "0-2",
    }),
  );

  const improvingSeries = buildPlayerStateSeries(improving);
  const decliningSeries = buildPlayerStateSeries(declining);

  assert.ok(typeof improvingSeries.formTech.w3 === "number");
  assert.ok(typeof decliningSeries.formTech.w3 === "number");
  assert.ok((improvingSeries.formTech.w3 as number) > 51);
  assert.ok((decliningSeries.formTech.w3 as number) < 49);
});

test("W3 Form-TECH stays near neutral on flat series", () => {
  const flat = Array.from({ length: 3 }, (_, index) =>
    makeFeature(index, {
      serveCore: 0.56,
      returnCore: 0.5,
      controlCore: 0.54,
      tpwCore: 0.52,
      resultText: index % 2 === 0 ? "W" : "L",
      scoreText: "1-1",
    }),
  );
  const series = buildPlayerStateSeries(flat);
  assert.ok(typeof series.formTech.w3 === "number");
  assert.ok((series.formTech.w3 as number) >= 48);
  assert.ok((series.formTech.w3 as number) <= 52);
});

test("W3 Form-PLUS reacts to score-shift when score data is present", () => {
  const positiveScoreShift = Array.from({ length: 3 }, (_, index) =>
    makeFeature(index, {
      serveCore: 0.56,
      returnCore: 0.5,
      controlCore: 0.54,
      tpwCore: 0.52,
      resultText: index === 2 ? "L" : "W",
      scoreText: index === 2 ? "0-2" : index === 1 ? "2-1" : "2-0",
    }),
  );
  const series = buildPlayerStateSeries(positiveScoreShift);
  assert.ok(typeof series.formTech.w3 === "number");
  assert.ok(typeof series.formPlus.w3 === "number");
  assert.ok((series.formPlus.w3 as number) > (series.formTech.w3 as number));
});

test("Form-PLUS keeps close to Form-TECH when score coverage is missing", () => {
  const missingScore = Array.from({ length: 10 }, (_, index) =>
    makeFeature(index, {
      serveCore: 0.56 - index * 0.002,
      returnCore: 0.51 - index * 0.002,
      controlCore: 0.53 - index * 0.002,
      tpwCore: 0.52 - index * 0.002,
      resultText: undefined,
      scoreText: undefined,
    }),
  );
  const series = buildPlayerStateSeries(missingScore);
  assert.ok(typeof series.formTech.w10 === "number");
  assert.ok(typeof series.formPlus.w10 === "number");
  assert.ok(Math.abs((series.formPlus.w10 as number) - (series.formTech.w10 as number)) <= 2);
});
