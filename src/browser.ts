import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { Logger } from "./logger.js";
import type { RunConfig } from "./types.js";

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export async function createBrowserSession(config: RunConfig): Promise<BrowserSession> {
  const browser = await chromium.launch({
    headless: !config.headed,
    slowMo: config.slowMo,
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 920 } });
  await context.addInitScript(() => {
    const scope = globalThis as { __name?: (target: unknown, name?: string) => unknown };
    if (typeof scope.__name !== "function") {
      scope.__name = (target: unknown): unknown => target;
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(config.timeoutMs);

  return { browser, context, page };
}

export async function closeBrowserSession(session: BrowserSession): Promise<void> {
  await session.context.close();
  await session.browser.close();
}

interface RetryOptions {
  timeoutMs: number;
  retries: number;
  logger: Logger;
  stepLabel: string;
}

export async function gotoWithRetry(
  page: Page,
  url: string,
  options: RetryOptions,
): Promise<void> {
  const maxAttempts = options.retries + 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      options.logger.debug(
        `${options.stepLabel}: navigating to ${url} (attempt ${attempt}/${maxAttempts})`,
      );
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
      await page.waitForLoadState("domcontentloaded", { timeout: options.timeoutMs });
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      options.logger.warn(
        `${options.stepLabel}: navigation failed for ${url}, retrying (${attempt}/${maxAttempts})`,
      );
      await page.waitForTimeout(400);
    }
  }
}
