import test from "node:test";
import assert from "node:assert/strict";
import {
  extractScheduledStartText,
  isDoublesDayHint,
  isSinglesDayPlayers,
} from "../src/extract/dayMatches.js";

test("isSinglesDayPlayers accepts regular singles names", () => {
  assert.equal(isSinglesDayPlayers("A. Ruzic", "E. Svitolina"), true);
});

test("isSinglesDayPlayers rejects slash-based doubles names", () => {
  assert.equal(isSinglesDayPlayers("A. Player / B. Player", "C. Opponent"), false);
  assert.equal(isSinglesDayPlayers("A. Player", "C. Opponent / D. Opponent"), false);
});

test("isSinglesDayPlayers rejects ampersand-based doubles names", () => {
  assert.equal(isSinglesDayPlayers("A. Player & B. Player", "C. Opponent"), false);
  assert.equal(isSinglesDayPlayers("A. Player", "C. Opponent & D. Opponent"), false);
});

test("isDoublesDayHint detects doubles by side player counts", () => {
  assert.equal(
    isDoublesDayHint({
      leftSidePlayersCount: 2,
      rightSidePlayersCount: 2,
      playerAName: "S. Doumbia",
      playerBName: "C. Frantzen",
    }),
    true,
  );
});

test("isDoublesDayHint detects doubles by text markers", () => {
  assert.equal(
    isDoublesDayHint({
      playerAName: "Player A",
      playerBName: "Player B",
      statusText: "ITF Doubles schedule",
    }),
    true,
  );
});

test("isDoublesDayHint stays false for regular singles row", () => {
  assert.equal(
    isDoublesDayHint({
      leftSidePlayersCount: 1,
      rightSidePlayersCount: 1,
      playerAName: "T. M. Etcheverry",
      playerBName: "V. Gaubas",
      statusText: "LIVE Set 1",
      tournament: "ATP",
    }),
    false,
  );
});

test("extractScheduledStartText parses full date-time", () => {
  const text = "WTA Doha 19-02-2026 21:55 Upcoming";
  assert.equal(extractScheduledStartText(text), "19-02-2026 21:55");
});

test("extractScheduledStartText falls back to HH:mm", () => {
  const text = "Court 1 Start 7:30 Upcoming";
  assert.equal(extractScheduledStartText(text), "7:30");
});
