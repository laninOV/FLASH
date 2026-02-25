import { clamp } from "../common/math.js";
import type { PlayerRecentStats } from "../types.js";
import { extractDirtFeatureRow, type DirtFeatureRow } from "./requiredMetrics.js";
import { pickByOddsOrSeed } from "./tieBreak.js";

const SOURCE = "stable14_matchup_cross_v1" as const;
const RECENCY_WEIGHTS = [0.3, 0.25, 0.2, 0.15, 0.1] as const;

type ComponentKey =
  | "serviceOff"
  | "returnOff"
  | "pressureAttack"
  | "pressureDefense"
  | "control"
  | "discipline";

interface ComponentPoint extends Record<ComponentKey, number> {}

interface ComponentSummary {
  means: Record<ComponentKey, number>;
  vars: Record<ComponentKey, number>;
  componentDispersion: number;
  stability: number;
}

export interface MatchupCrossShadowInput {
  playerAStats: PlayerRecentStats;
  playerBStats: PlayerRecentStats;
  playerAName: string;
  playerBName: string;
  requestedPerPlayer: number;
  homeOdd?: number;
  awayOdd?: number;
  seed: string;
}

export interface MatchupCrossShadowResult {
  p1: number;
  p2: number;
  winner?: string;
  source: typeof SOURCE;
  components?: {
    rawP1: number;
    scoreS: number;
    reliability: number;
    statsCoverage: number;
    componentAgreement: number;
    stabilityConfidence: number;
    edgeMagnitude: number;
    serveMatch: number;
    returnMatch: number;
    pressureMatch: number;
    controlMatch: number;
  };
  warnings: string[];
}

const COMPONENT_KEYS: ComponentKey[] = [
  "serviceOff",
  "returnOff",
  "pressureAttack",
  "pressureDefense",
  "control",
  "discipline",
];

export function computeMatchupCrossShadow(
  input: MatchupCrossShadowInput,
): MatchupCrossShadowResult {
  const warnings: string[] = [];
  const rowsA = collectFeatureRows(input.playerAStats);
  const rowsB = collectFeatureRows(input.playerBStats);
  const validA = Math.min(rowsA.length, 5);
  const validB = Math.min(rowsB.length, 5);
  const need = Math.max(1, Math.min(5, input.requestedPerPlayer || 5));
  const statsCoverage = clamp(Math.min(validA, validB) / 5, 0, 1);

  if (Math.min(validA, validB) < need) {
    warnings.push("matchup_low_pair_coverage");
    return neutralResult(input, warnings, statsCoverage);
  }

  const summaryA = buildPlayerComponentSummary(rowsA);
  const summaryB = buildPlayerComponentSummary(rowsB);
  if (!summaryA || !summaryB) {
    warnings.push("matchup_stats_unavailable");
    return neutralResult(input, warnings, 0);
  }

  const serveMatch = summaryA.means.serviceOff - summaryB.means.returnOff;
  const returnMatch = summaryA.means.returnOff - summaryB.means.serviceOff;
  const pressureMatch =
    0.5 * (summaryA.means.pressureAttack - summaryB.means.pressureDefense) +
    0.5 * (summaryA.means.pressureDefense - summaryB.means.pressureAttack);
  const controlMatch = summaryA.means.control - summaryB.means.control;
  const disciplineMatch = summaryA.means.discipline - summaryB.means.discipline;
  const stabilityMatch = summaryA.stability - summaryB.stability;

  const crossSynergy = clipInteraction(serveMatch * returnMatch);
  const pressureControlSync = clipInteraction(pressureMatch * controlMatch);
  const attackDefenseTension = clipInteraction(
    0.5 * serveMatch * pressureMatch + 0.5 * returnMatch * pressureMatch,
  );

  const scoreS =
    0.24 * serveMatch +
    0.24 * returnMatch +
    0.17 * pressureMatch +
    0.15 * controlMatch +
    0.06 * disciplineMatch +
    0.04 * stabilityMatch +
    0.06 * crossSynergy +
    0.03 * pressureControlSync +
    0.01 * attackDefenseTension;

  const rawP1 = clamp(50 + 50 * Math.tanh(1.45 * scoreS), 1, 99);
  const componentAgreement = clamp(
    1 - (Math.abs(serveMatch - returnMatch) + Math.abs(controlMatch - pressureMatch)) / 1.2,
    0,
    1,
  );
  if (componentAgreement < 0.35) {
    warnings.push("matchup_high_component_conflict");
  }
  const stabilityConfidence = clamp((summaryA.stability + summaryB.stability) / 2, 0, 1);
  const edgeMagnitude = clamp(Math.abs(scoreS) / 0.55, 0, 1);
  const reliability = clamp(
    0.22 +
      0.28 * statsCoverage +
      0.2 * componentAgreement +
      0.18 * stabilityConfidence +
      0.12 * edgeMagnitude,
    0.22,
    0.8,
  );

  const p1Raw = clamp(50 + (rawP1 - 50) * reliability, 0, 100);
  const p1 = round1(p1Raw);
  const p2 = round1(100 - p1Raw);

  let winner: string;
  if (p1Raw > 50) {
    winner = input.playerAName;
  } else if (p1Raw < 50) {
    winner = input.playerBName;
  } else {
    warnings.push("matchup_neutral_tiebreak");
    winner = pickByOddsOrSeed(
      input.playerAName,
      input.playerBName,
      input.homeOdd,
      input.awayOdd,
      `${input.seed}|matchup`,
    ).winner;
  }

  return {
    p1,
    p2,
    winner,
    source: SOURCE,
    components: {
      rawP1: round3(rawP1),
      scoreS: round3(scoreS),
      reliability: round3(reliability),
      statsCoverage: round3(statsCoverage),
      componentAgreement: round3(componentAgreement),
      stabilityConfidence: round3(stabilityConfidence),
      edgeMagnitude: round3(edgeMagnitude),
      serveMatch: round3(serveMatch),
      returnMatch: round3(returnMatch),
      pressureMatch: round3(pressureMatch),
      controlMatch: round3(controlMatch),
    },
    warnings,
  };
}

