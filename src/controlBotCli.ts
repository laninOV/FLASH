import { buildRunConfig } from "./config.js";
import { acquireControlBotLock, type LockHandle } from "./control-bot/processLock.js";
import { TelegramControlBot } from "./controlBot.js";

async function main(): Promise<void> {
  const config = buildRunConfig(process.argv.slice(2), process.env);
  if (!config.telegramToken || !config.telegramChatId) {
    throw new Error("TG_BOT_TOKEN and TG_CHAT_ID are required.");
  }

  const lock = await acquireControlBotLock({ token: config.telegramToken });
  const releaseLock = onceRelease(lock);
  installReleaseHandlers(releaseLock);

  try {
    const bot = new TelegramControlBot(config);
    await bot.run();
  } finally {
    await releaseLock();
  }
}

function installReleaseHandlers(releaseLock: () => Promise<void>): void {
  const releaseAndExit = (code: number, message?: string): void => {
    void releaseLock().finally(() => {
      if (message) {
        process.stderr.write(`${message}\n`);
      }
      process.exit(code);
    });
  };

  process.once("SIGINT", () => releaseAndExit(130));
  process.once("SIGTERM", () => releaseAndExit(143));
  process.once("uncaughtException", (error) =>
    releaseAndExit(1, `Fatal error: ${stringifyUnknown(error)}`),
  );
  process.once("unhandledRejection", (reason) =>
    releaseAndExit(1, `Fatal error: ${stringifyUnknown(reason)}`),
  );
}

function onceRelease(lock: LockHandle): () => Promise<void> {
  let released = false;
  return async (): Promise<void> => {
    if (released) {
      return;
    }
    released = true;
    await lock.release();
  };
}

function stringifyUnknown(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Fatal error: ${message}\n`);
  process.exit(1);
});
