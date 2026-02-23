import { clamp, ratio } from "../common/math.js";
import { calibrateModelWeights, type DirtModelWeights } from "./dirtStyle.js";
import type { DirtFeatureRow } from "./requiredMetrics.js";

type DirtNumericKey = Exclude<keyof DirtFeatureRow, "matchUrl">;

export const DIRT_PAIR_STABLE14_METRICS: DirtNumericKey[] = [
  "first_serve",
  "first_serve_points_won",
  "second_serve_points_won",
  "break_points_saved",
  "double_faults",
  "first_serve_return_points_won",
  "second_serve_return_points_won",
  "break_points_converted",
  "total_service_points_won",
  "return_points_won",
  "total_points_won",
  "service_games_won",
  "return_games_won",
  "total_games_won",
];

const COMPARISON_METRICS: DirtNumericKey[] = DIRT_PAIR_STABLE14_METRICS;
export const DIRT_PAIR_PCA_FEATURES: DirtNumericKey[] = DIRT_PAIR_STABLE14_METRICS;
const PCA_FEATURES: DirtNumericKey[] = DIRT_PAIR_PCA_FEATURES;

export const DIRT_PAIR_INVERTED_METRICS = new Set<DirtNumericKey>(["double_faults"]);
const INVERTED_METRICS = DIRT_PAIR_INVERTED_METRICS;

const BASE_MODEL_WEIGHTS: DirtModelWeights = {
  logReg: 0.32,
  markov: 0.28,
  bradley: 0.2,
  pca: 0.2,
};

const PCA_SHRINKAGE_LAMBDA = 0.18;
const PCA_SOFT_CAP_MIN = 3;
const PCA_SOFT_CAP_MAX = 97;

export interface DirtPair {
  index: number;
  home: DirtFeatureRow;
  away: DirtFeatureRow;
}

export interface DirtPairModelOutput {
  index: number;
  matchAUrl: string;
  matchBUrl: string;
  logRegP1?: number;
  markovP1?: number;
  bradleyP1?: number;
  pcaP1?: number;
}

export interface DirtPairAggregateResult {
  requestedPairs: number;
  validPairs: number;
  pairOutputs: DirtPairModelOutput[];
  modelProbabilities: {
    logRegP1?: number;
    markovP1?: number;
    bradleyP1?: number;
    pcaP1?: number;
    finalP1: number;
  };
  validPairOutputs: {
    logReg: number;
    markov: number;
    bradley: number;
    pca: number;
  };
  reliabilities: DirtModelWeights;
  stability: {
    logReg?: number;
    markov?: number;
    bradley?: number;
    pca?: number;
  };
  weights: DirtModelWeights;
  warnings: string[];
}

interface ComparisonScore {
  winsA: number;
  winsB: number;
  compared: number;
}

interface PcaOutcome {
  probability?: number;
  stability?: number;
  tau?: number;
}

export function buildIndexPairs(
  homeRows: DirtFeatureRow[],
  awayRows: DirtFeatureRow[],
  requestedPairs = 5,
): DirtPair[] {
  const out: DirtPair[] = [];
  const count = Math.min(requestedPairs, homeRows.length, awayRows.length);
  for (let index = 0; index < count; index += 1) {
    const home = homeRows[index];
    const away = awayRows[index];
    if (!home || !away) {
      continue;
    }
    out.push({ index, home, away });
  }
  return out;
}

