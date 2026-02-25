import { clamp } from "../common/math.js";
import type { PlayerRecentStats } from "../types.js";
import {
  REQUIRED_DIRT_METRIC_KEYS,
  extractDirtFeatureRow,
  type DirtFeatureRow,
  type RequiredDirtMetricKey,
} from "./requiredMetrics.js";
import { pickByOddsOrSeed } from "./tieBreak.js";

const SOURCE = "stable14_mahal_edge_v2" as const;
const RECENCY_WEIGHTS = [0.28, 0.24, 0.2, 0.16, 0.12] as const;
const SHRINK_LAMBDA = 0.55;
const PERCENT_PRIOR_VAR = 64;
const COUNT_PRIOR_VAR = 4;
const PERCENT_VAR_FLOOR = 9;
const COUNT_VAR_FLOOR = 0.25;
const Z_CLIP = 3;

const COUNT_METRICS = new Set<RequiredDirtMetricKey>(["double_faults"]);
const INVERT_METRICS = new Set<RequiredDirtMetricKey>(["double_faults"]);

const METRIC_WEIGHTS: Readonly<Record<RequiredDirtMetricKey, number>> = {
  first_serve: 0.01,
  first_serve_points_won: 0.06,
  second_serve_points_won: 0.07,
  break_points_saved: 0.05,
  double_faults: 0.01,
  first_serve_return_points_won: 0.04,
  second_serve_return_points_won: 0.04,
  break_points_converted: 0.06,
  total_service_points_won: 0.06,
  return_points_won: 0.13,
  total_points_won: 0.19,
  service_games_won: 0.08,
  return_games_won: 0.07,
  total_games_won: 0.13,
};

const CORE_ANCHOR_WEIGHTS: Readonly<Partial<Record<RequiredDirtMetricKey, number>>> = {
  total_points_won: 0.4,
  total_games_won: 0.25,
  return_points_won: 0.2,
  total_service_points_won: 0.15,
};

export interface MahalEdgeShadowInput {
  playerAStats: PlayerRecentStats;
  playerBStats: PlayerRecentStats;
  playerAName: string;
  playerBName: string;
  requestedPerPlayer: number;
  homeOdd?: number;
  awayOdd?: number;
  seed: string;
}

export interface MahalEdgeShadowResult {
  p1: number;
  p2: number;
  winner?: string;
  source: typeof SOURCE;
  components?: {
    rawP1: number;
    scoreS: number;
    distanceD: number;
    reliability: number;
    statsCoverage: number;
    varianceStability: number;
    signConsensus: number;
    distanceConfidence: number;
  };
  warnings: string[];
}

interface PerMetricStats {
  mean: number;
  variance: number;
}

interface MetricComputation {
  key: RequiredDirtMetricKey;
  weight: number;
  pooledVar: number;
  priorVar: number;
  z: number;
}

export function computeMahalEdgeShadow(input: MahalEdgeShadowInput): MahalEdgeShadowResult {
  const warnings: string[] = [];
  const rowsA = collectFeatureRows(input.playerAStats);
  const rowsB = collectFeatureRows(input.playerBStats);
  const validA = Math.min(rowsA.length, 5);
  const validB = Math.min(rowsB.length, 5);

  if (Math.min(validA, validB) < Math.max(1, input.requestedPerPlayer)) {
    warnings.push("mahal_low_pair_coverage");
  }

  const metrics = buildMetricComputations(rowsA, rowsB);
  if (!metrics || metrics.length === 0) {
    warnings.push("mahal_stats_unavailable");
    return neutralResult(input, warnings, "unavailable");
  }

  let scoreS = 0;
  let coreScoreNumerator = 0;
  let coreScoreWeight = 0;
  let sq = 0;
  let signWeighted = 0;
  let weightSum = 0;
  let varianceStabilitySum = 0;
  let varianceStabilityCount = 0;

  for (const metric of metrics) {
    scoreS += metric.weight * metric.z;
    const coreWeight = CORE_ANCHOR_WEIGHTS[metric.key] || 0;
    if (coreWeight > 0) {
      coreScoreNumerator += coreWeight * metric.z;
      coreScoreWeight += coreWeight;
    }
    sq += metric.weight * metric.z * metric.z;
    signWeighted += metric.weight * Math.sign(metric.z);
    weightSum += metric.weight;
    varianceStabilitySum += metric.priorVar / (metric.priorVar + metric.pooledVar);
    varianceStabilityCount += 1;
  }

  if (weightSum <= 0 || varianceStabilityCount <= 0) {
    warnings.push("mahal_stats_unavailable");
    return neutralResult(input, warnings, "unavailable");
  }

  const coreScore = coreScoreWeight > 0 ? coreScoreNumerator / coreScoreWeight : scoreS;
  const effectiveScoreS = 0.7 * scoreS + 0.3 * coreScore;
  const coreAgreement = clamp(1 - Math.abs(scoreS - coreScore) / 1.75, 0, 1);
  const distanceD = Math.sqrt(Math.max(0, sq));
  const rawP1 = clamp(50 + 50 * Math.tanh(0.5 * effectiveScoreS), 1, 99);
  const statsCoverage = clamp(
    Math.min(validA, validB) / Math.max(1, Math.min(5, input.requestedPerPlayer || 5)),
    0,
    1,
  );
  const varianceStability = clamp(varianceStabilitySum / varianceStabilityCount, 0, 1);
  const signConsensus = clamp(Math.abs(signWeighted) / weightSum, 0, 1);
  const distanceConfidence = clamp(distanceD / 1.5, 0, 1);
  const reliability = clamp(
    0.22 +
      0.23 * statsCoverage +
      0.25 * varianceStability +
      0.12 * signConsensus +
      0.1 * distanceConfidence +
      0.08 * coreAgreement,
    0.22,
    0.78,
  );

  if (distanceConfidence < 0.2 && varianceStability < 0.5) {
    warnings.push("mahal_high_dispersion");
  }

  const p1Raw = clamp(50 + (rawP1 - 50) * reliability, 0, 100);
  const p1 = round1(p1Raw);
  const p2 = round1(100 - p1Raw);
  let winner: string;
  if (p1Raw > 50) {
    winner = input.playerAName;
  } else if (p1Raw < 50) {
    winner = input.playerBName;
  } else {
    warnings.push("mahal_neutral_tiebreak");
    winner = pickByOddsOrSeed(
      input.playerAName,
      input.playerBName,
      input.homeOdd,
      input.awayOdd,
      `${input.seed}|mahal`,
    ).winner;
  }

  return {
    p1,
    p2,
    winner,
    source: SOURCE,
    components: {
      rawP1: round3(rawP1),
      scoreS: round3(effectiveScoreS),
      distanceD: round3(distanceD),
      reliability: round3(reliability),
      statsCoverage: round3(statsCoverage),
      varianceStability: round3(varianceStability),
      signConsensus: round3(signConsensus),
      distanceConfidence: round3(distanceConfidence),
    },
    warnings,
  };
}

