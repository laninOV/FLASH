import test from "node:test";
import assert from "node:assert/strict";
import { isGetUpdatesConflictError } from "../src/control-bot/telegramPoll.js";

test("isGetUpdatesConflictError detects 409 getUpdates conflict shapes", () => {
  assert.equal(
    isGetUpdatesConflictError(
      'getUpdates failed (409): {"ok":false,"error_code":409,"description":"Conflict: terminated by other getUpdates request"}',
    ),
    true,
  );
  assert.equal(
    isGetUpdatesConflictError("Conflict: terminated by other getUpdates request"),
    true,
  );
});

test("isGetUpdatesConflictError ignores non-409 polling errors", () => {
  assert.equal(
    isGetUpdatesConflictError(
      'getUpdates failed (502): {"ok":false,"error_code":502,"description":"Bad Gateway"}',
    ),
    false,
  );
  assert.equal(isGetUpdatesConflictError(new Error("network timeout")), false);
  assert.equal(isGetUpdatesConflictError(undefined), false);
});
