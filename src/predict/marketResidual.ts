import { clamp } from "../common/math.js";
import type { HistoricalMatchTechStats, MatchStatus, MetricValue, PlayerRecentStats } from "../types.js";
import { metricQuality, metricValueToNumber } from "./metricNormalization.js";
import {
  REQUIRED_DIRT_METRIC_KEYS,
  canonicalDirtMetricKey,
  type DirtFeatureRow,
  type RequiredDirtMetricKey,
} from "./requiredMetrics.js";
import { pickByOddsOrSeed } from "./tieBreak.js";

const SOURCE = "market_residual_oppadj_v1" as const;
const RECENCY_WEIGHTS = [0.34, 0.26, 0.18, 0.13, 0.09] as const;
const COUNT_METRICS = new Set<RequiredDirtMetricKey>(["double_faults"]);
const NEUTRAL_EPS = 1e-9;

type DominanceComponentKey =
  | "serveDom"
  | "returnDom"
  | "controlDom"
  | "pressureBalance"
  | "disciplineDom";

interface DominancePoint {
  serveDom: number;
  returnDom: number;
  controlDom: number;
  pressureBalance: number;
  disciplineDom: number;
  oppQ01: number;
}

interface DominanceProfile {
  validCount: number;
  mean: Record<DominanceComponentKey, number>;
  variance: Record<DominanceComponentKey, number>;
  meanOppQ: number;
  varOppQ: number;
  profileStability: number;
}

interface MarketPrior {
  available: boolean;
  marketP1: number;
  marketLogit: number;
  marketRel: number;
}

export interface MarketResidualShadowInput {
  playerAStats: PlayerRecentStats;
  playerBStats: PlayerRecentStats;
  playerAName: string;
  playerBName: string;
  requestedPerPlayer: number;
  homeOdd?: number;
  awayOdd?: number;
  tournament?: string;
  status?: MatchStatus;
  seed: string;
}

export interface MarketResidualShadowResult {
  p1: number;
  p2: number;
  winner?: string;
  source: typeof SOURCE;
  components?: {
    marketP1?: number;
    marketRel: number;
    residualScoreR: number;
    residualAdjRaw: number;
    gate: number;
    residRel: number;
    statsCoverage: number;
    stabilityConf: number;
    edgeCoherence: number;
    marketStrength?: number;
    marketStatsDisagreement?: number;
    serveEdge?: number;
    returnEdge?: number;
    controlEdge?: number;
    pressureEdge?: number;
    oppQualityEdge?: number;
  };
  warnings: string[];
}

type FeaturePair = { player: DirtFeatureRow; opponent: DirtFeatureRow };

