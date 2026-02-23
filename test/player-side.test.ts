import test from "node:test";
import assert from "node:assert/strict";
import { resolvePlayerSide } from "../src/extract/techStats.js";

test("resolvePlayerSide detects left side by exact name", () => {
  assert.equal(resolvePlayerSide("Iva Jovic", "Iva Jovic", "Jessica Pegula"), "left");
});

test("resolvePlayerSide detects right side by partial token overlap", () => {
  assert.equal(resolvePlayerSide("Jessica Pegula", "Iva Jovic", "Pegula Jessica"), "right");
});

test("resolvePlayerSide returns unknown when headers do not match", () => {
  assert.equal(resolvePlayerSide("Iva Jovic", "Player A", "Player B"), "unknown");
});

