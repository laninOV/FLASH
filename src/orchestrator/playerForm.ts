import { normalizeWhitespace } from "../normalize.js";
import type { PlayerRecentFormSummary, RecentMatchRef } from "../types.js";

export const FORM_WINDOW = 8;
const FORM_SOURCE = "profile_results_flashscore_v1" as const;

export function buildPlayerRecentFormSummary(
  matches: RecentMatchRef[],
  options: { window?: number } = {},
): PlayerRecentFormSummary {
  const windowRequested = normalizeWindow(options.window);
  const weights = recencyWeights(windowRequested);

  let wins = 0;
  let losses = 0;
  let usableMatches = 0;
  let unparsedScoreRows = 0;
  let weightedSum = 0;
  let weightedDen = 0;

  for (let index = 0; index < Math.min(windowRequested, matches.length); index += 1) {
    const match = matches[index];
    const winSign = extractResultMarkerSign(match.resultText);
    if (!winSign) {
      continue;
    }

    const weight = weights[index] ?? weights[weights.length - 1] ?? 1;
    const setMarginNorm = parseSetMarginNorm(match.scoreText, winSign);
    if (normalizeWhitespace(match.scoreText || "") && setMarginNorm === undefined) {
      unparsedScoreRows += 1;
    }

    const matchForm = clamp(-1, 1, 0.8 * winSign + 0.2 * (setMarginNorm ?? 0));
    weightedSum += matchForm * weight;
    weightedDen += weight;
    usableMatches += 1;
    if (winSign > 0) {
      wins += 1;
    } else {
      losses += 1;
    }
  }

  const weightedScore =
    weightedDen > 0 ? clamp(-1, 1, weightedSum / weightedDen) : 0;

  return {
    windowRequested,
    windowUsed: usableMatches,
    wins,
    losses,
    weightedScore,
    usableMatches,
    unparsedScoreRows,
    source: FORM_SOURCE,
  };
}

function normalizeWindow(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return FORM_WINDOW;
  }
  const n = Math.trunc(value as number);
  if (n <= 0) {
    return FORM_WINDOW;
  }
  return Math.min(n, 20);
}

function recencyWeights(count: number): number[] {
  if (count <= 0) {
    return [];
  }
  if (count === 1) {
    return [1];
  }
  const start = 1;
  const end = 0.44;
  const step = (start - end) / (count - 1);
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(Number((start - step * i).toFixed(4)));
  }
  return out;
}

function extractResultMarkerSign(resultText: string | undefined): 1 | -1 | undefined {
  const text = normalizeWhitespace(resultText || "");
  if (!text) {
    return undefined;
  }
  const marker = text.match(/(?:^|\s)([WLVПВ])(?:\s|$)/iu)?.[1]?.toUpperCase();
  if (!marker) {
    return undefined;
  }
  if (marker === "W" || marker === "В") {
    return 1;
  }
  if (marker === "L" || marker === "П") {
    return -1;
  }
  return undefined;
}

function parseSetMarginNorm(
  scoreText: string | undefined,
  winSign: 1 | -1,
): number | undefined {
  const text = normalizeWhitespace(scoreText || "");
  if (!text) {
    return undefined;
  }
  const score = text.match(/^(\d+)\s*-\s*(\d+)/);
  if (!score) {
    return undefined;
  }
  const left = Number(score[1]);
  const right = Number(score[2]);
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return undefined;
  }
  const absMargin = Math.abs(left - right);
  return winSign * clamp(0, 1, absMargin / 2);
}

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

