import test from "node:test";
import assert from "node:assert/strict";
import { parseMetricValue } from "../src/normalize.js";
import { metricValueToNumber } from "../src/predict/metricNormalization.js";

test("ratio values use Laplace smoothing for non-count metrics", () => {
  const value = parseMetricValue("64%(7/11)");
  const normalized = metricValueToNumber(value, { smoothRatio: true });
  assert.ok(Number.isFinite(normalized));
  assert.ok(Math.abs((normalized as number) - ((7 + 1) / (11 + 2)) * 100) < 1e-9);
});

test("single-shot 100%(1/1) is smoothed and not treated as hard 100", () => {
  const value = parseMetricValue("100%(1/1)");
  const normalized = metricValueToNumber(value, { smoothRatio: true });
  assert.ok(Number.isFinite(normalized));
  assert.ok(Math.abs((normalized as number) - (2 / 3) * 100) < 1e-9);
});

test("percent-only values stay unchanged", () => {
  const value = parseMetricValue("65%");
  const normalized = metricValueToNumber(value, { smoothRatio: true });
  assert.equal(normalized, 65);
});

test("count metrics preserve count from ratio", () => {
  const value = parseMetricValue("64%(7/11)");
  const normalized = metricValueToNumber(value, { isCountMetric: true, smoothRatio: true });
  assert.equal(normalized, 7);
});
