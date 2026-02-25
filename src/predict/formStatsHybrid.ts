import { clamp } from "../common/math.js";
import type { PlayerRecentStats } from "../types.js";
import { pickByOddsOrSeed } from "./tieBreak.js";
import { extractDirtFeatureRow, type DirtFeatureRow } from "./requiredMetrics.js";

const SOURCE = "form_stats_hybrid_v2" as const;
const FORM_WINDOW = 8;
const STATS_WEIGHT = 0.8;
const FORM_WEIGHT = 0.2;
const MAX_HYBRID_RELIABILITY = 0.8;

type HybridMetricKey =
  | "total_points_won"
  | "return_points_won"
  | "total_games_won"
  | "service_games_won"
  | "return_games_won"
  | "break_points_converted"
  | "break_points_saved"
  | "first_serve_points_won"
  | "second_serve_points_won"
  | "first_serve_return_points_won"
  | "second_serve_return_points_won"
  | "double_faults";

const HYBRID_STATS_METRICS: Array<{
  key: HybridMetricKey;
  weight: number;
  scale: number;
  invert?: boolean;
}> = [
  { key: "total_points_won", weight: 0.2, scale: 15 },
  { key: "return_points_won", weight: 0.12, scale: 15 },
  { key: "total_games_won", weight: 0.12, scale: 15 },
  { key: "service_games_won", weight: 0.08, scale: 15 },
  { key: "return_games_won", weight: 0.08, scale: 15 },
  { key: "break_points_converted", weight: 0.08, scale: 10 },
  { key: "break_points_saved", weight: 0.06, scale: 10 },
  { key: "first_serve_points_won", weight: 0.07, scale: 10 },
  { key: "second_serve_points_won", weight: 0.07, scale: 10 },
  { key: "first_serve_return_points_won", weight: 0.05, scale: 10 },
  { key: "second_serve_return_points_won", weight: 0.05, scale: 10 },
  { key: "double_faults", weight: 0.02, scale: 2, invert: true },
];

export interface FormStatsHybridInput {
  playerAStats: PlayerRecentStats;
  playerBStats: PlayerRecentStats;
  playerAName: string;
  playerBName: string;
  requestedPerPlayer: number;
  homeOdd?: number;
  awayOdd?: number;
  seed: string;
}

export interface FormStatsHybridResult {
  p1: number;
  p2: number;
  winner?: string;
  source: typeof SOURCE;
  components: {
    statsP1?: number;
    formP1?: number;
    hybridRawP1?: number;
    statsWeight: number;
    formWeight: number;
    statsReliability: number;
    formReliability: number;
    hybridReliability: number;
  };
  warnings: string[];
}

