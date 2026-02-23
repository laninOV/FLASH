import type { Page } from "playwright";
import { gotoWithRetry } from "../browser.js";
import type { Logger } from "../logger.js";
import { normalizeName, normalizeWhitespace } from "../normalize.js";
import type {
  DayMatchRef,
  MatchOdds,
  MatchPageRef,
  PclassSnapshot,
  PlayerRef,
  RunConfig,
} from "../types.js";
import { guessStatusFromText, toAbsoluteUrl, uniqueBy } from "./shared.js";

interface RawPlayerLink {
  name: string;
  url: string;
}

interface RawPclassSignals {
  homeDvData?: string;
  awayDvData?: string;
  fallbackDvData: string[];
}

interface RawDoublesSignals {
  homePlayerCount: number;
  awayPlayerCount: number;
  hasDoubleScheduleLink: boolean;
  hasDoublesRankingText: boolean;
  titleHasPairDelimiter: boolean;
  hasDoublesCategoryText?: boolean;
}

interface RawMatchPageData {
  title?: string;
  tournament?: string;
  statusText?: string;
  scheduledStartText?: string;
  playerLinks: RawPlayerLink[];
  doublesSignals?: RawDoublesSignals;
  marketOdds?: MatchOdds;
}

export async function extractMatchPageRef(
  page: Page,
  dayMatch: DayMatchRef,
  config: RunConfig,
  logger: Logger,
): Promise<MatchPageRef> {
  await gotoWithRetry(page, dayMatch.url, {
    timeoutMs: config.timeoutMs,
    retries: config.maxGotoRetries,
    logger,
    stepLabel: "match-page",
  });
  try {
    await page.waitForSelector(
      ".duelParticipant, .duelParticipant__home .participant__participantName, .duelParticipant__away .participant__participantName",
      { timeout: Math.min(config.timeoutMs, 5_000) },
    );
  } catch {
    // Continue with best-effort parsing; some pages render slightly different shells.
  }

  const raw = await page.evaluate((): RawMatchPageData => {
    const normalize = (value: string): string => value.replace(/\s+/g, " ").trim();
    const parseDecimal = (value: string): number | undefined => {
      const text = normalize(value).replace(",", ".");
      if (!/^\d+(?:\.\d+)?$/.test(text)) {
        return undefined;
      }
      const n = Number(text);
      if (!Number.isFinite(n) || n < 1 || n > 100) {
        return undefined;
      }
      return n;
    };

    const parseOdds = (): MatchOdds | undefined => {
      const rows = Array.from(document.querySelectorAll<HTMLElement>(".ui-table__row"));
      for (const row of rows) {
        const odds = Array.from(row.querySelectorAll<HTMLElement>(".oddsCell__odd"))
          .map((el) => parseDecimal(el.textContent || ""))
          .filter((v): v is number => typeof v === "number");
        if (odds.length >= 2) {
          return { home: odds[0], away: odds[1] };
        }
      }
      return undefined;
    };

    const participantLinks = [".duelParticipant__home", ".duelParticipant__away"]
      .map((selector) => {
        const root = document.querySelector<HTMLElement>(selector);
        if (!root) {
          return undefined;
        }
        const anchor =
          root.querySelector<HTMLAnchorElement>("a[href*='/player/']") ||
          root.querySelector<HTMLAnchorElement>(".participant__participantName a[href]");
        const name =
          normalize(root.querySelector<HTMLElement>(".participant__participantName")?.textContent || "") ||
          normalize(anchor?.textContent || "");
        const url = anchor?.getAttribute("href") || "";
        if (!name && !url) {
          return undefined;
        }
        return { name, url };
      })
      .filter((entry): entry is RawPlayerLink => !!entry && !!entry.url);

    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
      .map((link) => ({
        name: normalize(link.textContent || ""),
        url: link.getAttribute("href") || "",
      }))
      .filter((entry) => entry.url && entry.name);

    const title =
      normalize(document.querySelector("h1")?.textContent || "") ||
      normalize(document.querySelector("h2")?.textContent || "") ||
      undefined;

    const breadcrumbParts = Array.from(document.querySelectorAll<HTMLElement>("[class*='breadcrumbItemLabel']"))
      .map((el) => normalize(el.textContent || ""))
      .filter(Boolean);
    const tournament =
      breadcrumbParts[breadcrumbParts.length - 1] ||
      normalize(document.querySelector<HTMLElement>(".headerLeague__titleWrapper")?.textContent || "") ||
      normalize(document.querySelector<HTMLElement>(".wcl-breadcrumb")?.textContent || "") ||
      undefined;

    const statusText =
      normalize(document.querySelector<HTMLElement>(".detailScore__status")?.textContent || "") ||
      normalize(document.querySelector<HTMLElement>(".fixedHeaderDuel__detailStatus")?.textContent || "") ||
      undefined;

    const scheduledStartText =
      normalize(document.querySelector<HTMLElement>(".duelParticipant__startTime")?.textContent || "") ||
      undefined;

    const categoryContext = normalize(`${breadcrumbParts.join(" ")} ${tournament || ""}`);

    const doublesSignals: RawDoublesSignals = {
      homePlayerCount: document.querySelectorAll(".duelParticipant__home .participant__participantName a").length,
      awayPlayerCount: document.querySelectorAll(".duelParticipant__away .participant__participantName a").length,
      hasDoubleScheduleLink: false,
      hasDoublesRankingText: /\bdoubles\s+ranking\b/i.test(document.body.innerText || ""),
      titleHasPairDelimiter: /(?:\p{L}\s*\/\s*\p{L}|\s&\s)/iu.test(title || ""),
      hasDoublesCategoryText: /(парн|дубл|doubles|mixed)/i.test(categoryContext),
    };

    return {
      title,
      tournament,
      statusText,
      scheduledStartText,
      playerLinks: [...participantLinks, ...links],
      doublesSignals,
      marketOdds: parseOdds(),
    };
  });

  let marketOdds = raw.marketOdds;
  if (!marketOdds) {
    const oddsUrl = toFlashscoreOddsUrl(dayMatch.url);
    if (oddsUrl) {
      try {
        await gotoWithRetry(page, oddsUrl, {
          timeoutMs: config.timeoutMs,
          retries: config.maxGotoRetries,
          logger,
          stepLabel: "match-odds-page",
        });
        marketOdds = await page.evaluate((): MatchOdds | undefined => {
          const normalize = (value: string): string => value.replace(/\s+/g, " ").trim();
          const parseDecimal = (value: string): number | undefined => {
            const text = normalize(value).replace(",", ".");
            if (!/^\d+(?:\.\d+)?$/.test(text)) {
              return undefined;
            }
            const n = Number(text);
            if (!Number.isFinite(n) || n < 1 || n > 100) {
              return undefined;
            }
            return n;
          };

          const rows = Array.from(document.querySelectorAll<HTMLElement>(".ui-table__row"));
          for (const row of rows) {
            const cells = Array.from(row.querySelectorAll<HTMLElement>(".oddsCell__odd"));
            if (cells.length < 2) {
              continue;
            }
            const home = parseDecimal(cells[0]?.textContent || "");
            const away = parseDecimal(cells[1]?.textContent || "");
            if (typeof home !== "number" || typeof away !== "number") {
              continue;
            }
            return { home, away };
          }
          return undefined;
        });
      } catch (error) {
        logger.warn(
          `Odds page parse failed for ${dayMatch.url}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  const expected = [dayMatch.playerAName, dayMatch.playerBName];
  const players = matchPlayersToProfileLinks(expected, raw.playerLinks, dayMatch.url);
  const pclass = resolvePclassSnapshot();
  const isDoublesHint = resolveMatchPageDoublesHint(raw.doublesSignals);
  const pageStatus = guessStatusFromText(`${raw.statusText || ""} ${raw.scheduledStartText || ""}`);
  const status = pageStatus === "unknown" ? dayMatch.status : pageStatus;

  logger.debug(
    `Match page: resolved players ${players[0].name} (${players[0].profileUrl || "no profile"}), ` +
      `${players[1].name} (${players[1].profileUrl || "no profile"}), ` +
      `odds=${formatOdds(marketOdds)}, pclass=${formatPclass(pclass)}, doubles_hint=${isDoublesHint ? "true" : "false"}`,
  );

  return {
    url: dayMatch.url,
    status,
    scheduledStartText: raw.scheduledStartText || dayMatch.scheduledStartText,
    isDoublesHint,
    tournament: raw.tournament || dayMatch.tournament,
    players,
    marketOdds,
    pclass,
  };
}

function toFlashscoreOddsUrl(matchUrl: string): string | undefined {
  const text = normalizeWhitespace(matchUrl);
  if (!text) {
    return undefined;
  }
  try {
    const parsed = new URL(text);
    const mid = parsed.searchParams.get("mid") || "";
    const pathname = parsed.pathname.replace(/\/+$/, "");
    const oddsPath = pathname.includes("/odds/") ? pathname : `${pathname}/odds/home-away/full-time/`;
    parsed.pathname = oddsPath;
    if (mid) {
      parsed.searchParams.set("mid", mid);
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function formatOdds(odds?: MatchOdds): string {
  if (!odds || typeof odds.home !== "number" || typeof odds.away !== "number") {
    return "n/a";
  }
  const suffixParts = [];
  if (odds.bookmaker) {
    suffixParts.push(odds.bookmaker);
  }
  if (odds.stage) {
    suffixParts.push(odds.stage);
  }
  const suffix = suffixParts.length > 0 ? ` (${suffixParts.join(", ")})` : "";
  return `${odds.home.toFixed(2)}:${odds.away.toFixed(2)}${suffix}`;
}

function formatPclass(pclass?: PclassSnapshot): string {
  if (!pclass || pclass.source !== "match_dv_data") {
    return "missing";
  }
  return `${pclass.ev}/${pclass.dep}`;
}

export function resolvePclassSnapshot(signals?: RawPclassSignals): PclassSnapshot {
  const homePrimary = parsePositiveInt(signals?.homeDvData);
  const awayPrimary = parsePositiveInt(signals?.awayDvData);
  if (typeof homePrimary === "number" && typeof awayPrimary === "number") {
    return {
      ev: homePrimary,
      dep: awayPrimary,
      source: "match_dv_data",
    };
  }

  const fallback = (signals?.fallbackDvData || [])
    .map((value) => parsePositiveInt(value))
    .filter((value): value is number => typeof value === "number");
  if (fallback.length >= 2) {
    return {
      ev: fallback[0],
      dep: fallback[1],
      source: "match_dv_data",
    };
  }

  return { source: "missing" };
}

export function resolveMatchPageDoublesHint(signals?: RawDoublesSignals): boolean {
  if (!signals) {
    return false;
  }
  if (signals.homePlayerCount > 1 || signals.awayPlayerCount > 1) {
    return true;
  }
  if (signals.hasDoubleScheduleLink || signals.hasDoublesRankingText) {
    return true;
  }
  if (signals.titleHasPairDelimiter || signals.hasDoublesCategoryText) {
    return true;
  }
  return false;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  const text = normalizeWhitespace(value || "");
  if (!/^\d+$/.test(text)) {
    return undefined;
  }
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function matchPlayersToProfileLinks(
  expectedNames: [string, string] | string[],
  rawLinks: RawPlayerLink[],
  baseUrl: string,
): [PlayerRef, PlayerRef] {
  const normalizedLinks = uniqueBy(
    rawLinks
      .map((entry) => ({
        name: normalizeWhitespace(entry.name),
        normalizedName: normalizeName(entry.name),
        url: toAbsoluteUrl(entry.url, baseUrl),
      }))
      .filter((entry) => !!entry.name && !!entry.url),
    (value) => `${value.normalizedName}:${value.url}`,
  );

  const chosen: PlayerRef[] = [];
  for (const expectedName of expectedNames.slice(0, 2)) {
    const expectedNormalized = normalizeName(expectedName);
    const match = normalizedLinks.find((candidate) => {
      if (!candidate.url || !/\/player\//i.test(candidate.url)) {
        return false;
      }
      if (!candidate.normalizedName) {
        return false;
      }
      return (
        candidate.normalizedName === expectedNormalized ||
        candidate.normalizedName.includes(expectedNormalized) ||
        expectedNormalized.includes(candidate.normalizedName)
      );
    });

    chosen.push({
      name: expectedName,
      profileUrl: match?.url,
    });
  }

  const usedUrls = new Set(chosen.map((player) => player.profileUrl).filter(Boolean));
  const fallbackLinks = normalizedLinks.filter(
    (candidate) => !!candidate.url && /\/player\//i.test(candidate.url) && !usedUrls.has(candidate.url),
  );
  for (const player of chosen) {
    if (player.profileUrl) {
      continue;
    }
    const fallback = fallbackLinks.shift();
    if (fallback?.url) {
      player.profileUrl = fallback.url;
    }
  }

  return [chosen[0], chosen[1]];
}
