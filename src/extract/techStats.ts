import type { Page } from "playwright";
import { gotoWithRetry } from "../browser.js";
import type { Logger } from "../logger.js";
import {
  isLikelyMetricValue,
  metricLabelToKey,
  normalizeName,
  normalizeWhitespace,
  parseMetricValue,
} from "../normalize.js";
import { TECH_STAT_SECTIONS } from "../selectors.js";
import type {
  HistoricalMatchTechStats,
  PlayerColumn,
  RunConfig,
  TechStatRow,
} from "../types.js";

export type TechStatsSkipReason = "tech_missing" | "non_singles_history";

export type TechStatsExtractResult =
  | {
      status: "ok";
      parsed: HistoricalMatchTechStats;
    }
  | {
      status: "skip";
      reason: TechStatsSkipReason;
    };

interface MatrixCapture {
  title?: string;
  matrices: string[][][];
}

const CORE_TECH_KEYS = new Set([
  "total_points_won",
  "second_serve_points_won",
  "first_serve_return_points_won",
  "second_serve_return_points_won",
  "break_points_saved",
  "break_points_converted",
]);

export async function extractTechStatsFromMatch(
  page: Page,
  matchUrl: string,
  playerName: string,
  config: RunConfig,
  logger: Logger,
): Promise<TechStatsExtractResult> {
  const statsUrl = toFlashscoreStatsUrl(matchUrl) || matchUrl;
  try {
    await gotoWithRetry(page, statsUrl, {
      timeoutMs: config.timeoutMs,
      retries: config.maxGotoRetries,
      logger,
      stepLabel: `tech-stats:${playerName}`,
    });
  } catch (error) {
    if (statsUrl !== matchUrl) {
      logger.warn(
        `Tech Statistics stats-url failed for ${playerName} at ${statsUrl}, fallback to match URL.`,
      );
      await gotoWithRetry(page, matchUrl, {
        timeoutMs: config.timeoutMs,
        retries: config.maxGotoRetries,
        logger,
        stepLabel: `tech-stats:${playerName}:fallback`,
      });
    } else {
      throw error;
    }
  }

  try {
    await page.waitForSelector(
      ".tabContent__match-statistics [data-testid='wcl-statistics'], #dv_techStat",
      { timeout: Math.min(config.timeoutMs, 3_000) },
    );
  } catch {
    // Some matches legitimately have no detailed stats; capture path below will decide.
  }

  const doublesSignals = await captureHistoricalDoublesSignals(page);
  if (resolveHistoricalDoublesHint(doublesSignals)) {
    logger.warn(`Tech Statistics skipped as non_singles_history for ${playerName} at ${matchUrl}`);
    return {
      status: "skip",
      reason: "non_singles_history",
    };
  }

  let captured = await captureTechStatsMatrices(page);
  let parsed = chooseBestMatrixAndParse(captured.matrices, playerName);
  if (!isStrictParseReady(parsed)) {
    logger.debug(`Tech Statistics capture retry for ${playerName} at ${matchUrl}`);
    await page.waitForTimeout(350);
    captured = await captureTechStatsMatrices(page);
    parsed = chooseBestMatrixAndParse(captured.matrices, playerName);
  }

  if (captured.matrices.length === 0) {
    logger.warn(`Tech Statistics not found for ${playerName} at ${matchUrl}`);
    return {
      status: "skip",
      reason: "tech_missing",
    };
  }
  if (!parsed || parsed.rows.length === 0) {
    logger.warn(`Tech Statistics parse produced no rows for ${playerName} at ${matchUrl}`);
    return {
      status: "skip",
      reason: "tech_missing",
    };
  }
  if (!hasStrictTechCoverage(parsed.rows)) {
    logger.warn(`Tech Statistics missing core metrics for ${playerName} at ${matchUrl}`);
    return {
      status: "skip",
      reason: "tech_missing",
    };
  }

  return {
    status: "ok",
    parsed: {
      matchUrl,
      matchTitle: captured.title,
      playerName,
      sourcePlayerSide: parsed.side,
      rows: parsed.rows,
      warnings: parsed.warnings,
    },
  };
}

