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
  let abstainLowEdgeOrMixed = 0;

  for (const row of usable) {
    const state = computeStateDecision({
      playerAName: row.playerAName,
      playerBName: row.playerBName,
      playerA: row.playerA,
      playerB: row.playerB,
    });

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

  assert.ok(
    hitRate >= 0.625,
    `expected hit-rate >= 62.5%, got ${(hitRate * 100).toFixed(1)}%`,
  );
  assert.ok(
    precisionOnCalled >= 0.7,
    `expected precision_on_called >= 70%, got ${(precisionOnCalled * 100).toFixed(1)}%`,
  );
  assert.ok(
    coverage >= 0.5,
    `expected coverage >= 50%, got ${(coverage * 100).toFixed(1)}%`,
  );
  assert.ok(
    abstainLowEdgeOrMixed >= 1,
    "expected at least one LOW_EDGE or MIXED abstain in mini-batch",
  );
});
