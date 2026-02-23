import type { PredictionTransport, RunConfig } from "../types.js";
import { ConsoleTransport } from "../transports/console.js";
import { TelegramTransport } from "../transports/telegram.js";

export function createTransports(config: RunConfig): PredictionTransport[] {
  const transports: PredictionTransport[] = [];
  if (config.console) {
    transports.push(new ConsoleTransport());
  }
  if (config.telegram && config.telegramToken && config.telegramChatId) {
    transports.push(
      new TelegramTransport({
        token: config.telegramToken,
        chatId: config.telegramChatId,
        maxRequestsPerMinute: config.tgSendMaxRpm,
      }),
    );
  }
  return transports;
}
