import test from "node:test";
import assert from "node:assert/strict";
import { chunkLines, formatMatchListEntry, formatSummary } from "../src/control-bot/messages.js";

test("formatSummary renders compact run summary", () => {
  const text = formatSummary("анализ лайв", {
    startedAt: "2026-02-19T00:00:00.000Z",
    finishedAt: "2026-02-19T00:10:00.000Z",
    processedMatches: 10,
    predictedMatches: 7,
    skippedMatches: 3,
    parserErrors: 1,
    telegramFailures: 2,
  });

  assert.equal(
    text,
    "анализ лайв завершён.\nprocessed=10, predicted=7, skipped=3, errors=1, telegram_failures=2",
  );
});

test("chunkLines splits long payload into stable chunks", () => {
  const chunks = chunkLines(
    [
      "L1 1111111111",
      "L2 2222222222",
      "L3 3333333333",
      "L4 4444444444",
    ],
    28,
  );

  assert.deepEqual(chunks, [
    "L1 1111111111\nL2 2222222222",
    "L3 3333333333\nL4 4444444444",
  ]);
});

test("formatMatchListEntry includes HH:mm for prematch", () => {
  const line = formatMatchListEntry(0, {
    id: "1",
    url: "https://sports1.nowgoal26.com/tennis/match/195785",
    playerAName: "C.Lee",
    playerBName: "A. Korneeva",
    status: "upcoming",
    scheduledStartText: "20-02-2026 15:20",
  });

  assert.equal(line, "1. C.Lee vs A. Korneeva | 20.02 15:20");
});

test("formatMatchListEntry shows LIVE for live match", () => {
  const line = formatMatchListEntry(1, {
    id: "2",
    url: "https://sports1.nowgoal26.com/tennis/match/195741",
    playerAName: "D. Dzumhur",
    playerBName: "J. Faria",
    status: "live",
  });

  assert.equal(line, "2. D. Dzumhur vs J. Faria | LIVE");
});
