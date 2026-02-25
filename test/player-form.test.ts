import test from "node:test";
import assert from "node:assert/strict";
import { buildPlayerRecentFormSummary } from "../src/orchestrator/playerForm.js";
import type { RecentMatchRef } from "../src/types.js";

test("buildPlayerRecentFormSummary computes weighted wins/losses and tracks unparsed score rows", () => {
  const matches: RecentMatchRef[] = [
    {
      url: "https://x/m1",
      resultText: "W",
      scoreText: "2-0",
      isFinishedHint: true,
      isSingles: true,
    },
    {
      url: "https://x/m2",
      resultText: "L",
      scoreText: "1-2",
      isFinishedHint: true,
      isSingles: true,
    },
    {
      url: "https://x/m3",
      resultText: "W",
      scoreText: "ret.",
      isFinishedHint: true,
      isSingles: true,
    },
    {
      url: "https://x/m4",
      resultText: "-",
      scoreText: "2-1",
      isFinishedHint: true,
      isSingles: true,
    },
  ];

  const summary = buildPlayerRecentFormSummary(matches);

  assert.equal(summary.source, "profile_results_flashscore_v1");
  assert.equal(summary.windowRequested, 8);
  assert.equal(summary.usableMatches, 3);
  assert.equal(summary.windowUsed, 3);
  assert.equal(summary.wins, 2);
  assert.equal(summary.losses, 1);
  assert.equal(summary.unparsedScoreRows, 1);
  assert.ok(summary.weightedScore > 0);
  assert.ok(summary.weightedScore <= 1);
});

