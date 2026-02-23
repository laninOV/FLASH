import test from "node:test";
import assert from "node:assert/strict";
import { guessStatusFromText } from "../src/extract/shared.js";

test("guessStatusFromText marks Set 1 as live", () => {
  assert.equal(guessStatusFromText("19-02-2026 17:00 Set 1"), "live");
});

test("guessStatusFromText marks Set 1 with glued score header as live", () => {
  assert.equal(guessStatusFromText("19-02-2026 17:00 Set 112345PSets"), "live");
});

test("guessStatusFromText marks Set 2 as live", () => {
  assert.equal(guessStatusFromText("19-02-2026 16:00 Set 2"), "live");
});

test("guessStatusFromText marks P1 retired as finished", () => {
  assert.equal(guessStatusFromText("19-02-2026 17:30 P1 retired"), "finished");
});

test("guessStatusFromText marks P2 retired as finished", () => {
  assert.equal(guessStatusFromText("19-02-2026 14:10 P2 retired"), "finished");
});

test("guessStatusFromText marks FT as finished", () => {
  assert.equal(guessStatusFromText("19-02-2026 15:20 FT"), "finished");
});

test("guessStatusFromText marks FT with glued score header as finished", () => {
  assert.equal(guessStatusFromText("19-02-2026 15:20 FT12345PSets"), "finished");
});

test("guessStatusFromText marks plain time as upcoming", () => {
  assert.equal(guessStatusFromText("20-02-2026 09:00"), "upcoming");
});

test("guessStatusFromText prioritizes finished over live markers", () => {
  assert.equal(guessStatusFromText("19-02-2026 17:00 FT Set 1"), "finished");
});
