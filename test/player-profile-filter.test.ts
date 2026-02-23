import test from "node:test";
import assert from "node:assert/strict";
import {
  filterRecentMatchCandidates,
  parseNowGoalProfileDate,
} from "../src/extract/playerProfile.js";
import type { RecentMatchRef } from "../src/types.js";

const NOW = new Date("2026-02-18T12:00:00.000Z");

test("parseNowGoalProfileDate parses DD-MM-YYYY HH:mm", () => {
  const parsed = parseNowGoalProfileDate("18-02-2026 21:55");
  assert.ok(parsed);
  assert.equal(parsed?.getFullYear(), 2026);
  assert.equal(parsed?.getMonth(), 1);
  assert.equal(parsed?.getDate(), 18);
  assert.equal(parsed?.getHours(), 21);
  assert.equal(parsed?.getMinutes(), 55);
});

test("filterRecentMatchCandidates filters future and doubles, keeps finished singles", () => {
  const candidates: RecentMatchRef[] = [
    {
      url: "https://sports1.nowgoal26.com/tennis/match/195757",
      isSingles: true,
      isFinishedHint: false,
      isFutureHint: true,
      dateText: "19-02-2026 21:55",
      scoreText: "",
    },
    {
      url: "https://sports1.nowgoal26.com/tennis/match/195756",
      isSingles: false,
      isFinishedHint: true,
      dateText: "18-02-2026 10:00",
      scoreText: "2-0 (6-2,6-1)",
    },
    {
      url: "https://sports1.nowgoal26.com/tennis/match/195693",
      isSingles: true,
      isFinishedHint: true,
      dateText: "18-02-2026 01:00",
      scoreText: "0-2 (5-7,4-6)",
    },
  ];

  const result = filterRecentMatchCandidates(candidates, {
    needCount: 5,
    scanLimit: 30,
    now: NOW,
  });

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0]?.url, "https://sports1.nowgoal26.com/tennis/match/195693");
  assert.equal(result.filtered.future, 1);
  assert.equal(result.filtered.nonSingles, 1);
});

test("filterRecentMatchCandidates excludes target match url", () => {
  const candidates: RecentMatchRef[] = [
    {
      url: "https://sports1.nowgoal26.com/tennis/match/195757",
      isSingles: true,
      isFinishedHint: true,
      dateText: "18-02-2026 11:00",
      scoreText: "2-1 (6-4,3-6,7-5)",
    },
    {
      url: "https://sports1.nowgoal26.com/tennis/match/195693",
      isSingles: true,
      isFinishedHint: true,
      dateText: "18-02-2026 01:00",
      scoreText: "0-2 (5-7,4-6)",
    },
  ];

  const result = filterRecentMatchCandidates(candidates, {
    needCount: 5,
    scanLimit: 30,
    excludeMatchUrl: "https://sports1.nowgoal26.com/tennis/match/195757",
    now: NOW,
  });

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0]?.url, "https://sports1.nowgoal26.com/tennis/match/195693");
  assert.equal(result.filtered.sameAsTargetMatch, 1);
});

test("filterRecentMatchCandidates rejects doubles when link counts indicate pair row", () => {
  const candidates: RecentMatchRef[] = [
    {
      url: "https://sports1.nowgoal26.com/tennis/match/195800",
      isSingles: true,
      isDoublesHint: true,
      leftPlayerLinksCount: 2,
      rightPlayerLinksCount: 1,
      isFinishedHint: true,
      dateText: "18-02-2026 11:00",
      scoreText: "2-1 (6-4,3-6,7-5)",
    },
    {
      url: "https://sports1.nowgoal26.com/tennis/match/195801",
      isSingles: true,
      leftPlayerLinksCount: 1,
      rightPlayerLinksCount: 1,
      isFinishedHint: true,
      dateText: "18-02-2026 10:00",
      scoreText: "2-0 (6-2,6-1)",
    },
  ];

  const result = filterRecentMatchCandidates(candidates, {
    needCount: 5,
    scanLimit: 30,
    now: NOW,
  });

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0]?.url, "https://sports1.nowgoal26.com/tennis/match/195801");
  assert.equal(result.filtered.nonSingles, 1);
});