export function aggregateIndexPairs(
  homeRows: DirtFeatureRow[],
  awayRows: DirtFeatureRow[],
  requestedPairs = 5,
): DirtPairAggregateResult {
  const warnings: string[] = [];
  const pairs = buildIndexPairs(homeRows, awayRows, requestedPairs);
  const pairOutputs = pairs.map((pair) => computePairModelOutput(pair));

  const logRegSeries = pairOutputs
    .map((pair) => pair.logRegP1)
    .filter((value): value is number => Number.isFinite(value));
  const markovSeries = pairOutputs
    .map((pair) => pair.markovP1)
    .filter((value): value is number => Number.isFinite(value));
  const bradleySeries = pairOutputs
    .map((pair) => pair.bradleyP1)
    .filter((value): value is number => Number.isFinite(value));
  const pcaOutcome = historyPcaProbability(
    homeRows.slice(0, pairs.length),
    awayRows.slice(0, pairs.length),
  );
  const pcaP1 = pcaOutcome.probability;

  const modelProbabilities = {
    logRegP1: safeAverage(logRegSeries),
    markovP1: safeAverage(markovSeries),
    bradleyP1: safeAverage(bradleySeries),
    pcaP1,
    finalP1: 50,
  };

  const validPairOutputs = {
    logReg: logRegSeries.length,
    markov: markovSeries.length,
    bradley: bradleySeries.length,
    pca: Number.isFinite(pcaP1) ? requestedPairs : 0,
  };

  const stability = {
    logReg: modelStability(logRegSeries),
    markov: modelStability(markovSeries),
    bradley: modelStability(bradleySeries),
    pca: Number.isFinite(pcaP1) ? pcaOutcome.stability : undefined,
  };

  const reliabilities: DirtModelWeights = {
    logReg:
      ratio(validPairOutputs.logReg, requestedPairs) * (stability.logReg ?? 0),
    markov:
      ratio(validPairOutputs.markov, requestedPairs) * (stability.markov ?? 0),
    bradley:
      ratio(validPairOutputs.bradley, requestedPairs) * (stability.bradley ?? 0),
    pca:
      ratio(validPairOutputs.pca, requestedPairs) * (stability.pca ?? 0),
  };

  const weights = calibrateModelWeights(BASE_MODEL_WEIGHTS, reliabilities, {
    logReg: modelProbabilities.logRegP1,
    markov: modelProbabilities.markovP1,
    bradley: modelProbabilities.bradleyP1,
    pca: modelProbabilities.pcaP1,
  });

  modelProbabilities.finalP1 = weightedProbability(
    {
      logReg: modelProbabilities.logRegP1,
      markov: modelProbabilities.markovP1,
      bradley: modelProbabilities.bradleyP1,
      pca: modelProbabilities.pcaP1,
    },
    weights,
  );

  if (
    !Number.isFinite(modelProbabilities.logRegP1) &&
    !Number.isFinite(modelProbabilities.markovP1) &&
    !Number.isFinite(modelProbabilities.bradleyP1) &&
    !Number.isFinite(modelProbabilities.pcaP1)
  ) {
    warnings.push("all_models_unavailable");
  }

  if (pairs.length < requestedPairs) {
    warnings.push(`valid_pairs=${pairs.length}/${requestedPairs}`);
  }

  return {
    requestedPairs,
    validPairs: pairs.length,
    pairOutputs,
    modelProbabilities,
    validPairOutputs,
    reliabilities,
    stability,
    weights,
    warnings,
  };
}

export function computePairModelOutput(pair: DirtPair): DirtPairModelOutput {
  const comparison = comparisonScore(pair.home, pair.away);
  const output: DirtPairModelOutput = {
    index: pair.index,
    matchAUrl: pair.home.matchUrl,
    matchBUrl: pair.away.matchUrl,
    logRegP1: logisticProbability(pair.home, pair.away),
    markovP1: markovProbability(pair.home, pair.away, comparison),
    bradleyP1: bradleyProbability(comparison),
  };
  return output;
}

function logisticProbability(home: DirtFeatureRow, away: DirtFeatureRow): number | undefined {
  let sumHome = 0;
  let sumAway = 0;
  let count = 0;

  for (const key of COMPARISON_METRICS) {
    const h = home[key];
    const a = away[key];
    if (!Number.isFinite(h) || !Number.isFinite(a) || h < 0 || a < 0) {
      continue;
    }
    if (INVERTED_METRICS.has(key)) {
      sumHome += 1 / (1 + Math.max(h, 0));
      sumAway += 1 / (1 + Math.max(a, 0));
    } else {
      sumHome += clamp(h, 0, 100) / 100;
      sumAway += clamp(a, 0, 100) / 100;
    }
    count += 1;
  }

  if (count === 0) {
    return undefined;
  }
  return clamp(sigmoid(((sumHome / count) - (sumAway / count)) * 5) * 100, 0, 100);
}

