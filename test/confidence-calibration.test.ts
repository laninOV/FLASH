import test from "node:test";
import assert from "node:assert/strict";
import { computeConfidenceScore } from "../src/predictor.js";

test("confidence is exactly 0.50 at 50/50 edge", () => {
  const confidence = computeConfidenceScore({
    requestedPerPlayer: 5,
    coverageA: 5,
    coverageB: 5,
    validPairs: 5,
    activeModels: 4,
    finalProbability: 50,
    modelProbabilities: [50, 50, 50, 50],
  });
  assert.equal(confidence, 0.5);
});

test("confidence is lower for high model disagreement at same edge", () => {
  const lowDispersion = computeConfidenceScore({
    requestedPerPlayer: 5,
    coverageA: 5,
    coverageB: 5,
    validPairs: 5,
    activeModels: 4,
    finalProbability: 60,
    modelProbabilities: [59, 60, 61, 60],
  });
  const highDispersion = computeConfidenceScore({
    requestedPerPlayer: 5,
    coverageA: 5,
    coverageB: 5,
    validPairs: 5,
    activeModels: 4,
    finalProbability: 60,
    modelProbabilities: [85, 35, 78, 42],
  });

  assert.ok(lowDispersion > highDispersion);
});
