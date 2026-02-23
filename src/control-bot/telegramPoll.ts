import { stringifyError } from "../common/errors.js";

export interface TelegramUpdate {
  update_id: number;
  message?: {
    chat?: { id?: number };
    text?: string;
  };
}

interface PollLogger {
  debug(message: string): void;
}

export async function getUpdates(
  token: string,
  options: { offset: number; timeoutSec: number },
): Promise<TelegramUpdate[]> {
  const params = new URLSearchParams();
  params.set("offset", String(options.offset));
  params.set("timeout", String(options.timeoutSec));
  params.set("allowed_updates", JSON.stringify(["message"]));

  const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?${params.toString()}`);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`getUpdates failed (${response.status}): ${body}`);
  }

  const parsed = JSON.parse(body) as { ok?: boolean; result?: TelegramUpdate[] };
  if (!parsed.ok || !Array.isArray(parsed.result)) {
    throw new Error(`getUpdates invalid payload: ${body}`);
  }
  return parsed.result;
}

export function nextOffset(currentOffset: number, updates: TelegramUpdate[]): number {
  let offset = currentOffset;
  for (const update of updates) {
    offset = Math.max(offset, update.update_id + 1);
  }
  return offset;
}

export async function bootstrapOffset(
  token: string,
  currentOffset: number,
  logger?: PollLogger,
): Promise<number> {
  const pending = await getUpdates(token, { offset: 0, timeoutSec: 0 });
  if (pending.length === 0) {
    return currentOffset;
  }
  const offset = nextOffset(currentOffset, pending);
  await acknowledgeOffset(token, offset, logger);
  return offset;
}

export async function acknowledgeOffset(
  token: string,
  offset: number,
  logger?: PollLogger,
): Promise<void> {
  if (offset <= 0) {
    return;
  }
  try {
    await getUpdates(token, { offset, timeoutSec: 0 });
  } catch (error) {
    logger?.debug(`Offset ack failed: ${stringifyError(error)}`);
  }
}