export function computeFormStatsHybrid(input: FormStatsHybridInput): FormStatsHybridResult {
  const warnings: string[] = [];

  const featureA = collectFeatureRows(input.playerAStats);
  const featureB = collectFeatureRows(input.playerBStats);
  const statsP1 = computeStatsComponent(featureA, featureB);

  const formA = input.playerAStats.recentForm;
  const formB = input.playerBStats.recentForm;
  const formP1 = computeFormComponent(formA?.weightedScore, formB?.weightedScore);

  if (!formA || formA.usableMatches <= 0) {
    warnings.push("hybrid_form_unavailable_a");
  }
  if (!formB || formB.usableMatches <= 0) {
    warnings.push("hybrid_form_unavailable_b");
  }
  if (!Number.isFinite(statsP1)) {
    warnings.push("hybrid_stats_unavailable");
  }

  const usableFormMatchesMin = Math.min(formA?.usableMatches || 0, formB?.usableMatches || 0);
  if (usableFormMatchesMin < FORM_WINDOW) {
    warnings.push("hybrid_form_low_coverage");
  }

  const statsReliability = clamp01(
    input.requestedPerPlayer > 0
      ? Math.min(featureA.length, featureB.length) / input.requestedPerPlayer
      : 0,
  );
  const formReliability = clamp01(usableFormMatchesMin / FORM_WINDOW);
  const statsP1Used = Number.isFinite(statsP1) ? (statsP1 as number) : 50;
  const formP1Used = Number.isFinite(formP1) ? (formP1 as number) : 50;
  const componentAgreement = clamp01(1 - Math.abs(statsP1Used - formP1Used) / 40);
  const hybridReliability = clamp01(
    Math.min(
      MAX_HYBRID_RELIABILITY,
      0.45 * statsReliability + 0.15 * formReliability + 0.2 * componentAgreement,
    ),
  );
  const hybridRawP1 = clamp(STATS_WEIGHT * statsP1Used + FORM_WEIGHT * formP1Used, 0, 100);
  const hybridP1 = clamp(50 + (hybridRawP1 - 50) * hybridReliability, 0, 100);
  const winner = resolveHybridWinner({
    p1: hybridP1,
    playerAName: input.playerAName,
    playerBName: input.playerBName,
    homeOdd: input.homeOdd,
    awayOdd: input.awayOdd,
    seed: input.seed,
  });

  return {
    p1: round1(hybridP1),
    p2: round1(100 - hybridP1),
    winner,
    source: SOURCE,
    components: {
      ...(Number.isFinite(statsP1) ? { statsP1: round1(statsP1 as number) } : {}),
      ...(Number.isFinite(formP1) ? { formP1: round1(formP1 as number) } : {}),
      hybridRawP1: round1(hybridRawP1),
      statsWeight: STATS_WEIGHT,
      formWeight: FORM_WEIGHT,
      statsReliability: round3(statsReliability),
      formReliability: round3(formReliability),
      hybridReliability: round3(hybridReliability),
    },
    warnings,
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

function computeStatsComponent(
  playerA: DirtFeatureRow[],
  playerB: DirtFeatureRow[],
): number | undefined {
  if (playerA.length === 0 || playerB.length === 0) {
    return undefined;
  }
  const meanA = averageMetrics(playerA);
  const meanB = averageMetrics(playerB);

  let weighted = 0;
  let totalWeight = 0;
  for (const metric of HYBRID_STATS_METRICS) {
    const a = meanA[metric.key];
    const b = meanB[metric.key];
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      continue;
    }
    let delta = (a as number) - (b as number);
    if (metric.invert) {
      delta *= -1;
    }
    const score = clamp(delta / metric.scale, -1, 1);
    weighted += score * metric.weight;
    totalWeight += metric.weight;
  }

  if (totalWeight <= 0) {
    return undefined;
  }
  const statsScore = weighted / totalWeight;
  return clamp(50 + 35 * statsScore, 0, 100);
}

function averageMetrics(rows: DirtFeatureRow[]): Partial<Record<HybridMetricKey, number>> {
  const sums: Partial<Record<HybridMetricKey, number>> = {};
  const counts: Partial<Record<HybridMetricKey, number>> = {};

  for (const row of rows) {
    for (const metric of HYBRID_STATS_METRICS) {
      const value = row[metric.key];
      if (!Number.isFinite(value)) {
        continue;
      }
      sums[metric.key] = (sums[metric.key] || 0) + value;
      counts[metric.key] = (counts[metric.key] || 0) + 1;
    }
  }

  const out: Partial<Record<HybridMetricKey, number>> = {};
  for (const metric of HYBRID_STATS_METRICS) {
    const count = counts[metric.key] || 0;
    if (count <= 0) {
      continue;
    }
    out[metric.key] = (sums[metric.key] || 0) / count;
  }
  return out;
}

function computeFormComponent(
  formScoreA: number | undefined,
  formScoreB: number | undefined,
): number | undefined {
  if (!Number.isFinite(formScoreA) || !Number.isFinite(formScoreB)) {
    return undefined;
  }
  const delta = (formScoreA as number) - (formScoreB as number);
  return clamp(50 + 25 * delta, 0, 100);
}

function resolveHybridWinner(input: {
  p1: number;
  playerAName: string;
  playerBName: string;
  homeOdd?: number;
  awayOdd?: number;
  seed: string;
}): string {
  if (input.p1 > 50) {
    return input.playerAName;
  }
  if (input.p1 < 50) {
    return input.playerBName;
  }
  return pickByOddsOrSeed(
    input.playerAName,
    input.playerBName,
    input.homeOdd,
    input.awayOdd,
    `${input.seed}|hybrid`,
  ).winner;
}

function clamp01(value: number): number {
  return clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
