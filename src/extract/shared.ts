import { MATCH_STATUS_TEXT, MATCH_LINK_HINTS, PROFILE_LINK_HINTS } from "../selectors.js";
import { normalizeWhitespace } from "../normalize.js";
import type { MatchStatus } from "../types.js";

const LIVE_SET_RE = /\bset\s*[1-5]|\b[1-5][-\s]?(?:й|й̆)?\s*сет\b/i;
const FINISHED_RE = /\b(ft|final|finished|ended)(?:\b|(?=\d))/;
const RETIRED_RE =
  /\bp[12]\s*retired(?:\b|(?=\d))|\bretired(?:\b|(?=\d))|\bwalkover(?:\b|(?=\d))|\bw\/o(?:\b|(?=\d))|\bwo(?:\b|(?=\d))|\babandoned(?:\b|(?=\d))|отказ|відмова|неявка/i;
const HHMM_RE = /\b\d{1,2}:\d{2}\b/;

export function toAbsoluteUrl(candidate: string, baseUrl: string): string | undefined {
  if (!candidate) {
    return undefined;
  }
  try {
    return new URL(candidate, baseUrl).href;
  } catch {
    return undefined;
  }
}

export function isLikelyPlayerName(text: string): boolean {
  const value = normalizeWhitespace(text);
  if (!value) {
    return false;
  }
  if (value.length < 3 || value.length > 45) {
    return false;
  }
  if (!/[\p{L}]/u.test(value)) {
    return false;
  }
  if (/\d{3,}/.test(value)) {
    return false;
  }
  if (
    /(?:live|upcoming|finished|odds|h2h|stats|statistics|set|game|point|round|quarter|semi|коэфф|коеф|статист|сетка|новости|матч|завершен|прерван)/i.test(
      value,
    )
  ) {
    return false;
  }
  return true;
}

export function guessStatusFromText(text: string): MatchStatus {
  const value = normalizeWhitespace(text).toLowerCase();
  if (!value) {
    return "unknown";
  }
  if (
    FINISHED_RE.test(value) ||
    RETIRED_RE.test(value) ||
    MATCH_STATUS_TEXT.finished.some((token) => hasStatusToken(value, token))
  ) {
    return "finished";
  }
  if (
    LIVE_SET_RE.test(value) ||
    MATCH_STATUS_TEXT.live.some((token) => hasStatusToken(value, token))
  ) {
    return "live";
  }
  if (MATCH_STATUS_TEXT.upcoming.some((token) => hasStatusToken(value, token))) {
    return "upcoming";
  }
  if (HHMM_RE.test(value)) {
    return "upcoming";
  }
  return "unknown";
}

function hasStatusToken(value: string, token: string): boolean {
  if (!token) {
    return false;
  }
  if (token.includes(" ")) {
    return value.includes(token);
  }
  const escaped = escapeRegex(token);
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "iu").test(value);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isLikelyMatchUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (PROFILE_LINK_HINTS.some((token) => lower.includes(token))) {
    return false;
  }
  if (/javascript:|mailto:|tel:/.test(lower)) {
    return false;
  }
  if (!MATCH_LINK_HINTS.some((token) => lower.includes(token))) {
    return false;
  }
  return /\/match\/|\/event\/|matchid=|eventid=/.test(lower);
}

export function extractFlashscoreMid(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    const mid = normalizeWhitespace(parsed.searchParams.get("mid") || "");
    return mid || undefined;
  } catch {
    const fromText = normalizeWhitespace(url).match(/[?&]mid=([A-Za-z0-9]+)/)?.[1];
    return fromText || undefined;
  }
}

export function uniqueBy<T>(items: T[], keyFn: (value: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return out;
}
