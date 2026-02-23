type Level = "debug" | "info" | "warn" | "error";

export interface LoggerOptions {
  debugEnabled?: boolean;
}

export class Logger {
  private readonly debugEnabled: boolean;

  constructor(options: LoggerOptions = {}) {
    this.debugEnabled = options.debugEnabled ?? true;
  }

  debug(message: string): void {
    if (!this.debugEnabled) {
      return;
    }
    this.print("debug", message);
  }

  info(message: string): void {
    this.print("info", message);
  }

  warn(message: string): void {
    this.print("warn", message);
  }

  error(message: string): void {
    this.print("error", message);
  }

  private print(level: Level, message: string): void {
    const ts = new Date().toISOString();
    // Unified, grep-friendly log format.
    process.stdout.write(`[${ts}] [${level.toUpperCase()}] ${message}\n`);
  }
}

