import test from "node:test";
import assert from "node:assert/strict";
import { tpw12HistoryScores } from "../src/predict/tpw12.js";

test("tpw12HistoryScores returns expected score components", () => {
  const rows = [0.6, 0.55, 0.52, 0.48, 0.51].map((value, index) => ({
    matchUrl: `https://example.com/m/${index}`,
    tpw12: value,
    warnings: [],
  }));

  const score = tpw12HistoryScores(rows, 5);
  assert.equal(score.n, 5);
  assert.ok(typeof score.rating === "number");
  assert.ok((score.rating || 0) > 60);
  assert.ok((score.power || 0) > 65);
  assert.ok((score.form || 0) > 80);
  assert.ok((score.volatility || 100) < 80);
  assert.ok(score.reliability > 20);
});

test("tpw12HistoryScores returns empty payload for no values", () => {
  const score = tpw12HistoryScores([], 5);
  assert.equal(score.n, 0);
  assert.equal(score.rating, undefined);
  assert.equal(score.reliability, 0);
});
