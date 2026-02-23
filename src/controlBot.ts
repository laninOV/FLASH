import { closeBrowserSession, createBrowserSession } from "./browser.js";
import { isAbortError, stringifyError } from "./common/errors.js";
import { parseControlCommand } from "./control-bot/commands.js";
import { MAX_LIST_LINES, MENU, MENU_KEYBOARD } from "./control-bot/menu.js";
import { chunkLines, formatMatchListEntry, formatSummary } from "./control-bot/messages.js";
import {
  acknowledgeOffset,
  bootstrapOffset,
  getUpdates,
  type TelegramUpdate,
} from "./control-bot/telegramPoll.js";
import { extractDayMatches } from "./extract/dayMatches.js";
import { Logger } from "./logger.js";
import { run } from "./orchestrator.js";
import { orderMatchesForProcessing } from "./orchestrator/utils.js";
import { TelegramTransport } from "./transports/telegram.js";
import type { DayMatchRef, MatchStatusFilter, RunConfig } from "./types.js";

interface ActiveTask {
  label: string;
  abortController: AbortController;
  promise: Promise<void>;
}

export class TelegramControlBot {
  private readonly logger = new Logger({ debugEnabled: false });
  private readonly token: string;
  private readonly chatId: string;
  private readonly transport: TelegramTransport;
  private offset = 0;
  private shuttingDown = false;
  private activeTask?: ActiveTask;

  constructor(private readonly baseConfig: RunConfig) {
    if (!baseConfig.telegramToken || !baseConfig.telegramChatId) {
      throw new Error("TG_BOT_TOKEN and TG_CHAT_ID are required for control bot.");
    }
    this.token = baseConfig.telegramToken;
    this.chatId = String(baseConfig.telegramChatId);
    this.transport = new TelegramTransport({
      token: this.token,
      chatId: this.chatId,
      maxRequestsPerMinute: baseConfig.tgSendMaxRpm,
    });
  }

  async run(): Promise<void> {
    this.offset = await bootstrapOffset(this.token, this.offset, this.logger);
    await this.send("Бот управления запущен. Выберите действие из меню.", true);

    while (!this.shuttingDown) {
      let updates: TelegramUpdate[] = [];
      try {
        updates = await getUpdates(this.token, { offset: this.offset, timeoutSec: 15 });
      } catch (error) {
        await this.send(`Ошибка Telegram polling: ${stringifyError(error)}`);
        await sleep(1200);
        continue;
      }

      for (const update of updates) {
        this.offset = Math.max(this.offset, update.update_id + 1);
        const text = update.message?.text;
        const chatId = String(update.message?.chat?.id ?? "");
        if (!text || chatId !== this.chatId) {
          continue;
        }
        try {
          await this.handleCommand(text);
        } catch (error) {
          await this.send(`Ошибка обработки команды: ${stringifyError(error)}`);
        }
      }
    }

    await acknowledgeOffset(this.token, this.offset, this.logger);

    if (this.activeTask) {
      this.activeTask.abortController.abort();
      await settleTask(this.activeTask.promise);
      this.activeTask = undefined;
    }
  }

  private async handleCommand(rawText: string): Promise<void> {
    const command = parseControlCommand(rawText);
    switch (command.kind) {
      case "ignore":
        return;
      case "show_menu":
        await this.send("Меню обновлено.", true);
        return;
      case "shutdown":
        await this.send("Выключаю бота...");
        this.shuttingDown = true;
        return;
      case "reload":
        await this.stopActiveTask("Перезагрузка: остановка текущего процесса...");
        await this.send("Перезагрузка выполнена. Бот готов к новым командам.", true);
        return;
      case "stop":
        await this.stopActiveTask("Останавливаю текущий процесс...");
        return;
      case "list":
        await this.sendMatchList(command.status);
        return;
      case "analyze":
        await this.startAnalysis(command.status, command.label);
        return;
      case "unknown":
        await this.send("Команда не распознана. Используйте кнопки меню.", true);
        return;
      default:
        return;
    }
  }

  private async sendMatchList(status: MatchStatusFilter): Promise<void> {
    await this.send(`Собираю список матчей: ${status === "live" ? "лайв" : "прематч"}...`);
    const matches = await this.fetchDayMatches(status);
    if (matches.length === 0) {
      await this.send("Подходящих матчей не найдено.");
      return;
    }

    const title =
      status === "live"
        ? `Список лайв (${matches.length})`
        : `Список прематч (${matches.length})`;
    const lines = [title];

    const selected = matches.slice(0, MAX_LIST_LINES);
    for (let index = 0; index < selected.length; index += 1) {
      const match = selected[index];
      lines.push(formatMatchListEntry(index, match));
      lines.push(match.url);
    }
    if (matches.length > MAX_LIST_LINES) {
      lines.push(`... и ещё ${matches.length - MAX_LIST_LINES} матчей`);
    }

    for (const chunk of chunkLines(lines, 3500)) {
      await this.send(chunk);
    }
  }

  private async startAnalysis(status: MatchStatusFilter, label: string): Promise<void> {
    if (this.activeTask) {
      await this.send(
        `Уже выполняется процесс: ${this.activeTask.label}. ` +
          `Сначала нажмите "${MENU.stop}".`,
      );
      return;
    }

    const controller = new AbortController();
    const taskLabel = `анализ ${label}`;
    await this.send(`Запускаю ${taskLabel}...`);

    const runConfig: RunConfig = {
      ...this.baseConfig,
      status,
      limit: undefined,
      telegram: true,
      console: false,
    };

    const promise = (async () => {
      try {
        const summary = await run(runConfig, { signal: controller.signal });
        await this.send(formatSummary(taskLabel, summary));
      } catch (error) {
        if (isAbortError(error)) {
          await this.send(`Процесс остановлен: ${taskLabel}.`);
          return;
        }
        await this.send(`Ошибка в ${taskLabel}: ${stringifyError(error)}`);
      }
    })().finally(() => {
      if (this.activeTask?.abortController === controller) {
        this.activeTask = undefined;
      }
    });

    this.activeTask = { label: taskLabel, abortController: controller, promise };
  }

  private async stopActiveTask(message: string): Promise<void> {
    if (!this.activeTask) {
      await this.send("Сейчас нет активного процесса.");
      return;
    }
    await this.send(message);
    this.activeTask.abortController.abort();
    await settleTask(this.activeTask.promise);
    this.activeTask = undefined;
  }

  private async fetchDayMatches(status: MatchStatusFilter): Promise<DayMatchRef[]> {
    const config: RunConfig = {
      ...this.baseConfig,
      status: "all",
      limit: undefined,
      headed: false,
      slowMo: 0,
      telegram: false,
      console: false,
    };
    const session = await createBrowserSession(config);
    try {
      const all = await extractDayMatches(session.page, config, this.logger);
      const filtered = status === "all" ? all : all.filter((match) => match.status === status);
      return orderMatchesForProcessing(filtered, status);
    } finally {
      await closeBrowserSession(session);
    }
  }

  private async send(text: string, withMenu = false): Promise<void> {
    await this.transport.sendText(text, {
      replyMarkup: withMenu ? MENU_KEYBOARD : undefined,
      disableWebPagePreview: true,
    });
  }
}

async function settleTask(task: Promise<void>): Promise<void> {
  try {
    await task;
  } catch {
    // no-op
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
