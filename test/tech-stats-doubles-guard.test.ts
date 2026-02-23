import test from "node:test";
import assert from "node:assert/strict";
import { resolveHistoricalDoublesHint } from "../src/extract/techStats.js";

test("resolveHistoricalDoublesHint returns true for multi-player side counts", () => {
  assert.equal(
    resolveHistoricalDoublesHint({
      homePlayerCount: 2,
      awayPlayerCount: 1,
      hasDoubleScheduleLink: false,
      hasDoublesRankingText: false,
    }),
    true,
  );
});

test("resolveHistoricalDoublesHint returns true for doubles schedule/ranking markers", () => {
  assert.equal(
    resolveHistoricalDoublesHint({
      homePlayerCount: 1,
      awayPlayerCount: 1,
      hasDoubleScheduleLink: true,
      hasDoublesRankingText: false,
    }),
    true,
  );
  assert.equal(
    resolveHistoricalDoublesHint({
      homePlayerCount: 1,
      awayPlayerCount: 1,
      hasDoubleScheduleLink: false,
      hasDoublesRankingText: true,
    }),
    true,
  );
});

test("resolveHistoricalDoublesHint returns false for normal singles page", () => {
  assert.equal(
    resolveHistoricalDoublesHint({
      homePlayerCount: 1,
      awayPlayerCount: 1,
      hasDoubleScheduleLink: false,
      hasDoublesRankingText: false,
    }),
    false,
  );
});