function comparisonScore(home: DirtFeatureRow, away: DirtFeatureRow): ComparisonScore {
  let winsA = 0;
  let winsB = 0;
  let compared = 0;

  for (const key of COMPARISON_METRICS) {
    const h = home[key];
    const a = away[key];
    if (!Number.isFinite(h) || !Number.isFinite(a)) {
      continue;
    }
    compared += 1;

    if (INVERTED_METRICS.has(key)) {
      if (h < a) {
        winsA += 1;
      } else if (a < h) {
        winsB += 1;
      } else {
        winsA += 0.5;
        winsB += 0.5;
      }
      continue;
    }

    if (h > a) {
      winsA += 1;
    } else if (a > h) {
      winsB += 1;
    } else {
      winsA += 0.5;
      winsB += 0.5;
    }
  }

  return { winsA, winsB, compared };
}

function markovProbability(
  home: DirtFeatureRow,
  away: DirtFeatureRow,
  comparison: ComparisonScore,
): number | undefined {
  const serve1 = normalizeProbability(home.first_serve_points_won, 0.6);
  const serve2 = normalizeProbability(away.first_serve_points_won, 0.6);
  const ret1 = normalizeProbability(home.first_serve_return_points_won, 0.4);
  const ret2 = normalizeProbability(away.first_serve_return_points_won, 0.4);

  const matrix: number[][] = [
    [0, 0, ret2, 1 - ret2],
    [0, 0, ret2, 1 - ret2],
    [ret1, 1 - ret1, 0, 0],
    [ret1, 1 - ret1, 0, 0],
  ];

  let state = [0.5 * serve1, 0.5 * (1 - serve1), 0.5 * serve2, 0.5 * (1 - serve2)];
  for (let step = 0; step < 20; step += 1) {
    const next = [0, 0, 0, 0];
    for (let i = 0; i < 4; i += 1) {
      for (let j = 0; j < 4; j += 1) {
        next[i]! += state[j]! * matrix[j]![i]!;
      }
    }
    state = next;
  }

  const markovRawHome = state[0]! + state[3]!;
  const markovRawAway = state[1]! + state[2]!;
  const markovP1 = markovRawHome + markovRawAway > 0
    ? (markovRawHome / (markovRawHome + markovRawAway)) * 100
    : 50;

  const scoreP1 =
    comparison.winsA + comparison.winsB > 0
      ? (comparison.winsA / (comparison.winsA + comparison.winsB)) * 100
      : 50;
  return clamp(markovP1 * 0.8 + scoreP1 * 0.2, 0, 100);
}

function bradleyProbability(comparison: ComparisonScore): number | undefined {
  const den = comparison.winsA + comparison.winsB;
  if (den <= 0) {
    return undefined;
  }
  return clamp((comparison.winsA / den) * 100, 0, 100);
}

function historyPcaProbability(
  homeRows: DirtFeatureRow[],
  awayRows: DirtFeatureRow[],
): PcaOutcome {
  if (homeRows.length === 0 || awayRows.length === 0) {
    return {};
  }

  const samples = [...homeRows, ...awayRows];
  const m = PCA_FEATURES.length;
  const n = samples.length;
  if (n < 2) {
    return {};
  }

  const x = samples.map((sample) => PCA_FEATURES.map((key) => sample[key]));
  for (const row of x) {
    if (row.some((value) => !Number.isFinite(value))) {
      return {};
    }
  }

  const means = new Array<number>(m).fill(0);
  const sds = new Array<number>(m).fill(1);
  for (let i = 0; i < m; i += 1) {
    const values = x.map((row) => row[i]!);
    means[i] = average(values);
    sds[i] = sampleSd(values);
    if (!Number.isFinite(sds[i]) || sds[i]! <= 0) {
      sds[i] = 1;
    }
  }

  const z = x.map((row) => row.map((value, idx) => (value - means[idx]!) / sds[idx]!));
  const cov = covarianceMatrix(z, m, n, PCA_SHRINKAGE_LAMBDA);
  const pc1 = firstEigenvector(cov, m);
  if (!pc1) {
    return {};
  }

  const meanHome = meanVector(z.slice(0, homeRows.length), m);
  const meanAway = meanVector(z.slice(homeRows.length), m);
  const s1 = dot(pc1, meanHome);
  const s2 = dot(pc1, meanAway);
  const tau = clamp(Math.sqrt(n / 20), 0.45, 1);
  const rawProbability = sigmoid((s1 - s2) * 1.5 * tau) * 100;
  return {
    probability: clamp(rawProbability, PCA_SOFT_CAP_MIN, PCA_SOFT_CAP_MAX),
    stability: clamp(tau * (1 - PCA_SHRINKAGE_LAMBDA / 2), 0.25, 1),
    tau,
  };
}

