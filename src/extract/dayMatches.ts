import type { Page } from "playwright";
import { gotoWithRetry } from "../browser.js";
import type { Logger } from "../logger.js";
import { normalizeWhitespace } from "../normalize.js";
import { DAY_PAGE_ROW_SELECTORS, PLAYER_NAME_SELECTORS } from "../selectors.js";
import type { DayMatchRef, RunConfig } from "../types.js";
import {
  guessStatusFromText,
  isLikelyMatchUrl,
  isLikelyPlayerName,
  toAbsoluteUrl,
  uniqueBy,
} from "./shared.js";

interface RawDayMatch {
  url: string;
  playerAName?: string;
  playerBName?: string;
  statusText?: string;
  statusHint?: "live" | "upcoming" | "finished" | "unknown";
  tournament?: string;
  leftSidePlayersCount?: number;
  rightSidePlayersCount?: number;
  isDoublesHint?: boolean;
}

export async function extractDayMatches(
  page: Page,
  config: RunConfig,
  logger: Logger,
  options?: {
    skipNavigation?: boolean;
  },
): Promise<DayMatchRef[]> {
  if (options?.skipNavigation !== true) {
    await gotoWithRetry(page, config.entryUrl, {
      timeoutMs: config.timeoutMs,
      retries: config.maxGotoRetries,
      logger,
      stepLabel: "day-page",
    });
  }
  try {
    await page.waitForSelector('[data-event-row="true"][id^="g_2_"]', {
      timeout: Math.min(config.timeoutMs, 5_000),
    });
  } catch {
    // Keep generic fallback parsing below for alternative layouts / slow loads.
  }

  const rawMatches = (await page.evaluate(
    ({ rowSelectors, nameSelectors }) => {
      const normalize = (value: string): string => value.replace(/\s+/g, " ").trim();

      const flashscoreRows = Array.from(
        document.querySelectorAll<HTMLElement>('[data-event-row="true"][id^="g_2_"]'),
      );
      if (flashscoreRows.length > 0) {
        const flashscoreData: RawDayMatch[] = [];
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

        for (const row of flashscoreRows) {
          const matchLink = row.querySelector<HTMLAnchorElement>("a.eventRowLink[href]");
          if (!matchLink) {
            continue;
          }
          const playerAName = normalize(
            row.querySelector<HTMLElement>(".event__participant--home")?.textContent || "",
          );
          const playerBName = normalize(
            row.querySelector<HTMLElement>(".event__participant--away")?.textContent || "",
          );
          const stageText = normalize(
            row.querySelector<HTMLElement>(".event__stage--block")?.textContent || "",
          );
          const timeText = normalize(
            row.querySelector<HTMLElement>(".event__time")?.textContent || "",
          );
          const scoreStates = Array.from(
            row.querySelectorAll<HTMLElement>('[data-testid="wcl-matchRowScore"]'),
          )
            .map((el) => normalize(el.getAttribute("data-state") || ""))
            .filter(Boolean);
          const scoreStateText = scoreStates.join(" ");
          const rowText = normalize(row.textContent || "");
          const rowClass = String(row.className || "");
          const tournament = findLeagueHeaderText(row);
          const leftSidePlayersCount = row.querySelectorAll(".event__participant--home").length;
          const rightSidePlayersCount = row.querySelectorAll(".event__participant--away").length;
          const statusHint: RawDayMatch["statusHint"] =
            scoreStates.includes("live")
              ? "live"
              : scoreStates.includes("pre-match") || rowClass.includes("event__match--scheduled")
                ? "upcoming"
                : scoreStates.includes("final")
                  ? "finished"
                  : "unknown";
          const categoryContext = normalize(`${tournament} ${rowText}`);
          const isDoublesHint =
            leftSidePlayersCount > 1 ||
            rightSidePlayersCount > 1 ||
            /(парн|дубл|double|mixed)/i.test(categoryContext) ||
            /[&/]/.test(`${playerAName} ${playerBName}`);

          flashscoreData.push({
            url: matchLink.getAttribute("href") || "",
            playerAName,
            playerBName,
            statusText: normalize(`${stageText} ${timeText} ${scoreStateText} ${rowText}`),
            statusHint,
            tournament,
            leftSidePlayersCount,
            rightSidePlayersCount,
            isDoublesHint,
          });
        }

        if (flashscoreData.length > 0) {
          return flashscoreData;
        }
      }

      const dataFromMatchLinks: RawDayMatch[] = [];

      // Main NowGoal structure: first player row contains /tennis/match/{id}, next row contains second player.
      const directMatchLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).filter(
        (link) => (link.getAttribute("href") || "").includes("/tennis/match/"),
      );
      for (const matchLink of directMatchLinks) {
        const row = matchLink.closest("tr");
        if (!row) {
          continue;
        }
        const nextRow = row.nextElementSibling as HTMLElement | null;
        const prevRow = row.previousElementSibling as HTMLElement | null;

        const leftSidePlayers = Array.from(
          row.querySelectorAll<HTMLAnchorElement>('a[href*="/tennis/tournament/player/"]'),
        )
          .map((item) => normalize(item.textContent || ""))
          .filter(Boolean);
        const rightSidePlayers = Array.from(
          nextRow?.querySelectorAll<HTMLAnchorElement>('a[href*="/tennis/tournament/player/"]') || [],
        )
          .map((item) => normalize(item.textContent || ""))
          .filter(Boolean);

        const playerAName =
          (leftSidePlayers.length > 1
            ? leftSidePlayers.join(" / ")
            : leftSidePlayers[0]) || normalize((row.textContent || "").split("[")[0] || "");
        const playerBName =
          (rightSidePlayers.length > 1
            ? rightSidePlayers.join(" / ")
            : rightSidePlayers[0]) ||
          normalize((nextRow?.textContent || "").split("[")[0] || "");

        const tournament = normalize(
          (
            row.closest("tbody,table,section,article")?.previousElementSibling?.textContent || ""
          ).slice(0, 160),
        );
        const statusText = normalize(
          `${prevRow?.textContent || ""} ${row.textContent || ""} ${nextRow?.textContent || ""}`,
        );
        const isDoublesHint =
          leftSidePlayers.length > 1 ||
          rightSidePlayers.length > 1 ||
          /[&/]/.test(`${playerAName} ${playerBName}`) ||
          /(?:\bdoubles?\b|doublesschedule)/i.test(`${statusText} ${tournament}`);
        dataFromMatchLinks.push({
          url: matchLink.getAttribute("href") || "",
          playerAName,
          playerBName,
          statusText,
          tournament,
          leftSidePlayersCount: leftSidePlayers.length,
          rightSidePlayersCount: rightSidePlayers.length,
          isDoublesHint,
        });
      }

      if (dataFromMatchLinks.length > 0) {
        return dataFromMatchLinks;
      }

      const matchRows = Array.from(
        document.querySelectorAll<HTMLElement>(rowSelectors.join(",")),
      );
      const rowsData: RawDayMatch[] = [];

      for (const row of matchRows) {
        const allAnchors = Array.from(row.querySelectorAll<HTMLAnchorElement>("a[href]"));
        if (allAnchors.length === 0) {
          continue;
        }

        const matchLink = allAnchors
          .map((a) => a.getAttribute("href") || "")
          .find((href) => !!href);
        if (!matchLink) {
          continue;
        }

        const directNames = Array.from(
          row.querySelectorAll<HTMLElement>(nameSelectors.join(",")),
        )
          .map((el) => normalize(el.textContent || ""))
          .filter(Boolean);

        const anchorNames = allAnchors
          .map((a) => normalize(a.textContent || ""))
          .filter(Boolean);
        const mergedNames = Array.from(
          new Set([...directNames, ...anchorNames].map((value) => value.toLowerCase())),
        ).map((name) => {
          const source =
            [...directNames, ...anchorNames].find((candidate) => candidate.toLowerCase() === name) ||
            name;
          return source;
        });

        let playerAName: string | undefined;
        let playerBName: string | undefined;
        if (mergedNames.length >= 2) {
          playerAName = mergedNames[0];
          playerBName = mergedNames[1];
        } else {
          const text = normalize(row.textContent || "");
          const splitByVs = text.split(/\bvs\b|\bv\b| - /i).map((value) => normalize(value));
          if (splitByVs.length >= 2) {
            playerAName = splitByVs[0];
            playerBName = splitByVs[1];
          }
        }

        const statusText = normalize(row.textContent || "");
        const tournament = normalize(
          (
            row.closest("table, section, article, .league, .tournament") as HTMLElement | null
          )?.getAttribute("data-name") || "",
        );

        rowsData.push({ url: matchLink, playerAName, playerBName, statusText, tournament });
      }

      if (rowsData.length > 0) {
        return rowsData;
      }

      // Fallback if row-oriented structure is not present.
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
      return links.map((link) => {
        const label = normalize(link.textContent || "");
        const parts = label
          .split(/\bvs\b|\bv\b| - /i)
          .map((value) => normalize(value))
          .filter(Boolean);
        return {
          url: link.getAttribute("href") || "",
          playerAName: parts[0],
          playerBName: parts[1],
          statusText: label,
          tournament: undefined,
        } satisfies RawDayMatch;
      });
    },
    { rowSelectors: [...DAY_PAGE_ROW_SELECTORS], nameSelectors: [...PLAYER_NAME_SELECTORS] },
  )) as RawDayMatch[];

  const mapped: DayMatchRef[] = [];
  let doublesHintFiltered = 0;
  let nonSinglesNameFiltered = 0;
  for (let index = 0; index < rawMatches.length; index += 1) {
    const raw = rawMatches[index];
    const absoluteUrl = toAbsoluteUrl(raw.url, config.entryUrl);
    if (!absoluteUrl || !isLikelyMatchUrl(absoluteUrl)) {
      continue;
    }
    const playerAName = normalizeWhitespace(raw.playerAName || "");
    const playerBName = normalizeWhitespace(raw.playerBName || "");
    if (!isLikelyPlayerName(playerAName) || !isLikelyPlayerName(playerBName)) {
      continue;
    }

    const doublesHint =
      raw.isDoublesHint === true ||
      isDoublesDayHint({
        leftSidePlayersCount: raw.leftSidePlayersCount,
        rightSidePlayersCount: raw.rightSidePlayersCount,
        playerAName,
        playerBName,
        statusText: raw.statusText,
        tournament: raw.tournament,
      });
    if (doublesHint) {
      doublesHintFiltered += 1;
      continue;
    }

    if (!isSinglesDayPlayers(playerAName, playerBName)) {
      nonSinglesNameFiltered += 1;
      continue;
    }

    const tournament = normalizeWhitespace(raw.tournament || "");
    const status =
      raw.statusHint && raw.statusHint !== "unknown"
        ? raw.statusHint
        : guessStatusFromText(raw.statusText || "");
    const scheduledStartText = extractScheduledStartText(raw.statusText || "");
    mapped.push({
      id: `${index}:${absoluteUrl}`,
      url: absoluteUrl,
      playerAName,
      playerBName,
      status,
      ...(status === "upcoming" && scheduledStartText ? { scheduledStartText } : {}),
      ...(tournament ? { tournament } : {}),
    });
  }

  const deduped = uniqueBy(mapped, (value) => value.url);
  logger.info(`Day page: extracted ${deduped.length} singles candidate matches before status filtering.`);
  logger.debug(
    `Day page singles filter: doubles_hints_filtered=${doublesHintFiltered}, ` +
      `name_filter_filtered=${nonSinglesNameFiltered}`,
  );
  const statusDistribution = deduped.reduce(
    (acc, match) => {
      acc[match.status] += 1;
      return acc;
    },
    { live: 0, upcoming: 0, finished: 0, unknown: 0 },
  );
  logger.debug(
    `Day page status_distribution live=${statusDistribution.live} ` +
      `upcoming=${statusDistribution.upcoming} ` +
      `finished=${statusDistribution.finished} ` +
      `unknown=${statusDistribution.unknown}`,
  );
  return deduped;
}

