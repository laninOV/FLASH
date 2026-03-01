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

test("computeStateDecision returns decisive winner on aligned state drivers", () => {
  const playerA = makeSide({
    stability: { w10: 72, w5: 75, w3: 78 },
    formTech: { w10: 64, w5: 70, w3: 74 },
    formPlus: { w10: 62, w5: 72, w3: 78 },
    strength: { w10: 58, w5: 60, w3: 63 },
  });
  const playerB = makeSide({
    stability: { w10: 55, w5: 56, w3: 57 },
    formTech: { w10: 48, w5: 46, w3: 45 },
    formPlus: { w10: 46, w5: 45, w3: 44 },
    strength: { w10: 43, w5: 42, w3: 41 },
  });

  const state = computeStateDecision({
    playerAName: "A",
    playerBName: "B",
    playerA,
    playerB,
  });

  assert.equal(state.source, "player_state_decision_v3");
  assert.equal(state.winner, "A");
  assert.equal(state.abstained, false);
  assert.ok(typeof state.p1 === "number" && state.p1 > 50);
  assert.ok(typeof state.p2 === "number" && state.p2 < 50);
  assert.ok(state.reasonTags.includes("FORM_PLUS") || state.reasonTags.includes("FORM_TECH"));
});

test("computeStateDecision returns LOW_COVERAGE abstain for weak window coverage", () => {
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
  assert.equal(state.abstained, true);
  assert.ok(state.reasonTags.includes("LOW_COVERAGE"));
});

test("computeStateDecision returns LOW_EDGE abstain on near-neutral edge", () => {
  const playerA = makeSide({
    stability: { w10: 60, w5: 60, w3: 60 },
    formTech: { w10: 50, w5: 50, w3: 50 },
    formPlus: { w10: 50, w5: 50, w3: 50 },
    strength: { w10: 50, w5: 50, w3: 50 },
  });
  const playerB = makeSide({
    stability: { w10: 60, w5: 60, w3: 60 },
    formTech: { w10: 50, w5: 50, w3: 50 },
    formPlus: { w10: 50, w5: 50, w3: 50 },
    strength: { w10: 50, w5: 50, w3: 50 },
  });

  const state = computeStateDecision({
    playerAName: "A",
    playerBName: "B",
    playerA,
    playerB,
  });

  assert.equal(state.winner, undefined);
  assert.equal(state.abstained, true);
  assert.ok(state.reasonTags.includes("LOW_EDGE"));
  assert.ok(state.reasonTags.includes("MIXED"));
});

test("computeStateDecision returns LOW_EDGE+MIXED abstain on strong anchor-vs-form conflict", () => {
  const playerA = makeSide({
    stability: { w10: 80, w5: 80, w3: 80 },
    formTech: { w10: 50, w5: 50, w3: 50 },
    formPlus: { w10: 50, w5: 50, w3: 50 },
    strength: { w10: 70, w5: 70, w3: 70 },
  });
  const playerB = makeSide({
    stability: { w10: 62, w5: 62, w3: 62 },
    formTech: { w10: 63, w5: 63, w3: 63 },
    formPlus: { w10: 63, w5: 63, w3: 63 },
    strength: { w10: 52, w5: 52, w3: 52 },
  });

  const state = computeStateDecision({
    playerAName: "A",
    playerBName: "B",
    playerA,
    playerB,
  });

  assert.equal(state.winner, undefined);
  assert.equal(state.abstained, true);
  assert.ok(state.reasonTags.includes("LOW_EDGE"));
  assert.ok(state.reasonTags.includes("MIXED"));
  assert.ok((state.conflictIndex || 0) >= 0.72);
});

test("computeStateDecision keeps winner in aggressive mode on normal edge", () => {
  const playerA = makeSide({
    stability: { w10: 72, w5: 74, w3: 73 },
    formTech: { w10: 61, w5: 65, w3: 67 },
    formPlus: { w10: 60, w5: 64, w3: 66 },
    strength: { w10: 56, w5: 57, w3: 58 },
  });
  const playerB = makeSide({
    stability: { w10: 66, w5: 67, w3: 68 },
    formTech: { w10: 50, w5: 52, w3: 53 },
    formPlus: { w10: 49, w5: 51, w3: 52 },
    strength: { w10: 49, w5: 50, w3: 51 },
  });

  const state = computeStateDecision({
    playerAName: "A",
    playerBName: "B",
    playerA,
    playerB,
  });

  assert.equal(state.abstained, false);
  assert.equal(state.winner, "A");
  assert.ok(typeof state.rawDiff === "number");
});