export function resolvePlayerSide(
  playerName: string,
  leftHeader?: string,
  rightHeader?: string,
): PlayerColumn {
  const player = normalizeName(playerName);
  const left = normalizeName(leftHeader || "");
  const right = normalizeName(rightHeader || "");

  if (!player || (!left && !right)) {
    return "unknown";
  }
  if (nameMatch(player, left) && !nameMatch(player, right)) {
    return "left";
  }
  if (nameMatch(player, right) && !nameMatch(player, left)) {
    return "right";
  }
  if (left && !right && nameMatch(player, left)) {
    return "left";
  }
  if (right && !left && nameMatch(player, right)) {
    return "right";
  }
  return "unknown";
}

export function matrixFromHtmlFragment(html: string): string[][] {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const matrix: string[][] = [];

  for (const rowHtml of rows) {
    const cells: string[] = [];
    const cellRegex = /<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi;
    for (const match of rowHtml.matchAll(cellRegex)) {
      const rawCell = match[2] || "";
      const withoutTags = rawCell.replace(/<[^>]+>/g, " ");
      const decoded = decodeBasicHtmlEntities(withoutTags);
      const value = normalizeWhitespace(decoded);
      if (value) {
        cells.push(value);
      }
    }
    if (cells.length > 0) {
      matrix.push(cells);
    }
  }
  return matrix;
}

interface ParsedMatrix {
  rows: TechStatRow[];
  side: PlayerColumn;
  warnings: string[];
}

function isStrictParseReady(parsed: ParsedMatrix | undefined): boolean {
  if (!parsed || parsed.rows.length === 0) {
    return false;
  }
  return hasStrictTechCoverage(parsed.rows);
}

export function parseTechStatsMatrix(matrix: string[][], playerName: string): ParsedMatrix {
  const warnings: string[] = [];
  const sanitized = matrix
    .map((row) => row.map((cell) => normalizeWhitespace(cell)).filter(Boolean))
    .filter((row) => row.length > 0);

  if (sanitized.length === 0) {
    return { rows: [], side: "unknown", warnings: ["Empty matrix"] };
  }

  const header = detectHeaderNames(sanitized);
  const side = resolvePlayerSide(playerName, header.left, header.right);
  if (side === "unknown") {
    warnings.push("Unable to confidently map player to left/right column.");
  }

  let currentSection = "General";
  const parsedRows: TechStatRow[] = [];
  for (const row of sanitized) {
    if (row.length === 1 && isSectionName(row[0])) {
      currentSection = normalizeWhitespace(row[0]);
      continue;
    }

    if (row.length < 3) {
      continue;
    }

    const left = row[0];
    const right = row[row.length - 1];
    const label = normalizeWhitespace(row.slice(1, row.length - 1).join(" "));

    if (!label || isSectionName(label)) {
      continue;
    }
    if (looksLikeNameRow(left, label, right)) {
      continue;
    }
    if (!isLikelyMetricValue(left) && !isLikelyMetricValue(right)) {
      continue;
    }

    const [playerRaw, opponentRaw] =
      side === "right" ? [right, left] : ([left, right] as const);

    parsedRows.push({
      section: currentSection,
      metricLabel: label,
      metricKey: canonicalTechMetricKey(metricLabelToKey(label), label),
      playerValue: parseMetricValue(playerRaw),
      opponentValue: parseMetricValue(opponentRaw),
    });
  }

  return { rows: parsedRows, side, warnings };
}