function weightedProbability(
  probabilities: {
    logReg?: number;
    markov?: number;
    bradley?: number;
    pca?: number;
  },
  weights: DirtModelWeights,
): number {
  const slots: Array<{ p?: number; w: number }> = [
    { p: probabilities.logReg, w: weights.logReg },
    { p: probabilities.markov, w: weights.markov },
    { p: probabilities.bradley, w: weights.bradley },
    { p: probabilities.pca, w: weights.pca },
  ];
  let sum = 0;
  let total = 0;
  for (const slot of slots) {
    if (!Number.isFinite(slot.p) || slot.w <= 0) {
      continue;
    }
    sum += (slot.p as number) * slot.w;
    total += slot.w;
  }
  if (total <= 0) {
    return 50;
  }
  return clamp(sum / total, 0, 100);
}

function covarianceMatrix(
  z: number[][],
  m: number,
  n: number,
  shrinkageLambda: number,
): number[][] {
  const den = Math.max(1, n - 1);
  const cov = new Array<number[]>(m);
  for (let i = 0; i < m; i += 1) {
    cov[i] = new Array<number>(m).fill(0);
  }
  for (let i = 0; i < m; i += 1) {
    for (let j = 0; j < m; j += 1) {
      let sum = 0;
      for (let row = 0; row < n; row += 1) {
        sum += z[row]![i]! * z[row]![j]!;
      }
      cov[i]![j] = sum / den;
    }
  }
  const lambda = clamp(shrinkageLambda, 0, 1);
  if (lambda > 0) {
    for (let i = 0; i < m; i += 1) {
      for (let j = 0; j < m; j += 1) {
        const diagonal = i === j ? 1 : 0;
        cov[i]![j] = (1 - lambda) * cov[i]![j]! + lambda * diagonal;
      }
    }
  }
  return cov;
}

function firstEigenvector(cov: number[][], n: number): number[] | undefined {
  let vector = new Array<number>(n).fill(1 / Math.sqrt(n));
  for (let step = 0; step < 30; step += 1) {
    const next = multiplyMatrixVector(cov, vector);
    const norm = vectorNorm(next);
    if (!Number.isFinite(norm) || norm <= 0) {
      return undefined;
    }
    vector = next.map((value) => value / norm);
  }
  if ((vector[0] || 0) < 0) {
    vector = vector.map((value) => -value);
  }
  return vector;
}

function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
  const out = new Array<number>(vector.length).fill(0);
  for (let i = 0; i < matrix.length; i += 1) {
    let sum = 0;
    for (let j = 0; j < vector.length; j += 1) {
      sum += matrix[i]![j]! * vector[j]!;
    }
    out[i] = sum;
  }
  return out;
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    sum += a[i]! * b[i]!;
  }
  return sum;
}

function meanVector(rows: number[][], width: number): number[] {
  if (rows.length === 0) {
    return new Array<number>(width).fill(0);
  }
  const out = new Array<number>(width).fill(0);
  for (const row of rows) {
    for (let index = 0; index < width; index += 1) {
      out[index]! += row[index]!;
    }
  }
  return out.map((value) => value / rows.length);
}

function modelStability(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  return clamp(1 - sampleSd(values) / 20, 0.25, 1);
}

function normalizeProbability(value: number, fallbackValue: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallbackValue;
  }
  const normalized = value > 1 ? value / 100 : value;
  return clamp(normalized, 0, 1);
}

function safeAverage(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  return average(values);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
}

function sampleSd(values: number[]): number {
  if (values.length < 2) {
    return 1;
  }
  const mean = average(values);
  let sumSq = 0;
  for (const value of values) {
    const diff = value - mean;
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / (values.length - 1));
}

function vectorNorm(values: number[]): number {
  let sumSq = 0;
  for (const value of values) {
    sumSq += value * value;
  }
  return Math.sqrt(sumSq);
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}
