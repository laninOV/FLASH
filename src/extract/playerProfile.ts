import type { Page } from "playwright";
import { gotoWithRetry } from "../browser.js";
import type { Logger } from "../logger.js";
import { normalizeWhitespace } from "../normalize.js";
import type { PlayerRef, RecentMatchRef, RunConfig } from "../types.js";
import { extractFlashscoreMid, isLikelyMatchUrl, toAbsoluteUrl } from "./shared.js";

interface RawRecentMatch {
  url: string;
  dateText?: string;
  opponentName?: string;
  tournament?: string;
  resultText?: string;
  matchId?: string;
  scoreText?: string;
  playerAName?: string;
  playerBName?: string;
  resultMarker?: string;
  leftPlayerLinksCount?: number;
  rightPlayerLinksCount?: number;
  statusState?: string;
  statusText?: string;
  doublesCategoryHint?: boolean;
}

export interface ExtractRecentMatchesContext {
  excludeMatchUrl?: string;
  needCount: number;
  scanLimit?: number;
}

export interface RecentMatchesPreFilterStats {
  sameAsTargetMatch: number;
  nonSingles: number;
  notFinished: number;
  future: number;
  invalid: number;
}

export interface RecentMatchesExtractionResult {
  matches: RecentMatchRef[];
  candidatePool: number;
  filtered: RecentMatchesPreFilterStats;
}