async function captureTechStatsMatrices(page: Page): Promise<MatrixCapture> {
  return page.evaluate((): MatrixCapture => {
    const normalize = (value: string): string => value.replace(/\s+/g, " ").trim();
    const looksLikeValue = (value: string): boolean => {
      const v = normalize(value);
      if (!v) {
        return false;
      }
      if (v === "-" || v === "--") {
        return true;
      }
      return (
        /^(\d+(?:\.\d+)?)%$/.test(v) ||
        /^(\d+(?:\.\d+)?)%\((\d+)\/(\d+)\)$/.test(v) ||
        /^(\d+)\/(\d+)$/.test(v) ||
        /^-?\d+(?:\.\d+)?$/.test(v)
      );
    };

    const matrixFromTable = (table: HTMLTableElement): string[][] => {
      const rows = Array.from(table.querySelectorAll("tr"));
      const matrix: string[][] = [];
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll("th,td"))
          .map((cell) => normalize(cell.textContent || ""))
          .filter(Boolean);
        if (cells.length > 0) {
          matrix.push(cells);
        }
      }
      return matrix;
    };

    const matrixFromNowGoalTechBlock = (): string[][] | null => {
      const root = document.querySelector<HTMLElement>("#dv_techStat");
      if (!root) {
        return null;
      }

      const matrix: string[][] = [];
      const homeName = normalize(
        document.querySelector<HTMLElement>("#teamTechDiv_detail .player-h1 .home-bg")
          ?.textContent || "",
      );
      const awayName = normalize(
        document.querySelector<HTMLElement>("#teamTechDiv_detail .player-h1 .away-bg")
          ?.textContent || "",
      );
      if (homeName || awayName) {
        matrix.push([homeName || "Home", "vs", awayName || "Away"]);
      }

      for (const child of Array.from(root.children)) {
        const sectionEl = child as HTMLElement;
        if (sectionEl.classList.contains("dv-player-title")) {
          const section = normalize(sectionEl.textContent || "");
          if (section) {
            matrix.push([section]);
          }
          continue;
        }

        if (
          sectionEl.tagName.toLowerCase() === "ul" &&
          sectionEl.classList.contains("stat")
        ) {
          const items = Array.from(sectionEl.querySelectorAll("li"));
          for (const item of items) {
            const label = normalize(
              item.querySelector<HTMLElement>(".stat-title")?.textContent || "",
            );
            if (!label) {
              continue;
            }

            const values = Array.from(item.querySelectorAll<HTMLElement>(".t-stat-c"))
              .map((el) => normalize(el.textContent || ""))
              .filter(Boolean);
            if (values.length < 2) {
              continue;
            }

            matrix.push([values[0], label, values[values.length - 1]]);
          }
        }
      }

      return matrix.length > 0 ? matrix : null;
    };

    const matrixFromFlashscoreStatsBlock = (): string[][] | null => {
      const root =
        document.querySelector<HTMLElement>(".tabContent__match-statistics") ||
        document.querySelector<HTMLElement>(".sectionsWrapper");
      if (!root) {
        return null;
      }

      const matrix: string[][] = [];
      const homeName =
        normalize(
          document.querySelector<HTMLElement>(".duelParticipant__home .participant__participantName")
            ?.textContent || "",
        ) ||
        normalize(document.querySelector<HTMLElement>(".smh__participantName.smh__home")?.textContent || "");
      const awayName =
        normalize(
          document.querySelector<HTMLElement>(".duelParticipant__away .participant__participantName")
            ?.textContent || "",
        ) ||
        normalize(document.querySelector<HTMLElement>(".smh__participantName.smh__away")?.textContent || "");
      if (homeName || awayName) {
        matrix.push([homeName || "Home", "vs", awayName || "Away"]);
      }

      const sections = Array.from(root.querySelectorAll<HTMLElement>(".section"));
      const sectionScopes = sections.length > 0 ? sections : [root];
      for (const section of sectionScopes) {
        const sectionTitle = normalize(
          section.querySelector<HTMLElement>(".section__title, .stat__header, [class*='sectionHeader']")
            ?.textContent || "",
        );
        if (sectionTitle) {
          matrix.push([sectionTitle]);
        }

        const rows = Array.from(section.querySelectorAll<HTMLElement>('[class*=\"wcl-row_\"]'));
        for (const row of rows) {
          const labelEl =
            row.querySelector<HTMLElement>('[data-testid=\"wcl-statistics-category\"]') ||
            row.querySelector<HTMLElement>('[class*=\"wcl-category_\"][data-testid]');
          const label = normalize(labelEl?.textContent || "");

          const valueEls = Array.from(
            row.querySelectorAll<HTMLElement>('[data-testid=\"wcl-statistics-value\"]'),
          );
          const values = valueEls
            .map((el) =>
              Array.from(
                el.querySelectorAll<HTMLElement>('[data-testid^=\"wcl-scores-simple-text\"], span'),
              )
                .map((node) => normalize(node.textContent || ""))
                .filter(Boolean)
                .join(""),
            )
            .map((value) => normalize(value))
            .filter(Boolean);

          if (!label || values.length < 2) {
            continue;
          }
          const homeValue = values[0];
          const awayValue = values[values.length - 1];
          if (!homeValue || !awayValue) {
            continue;
          }
          matrix.push([homeValue, label, awayValue]);
        }
      }

      return matrix.length > 0 ? matrix : null;
    };

    const candidates = new Set<HTMLTableElement>();
    const elements = Array.from(document.querySelectorAll<HTMLElement>("*"));
    for (const el of elements) {
      const text = normalize(el.textContent || "");
      if (!/tech statistics/i.test(text)) {
        continue;
      }

      const tableParent = el.closest("table");
      if (tableParent) {
        candidates.add(tableParent);
      }

      const blockParent = el.closest("section,article,div");
      if (blockParent) {
        const nestedTables = Array.from(blockParent.querySelectorAll<HTMLTableElement>("table"));
        for (const table of nestedTables) {
          candidates.add(table);
        }
      }
    }

    if (candidates.size === 0) {
      for (const table of Array.from(document.querySelectorAll<HTMLTableElement>("table"))) {
        const matrix = matrixFromTable(table);
        const flat = matrix.flat();
        if (flat.some((cell) => /1st serve|return points|total points/i.test(cell))) {
          candidates.add(table);
        }
      }
    }

    const matrices: string[][][] = [];
    const flashscoreMatrix = matrixFromFlashscoreStatsBlock();
    if (flashscoreMatrix) {
      matrices.push(flashscoreMatrix);
    }
    const nowGoalMatrix = matrixFromNowGoalTechBlock();
    if (nowGoalMatrix) {
      matrices.push(nowGoalMatrix);
    }

    for (const table of candidates) {
      const matrix = matrixFromTable(table);
      const flat = matrix.flat();
      const score = flat.filter((cell) => looksLikeValue(cell)).length;
      if (matrix.length >= 3 && score >= 2) {
        matrices.push(matrix);
      }
    }

    const title =
      normalize(document.querySelector("h1")?.textContent || "") ||
      normalize(document.querySelector("h2")?.textContent || "") ||
      undefined;

    return { title, matrices };
  });
}