export function isSinglesDayPlayers(playerAName: string, playerBName: string): boolean {
  const left = normalizeWhitespace(playerAName);
  const right = normalizeWhitespace(playerBName);
  if (!left || !right) {
    return false;
  }
  return !/[&/]/.test(left) && !/[&/]/.test(right);
}

export interface DayDoublesHintInput {
  leftSidePlayersCount?: number;
  rightSidePlayersCount?: number;
  playerAName?: string;
  playerBName?: string;
  statusText?: string;
  tournament?: string;
}

export function isDoublesDayHint(input: DayDoublesHintInput): boolean {
  if ((input.leftSidePlayersCount || 0) > 1 || (input.rightSidePlayersCount || 0) > 1) {
    return true;
  }
  const players = normalizeWhitespace(`${input.playerAName || ""} ${input.playerBName || ""}`);
  if (/[&/]/.test(players)) {
    return true;
  }
  const context = normalizeWhitespace(`${input.statusText || ""} ${input.tournament || ""}`);
  if (/(?:\bdoubles?\b|doublesschedule)/i.test(context)) {
    return true;
  }
  return false;
}

export function extractScheduledStartText(statusText: string): string | undefined {
  const text = normalizeWhitespace(statusText || "");
  if (!text) {
    return undefined;
  }

  const fullDate =
    text.match(/\b(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2})\b/)?.[1] ||
    text.match(/\b(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\b/)?.[1] ||
    text.match(/\b(\d{2}[./]\d{2}[./]\d{4}\s+\d{2}:\d{2})\b/)?.[1] ||
    text.match(/\b(\d{2}[./]\d{2}\.\s+\d{2}:\d{2})\b/)?.[1];
  if (fullDate) {
    return fullDate;
  }

  const hhmm = text.match(/\b(\d{1,2}:\d{2})\b/)?.[1];
  if (hhmm) {
    return hhmm;
  }
  return undefined;
}