export async function extractRecentMatchesFromProfile(
  page: Page,
  player: PlayerRef,
  config: RunConfig,
  logger: Logger,
  context: ExtractRecentMatchesContext,
): Promise<RecentMatchesExtractionResult> {
  if (!player.profileUrl) {
    logger.warn(`Player ${player.name}: profile URL not found on match page.`);
    return emptyRecentMatchesExtractionResult();
  }

  const historyUrl = toFlashscoreProfileResultsUrl(player.profileUrl) || player.profileUrl;

  await gotoWithRetry(page, historyUrl, {
    timeoutMs: config.timeoutMs,
    retries: config.maxGotoRetries,
    logger,
    stepLabel: `profile-page:${player.name}`,
  });
  try {
    await page.waitForSelector('[data-event-row="true"][id^="g_2_"], .eventRowLink', {
      timeout: Math.min(config.timeoutMs, 5_000),
    });
  } catch {
    // Some profile pages render a summary-first layout; parser below keeps fallbacks.
  }

  const rawMatches = await page.evaluate((focusedPlayerName): RawRecentMatch[] => {
    const normalize = (value: string): string => value.replace(/\s+/g, " ").trim();
    const normName = (value: string): string =>
      normalize(value)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .replace(/\s+/g, " ")
        .trim();
    const focused = normName(focusedPlayerName || "");

    const flashscoreRows = Array.from(
      document.querySelectorAll<HTMLElement>('[data-event-row="true"][id^="g_2_"]'),
    );
    if (flashscoreRows.length > 0) {
      const participantNameText = (row: HTMLElement, side: "home" | "away"): string => {
        const legacySelector = side === "home" ? ".event__participant--home" : ".event__participant--away";
        const modernRootSelector = side === "home" ? ".event__homeParticipant" : ".event__awayParticipant";
        const legacy = normalize(row.querySelector<HTMLElement>(legacySelector)?.textContent || "");
        if (legacy) {
          return legacy;
        }
        const modernRoot = row.querySelector<HTMLElement>(modernRootSelector);
        if (!modernRoot) {
          return "";
        }
        const direct = normalize(
          modernRoot.querySelector<HTMLElement>("[class*='wcl-name_']")?.textContent ||
            modernRoot.querySelector<HTMLElement>("[data-testid^='wcl-scores-simple-text']")?.textContent ||
            "",
        );
        if (direct) {
          return direct;
        }
        const textNodes = Array.from(modernRoot.querySelectorAll<HTMLElement>("span,div"))
          .map((el) => normalize(el.textContent || ""))
          .filter(Boolean);
        return textNodes.find((value) => /[\p{L}]/u.test(value)) || "";
      };

      const participantCount = (row: HTMLElement, side: "home" | "away"): number => {
        const modernRootSelector = side === "home" ? ".event__homeParticipant" : ".event__awayParticipant";
        const modernRoot = row.querySelector<HTMLElement>(modernRootSelector);
        if (modernRoot) {
          const itemCount = modernRoot.querySelectorAll("[class*='wcl-item_']").length;
          if (itemCount > 0) {
            return itemCount;
          }
          const namedCount = modernRoot.querySelectorAll("[class*='wcl-name_'], [data-testid^='wcl-scores-simple-text']").length;
          if (namedCount > 0) {
            return namedCount;
          }
        }
        const legacySelector = side === "home" ? ".event__participant--home" : ".event__participant--away";
        return row.querySelectorAll(legacySelector).length;
      };

      const findLeagueHeaderText = (row: HTMLElement): string => {
        let cursor: Element | null = row.previousElementSibling;
        while (cursor) {
          const el = cursor as HTMLElement;
          const cls = String(el.className || "");
          if (cls.includes("headerLeague__wrapper") || cls.includes("headerLeague")) {
            return normalize(el.textContent || "");
          }
          cursor = cursor.previousElementSibling;
        }
        return "";
      };

      const out: RawRecentMatch[] = [];
      for (const row of flashscoreRows) {
        const url = row.querySelector<HTMLAnchorElement>("a.eventRowLink[href]")?.getAttribute("href") || "";
        if (!url) {
          continue;
        }
        const playerAName = participantNameText(row, "home");
        const playerBName = participantNameText(row, "away");
        const dateText = normalize(row.querySelector<HTMLElement>(".event__time")?.textContent || "") || undefined;
        const stageText = normalize(
          row.querySelector<HTMLElement>(".event__stage--block")?.textContent || "",
        );
        const scoreEls = Array.from(
          row.querySelectorAll<HTMLElement>('[data-testid="wcl-matchRowScore"]'),
        );
        const scoreState =
          normalize(scoreEls[0]?.getAttribute("data-state") || scoreEls[1]?.getAttribute("data-state") || "") ||
          undefined;
        const homeScore = normalize(
          row.querySelector<HTMLElement>(".event__score--home")?.textContent ||
            scoreEls.find((el) => (el.getAttribute("data-side") || "") === "1")?.textContent ||
            "",
        );
        const awayScore = normalize(
          row.querySelector<HTMLElement>(".event__score--away")?.textContent ||
            scoreEls.find((el) => (el.getAttribute("data-side") || "") === "2")?.textContent ||
            "",
        );
        const tournament = findLeagueHeaderText(row) || undefined;
        const rowText = normalize(row.textContent || "") || undefined;
        const categoryContext = normalize(`${tournament || ""} ${rowText || ""}`);
        const doublesCategoryHint = /(парн|дубл|double|mixed)/i.test(categoryContext);
        const matchId = (url.match(/[?&]mid=([A-Za-z0-9]+)/)?.[1] || "") || undefined;

        let opponentName = "";
        const aNorm = normName(playerAName || "");
        const bNorm = normName(playerBName || "");
        if (focused && aNorm && bNorm) {
          if (aNorm === focused || aNorm.includes(focused) || focused.includes(aNorm)) {
            opponentName = playerBName;
          } else if (bNorm === focused || bNorm.includes(focused) || focused.includes(bNorm)) {
            opponentName = playerAName;
          }
        }
        if (!opponentName) {
          opponentName = playerAName || playerBName;
        }

        const scoreText =
          homeScore && awayScore && /^[-\d]+$/.test(homeScore) && /^[-\d]+$/.test(awayScore)
            ? `${homeScore}-${awayScore}`
            : undefined;
        const resultMarker = (rowText?.match(/(?:^|\s)([ВПWL])(?:\s|$)/u)?.[1] || "") || undefined;

        out.push({
          url,
          dateText,
          opponentName: opponentName || undefined,
          tournament,
          resultText: rowText,
          matchId,
          scoreText,
          playerAName: playerAName || undefined,
          playerBName: playerBName || undefined,
          resultMarker,
          leftPlayerLinksCount: participantCount(row, "home") || undefined,
          rightPlayerLinksCount: participantCount(row, "away") || undefined,
          statusState: scoreState,
          statusText: stageText || undefined,
          doublesCategoryHint,
        });
      }
      if (out.length > 0) {
        return out;
      }
    }

    const scheduleRows = Array.from(document.querySelectorAll<HTMLElement>('tr[name="schetr"]'));
    if (scheduleRows.length > 0) {
      const scheduleData: RawRecentMatch[] = [];
      for (const row of scheduleRows) {
        let matchLink =
          Array.from(row.querySelectorAll<HTMLAnchorElement>("a[href]"))
            .map((a) => a.getAttribute("href") || "")
            .find((href) => !!href) || "";

        const iconWithOnclick = row.querySelector<HTMLElement>('[onclick*="GetTsAnanisyPageUrl"]');
        const onclick = iconWithOnclick?.getAttribute("onclick") || "";
        const idMatch = onclick.match(/GetTsAnanisyPageUrl\([^)]*?,\s*(\d+)\s*,/);
        if (!matchLink && idMatch?.[1]) {
          matchLink = `/tennis/match/${idMatch[1]}`;
        }
        if (!matchLink) {
          continue;
        }

        const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("td")).map((cell) =>
          normalize(cell.textContent || ""),
        );
        const p1Cell = row.querySelector<HTMLElement>("td:nth-child(3) div");
        const p2Cell = row.querySelector<HTMLElement>("td:nth-child(5) div");
        const p1 = normalize(p1Cell?.textContent || cells[2] || "");
        const p2 = normalize(p2Cell?.textContent || cells[4] || "");
        const leftPlayerLinksCount = row.querySelectorAll(
          'td:nth-child(3) a[href*="/tennis/tournament/player/"]',
        ).length;
        const rightPlayerLinksCount = row.querySelectorAll(
          'td:nth-child(5) a[href*="/tennis/tournament/player/"]',
        ).length;

        const p1IsFocused = (p1Cell?.className || "").includes("f-b");
        const p2IsFocused = (p2Cell?.className || "").includes("f-b");
        let opponentName = "";
        if (p1IsFocused && !p2IsFocused) {
          opponentName = p2;
        } else if (p2IsFocused && !p1IsFocused) {
          opponentName = p1;
        } else {
          opponentName = p1 || p2;
        }

        let titleText = "";
        let cursor = row.previousElementSibling as HTMLElement | null;
        while (cursor) {
          if ((cursor.getAttribute("name") || "").toLowerCase() === "classtr") {
            titleText = normalize(cursor.textContent || "");
            break;
          }
          cursor = cursor.previousElementSibling as HTMLElement | null;
        }

        scheduleData.push({
          url: matchLink,
          dateText: cells[0] || undefined,
          opponentName: opponentName || undefined,
          tournament: titleText || undefined,
          resultText: normalize(row.textContent || "") || undefined,
          matchId: idMatch?.[1] || undefined,
          scoreText: cells[3] || undefined,
          playerAName: p1 || undefined,
          playerBName: p2 || undefined,
          resultMarker: cells[5] || undefined,
          leftPlayerLinksCount,
          rightPlayerLinksCount,
        });
      }
      if (scheduleData.length > 0) {
        return scheduleData;
      }
    }

    const rows = Array.from(
      document.querySelectorAll<HTMLElement>("tr, li, .match-row, .record-item, .history-item"),
    );
    const data: RawRecentMatch[] = [];

    for (const row of rows) {
      const anchors = Array.from(row.querySelectorAll<HTMLAnchorElement>("a[href]"));
      if (anchors.length === 0) {
        continue;
      }
      const matchLink = anchors.map((a) => a.getAttribute("href") || "").find((href) => !!href);
      if (!matchLink) {
        continue;
      }
      const rowText = normalize(row.textContent || "");
      const dateText =
        normalize(row.querySelector(".date,.time,.match-time,td:first-child")?.textContent || "") ||
        undefined;
      const opponentName =
        normalize(row.querySelector(".opponent,.away,.team-away,.player-name")?.textContent || "") ||
        undefined;
      const tournament =
        normalize(row.querySelector(".league,.tournament,.event-name")?.textContent || "") ||
        undefined;
      const scoreText =
        normalize(row.querySelector(".score,.match-score,td:nth-child(4)")?.textContent || "") ||
        undefined;
      const resultMarker = normalize(row.querySelector(".wl,td:nth-child(6)")?.textContent || "") || undefined;

      data.push({
        url: matchLink,
        dateText,
        opponentName,
        tournament,
        scoreText,
        resultMarker,
        resultText: rowText || undefined,
      });
    }

    if (data.length > 0) {
      return data;
    }

    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
    return links.map((link) => ({
      url: link.getAttribute("href") || "",
      resultText: normalize(link.textContent || "") || undefined,
    }));
  }, player.name);

  const mapped = rawMatches
    .map((raw): RecentMatchRef | undefined => {
      const absoluteUrl = toAbsoluteUrl(raw.url, historyUrl);
      if (!absoluteUrl || !isLikelyMatchUrl(absoluteUrl)) {
        return undefined;
      }

      const dateText = normalizeWhitespace(raw.dateText || "");
      const opponentName = normalizeWhitespace(raw.opponentName || "");
      const tournament = normalizeWhitespace(raw.tournament || "");
      const resultText = normalizeWhitespace(raw.resultText || "");
      const scoreText = normalizeWhitespace(raw.scoreText || "");
      const parsedAtDate = parseNowGoalProfileDate(dateText);
      const parsedAt = parsedAtDate?.toISOString();
      const isFinishedHint =
        raw.statusState === "final" ||
        isFinishedStatusText(raw.statusText) ||
        (scoreLooksFinished(scoreText) && hasResultMarker(raw.resultMarker));
      const isDoublesHint =
        raw.doublesCategoryHint === true ||
        (raw.leftPlayerLinksCount || 0) > 1 ||
        (raw.rightPlayerLinksCount || 0) > 1;
      const isSingles = isDoublesHint
        ? false
        : raw.playerAName && raw.playerBName
          ? isSinglesMatch(raw.playerAName, raw.playerBName)
          : opponentLooksSingles(opponentName);
      const isFutureHint =
        raw.statusState === "pre-match"
          ? true
          : parsedAtDate !== undefined
            ? parsedAtDate.getTime() > Date.now()
            : undefined;
      const matchId = raw.matchId || extractMatchIdFromUrl(absoluteUrl);

      return {
        url: absoluteUrl,
        ...(dateText ? { dateText } : {}),
        ...(opponentName ? { opponentName } : {}),
        ...(tournament ? { tournament } : {}),
        ...(resultText ? { resultText } : {}),
        ...(scoreText ? { scoreText } : {}),
        ...(matchId ? { matchId } : {}),
        ...(parsedAt ? { parsedAt } : {}),
        ...(typeof isFutureHint === "boolean" ? { isFutureHint } : {}),
        ...(typeof raw.leftPlayerLinksCount === "number"
          ? { leftPlayerLinksCount: raw.leftPlayerLinksCount }
          : {}),
        ...(typeof raw.rightPlayerLinksCount === "number"
          ? { rightPlayerLinksCount: raw.rightPlayerLinksCount }
          : {}),
        ...(isDoublesHint ? { isDoublesHint: true } : {}),
        isSingles,
        isFinishedHint,
      };
    })
    .filter((value): value is RecentMatchRef => value !== undefined);

  const filtered = filterRecentMatchCandidates(mapped, context);
  logger.debug(
    `Player ${player.name}: candidate pool=${filtered.candidatePool}, ` +
      `filtered(same_as_target_match=${filtered.filtered.sameAsTargetMatch}, ` +
      `doubles=${filtered.filtered.nonSingles}, future=${filtered.filtered.future}, ` +
      `not_finished=${filtered.filtered.notFinished}, invalid=${filtered.filtered.invalid}).`,
  );
  return filtered;
}