export function computeMarketResidualShadow(
  input: MarketResidualShadowInput,
): MarketResidualShadowResult {
  const warnings: string[] = [];
  const need = Math.max(1, input.requestedPerPlayer || 1);
  const profileA = buildDominanceProfile(input.playerAStats.parsedMatches);
  const profileB = buildDominanceProfile(input.playerBStats.parsedMatches);

  const validA = profileA?.validCount || 0;
  const validB = profileB?.validCount || 0;
  const statsCoverage = clamp(Math.min(validA, validB) / need, 0, 1);
  if (Math.min(validA, validB) < need) {
    warnings.push("mroa_low_pair_coverage");
  }

  const market = buildMarketPrior(input.homeOdd, input.awayOdd);
  if (!market.available) {
    warnings.push("mroa_market_unavailable");
  }

  if (!profileA || !profileB) {
    warnings.push("mroa_stats_unavailable");
    return neutralOrMarketResult(input, warnings, market, 0, statsCoverage);
  }

  const serveEdge = profileA.mean.serveDom - profileB.mean.serveDom;
  const returnEdge = profileA.mean.returnDom - profileB.mean.returnDom;
  const controlEdge = profileA.mean.controlDom - profileB.mean.controlDom;
  const pressureEdge = profileA.mean.pressureBalance - profileB.mean.pressureBalance;
  const disciplineEdge = profileA.mean.disciplineDom - profileB.mean.disciplineDom;
  const stabilityEdge = clamp(profileA.profileStability - profileB.profileStability, -1, 1);
  const oppQualityEdge = profileA.meanOppQ - profileB.meanOppQ;

  const serveEdgeN = normalizePercentEdge(serveEdge);
  const returnEdgeN = normalizePercentEdge(returnEdge);
  const controlEdgeN = normalizePercentEdge(controlEdge);
  const pressureEdgeN = normalizePercentEdge(pressureEdge);
  const disciplineEdgeN = clamp(disciplineEdge / 2.5, -1.5, 1.5);
  const oppQualityEdgeN = clamp(oppQualityEdge / 0.25, -1.5, 1.5);

  const rStats =
    0.24 * serveEdgeN +
    0.24 * returnEdgeN +
    0.2 * controlEdgeN +
    0.12 * pressureEdgeN +
    0.06 * disciplineEdgeN +
    0.07 * oppQualityEdgeN +
    0.07 * stabilityEdge;
  const consistencySynergy = clamp(controlEdgeN * stabilityEdge, -0.35, 0.35);
  const twoWayEdge = clamp((serveEdgeN + returnEdgeN) / 2, -1, 1);
  const residualScoreR = rStats + 0.05 * consistencySynergy + 0.05 * twoWayEdge;
  const residualAdjRaw = 1.15 * Math.tanh(0.95 * residualScoreR);

  const stabilityConf = clamp((profileA.profileStability + profileB.profileStability) / 2, 0, 1);
  const edgeCoherence = clamp(
    1 - (Math.abs(serveEdgeN - returnEdgeN) + Math.abs(controlEdgeN - pressureEdgeN)) / 2.4,
    0,
    1,
  );
  const opponentQualityConfidence = clamp(
    1 - Math.abs(profileA.varOppQ - profileB.varOppQ) / 0.12,
    0,
    1,
  );
  const residRel = clamp(
    0.2 +
      0.3 * statsCoverage +
      0.2 * stabilityConf +
      0.2 * edgeCoherence +
      0.1 * opponentQualityConfidence,
    0.2,
    0.82,
  );

  let gate = residRel;
  let posteriorLogit: number;
  let marketStrength: number | undefined;
  let marketStatsDisagreement: number | undefined;

  if (market.available) {
    marketStrength = clamp(Math.abs(market.marketP1 - 50) / 30, 0, 1);
    const statsPosteriorNoGate = sigmoid(market.marketLogit + residualAdjRaw) * 100;
    marketStatsDisagreement = clamp(Math.abs(statsPosteriorNoGate - market.marketP1) / 35, 0, 1);
    gate = clamp(
      0.25 +
        0.45 * residRel +
        0.2 * (1 - marketStrength) +
        0.1 * (1 - marketStatsDisagreement),
      0.2,
      0.9,
    );
    posteriorLogit = market.marketLogit + gate * residualAdjRaw;
    if (marketStatsDisagreement > 0.75) {
      warnings.push("mroa_high_market_stats_conflict");
    }
  } else {
    posteriorLogit = residualAdjRaw * residRel;
  }

  const p1Raw = clamp(sigmoid(posteriorLogit) * 100, 0, 100);
  const p2Raw = 100 - p1Raw;
  const p1 = round1(p1Raw);
  const p2 = round1(p2Raw);

  let winner: string;
  if (p1Raw > 50 + NEUTRAL_EPS) {
    winner = input.playerAName;
  } else if (p1Raw < 50 - NEUTRAL_EPS) {
    winner = input.playerBName;
  } else {
    warnings.push("mroa_neutral_tiebreak");
    winner = pickByOddsOrSeed(
      input.playerAName,
      input.playerBName,
      input.homeOdd,
      input.awayOdd,
      `${input.seed}|mroa`,
    ).winner;
  }

  return {
    p1,
    p2,
    winner,
    source: SOURCE,
    components: {
      ...(market.available ? { marketP1: round3(market.marketP1) } : {}),
      marketRel: round3(market.marketRel),
      residualScoreR: round3(residualScoreR),
      residualAdjRaw: round3(residualAdjRaw),
      gate: round3(gate),
      residRel: round3(residRel),
      statsCoverage: round3(statsCoverage),
      stabilityConf: round3(stabilityConf),
      edgeCoherence: round3(edgeCoherence),
      ...(typeof marketStrength === "number" ? { marketStrength: round3(marketStrength) } : {}),
      ...(typeof marketStatsDisagreement === "number"
        ? { marketStatsDisagreement: round3(marketStatsDisagreement) }
        : {}),
      serveEdge: round3(serveEdge),
      returnEdge: round3(returnEdge),
      controlEdge: round3(controlEdge),
      pressureEdge: round3(pressureEdge),
      oppQualityEdge: round3(oppQualityEdge),
    },
    warnings,
  };
}

