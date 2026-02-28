import { randomUUID, createHash } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";

interface LockFilePayload {
  pid: number;
  ownerId: string;
  tokenHash: string;
  createdAt: string;
}

export interface AcquireControlBotLockOptions {
  token: string;
  lockFilePath?: string;
}

export interface LockHandle {
  path: string;
  release(): Promise<void>;
}

export async function acquireControlBotLock(
  options: AcquireControlBotLockOptions,
): Promise<LockHandle> {
  const tokenHash = hashToken(options.token);
  const lockPath = options.lockFilePath || `/tmp/flash-control-bot-${tokenHash}.lock`;
  const ownerId = randomUUID();
  const payload: LockFilePayload = {
    pid: process.pid,
    ownerId,
    tokenHash,
    createdAt: new Date().toISOString(),
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await writeFile(lockPath, JSON.stringify(payload), {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      return createHandle(lockPath, ownerId);
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
    }

    const existing = await readLockPayload(lockPath);
    const existingPid = existing?.pid;
    if (typeof existingPid === "number" && isProcessAlive(existingPid)) {
      throw new Error(
        `Control bot already running (pid=${existingPid}) for token hash ${tokenHash}. ` +
          `Stop duplicate process and retry.`,
      );
    }

    try {
      await unlink(lockPath);
    } catch {
      // Best effort stale-lock cleanup; retry loop handles races.
    }
  }

  throw new Error(`Failed to acquire control-bot lock: ${lockPath}`);
}

function createHandle(path: string, ownerId: string): LockHandle {
  let released = false;
  return {
    path,
    async release(): Promise<void> {
      if (released) {
        return;
      }
      released = true;
      const existing = await readLockPayload(path);
      if (!existing || existing.ownerId !== ownerId) {
        return;
      }
      try {
        await unlink(path);
      } catch {
        // no-op
      }
    },
  };
}

async function readLockPayload(path: string): Promise<LockFilePayload | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<LockFilePayload>;
    if (
      !parsed ||
      typeof parsed.pid !== "number" ||
      !Number.isFinite(parsed.pid) ||
      typeof parsed.ownerId !== "string" ||
      typeof parsed.tokenHash !== "string"
    ) {
      return undefined;
    }
    return {
      pid: parsed.pid,
      ownerId: parsed.ownerId,
      tokenHash: parsed.tokenHash,
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : "",
    };
  } catch {
    return undefined;
  }
}

function isAlreadyExistsError(error: unknown): boolean {
  const code = (error as { code?: string } | undefined)?.code;
  return code === "EEXIST";
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as { code?: string } | undefined)?.code;
    if (code === "EPERM") {
      return true;
    }
    return false;
  }
}

function hashToken(token: string): string {
  const text = String(token || "");
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}
