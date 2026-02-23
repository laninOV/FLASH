export const DAY_PAGE_ROW_SELECTORS = [
  "tr",
  "li",
  ".match-row",
  ".match-item",
  ".event-item",
  ".list-item",
] as const;

export const PLAYER_NAME_SELECTORS = [
  ".home",
  ".away",
  ".team-home",
  ".team-away",
  ".player-name",
  ".name",
  ".participant",
] as const;

export const MATCH_STATUS_TEXT = {
  live: ["live", "in-play", "in play", "лайв", "наживо"],
  upcoming: [
    "upcoming",
    "scheduled",
    "not started",
    "ns",
    "запланирован",
    "заплановано",
    "ожидается",
    "очікується",
  ],
  finished: [
    "finished",
    "ended",
    "ft",
    "final",
    "retired",
    "walkover",
    "w/o",
    "wo",
    "abandoned",
    "завершен",
    "завершено",
    "завершён",
    "прерван",
    "перервано",
    "отказ",
    "відмова",
    "неявка",
    "walkover",
  ],
} as const;

export const PROFILE_LINK_HINTS = ["player", "profile"] as const;
export const MATCH_LINK_HINTS = ["match", "event", "tennis"] as const;

export const TECH_STAT_SECTIONS = new Set([
  "service",
  "return",
  "points",
  "games",
  "подача",
  "возврат",
  "повернення",
  "очки",
  "геймы",
  "гейми",
]);
