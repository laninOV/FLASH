import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { computeStateDecision } from "../src/predict/stateDecision.js";
import type { PlayerStatePlayerSummary } from "../src/types.js";

interface StateMiniBatchRow {
  id: string;
  playerAName: string;
  playerBName: string;
  actualWinner: string | null;
  excludeFromStateEval: boolean;
  playerA: PlayerStatePlayerSummary;
  playerB: PlayerStatePlayerSummary;
}

async function readFixture(): Promise<StateMiniBatchRow[]> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fixturePath = path.join(here, "fixtures", "state-mini-batch-2026-02-28.json");
  const raw = await readFile(fixturePath, "utf-8");
  return JSON.parse(raw) as StateMiniBatchRow[];
}

test("state mini-batch keeps hit-rate while increasing precision via abstain", async () => {
  const rows = await readFixture();
  const usable = rows.filter((row) => !row.excludeFromStateEval && typeof row.actualWinner === "string");

  let hits = 0;
  let called = 0;
  let strictHits = 0;
  let strictCalled = 0;
  let abstainLowEdgeOrMixed = 0;

  for (const row of usable) {
    const state = computeStateDecision({
      playerAName: row.playerAName,
      playerBName: row.playerBName,
      playerA: row.playerA,
      playerB: row.playerB,
    });

    const effectiveDiff = typeof state.effectiveDiff === "number" ? state.effectiveDiff : state.rawDiff;
    const strictWinnerVotes =
      state.winner === row.playerAName
        ? state.votes.playerA
        : state.winner === row.playerBName
          ? state.votes.playerB
          : 0;
    const strictAbstain =
      state.reliability < 0.5 ||
      typeof effectiveDiff !== "number" ||
      Math.abs(effectiveDiff) < 2.5 ||
      (state.conflictIndex ?? 0) >= 0.55 ||
      strictWinnerVotes < 2;
    if (!strictAbstain && typeof state.winner === "string") {
      strictCalled += 1;
      if (state.winner === row.actualWinner) {
        strictHits += 1;
      }
    }

    if (state.abstained) {
      if (state.reasonTags.includes("LOW_EDGE") || state.reasonTags.includes("MIXED")) {
        abstainLowEdgeOrMixed += 1;
      }
      continue;
    }

    called += 1;
    if (state.winner === row.actualWinner) {
      hits += 1;
    }
  }

  const hitRate = usable.length > 0 ? hits / usable.length : 0;
  const coverage = usable.length > 0 ? called / usable.length : 0;
  const precisionOnCalled = called > 0 ? hits / called : 0;
  const strictCoverage = usable.length > 0 ? strictCalled / usable.length : 0;
  const strictPrecisionOnCalled = strictCalled > 0 ? strictHits / strictCalled : 0;

  assert.ok(
    hitRate >= 0.625,
    `expected hit-rate >= 62.5%, got ${(hitRate * 100).toFixed(1)}%`,
  );
  assert.ok(
    coverage >= strictCoverage,
    `expected aggressive coverage >= strict baseline (${(strictCoverage * 100).toFixed(1)}%), got ${(coverage * 100).toFixed(1)}%`,
  );
  assert.ok(
    precisionOnCalled >= strictPrecisionOnCalled - 0.03,
    `expected precision_on_called not worse than strict baseline by >3pp (strict ${(strictPrecisionOnCalled * 100).toFixed(1)}%), got ${(precisionOnCalled * 100).toFixed(1)}%`,
  );
  assert.ok(
    abstainLowEdgeOrMixed >= 1,
    "expected at least one LOW_EDGE or MIXED abstain in mini-batch",
  );
});