interface HistoricalDoublesSignals {
  homePlayerCount: number;
  awayPlayerCount: number;
  hasDoubleScheduleLink: boolean;
  hasDoublesRankingText: boolean;
  hasDoublesCategoryText?: boolean;
}

async function captureHistoricalDoublesSignals(page: Page): Promise<HistoricalDoublesSignals> {
  return page.evaluate((): HistoricalDoublesSignals => {
    const homePlayerCount =
      document.querySelectorAll('#fbheader .home a[href*=\"/tennis/tournament/player/\"]').length ||
      document.querySelectorAll('.duelParticipant__home .participant__participantName a').length;
    const awayPlayerCount =
      document.querySelectorAll('#fbheader .guest a[href*=\"/tennis/tournament/player/\"]').length ||
      document.querySelectorAll('.duelParticipant__away .participant__participantName a').length;
    const hasDoubleScheduleLink = Boolean(
      document.querySelector('a[href*="/tennis/tournament/doublesschedule/"]'),
    );
    const bodyText = document.body.innerText || "";
    const hasDoublesRankingText = /\bdoubles\s+ranking\b/i.test(bodyText);
    const breadcrumbText = Array.from(
      document.querySelectorAll<HTMLElement>("[class*='breadcrumbItemLabel']"),
    )
      .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" ");
    const headerText =
      (document.querySelector<HTMLElement>(".headerLeague__titleWrapper")?.textContent || "") +
      " " +
      (document.querySelector<HTMLElement>("h1")?.textContent || "");
    const categoryContext = `${breadcrumbText} ${headerText}`.replace(/\s+/g, " ").trim();
    const hasDoublesCategoryText = /(парн|дубл|doubles|mixed)/i.test(categoryContext);
    return {
      homePlayerCount,
      awayPlayerCount,
      hasDoubleScheduleLink,
      hasDoublesRankingText,
      hasDoublesCategoryText,
    };
  });
}

export function resolveHistoricalDoublesHint(signals: HistoricalDoublesSignals): boolean {
  if ((signals.homePlayerCount || 0) > 1 || (signals.awayPlayerCount || 0) > 1) {
    return true;
  }
  if (signals.hasDoubleScheduleLink) {
    return true;
  }
  if (signals.hasDoublesRankingText) {
    return true;
  }
  if (signals.hasDoublesCategoryText) {
    return true;
  }
  return false;
}

