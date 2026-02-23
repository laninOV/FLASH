// Legacy module retained for research/tests; not used by main runtime pipeline.
import type { EnsembleMeta, HistoryModuleResult, HistoryModuleSide } from "../types.js";

export function ensemble(modules: HistoryModuleResult[]): EnsembleMeta {
  let score = 0;
  let votesHome = 0;
  let votesAway = 0;
  let strongHome = 0;
  let strongAway = 0;
  let active = 0;

  for (const mod of modules) {
    if (mod.side === "neutral" || mod.strength <= 0) {
      continue;
    }

    active += 1;
    if (mod.side === "home") {
      score += mod.strength;
      votesHome += 1;
      if (mod.strength >= 2) {
        strongHome += 1;
      }
    } else if (mod.side === "away") {
      score -= mod.strength;
      votesAway += 1;
      if (mod.strength >= 2) {
        strongAway += 1;
      }
    }
  }

  let finalSide: HistoryModuleSide = "neutral";
  if (score >= 3 && (strongHome >= 2 || votesHome >= 3) && active >= 2) {
    finalSide = "home";
  } else if (score <= -3 && (strongAway >= 2 || votesAway >= 3) && active >= 2) {
    finalSide = "away";
  }

  return {
    finalSide,
    score,
    votesHome,
    votesAway,
    strongHome,
    strongAway,
    active,
  };
}
