import test from "node:test";
import assert from "node:assert/strict";
import { resolveMatchPageDoublesHint } from "../src/extract/matchPage.js";

test("resolveMatchPageDoublesHint detects doubles by player counts", () => {
  const value = resolveMatchPageDoublesHint({
    homePlayerCount: 2,
    awayPlayerCount: 2,
    hasDoubleScheduleLink: false,
    hasDoublesRankingText: false,
    titleHasPairDelimiter: false,
  });
  assert.equal(value, true);
});

test("resolveMatchPageDoublesHint detects doubles by schedule or ranking markers", () => {
  assert.equal(
    resolveMatchPageDoublesHint({
      homePlayerCount: 1,
      awayPlayerCount: 1,
      hasDoubleScheduleLink: true,
      hasDoublesRankingText: false,
      titleHasPairDelimiter: false,
    }),
    true,
  );
  assert.equal(
    resolveMatchPageDoublesHint({
      homePlayerCount: 1,
      awayPlayerCount: 1,
      hasDoubleScheduleLink: false,
      hasDoublesRankingText: true,
      titleHasPairDelimiter: false,
    }),
    true,
  );
});

test("resolveMatchPageDoublesHint detects doubles by title delimiter", () => {
  const value = resolveMatchPageDoublesHint({
    homePlayerCount: 1,
    awayPlayerCount: 1,
    hasDoubleScheduleLink: false,
    hasDoublesRankingText: false,
    titleHasPairDelimiter: true,
  });
  assert.equal(value, true);
});

test("resolveMatchPageDoublesHint returns false for normal singles page", () => {
  const value = resolveMatchPageDoublesHint({
    homePlayerCount: 1,
    awayPlayerCount: 1,
    hasDoubleScheduleLink: false,
    hasDoublesRankingText: false,
    titleHasPairDelimiter: false,
  });
  assert.equal(value, false);
});