function chooseBestMatrixAndParse(
  matrices: string[][][],
  playerName: string,
): ParsedMatrix | undefined {
  const scored = matrices
    .map((matrix) => {
      const parse = parseTechStatsMatrix(matrix, playerName);
      const coveredCoreKeys = collectCoreTechKeys(parse.rows).size;
      const hasTotalPointsWon = parse.rows.some((row) => row.metricKey === "total_points_won");
      const score =
        parse.rows.length + coveredCoreKeys * 20 + (hasTotalPointsWon ? 40 : 0);
      return { parse, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.parse;
}

function hasStrictTechCoverage(rows: TechStatRow[]): boolean {
  const coveredCoreKeys = collectCoreTechKeys(rows);
  return coveredCoreKeys.has("total_points_won") && coveredCoreKeys.size >= 3;
}

function collectCoreTechKeys(rows: TechStatRow[]): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    if (CORE_TECH_KEYS.has(row.metricKey)) {
      out.add(row.metricKey);
    }
  }
  return out;
}

function detectHeaderNames(matrix: string[][]): { left?: string; right?: string } {
  for (const row of matrix.slice(0, 4)) {
    if (row.length < 2) {
      continue;
    }
    const left = row[0];
    const right = row[row.length - 1];
    if (looksLikeName(left) && looksLikeName(right)) {
      return { left, right };
    }
  }
  return {};
}

function looksLikeName(value: string): boolean {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return false;
  }
  if (normalized.length < 3 || normalized.length > 40) {
    return false;
  }
  if (!/[\p{L}]/u.test(normalized)) {
    return false;
  }
  if (/\d/.test(normalized)) {
    return false;
  }
  return !isSectionName(normalized);
}

function looksLikeNameRow(left: string, label: string, right: string): boolean {
  return looksLikeName(left) && looksLikeName(right) && !isLikelyMetricValue(label);
}

function nameMatch(normalizedPlayer: string, normalizedHeader: string): boolean {
  if (!normalizedPlayer || !normalizedHeader) {
    return false;
  }
  if (normalizedPlayer === normalizedHeader) {
    return true;
  }
  if (
    normalizedPlayer.includes(normalizedHeader) ||
    normalizedHeader.includes(normalizedPlayer)
  ) {
    return true;
  }

  const playerTokens = normalizedPlayer.split(" ").filter(Boolean);
  const headerTokens = normalizedHeader.split(" ").filter(Boolean);
  const overlap = playerTokens.filter((token) => headerTokens.includes(token)).length;
  return overlap > 0 && overlap >= Math.min(playerTokens.length, headerTokens.length);
}

function isSectionName(value: string): boolean {
  return TECH_STAT_SECTIONS.has(normalizeWhitespace(value).toLowerCase());
}

