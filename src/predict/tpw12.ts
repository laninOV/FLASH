// Legacy module retained for research/tests; not used by main runtime pipeline.
import type { HistoryMetricRow, TPW12HistoryScore } from "../types.js";

const POWER_SCALE_PP = 8;
const FORM_SCALE_PP = 3;
const VOLATILITY_SCALE_PP = 6;

export function tpw12HistoryScores(
  rows: HistoryMetricRow[],
  maxN = 5,
): TPW12HistoryScore {
  const values: number[] = [];

  for (const row of rows.slice(0, Math.max(0, maxN))) {
    if (typeof row.tpw12 === "number" && row.tpw12 >= 0 && row.tpw12 <= 1) {
      values.push(row.tpw12);
    }
  }

  const n = values.length;
  if (n === 0) {
    return {
      n: 0,
      reliability: 0,
      values: [],
    };
  }

  const mu = mean(values);
  const sigma = populationStd(values);
  const recentCount = Math.min(3, n);
  const muRecent = mean(values.slice(0, recentCount));
  const delta = muRecent - mu;

  const muPP = (mu - 0.5) * 100;
  const deltaPP = delta * 100;
  const sigmaPP = sigma * 100;

  const power = clamp100(50 + (muPP / POWER_SCALE_PP) * 50);
  const form = clamp100(50 + (deltaPP / FORM_SCALE_PP) * 50);
  const volatility = clamp100((sigmaPP / VOLATILITY_SCALE_PP) * 100);
  const rating = clamp100(0.6 * power + 0.25 * form + 0.15 * (100 - volatility));
  const reliability = clamp100((n / 20) * 100);

  return {
    n,
    mu_pp: muPP,
    delta_pp: deltaPP,
    sigma_pp: sigmaPP,
    power,
    form,
    volatility,
    rating,
    reliability,
    values,
  };
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function populationStd(values: number[]): number {
  const m = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function clamp100(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 100) {
    return 100;
  }
  return value;
}
