import test from "node:test";
import assert from "node:assert/strict";
import { TelegramControlBot } from "../src/controlBot.js";
import type { RunConfig } from "../src/types.js";
import type { TelegramUpdate } from "../src/control-bot/telegramPoll.js";

function makeConfig(): RunConfig {
  return {
    entryUrl: "https://www.flashscore.co.ke/tennis/",
    status: "all",
    recentCount: 5,
    headed: false,
    slowMo: 0,
    timeoutMs: 30_000,
    telegram: true,
    console: false,
    maxGotoRetries: 2,
    historyStatsMissBudget: 20,
    telegramToken: "123:abc",
    telegramChatId: "-1001",
    tgSendMaxRpm: 18,
  };
}

function makeShutdownUpdate(updateId = 1): TelegramUpdate {
  return {
    update_id: updateId,
    message: {
      chat: { id: -1001 },
      text: "выключить",
    },
  };
}

test("control-bot retries once on 409 and continues polling", async () => {
  const sent: string[] = [];
  const sleepCalls: number[] = [];
  const ackOffsets: number[] = [];
  let calls = 0;

  const bot = new TelegramControlBot(makeConfig(), {
    transport: {
      async sendText(text) {
        sent.push(text);
      },
    },
    bootstrapOffsetFn: async () => 0,
    acknowledgeOffsetFn: async (_token, offset) => {
      ackOffsets.push(offset);
    },
    sleepFn: async (ms) => {
      sleepCalls.push(ms);
    },
    getUpdatesFn: async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error(
          'getUpdates failed (409): {"ok":false,"error_code":409,"description":"Conflict: terminated by other getUpdates request"}',
        );
      }
      return [makeShutdownUpdate(10)];
    },
  });

  await bot.run();

  assert.equal(calls, 2);
  assert.deepEqual(sleepCalls, [4_000]);
  assert.deepEqual(ackOffsets, [11]);
  assert.ok(sent.some((line) => line.includes("Бот управления запущен")));
  assert.ok(sent.some((line) => line.includes("обнаружен второй polling-инстанс")));
  assert.ok(sent.some((line) => line.includes("Выключаю бота")));
});

test("control-bot fails after conflict streak threshold", async () => {
  const sent: string[] = [];
  const sleepCalls: number[] = [];

  const bot = new TelegramControlBot(makeConfig(), {
    transport: {
      async sendText(text) {
        sent.push(text);
      },
    },
    bootstrapOffsetFn: async () => 0,
    acknowledgeOffsetFn: async () => {
      throw new Error("ack should not be called on fatal conflict");
    },
    sleepFn: async (ms) => {
      sleepCalls.push(ms);
    },
    getUpdatesFn: async () => {
      throw new Error(
        'getUpdates failed (409): {"ok":false,"error_code":409,"description":"Conflict: terminated by other getUpdates request"}',
      );
    },
  });

  await assert.rejects(
    () => bot.run(),
    /Telegram polling conflict persisted \(6 attempts\)/,
  );

  assert.equal(sleepCalls.length, 5);
  assert.ok(sleepCalls.every((ms) => ms === 4_000));
  assert.equal(
    sent.filter((line) => line.includes("обнаружен второй polling-инстанс")).length,
    1,
  );
});

test("control-bot runs normal loop without conflict backoff", async () => {
  const sent: string[] = [];
  const sleepCalls: number[] = [];
  const ackOffsets: number[] = [];
  const updates: TelegramUpdate[][] = [[makeShutdownUpdate(5)]];
  let calls = 0;

  const bot = new TelegramControlBot(makeConfig(), {
    transport: {
      async sendText(text) {
        sent.push(text);
      },
    },
    bootstrapOffsetFn: async () => 0,
    acknowledgeOffsetFn: async (_token, offset) => {
      ackOffsets.push(offset);
    },
    sleepFn: async (ms) => {
      sleepCalls.push(ms);
    },
    getUpdatesFn: async () => {
      calls += 1;
      return updates.shift() ?? [];
    },
  });

  await bot.run();

  assert.equal(calls, 1);
  assert.deepEqual(sleepCalls, []);
  assert.deepEqual(ackOffsets, [6]);
  assert.equal(
    sent.some((line) => line.includes("обнаружен второй polling-инстанс")),
    false,
  );
});
