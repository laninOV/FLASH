import type { MatchStatusFilter } from "../types.js";

export type ControlCommand =
  | { kind: "ignore" }
  | { kind: "show_menu" }
  | { kind: "shutdown" }
  | { kind: "reload" }
  | { kind: "stop" }
  | { kind: "list"; status: MatchStatusFilter }
  | { kind: "analyze"; status: MatchStatusFilter; label: string }
  | { kind: "unknown" };

export function parseControlCommand(rawText: string): ControlCommand {
  const text = normalizeCommand(rawText);
  if (!text) {
    return { kind: "ignore" };
  }

  if (text.startsWith("/start") || text.startsWith("/menu")) {
    return { kind: "show_menu" };
  }

  if (hasToken(text, "выключ") || text.includes("shutdown")) {
    return { kind: "shutdown" };
  }

  if (hasToken(text, "перезагруз") || text.includes("reload")) {
    return { kind: "reload" };
  }

  if (hasToken(text, "останов") || hasToken(text, "стоп") || text.includes("stop current")) {
    return { kind: "stop" };
  }

  if (hasToken(text, "список") && (hasToken(text, "лайв") || text.includes("live"))) {
    return { kind: "list", status: "live" };
  }

  if (
    hasToken(text, "список") &&
    (hasToken(text, "прематч") ||
      hasToken(text, "премачт") ||
      text.includes("prematch") ||
      text.includes("upcoming"))
  ) {
    return { kind: "list", status: "upcoming" };
  }

  if (hasToken(text, "анализ") && (hasToken(text, "лайв") || text.includes("live"))) {
    return { kind: "analyze", status: "live", label: "лайв" };
  }

  if (
    hasToken(text, "анализ") &&
    (hasToken(text, "прематч") ||
      hasToken(text, "премачт") ||
      text.includes("prematch") ||
      text.includes("upcoming"))
  ) {
    return { kind: "analyze", status: "upcoming", label: "прематч" };
  }

  return { kind: "unknown" };
}

export function normalizeCommand(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s/_-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasToken(text: string, token: string): boolean {
  return text.includes(token);
}
