import { clamp } from "../common/math.js";
import type { DirtFeatureRow } from "./requiredMetrics.js";
import { pickByOddsOrSeed } from "./tieBreak.js";

const SOURCE = "stable14_nova_v1" as const;

interface NovaVector {
  serve: number;
  return: number;
  pressure: number;
  control: number;
}

export interface NovaEdgeResult {
  p1: number;
  p2: number;
  winner?: string;
  source: typeof SOURCE;
  warnings: string[];
}

export interface NovaEdgeOptions {
  homeOdd?: number;
  awayOdd?: number;
  seed: string;
}

const FRESHNESS_WEIGHTS = [5 / 15, 4 / 15, 3 / 15, 2 / 15, 1 / 15];
const POWER_WEIGHTS: NovaVector = {
  serve: 0.34,
  return: 0.28,
  pressure: 0.22,
  control: 0.16,
};
const TREND_WEIGHTS: NovaVector = {
  serve: 0.4,
  return: 0.3,
  pressure: 0.2,
  control: 0.1,
};

export function computeNovaEdge(
  playerAFeatures: DirtFeatureRow[],
  playerBFeatures: DirtFeatureRow[],
  playerAName: string,
  playerBName: string,
  options: NovaEdgeOptions,
): NovaEdgeResult {
  const vectorsA = rowsToVectors(playerAFeatures);
  const vectorsB = rowsToVectors(playerBFeatures);
  if (!vectorsA || !vectorsB) {
    const tieBreak = pickByOddsOrSeed(
      playerAName,
      playerBName,
      options.homeOdd,
      options.awayOdd,
      options.seed,
    );
    return {
      p1: 50,
      p2: 50,
      winner: tieBreak.winner,
      source: SOURCE,
      warnings: ["nova_edge_unavailable"],
    };
  }

  const scoreA = computeRawScore(vectorsA);
  const scoreB = computeRawScore(vectorsB);
  if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) {
    const tieBreak = pickByOddsOrSeed(
      playerAName,
      playerBName,
      options.homeOdd,
      options.awayOdd,
      options.seed,
    );
    return {
      p1: 50,
      p2: 50,
      winner: tieBreak.winner,
      source: SOURCE,
      warnings: ["nova_edge_unavailable"],
    };
  }

  const delta = scoreA - scoreB;
  const p1 = clamp(50 + 50 * Math.tanh(3.2 * delta), 1, 99);
  const p2 = 100 - p1;
  let winner: string | undefined;
  if (p1 > 50) {
    winner = playerAName;
  } else if (p1 < 50) {
    winner = playerBName;
  } else {
    winner = pickByOddsOrSeed(
      playerAName,
      playerBName,
      options.homeOdd,
      options.awayOdd,
      options.seed,
    ).winner;
  }
  return {
    p1,
    p2,
    winner,
    source: SOURCE,
    warnings: [],
  };
}

function rowsToVectors(rows: DirtFeatureRow[]): NovaVector[] | null {
  if (!Array.isArray(rows) || rows.length < 5) {
    return null;
  }
  const top = rows.slice(0, 5);
  const vectors: NovaVector[] = [];
  for (const row of top) {
    const vector = toVector(row);
    if (!vector) {
      return null;
    }
    vectors.push(vector);
  }
  if (vectors.length !== 5) {
    return null;
  }
  return vectors;
}