function toFlashscoreProfileResultsUrl(profileUrl: string): string | undefined {
  const text = normalizeWhitespace(profileUrl);
  if (!text) {
    return undefined;
  }
  try {
    const url = new URL(text);
    const path = url.pathname.replace(/\/+$/, "");
    if (/\/results$/i.test(path)) {
      return url.toString();
    }
    if (/\/player\//i.test(path)) {
      url.pathname = `${path}/results/`;
      return url.toString();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function filterRecentMatchCandidates(
  candidates: RecentMatchRef[],
  context: ExtractRecentMatchesContext & { now?: Date },
): RecentMatchesExtractionResult {
  const filtered: RecentMatchesPreFilterStats = {
    sameAsTargetMatch: 0,
    nonSingles: 0,
    notFinished: 0,
    future: 0,
    invalid: 0,
  };
  const out: RecentMatchRef[] = [];
  const seenUrls = new Set<string>();
  const nowMs = (context.now || new Date()).getTime();
  const scanLimit = Math.max(
    context.needCount,
    context.scanLimit ?? Math.max(context.needCount * 6, 30),
  );
  const excluded = normalizeMatchUrl(context.excludeMatchUrl);

  for (const match of candidates) {
    const normalized = normalizeMatchUrl(match.url);
    if (!normalized) {
      filtered.invalid += 1;
      continue;
    }
    if (seenUrls.has(normalized)) {
      continue;
    }
    seenUrls.add(normalized);

    if (excluded && normalized === excluded) {
      filtered.sameAsTargetMatch += 1;
      continue;
    }

    if (match.isDoublesHint === true || match.isSingles !== true) {
      filtered.nonSingles += 1;
      continue;
    }

    if (match.isFinishedHint !== true) {
      if (match.isFutureHint === true) {
        filtered.future += 1;
        continue;
      }
      if (hasProfileMatchHints(match)) {
        filtered.notFinished += 1;
      } else {
        filtered.invalid += 1;
      }
      continue;
    }

    const parsedAtDate = parseNowGoalProfileDate(match.dateText || "") || parseIsoDate(match.parsedAt);
    const isFutureHint =
      typeof match.isFutureHint === "boolean"
        ? match.isFutureHint
        : parsedAtDate !== undefined && parsedAtDate.getTime() > nowMs;

    out.push({
      ...match,
      matchId: match.matchId || extractMatchIdFromUrl(match.url),
      ...(parsedAtDate ? { parsedAt: parsedAtDate.toISOString() } : {}),
      ...(typeof isFutureHint === "boolean" ? { isFutureHint } : {}),
      ...(typeof match.leftPlayerLinksCount === "number"
        ? { leftPlayerLinksCount: match.leftPlayerLinksCount }
        : {}),
      ...(typeof match.rightPlayerLinksCount === "number"
        ? { rightPlayerLinksCount: match.rightPlayerLinksCount }
        : {}),
      isSingles: true,
      isDoublesHint: false,
      isFinishedHint: true,
    });

    if (out.length >= scanLimit) {
      break;
    }
  }

  return {
    matches: out,
    candidatePool: out.length,
    filtered,
  };
}

export function parseNowGoalProfileDate(dateText: string): Date | undefined {
  const text = normalizeWhitespace(dateText || "");
  if (!text) {
    return undefined;
  }

  // Flashscore recent style: 20.02. 22:15 (current year)
  const dayMonthTime = text.match(/^(\d{1,2})\.(\d{1,2})\.\s+(\d{1,2}):(\d{2})$/);
  if (dayMonthTime) {
    const year = new Date().getFullYear();
    return buildLocalDate(
      Number(dayMonthTime[1]),
      Number(dayMonthTime[2]),
      year,
      Number(dayMonthTime[3]),
      Number(dayMonthTime[4]),
    );
  }

  const full = text.match(/^((\d{1,2})[-/.](\d{1,2})[-/.](\d{4}))(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (full) {
    return buildLocalDate(
      Number(full[2]),
      Number(full[3]),
      Number(full[4]),
      Number(full[5] ?? "0"),
      Number(full[6] ?? "0"),
    );
  }

  const flashDots = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (flashDots) {
    return buildLocalDate(
      Number(flashDots[1]),
      Number(flashDots[2]),
      Number(flashDots[3]),
      Number(flashDots[4] ?? "0"),
      Number(flashDots[5] ?? "0"),
    );
  }

  return undefined;
}

function buildLocalDate(
  day: number,
  month: number,
  year: number,
  hour: number,
  minute: number,
): Date | undefined {
  if (
    !Number.isFinite(day) ||
    !Number.isFinite(month) ||
    !Number.isFinite(year) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return undefined;
  }
  if (
    day < 1 ||
    day > 31 ||
    month < 1 ||
    month > 12 ||
    year < 1900 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return undefined;
  }
  const parsed = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return undefined;
  }
  return parsed;
}

export function isSinglesMatch(playerAName: string, playerBName: string): boolean {
  return isSinglesName(playerAName) && isSinglesName(playerBName);
}

export function scoreLooksFinished(scoreText: string): boolean {
  const score = normalizeWhitespace(scoreText || "");
  if (!score) {
    return false;
  }
  const simpleMatchScore = /^\d+\s*-\s*\d+$/.test(score);
  const hasSetBreakdown = /^\d+\s*-\s*\d+\s*\(/.test(score);
  return simpleMatchScore || hasSetBreakdown;
}

function isFinishedStatusText(value: string | undefined): boolean {
  const text = normalizeWhitespace(value || "").toLowerCase();
  if (!text) {
    return false;
  }
  return /(finished|final|ended|заверш|прерван|перерван|отказ|відмова|walkover|retired|неявка)/i.test(text);
}

function hasResultMarker(value: string | undefined): boolean {
  const marker = normalizeWhitespace(value || "").toUpperCase();
  if (!marker) {
    return false;
  }
  return marker === "W" || marker === "L" || marker === "В" || marker === "П" || /\bW\b|\bL\b/.test(marker);
}

function hasProfileMatchHints(match: RecentMatchRef): boolean {
  return Boolean(
    normalizeWhitespace(match.dateText || "") ||
      normalizeWhitespace(match.scoreText || "") ||
      normalizeWhitespace(match.resultText || ""),
  );
}

function isSinglesName(name: string | undefined): boolean {
  const normalized = normalizeWhitespace(name || "");
  if (!normalized) {
    return false;
  }
  return !/[&/]/.test(normalized);
}

function opponentLooksSingles(opponentName: string): boolean {
  const normalized = normalizeWhitespace(opponentName || "");
  if (!normalized) {
    return false;
  }
  return isSinglesName(normalized);
}

function extractMatchIdFromUrl(url: string): string | undefined {
  const mid = extractFlashscoreMid(url);
  if (mid) {
    return mid;
  }
  const numeric = normalizeWhitespace(url).match(/\/match\/(\d+)/i)?.[1];
  if (numeric) {
    return numeric;
  }
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/\/+$/, "") || undefined;
  } catch {
    return undefined;
  }
}

function normalizeMatchUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    const mid = parsed.searchParams.get("mid") || "";
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    parsed.search = "";
    if (mid) {
      parsed.searchParams.set("mid", mid);
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function parseIsoDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed;
}

function emptyRecentMatchesExtractionResult(): RecentMatchesExtractionResult {
  return {
    matches: [],
    candidatePool: 0,
    filtered: {
      sameAsTargetMatch: 0,
      nonSingles: 0,
      notFinished: 0,
      future: 0,
      invalid: 0,
    },
  };
}