function neutralResult(
  input: MahalEdgeShadowInput,
  warnings: string[],
  reason: "unavailable" | "neutral",
): MahalEdgeShadowResult {
  const localWarnings = [...warnings];
  if (reason === "neutral") {
    localWarnings.push("mahal_neutral_tiebreak");
  }
  const tieBreak = pickByOddsOrSeed(
    input.playerAName,
    input.playerBName,
    input.homeOdd,
    input.awayOdd,
    `${input.seed}|mahal`,
  );
  return {
    p1: 50,
    p2: 50,
    winner: tieBreak.winner,
    source: SOURCE,
    components: {
      rawP1: 50,
      scoreS: 0,
      distanceD: 0,
      reliability: 0.22,
      statsCoverage: 0,
      varianceStability: 0,
      signConsensus: 0,
      distanceConfidence: 0,
    },
    warnings: localWarnings,
  };
}

function collectFeatureRows(stats: PlayerRecentStats): DirtFeatureRow[] {
  const out: DirtFeatureRow[] = [];
  for (const match of stats.parsedMatches) {
    const row = extractDirtFeatureRow(match);
    if (row) {
      out.push(row);
    }
  }
  return out;
}

function buildMetricComputations(
  rowsA: DirtFeatureRow[],
  rowsB: DirtFeatureRow[],
): MetricComputation[] | null {
  const n = Math.min(rowsA.length, rowsB.length, 5);
  if (n <= 0) {
    return null;
  }
  const weights = RECENCY_WEIGHTS.slice(0, n);
  const out: MetricComputation[] = [];

  for (const key of REQUIRED_DIRT_METRIC_KEYS) {
    const statsA = metricStats(rowsA.slice(0, n), weights, key);
    const statsB = metricStats(rowsB.slice(0, n), weights, key);
    if (!statsA || !statsB) {
      continue;
    }

    const pooledVar = 0.5 * (statsA.variance + statsB.variance);
    const priorVar = COUNT_METRICS.has(key) ? COUNT_PRIOR_VAR : PERCENT_PRIOR_VAR;
    const minVar = COUNT_METRICS.has(key) ? COUNT_VAR_FLOOR : PERCENT_VAR_FLOOR;
    const shrunkVar = Math.max(SHRINK_LAMBDA * pooledVar + (1 - SHRINK_LAMBDA) * priorVar, minVar);
    const sign = INVERT_METRICS.has(key) ? -1 : 1;
    const delta = (statsA.mean - statsB.mean) * sign;
    const z = clamp(delta / Math.sqrt(shrunkVar), -Z_CLIP, Z_CLIP);

    out.push({
      key,
      weight: METRIC_WEIGHTS[key],
      pooledVar,
      priorVar,
      z,
    });
  }

  return out.length > 0 ? out : null;
}

function metricStats(
  rows: DirtFeatureRow[],
  weights: readonly number[],
  key: RequiredDirtMetricKey,
): PerMetricStats | null {
  let sumW = 0;
  let meanNumerator = 0;

  for (let i = 0; i < rows.length && i < weights.length; i += 1) {
    const value = rows[i]?.[key];
    const w = weights[i] || 0;
    if (!Number.isFinite(value) || w <= 0) {
      continue;
    }
    sumW += w;
    meanNumerator += (value as number) * w;
  }

  if (sumW <= 0) {
    return null;
  }

  const mean = meanNumerator / sumW;
  let varianceNumerator = 0;
  for (let i = 0; i < rows.length && i < weights.length; i += 1) {
    const value = rows[i]?.[key];
    const w = weights[i] || 0;
    if (!Number.isFinite(value) || w <= 0) {
      continue;
    }
    const diff = (value as number) - mean;
    varianceNumerator += w * diff * diff;
  }

  return {
    mean,
    variance: varianceNumerator / sumW,
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
