import test from "node:test";
import assert from "node:assert/strict";
import { orderMatchesForProcessing, toSortableStartMs } from "../src/orchestrator/utils.js";
import type { DayMatchRef } from "../src/types.js";

function makeUpcoming(id: string, start?: string): DayMatchRef {
  return {
    id,
    url: `https://sports1.nowgoal26.com/tennis/match/${id}`,
    playerAName: `A-${id}`,
    playerBName: `B-${id}`,
    status: "upcoming",
    ...(start ? { scheduledStartText: start } : {}),
  };
}

test("orderMatchesForProcessing sorts upcoming matches by scheduled start asc", () => {
  const matches: DayMatchRef[] = [
    makeUpcoming("1", "20-02-2026 11:00"),
    makeUpcoming("2", "20-02-2026 09:30"),
    makeUpcoming("3"),
    makeUpcoming("4", "20-02-2026 09:30"),
  ];

  const ordered = orderMatchesForProcessing(matches, "upcoming");
  assert.deepEqual(
    ordered.map((item) => item.id),
    ["2", "4", "1", "3"],
  );
});

test("orderMatchesForProcessing keeps non-upcoming order untouched", () => {
  const matches: DayMatchRef[] = [
    { ...makeUpcoming("1", "20-02-2026 11:00"), status: "live" },
    { ...makeUpcoming("2", "20-02-2026 09:30"), status: "live" },
    { ...makeUpcoming("3"), status: "live" },
  ];

  const ordered = orderMatchesForProcessing(matches, "live");
  assert.deepEqual(
    ordered.map((item) => item.id),
    ["1", "2", "3"],
  );
});

test("toSortableStartMs parses hh:mm and rejects invalid time", () => {
  assert.ok(typeof toSortableStartMs("09:45") === "number");
  assert.equal(toSortableStartMs("29:99"), undefined);
  assert.equal(toSortableStartMs(undefined), undefined);
});