function neutralOrMarketResult(
  input: MarketResidualShadowInput,
  warnings: string[],
  market: MarketPrior,
  residRel: number,
  statsCoverage: number,
): MarketResidualShadowResult {
  const localWarnings = [...warnings];
  let p1Raw = market.available ? market.marketP1 : 50;
  let gate = 0;
  let winner: string;
  if (Math.abs(p1Raw - 50) <= NEUTRAL_EPS) {
    localWarnings.push("mroa_neutral_tiebreak");
    winner = pickByOddsOrSeed(
      input.playerAName,
      input.playerBName,
      input.homeOdd,
      input.awayOdd,
      `${input.seed}|mroa`,
    ).winner;
  } else {
    winner = p1Raw > 50 ? input.playerAName : input.playerBName;
  }
  return {
    p1: round1(p1Raw),
    p2: round1(100 - p1Raw),
    winner,
    source: SOURCE,
    components: {
      ...(market.available ? { marketP1: round3(market.marketP1) } : {}),
      marketRel: round3(market.marketRel),
      residualScoreR: 0,
      residualAdjRaw: 0,
      gate: round3(gate),
      residRel: round3(residRel),
      statsCoverage: round3(statsCoverage),
      stabilityConf: 0,
      edgeCoherence: 0,
      ...(market.available ? { marketStrength: round3(clamp(Math.abs(market.marketP1 - 50) / 30, 0, 1)) } : {}),
      serveEdge: 0,
      returnEdge: 0,
      controlEdge: 0,
      pressureEdge: 0,
      oppQualityEdge: 0,
    },
    warnings: localWarnings,
  };
}

function buildMarketPrior(homeOdd?: number, awayOdd?: number): MarketPrior {
  if (!isValidOdd(homeOdd) || !isValidOdd(awayOdd)) {
    return {
      available: false,
      marketP1: 50,
      marketLogit: 0,
      marketRel: 0,
    };
  }
  const ih = 1 / homeOdd;
  const ia = 1 / awayOdd;
  const sumI = ih + ia;
  if (!Number.isFinite(sumI) || sumI <= 0) {
    return {
      available: false,
      marketP1: 50,
      marketLogit: 0,
      marketRel: 0,
    };
  }
  const marketP1 = clamp((100 * ih) / sumI, 0, 100);
  const marketRel = clamp(1 - Math.abs(sumI - 1.06) / 0.18, 0.35, 1);
  return {
    available: true,
    marketP1,
    marketLogit: logit(clamp(marketP1 / 100, 0.02, 0.98)),
    marketRel,
  };
}

function buildDominanceProfile(matches: HistoricalMatchTechStats[]): DominanceProfile | undefined {
  const points: DominancePoint[] = [];
  for (const match of matches.slice(0, 5)) {
    const pair = extractDirtFeaturePair(match);
    if (!pair) {
      continue;
    }
    const point = pairToDominancePoint(pair);
    if (point) {
      points.push(point);
    }
  }
  if (points.length === 0) {
    return undefined;
  }

  const baseWeights = RECENCY_WEIGHTS.slice(0, points.length);
  const rawWeights = points.map(
    (point, index) => (baseWeights[index] || 0) * (0.85 + 0.3 * clamp(point.oppQ01, 0, 1)),
  );
  const normWeights = normalizeWeights(rawWeights);
  if (normWeights.length !== points.length) {
    return undefined;
  }

  const mean = {
    serveDom: weightedMean(points, normWeights, "serveDom"),
    returnDom: weightedMean(points, normWeights, "returnDom"),
    controlDom: weightedMean(points, normWeights, "controlDom"),
    pressureBalance: weightedMean(points, normWeights, "pressureBalance"),
    disciplineDom: weightedMean(points, normWeights, "disciplineDom"),
  } satisfies Record<DominanceComponentKey, number>;

  const variance = {
    serveDom: weightedVariance(points, normWeights, "serveDom", mean.serveDom),
    returnDom: weightedVariance(points, normWeights, "returnDom", mean.returnDom),
    controlDom: weightedVariance(points, normWeights, "controlDom", mean.controlDom),
    pressureBalance: weightedVariance(points, normWeights, "pressureBalance", mean.pressureBalance),
    disciplineDom: weightedVariance(points, normWeights, "disciplineDom", mean.disciplineDom),
  } satisfies Record<DominanceComponentKey, number>;

  const meanOppQ = weightedMean(points, normWeights, "oppQ01");
  const varOppQ = weightedVariance(points, normWeights, "oppQ01", meanOppQ);
  const componentDispersion =
    (variance.serveDom +
      variance.returnDom +
      variance.controlDom +
      variance.pressureBalance +
      variance.disciplineDom / 2) /
    5;
  const profileStability = clamp(Math.exp(-componentDispersion / 18), 0, 1);

  return {
    validCount: points.length,
    mean,
    variance,
    meanOppQ,
    varOppQ,
    profileStability,
  };
}