function toVector(row: DirtFeatureRow): NovaVector | null {
  const firstServe = norm(row.first_serve);
  const firstServeWon = norm(row.first_serve_points_won);
  const secondServeWon = norm(row.second_serve_points_won);
  const servicePointsWon = norm(row.total_service_points_won);
  const serviceGamesWon = norm(row.service_games_won);

  const firstServeReturnWon = norm(row.first_serve_return_points_won);
  const secondServeReturnWon = norm(row.second_serve_return_points_won);
  const returnPointsWon = norm(row.return_points_won);
  const returnGamesWon = norm(row.return_games_won);

  const breakSaved = norm(row.break_points_saved);
  const breakConverted = norm(row.break_points_converted);
  const doubleFaultInv = invCount(row.double_faults);

  const totalPointsWon = norm(row.total_points_won);
  const totalGamesWon = norm(row.total_games_won);

  const numeric = [
    firstServe,
    firstServeWon,
    secondServeWon,
    servicePointsWon,
    serviceGamesWon,
    firstServeReturnWon,
    secondServeReturnWon,
    returnPointsWon,
    returnGamesWon,
    breakSaved,
    breakConverted,
    doubleFaultInv,
    totalPointsWon,
    totalGamesWon,
  ];
  if (numeric.some((value) => !Number.isFinite(value))) {
    return null;
  }

  return {
    serve:
      0.16 * firstServe +
      0.24 * firstServeWon +
      0.2 * secondServeWon +
      0.22 * servicePointsWon +
      0.18 * serviceGamesWon,
    return:
      0.28 * firstServeReturnWon +
      0.28 * secondServeReturnWon +
      0.24 * returnPointsWon +
      0.2 * returnGamesWon,
    pressure: 0.4 * breakSaved + 0.35 * breakConverted + 0.25 * doubleFaultInv,
    control: 0.55 * totalPointsWon + 0.45 * totalGamesWon,
  };
}

function computeRawScore(vectors: NovaVector[]): number {
  const mu = weightedCentroid(vectors);
  const recent = averageVectors(vectors.slice(0, 2));
  const past = averageVectors(vectors.slice(2, 5));
  const trend = subVector(recent, past);
  const dispersion = averageDispersion(vectors, mu);
  const stability = clamp(Math.exp(-3 * dispersion), 0, 1);
  const balance = clamp(1 - std4([mu.serve, mu.return, mu.pressure, mu.control]) / 0.25, 0, 1);
  const power = dot(mu, POWER_WEIGHTS);
  const trendScore = dot(trend, TREND_WEIGHTS);
  return power + 0.3 * trendScore + 0.15 * (stability - 0.5) + 0.1 * (balance - 0.5);
}

function weightedCentroid(vectors: NovaVector[]): NovaVector {
  let serve = 0;
  let ret = 0;
  let pressure = 0;
  let control = 0;
  for (let i = 0; i < 5; i += 1) {
    const v = vectors[i];
    const w = FRESHNESS_WEIGHTS[i];
    serve += v.serve * w;
    ret += v.return * w;
    pressure += v.pressure * w;
    control += v.control * w;
  }
  return { serve, return: ret, pressure, control };
}

function averageVectors(vectors: NovaVector[]): NovaVector {
  const count = vectors.length;
  if (count === 0) {
    return { serve: 0, return: 0, pressure: 0, control: 0 };
  }
  let serve = 0;
  let ret = 0;
  let pressure = 0;
  let control = 0;
  for (const v of vectors) {
    serve += v.serve;
    ret += v.return;
    pressure += v.pressure;
    control += v.control;
  }
  return {
    serve: serve / count,
    return: ret / count,
    pressure: pressure / count,
    control: control / count,
  };
}

function subVector(a: NovaVector, b: NovaVector): NovaVector {
  return {
    serve: a.serve - b.serve,
    return: a.return - b.return,
    pressure: a.pressure - b.pressure,
    control: a.control - b.control,
  };
}

function averageDispersion(vectors: NovaVector[], mu: NovaVector): number {
  let total = 0;
  for (const v of vectors) {
    total +=
      (Math.abs(v.serve - mu.serve) +
        Math.abs(v.return - mu.return) +
        Math.abs(v.pressure - mu.pressure) +
        Math.abs(v.control - mu.control)) /
      4;
  }
  return total / vectors.length;
}

function dot(a: NovaVector, b: NovaVector): number {
  return (
    a.serve * b.serve +
    a.return * b.return +
    a.pressure * b.pressure +
    a.control * b.control
  );
}

function std4(values: number[]): number {
  const mean = (values[0] + values[1] + values[2] + values[3]) / 4;
  const variance =
    ((values[0] - mean) ** 2 +
      (values[1] - mean) ** 2 +
      (values[2] - mean) ** 2 +
      (values[3] - mean) ** 2) /
    4;
  return Math.sqrt(variance);
}

function norm(value: number): number {
  return clamp(value / 100, 0, 1);
}

function invCount(value: number): number {
  return 1 / (1 + Math.max(value, 0));
}
