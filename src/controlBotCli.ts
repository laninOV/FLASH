import { buildRunConfig } from "./config.js";
import { TelegramControlBot } from "./controlBot.js";

async function main(): Promise<void> {
  const config = buildRunConfig(process.argv.slice(2), process.env);
  if (!config.telegramToken || !config.telegramChatId) {
    throw new Error("TG_BOT_TOKEN and TG_CHAT_ID are required.");
  }

  const bot = new TelegramControlBot(config);
  await bot.run();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Fatal error: ${message}\n`);
  process.exit(1);
});
