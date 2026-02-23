import type { PredictionResult, PredictionTransport } from "../types.js";
import { formatShortPredictionMessage } from "./format.js";

export interface TelegramTransportOptions {
  token: string;
  chatId: string;
  maxRequestsPerMinute?: number;
}

export class TelegramTransport implements PredictionTransport {
  readonly name = "telegram";
  private readonly token: string;
  private readonly chatId: string;
  private readonly maxRequestsPerMinute: number;
  private readonly callTimes: number[] = [];

  constructor(options: TelegramTransportOptions) {
    this.token = options.token;
    this.chatId = options.chatId;
    this.maxRequestsPerMinute = options.maxRequestsPerMinute ?? 18;
  }

  async sendPrediction(prediction: PredictionResult): Promise<void> {
    await this.throttle();
    const message = formatShortPredictionMessage(prediction);
    const primary = await this.sendMessage({
      chat_id: this.chatId,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    if (primary.ok) {
      return;
    }

    // Fallback to plain text when Telegram rejects formatting.
    const fallback = await this.sendMessage({
      chat_id: this.chatId,
      text: message,
      disable_web_page_preview: true,
    });
    if (fallback.ok) {
      return;
    }

    throw new Error(
      `Telegram sendMessage failed (${fallback.status || primary.status}): ` +
        `${fallback.body || primary.body}`,
    );
  }

  async sendText(
    text: string,
    options: {
      replyMarkup?: unknown;
      disableWebPagePreview?: boolean;
    } = {},
  ): Promise<void> {
    await this.throttle();
    const payload: Record<string, unknown> = {
      chat_id: this.chatId,
      text,
    };
    if (options.disableWebPagePreview !== false) {
      payload.disable_web_page_preview = true;
    }
    if (options.replyMarkup) {
      payload.reply_markup = options.replyMarkup;
    }

    const response = await this.sendMessage(payload);
    if (response.ok) {
      return;
    }
    throw new Error(`Telegram sendText failed (${response.status}): ${response.body}`);
  }

  private async sendMessage(payload: Record<string, unknown>): Promise<{
    ok: boolean;
    status: number;
    body: string;
  }> {
    const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.text();
    return { ok: response.ok, status: response.status, body };
  }

  private async throttle(): Promise<void> {
    if (this.maxRequestsPerMinute <= 0) {
      return;
    }

    const now = Date.now();
    const windowMs = 60_000;

    while (this.callTimes.length > 0 && now - this.callTimes[0] > windowMs) {
      this.callTimes.shift();
    }

    if (this.callTimes.length >= this.maxRequestsPerMinute) {
      const earliest = this.callTimes[0];
      const waitForMs = windowMs - (now - earliest) + 100;
      if (waitForMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(waitForMs, 5_000)));
      }
    }

    this.callTimes.push(Date.now());
  }
}
