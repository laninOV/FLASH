import test from "node:test";
import assert from "node:assert/strict";
import { parseMetricValue } from "../src/normalize.js";

test("parseMetricValue parses percent with ratio", () => {
  const value = parseMetricValue("64%(7/11)");
  assert.equal(value.percent, 64);
  assert.equal(value.made, 7);
  assert.equal(value.total, 11);
});

test("parseMetricValue parses ratio-only values", () => {
  const value = parseMetricValue("7/11");
  assert.equal(value.made, 7);
  assert.equal(value.total, 11);
  assert.equal(value.percent, undefined);
});

test("parseMetricValue keeps empty marker as raw", () => {
  const value = parseMetricValue("-");
  assert.deepEqual(value, { raw: "-" });
});