function neutralResult(
  input: MatchupCrossShadowInput,
  warnings: string[],
  statsCoverage: number,
): MatchupCrossShadowResult {
  const localWarnings = [...warnings, "matchup_neutral_tiebreak"];
  const tieBreak = pickByOddsOrSeed(
    input.playerAName,
    input.playerBName,
    input.homeOdd,
    input.awayOdd,
    `${input.seed}|matchup`,
  );
  return {
    p1: 50,
    p2: 50,
    winner: tieBreak.winner,
    source: SOURCE,
    components: {
      rawP1: 50,
      scoreS: 0,
      reliability: 0.22,
      statsCoverage: round3(statsCoverage),
      componentAgreement: 0,
      stabilityConfidence: 0,
      edgeMagnitude: 0,
      serveMatch: 0,
      returnMatch: 0,
      pressureMatch: 0,
      controlMatch: 0,
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

function buildPlayerComponentSummary(rows: DirtFeatureRow[]): ComponentSummary | null {
  const n = Math.min(rows.length, 5);
  if (n <= 0) {
    return null;
  }
  const weights = RECENCY_WEIGHTS.slice(0, n);
  const points: ComponentPoint[] = [];
  for (let i = 0; i < n; i += 1) {
    const point = rowToComponentPoint(rows[i]!);
    if (!point) {
      return null;
    }
    points.push(point);
  }
  const means = weightedMeanPoints(points, weights);
  const vars = weightedVarPoints(points, means, weights);
  const componentDispersion =
    COMPONENT_KEYS.reduce((sum, key) => sum + vars[key], 0) / COMPONENT_KEYS.length;
  const stability = clamp(Math.exp(-4 * componentDispersion), 0, 1);

  return {
    means,
    vars,
    componentDispersion,
    stability,
  };
}

function rowToComponentPoint(row: DirtFeatureRow): ComponentPoint | null {
  const firstServe = toPercent01(row.first_serve);
  const firstServeWon = toPercent01(row.first_serve_points_won);
  const secondServeWon = toPercent01(row.second_serve_points_won);
  const breakSaved = toPercent01(row.break_points_saved);
  const firstServeReturnWon = toPercent01(row.first_serve_return_points_won);
  const secondServeReturnWon = toPercent01(row.second_serve_return_points_won);
  const breakConverted = toPercent01(row.break_points_converted);
  const totalServicePointsWon = toPercent01(row.total_service_points_won);
  const returnPointsWon = toPercent01(row.return_points_won);
  const totalPointsWon = toPercent01(row.total_points_won);
  const serviceGamesWon = toPercent01(row.service_games_won);
  const returnGamesWon = toPercent01(row.return_games_won);
  const totalGamesWon = toPercent01(row.total_games_won);
  const dfInv = inverseDoubleFaults(row.double_faults);

  const numeric = [
    firstServe,
    firstServeWon,
    secondServeWon,
    breakSaved,
    firstServeReturnWon,
    secondServeReturnWon,
    breakConverted,
    totalServicePointsWon,
    returnPointsWon,
    totalPointsWon,
    serviceGamesWon,
    returnGamesWon,
    totalGamesWon,
    dfInv,
  ];
  if (numeric.some((v) => !Number.isFinite(v))) {
    return null;
  }

  return {
    serviceOff:
      0.22 * firstServeWon +
      0.24 * secondServeWon +
      0.24 * totalServicePointsWon +
      0.2 * serviceGamesWon +
      0.1 * firstServe,
    returnOff:
      0.24 * firstServeReturnWon +
      0.24 * secondServeReturnWon +
      0.28 * returnPointsWon +
      0.24 * returnGamesWon,
    pressureAttack: 0.55 * breakConverted + 0.25 * returnGamesWon + 0.2 * secondServeReturnWon,
    pressureDefense: 0.5 * breakSaved + 0.25 * serviceGamesWon + 0.25 * dfInv,
    control: 0.6 * totalPointsWon + 0.4 * totalGamesWon,
    discipline: 0.65 * dfInv + 0.35 * firstServe,
  };
}

function weightedMeanPoints(
  points: ComponentPoint[],
  weights: readonly number[],
): Record<ComponentKey, number> {
  const sums = initComponentRecord(0);
  let sumW = 0;
  for (let i = 0; i < points.length && i < weights.length; i += 1) {
    const p = points[i]!;
    const w = weights[i] || 0;
    if (w <= 0) continue;
    sumW += w;
    for (const key of COMPONENT_KEYS) {
      sums[key] += p[key] * w;
    }
  }
  if (sumW <= 0) {
    return initComponentRecord(0);
  }
  const out = initComponentRecord(0);
  for (const key of COMPONENT_KEYS) {
    out[key] = sums[key] / sumW;
  }
  return out;
}

function weightedVarPoints(
  points: ComponentPoint[],
  means: Record<ComponentKey, number>,
  weights: readonly number[],
): Record<ComponentKey, number> {
  const sums = initComponentRecord(0);
  let sumW = 0;
  for (let i = 0; i < points.length && i < weights.length; i += 1) {
    const p = points[i]!;
    const w = weights[i] || 0;
    if (w <= 0) continue;
    sumW += w;
    for (const key of COMPONENT_KEYS) {
      const d = p[key] - means[key];
      sums[key] += d * d * w;
    }
  }
  if (sumW <= 0) {
    return initComponentRecord(0);
  }
  const out = initComponentRecord(0);
  for (const key of COMPONENT_KEYS) {
    out[key] = sums[key] / sumW;
  }
  return out;
}

function initComponentRecord(value: number): Record<ComponentKey, number> {
  return {
    serviceOff: value,
    returnOff: value,
    pressureAttack: value,
    pressureDefense: value,
    control: value,
    discipline: value,
  };
}

function toPercent01(value: number): number {
  if (!Number.isFinite(value)) return Number.NaN;
  return clamp((value as number) / 100, 0, 1);
}

function inverseDoubleFaults(value: number): number {
  if (!Number.isFinite(value)) return Number.NaN;
  return 1 / (1 + Math.max(0, value as number));
}

function clipInteraction(value: number): number {
  return clamp(value, -0.35, 0.35);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
