import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { acquireControlBotLock } from "../src/control-bot/processLock.js";

test("acquireControlBotLock creates and releases lock file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "flash-lock-"));
  try {
    const lockPath = join(dir, "bot.lock");
    const lock = await acquireControlBotLock({
      token: "token-a",
      lockFilePath: lockPath,
    });
    const raw = await readFile(lockPath, "utf8");
    const payload = JSON.parse(raw) as { pid: number };
    assert.equal(payload.pid, process.pid);

    await lock.release();
    await assert.rejects(() => access(lockPath, fsConstants.F_OK));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("acquireControlBotLock reuses stale lock", async () => {
  const dir = await mkdtemp(join(tmpdir(), "flash-lock-stale-"));
  try {
    const lockPath = join(dir, "bot.lock");
    await writeFile(
      lockPath,
      JSON.stringify({
        pid: 999_999,
        ownerId: "stale-owner",
        tokenHash: "stale",
        createdAt: new Date().toISOString(),
      }),
      "utf8",
    );

    const lock = await acquireControlBotLock({
      token: "token-b",
      lockFilePath: lockPath,
    });
    const raw = await readFile(lockPath, "utf8");
    const payload = JSON.parse(raw) as { pid: number; ownerId: string };
    assert.equal(payload.pid, process.pid);
    assert.notEqual(payload.ownerId, "stale-owner");
    await lock.release();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("acquireControlBotLock rejects second active owner", async () => {
  const dir = await mkdtemp(join(tmpdir(), "flash-lock-dup-"));
  try {
    const lockPath = join(dir, "bot.lock");
    const first = await acquireControlBotLock({
      token: "token-c",
      lockFilePath: lockPath,
    });
    await assert.rejects(
      () =>
        acquireControlBotLock({
          token: "token-c",
          lockFilePath: lockPath,
        }),
      /already running/i,
    );
    await first.release();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