function canonicalTechMetricKey(rawMetricKey: string, metricLabel: string): string {
  const key = normalizeWhitespace(rawMetricKey).toLowerCase();
  const label = normalizeWhitespace(metricLabel).toLowerCase();

  if (label.includes("% первой подачи") || label.includes("% першої подачі")) {
    return "first_serve";
  }
  if (label.includes("1st serve percentage") || label.includes("first serve percentage")) {
    return "first_serve";
  }
  if (label.includes("подачи навылет") || label.includes("ейси") || label.includes("ейс")) {
    return "aces";
  }
  if (label === "aces") {
    return "aces";
  }
  if (label.includes("двойные ошибки") || label.includes("подвійні помилки")) {
    return "double_faults";
  }
  if (label === "double faults") {
    return "double_faults";
  }
  if (label.includes("очки выигр. на п.п") || label.includes("очки вигр. на п.п")) {
    return "first_serve_points_won";
  }
  if (label.includes("1st serve points won") || label.includes("first serve points won")) {
    return "first_serve_points_won";
  }
  if (label.includes("очки выигр. на в.п") || label.includes("очки вигр. на в.п")) {
    return "second_serve_points_won";
  }
  if (label.includes("2nd serve points won") || label.includes("second serve points won")) {
    return "second_serve_points_won";
  }
  if (label.includes("спасенные брейк") || label.includes("врятовані брейк")) {
    return "break_points_saved";
  }
  if (label.includes("break points saved")) {
    return "break_points_saved";
  }
  if (label.includes("очки выигр. с п.п") || label.includes("очки вигр. з п.п")) {
    return "first_serve_return_points_won";
  }
  if (
    label.includes("1st serve return points won") ||
    label.includes("first serve return points won") ||
    label.includes("1st return points won") ||
    label.includes("first return points won")
  ) {
    return "first_serve_return_points_won";
  }
  if (label.includes("очки выигр. со в.п") || label.includes("очки вигр. з в.п")) {
    return "second_serve_return_points_won";
  }
  if (
    label.includes("2nd serve return points won") ||
    label.includes("second serve return points won") ||
    label.includes("2nd return points won") ||
    label.includes("second return points won")
  ) {
    return "second_serve_return_points_won";
  }
  if (label.includes("реализованные брейк") || label.includes("реалізовані брейк")) {
    return "break_points_converted";
  }
  if (label.includes("break points converted")) {
    return "break_points_converted";
  }
  if (label.includes("выиграно на подаче") || label.includes("виграно на подачі")) {
    return "total_service_points_won";
  }
  if (label.includes("service points won")) {
    return "total_service_points_won";
  }
  if (label.includes("выиграно на приеме") || label.includes("виграно на прийомі")) {
    return "return_points_won";
  }
  if (label.includes("return points won")) {
    return "return_points_won";
  }
  if (
    label.includes("геймы выигр. на с.п") ||
    label.includes("гейми вигр. на с.п") ||
    (label.includes("гейм") && label.includes("подач") && label.includes("выигр"))
  ) {
    return "service_games_won";
  }
  if (label.includes("геймы выигр. на приеме") || label.includes("гейми вигр. на прийомі")) {
    return "return_games_won";
  }
  if (label.includes("return games won")) {
    return "return_games_won";
  }
  if (label.includes("всего выигранных геймов") || label.includes("усього виграних гейм")) {
    return "total_games_won";
  }
  if (label.includes("total games won")) {
    return "total_games_won";
  }
  if (label.includes("всего выигранных очков") || label.includes("усього виграних очок")) {
    return "total_points_won";
  }
  if (label.includes("total points won")) {
    return "total_points_won";
  }
  if (label.includes("service games won")) {
    return "service_games_won";
  }

  if (key === "2nd_serve_points_won") {
    return "second_serve_points_won";
  }
  if (key === "2nd_serve_return_points_won") {
    return "second_serve_return_points_won";
  }
  if (key === "1st_serve_return_points_won") {
    return "first_serve_return_points_won";
  }
  if (key === "2nd_serve") {
    return "second_serve";
  }
  if (key === "1st_serve") {
    return "first_serve";
  }
  if (key === "1st_serve_percentage" || key === "first_serve_percentage") {
    return "first_serve";
  }
  if (key === "1st_serve_points_won") {
    return "first_serve_points_won";
  }
  if (key === "1st_return_points_won") {
    return "first_serve_return_points_won";
  }
  if (key === "2nd_return_points_won") {
    return "second_serve_return_points_won";
  }
  if (key === "service_points_won" || key === "total_service_points_won") {
    return "total_service_points_won";
  }
  if (
    key === "break_points_conversion" ||
    key === "break_points_conversions" ||
    (label.includes("break") && label.includes("converted"))
  ) {
    return "break_points_converted";
  }
  return key;
}

function toFlashscoreStatsUrl(matchUrl: string): string | undefined {
  const text = normalizeWhitespace(matchUrl);
  if (!text) {
    return undefined;
  }
  try {
    const parsed = new URL(text);
    const mid = parsed.searchParams.get("mid") || "";
    const pathname = parsed.pathname.replace(/\/+$/, "");
    if (!/\/match\//i.test(pathname)) {
      return undefined;
    }
    if (/\/summary\/stats\/?$/i.test(pathname)) {
      return parsed.toString();
    }
    parsed.pathname = `${pathname}/summary/stats/`;
    parsed.search = "";
    if (mid) {
      parsed.searchParams.set("mid", mid);
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}