function extractDirtFeaturePair(match: HistoricalMatchTechStats): FeaturePair | null {
  const playerOut: Partial<DirtFeatureRow> = { matchUrl: match.matchUrl };
  const oppOut: Partial<DirtFeatureRow> = { matchUrl: match.matchUrl };
  const playerQuality = new Map<RequiredDirtMetricKey, number>();
  const oppQuality = new Map<RequiredDirtMetricKey, number>();

  for (const row of match.rows) {
    const key = canonicalDirtMetricKey(row.metricKey, row.metricLabel);
    if (!key) {
      continue;
    }
    const playerNumeric = metricToNumber(row.playerValue, key);
    if (typeof playerNumeric === "number" && Number.isFinite(playerNumeric)) {
      const quality = metricQuality(row.playerValue);
      if (quality > (playerQuality.get(key) ?? -1)) {
        (playerOut as Record<string, number>)[key] = playerNumeric;
        playerQuality.set(key, quality);
      }
    }

    const opponentNumeric = metricToNumber(row.opponentValue, key);
    if (typeof opponentNumeric === "number" && Number.isFinite(opponentNumeric)) {
      const quality = metricQuality(row.opponentValue);
      if (quality > (oppQuality.get(key) ?? -1)) {
        (oppOut as Record<string, number>)[key] = opponentNumeric;
        oppQuality.set(key, quality);
      }
    }
  }

  for (const key of REQUIRED_DIRT_METRIC_KEYS) {
    const pv = (playerOut as Record<string, number | undefined>)[key];
    const ov = (oppOut as Record<string, number | undefined>)[key];
    if (!Number.isFinite(pv) || !Number.isFinite(ov)) {
      return null;
    }
  }

  return {
    player: playerOut as DirtFeatureRow,
    opponent: oppOut as DirtFeatureRow,
  };
}

function pairToDominancePoint(pair: FeaturePair): DominancePoint | null {
  const player = pair.player;
  const opponent = pair.opponent;
  const delta = (key: RequiredDirtMetricKey): number => {
    const pv = player[key];
    const ov = opponent[key];
    if (!Number.isFinite(pv) || !Number.isFinite(ov)) {
      return 0;
    }
    let value = pv - ov;
    if (key === "double_faults") {
      value *= -1;
    }
    return value;
  };

  const serveDom =
    0.2 * delta("first_serve_points_won") +
    0.22 * delta("second_serve_points_won") +
    0.24 * delta("total_service_points_won") +
    0.22 * delta("service_games_won") +
    0.12 * delta("break_points_saved");

  const returnDom =
    0.2 * delta("first_serve_return_points_won") +
    0.22 * delta("second_serve_return_points_won") +
    0.28 * delta("return_points_won") +
    0.2 * delta("return_games_won") +
    0.1 * delta("break_points_converted");

  const controlDom = 0.6 * delta("total_points_won") + 0.4 * delta("total_games_won");
  const pressureBalance =
    0.5 * delta("break_points_converted") +
    0.35 * delta("break_points_saved") +
    0.15 * delta("return_games_won");
  const disciplineDom = 0.75 * delta("double_faults") + 0.25 * delta("first_serve");

  const oppQ =
    0.35 * opponent.total_points_won +
    0.2 * opponent.return_points_won +
    0.2 * opponent.total_games_won +
    0.15 * opponent.service_games_won +
    0.1 * opponent.return_games_won;
  const oppQ01 = clamp((oppQ - 35) / 30, 0, 1);

  return {
    serveDom,
    returnDom,
    controlDom,
    pressureBalance,
    disciplineDom,
    oppQ01,
  };
}

function metricToNumber(value: MetricValue, key: RequiredDirtMetricKey): number | undefined {
  return metricValueToNumber(value, {
    isCountMetric: COUNT_METRICS.has(key),
    smoothRatio: true,
  });
}

function normalizeWeights(weights: number[]): number[] {
  const clean = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 0));
  const sum = clean.reduce((acc, value) => acc + value, 0);
  if (sum <= 0) {
    return [];
  }
  return clean.map((weight) => weight / sum);
}

function weightedMean<T extends object>(
  rows: T[],
  weights: number[],
  key: keyof T,
): number {
  let sum = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const value = rows[i] ? ((rows[i] as Record<PropertyKey, unknown>)[key as PropertyKey] as unknown) : undefined;
    const weight = weights[i] || 0;
    if (typeof value === "number" && Number.isFinite(value) && weight > 0) {
      sum += value * weight;
    }
  }
  return sum;
}

function weightedVariance<T extends object>(
  rows: T[],
  weights: number[],
  key: keyof T,
  mean: number,
): number {
  let sum = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const value = rows[i] ? ((rows[i] as Record<PropertyKey, unknown>)[key as PropertyKey] as unknown) : undefined;
    const weight = weights[i] || 0;
    if (typeof value === "number" && Number.isFinite(value) && weight > 0) {
      const diff = value - mean;
      sum += weight * diff * diff;
    }
  }
  return sum;
}

function normalizePercentEdge(value: number): number {
  return clamp(value / 12, -1.5, 1.5);
}

function isValidOdd(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 1.01;
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

function logit(probability01: number): number {
  const p = clamp(probability01, 1e-9, 1 - 1e-9);
  return Math.log(p / (1 - p));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
