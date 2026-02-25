import { z } from "zod";
import type { RunConfig } from "./types.js";

const schema = z.object({
  entryUrl: z.string().url(),
  status: z.enum(["all", "upcoming", "live", "finished"]),
  limit: z.number().int().positive().optional(),
  recentCount: z.number().int().positive().max(20),
  headed: z.boolean(),
  slowMo: z.number().int().min(0).max(5000),
  timeoutMs: z.number().int().min(1000).max(120000),
  telegram: z.boolean(),
  console: z.boolean(),
  maxGotoRetries: z.number().int().min(0).max(10),
  historyStatsMissBudget: z.number().int().min(0).max(100),
  tgSendMaxRpm: z.number().int().min(0).max(120),
});

const DEFAULTS = {
  entryUrl: "https://www.flashscore.co.ke/tennis/",
  status: "all",
  recentCount: 5,
  headed: true,
  slowMo: 450,
  timeoutMs: 30_000,
  telegram: true,
  console: true,
  maxGotoRetries: 2,
  historyStatsMissBudget: 3,
  tgSendMaxRpm: 18,
} as const;

type CliRaw = Record<string, string | boolean>;

export function buildRunConfig(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): RunConfig {
  const args = parseCliArgs(argv);

  const parsed = schema.parse({
    entryUrl: readString(args, "entry-url", DEFAULTS.entryUrl),
    status: readString(args, "status", DEFAULTS.status),
    limit: readOptionalInt(args, "limit"),
    recentCount: readInt(args, "recent-count", DEFAULTS.recentCount),
    headed: readBool(args, "headed", DEFAULTS.headed),
    slowMo: readInt(args, "slow-mo", DEFAULTS.slowMo),
    timeoutMs: readInt(args, "timeout-ms", DEFAULTS.timeoutMs),
    telegram: readBool(args, "telegram", DEFAULTS.telegram),
    console: readBool(args, "console", DEFAULTS.console),
    maxGotoRetries: readInt(args, "max-goto-retries", DEFAULTS.maxGotoRetries),
    historyStatsMissBudget: readInt(
      args,
      "history-stats-miss-budget",
      DEFAULTS.historyStatsMissBudget,
    ),
    tgSendMaxRpm: readEnvInt(env, "TG_SEND_MAX_RPM", DEFAULTS.tgSendMaxRpm),
  });

  const telegramToken = env.TG_BOT_TOKEN;
  const telegramChatId = env.TG_CHAT_ID;
  if (parsed.telegram && (!telegramToken || !telegramChatId)) {
    throw new Error(
      "Telegram is enabled but TG_BOT_TOKEN or TG_CHAT_ID is missing in environment.",
    );
  }

  return {
    ...parsed,
    telegramToken,
    telegramChatId,
  };
}

function parseCliArgs(argv: string[]): CliRaw {
  const out: CliRaw = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function readString(args: CliRaw, key: string, fallback: string): string {
  const value = args[key];
  if (typeof value === "string") {
    return value;
  }
  return fallback;
}

function readOptionalInt(args: CliRaw, key: string): number | undefined {
  const value = args[key];
  if (typeof value !== "string") {
    return undefined;
  }
  return Number.parseInt(value, 10);
}

function readInt(args: CliRaw, key: string, fallback: number): number {
  const value = args[key];
  if (typeof value !== "string") {
    return fallback;
  }
  return Number.parseInt(value, 10);
}

function readBool(args: CliRaw, key: string, fallback: boolean): boolean {
  const value = args[key];
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return fallback;
}

function readEnvInt(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
): number {
  const raw = env[key];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
}
