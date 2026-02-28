import test from "node:test";
import assert from "node:assert/strict";

import { computeStateDecision } from "../src/predict/stateDecision.js";
import type { PlayerStatePlayerSummary } from "../src/types.js";

function makeSide(overrides: Partial<PlayerStatePlayerSummary> = {}): PlayerStatePlayerSummary {
  return {
    nTech: 10,
    hasW10: true,
    hasW5: true,
    hasW3: true,
    degradedW10: false,
    degradedW5: false,
    degradedW3: false,
    stability: { w10: 50, w5: 50, w3: 50 },
    formTech: { w10: 50, w5: 50, w3: 50 },
    formPlus: { w10: 50, w5: 50, w3: 50 },
    strength: { w10: 50, w5: 50, w3: 50 },
    ...overrides,
  };
}

test("computeStateDecision picks Birrell-like side with realistic probability band", () => {
  const playerA = makeSide({
    stability: { w10: 86, w5: 89, w3: 78 },
    formTech: { w10: 65, w5: 62, w3: 42 },
    formPlus: { w10: 61, w5: 57, w3: 43 },
    strength: { w10: 45, w5: 47, w3: 48 },
  });
  const playerB = makeSide({
    stability: { w10: 86, w5: 84, w3: 97 },
    formTech: { w10: 53, w5: 93, w3: 83 },
    formPlus: { w10: 53, w5: 87, w3: 81 },
    strength: { w10: 40, w5: 40, w3: 43 },
  });

  const state = computeStateDecision({
    playerAName: "Stearns P.",
    playerBName: "Birrell K.",
    playerA,
    playerB,
  });

  assert.equal(state.winner, "Birrell K.");
  assert.ok(typeof state.p2 === "number");
  assert.ok((state.p2 as number) >= 66);
  assert.ok((state.p2 as number) <= 76);
});

test("computeStateDecision returns LOW_COVERAGE fallback for weak windows", () => {
  const lowA = makeSide({
    nTech: 2,
    hasW10: false,
    hasW5: false,
    hasW3: true,
    stability: { w3: 56 },
    formTech: { w3: 54 },
    formPlus: { w3: 55 },
    strength: { w3: 52 },
  });
  const lowB = makeSide({
    nTech: 2,
    hasW10: false,
    hasW5: false,
    hasW3: true,
    stability: { w3: 44 },
    formTech: { w3: 46 },
    formPlus: { w3: 45 },
    strength: { w3: 48 },
  });

  const state = computeStateDecision({
    playerAName: "A",
    playerBName: "B",
    playerA: lowA,
    playerB: lowB,
  });

  assert.equal(state.winner, undefined);
  assert.equal(state.p1, undefined);
  assert.equal(state.p2, undefined);
  assert.ok(state.reasonTags.includes("LOW_COVERAGE"));
});

test("computeStateDecision marks MIXED when metric votes are split", () => {
  const sideA = makeSide({
    stability: { w10: 72, w5: 74, w3: 76 },
    formTech: { w10: 42, w5: 44, w3: 46 },
    formPlus: { w10: 40, w5: 42, w3: 44 },
    strength: { w10: 62, w5: 63, w3: 64 },
  });
  const sideB = makeSide({
    stability: { w10: 62, w5: 61, w3: 60 },
    formTech: { w10: 56, w5: 58, w3: 60 },
    formPlus: { w10: 58, w5: 60, w3: 62 },
    strength: { w10: 50, w5: 49, w3: 48 },
  });

  const state = computeStateDecision({
    playerAName: "A",
    playerBName: "B",
    playerA: sideA,
    playerB: sideB,
  });

  assert.ok(state.reasonTags.includes("MIXED"));
});
