import { clamp, ratio } from "../common/math.js";
import type { DirtFeatureRow } from "../predict/requiredMetrics.js";

type DirtNumericKey = Exclude<keyof DirtFeatureRow, "matchUrl">;

const STABLE14: DirtNumericKey[] = [
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

const INVERTED = new Set<DirtNumericKey>(["double_faults"]);
const BASE_WEIGHTS = {
  logReg: 0.32,
  markov: 0.28,
  bradley: 0.2,
  pca: 0.2,
} as const;

const PCA_SHRINKAGE_LAMBDA = 0.18;
const PCA_SOFT_CAP_MIN = 3;
const PCA_SOFT_CAP_MAX = 97;

export interface OraclePairModelOutput {
  index: number;
  matchAUrl: string;
  matchBUrl: string;
  logRegP1?: number;
  markovP1?: number;
  bradleyP1?: number;
  pcaP1?: number;
}

export interface OracleAggregateResult {
  requestedPairs: number;
  validPairs: number;
  pairOutputs: OraclePairModelOutput[];
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
  reliabilities: {
    logReg: number;
    markov: number;
    bradley: number;
    pca: number;
  };
  weights: {
    logReg: number;
    markov: number;
    bradley: number;
    pca: number;
  };
  warnings: string[];
}

interface ComparisonScore {
  winsA: number;
  winsB: number;
}

interface PcaOutcome {
  probability?: number;
  stability?: number;
}

interface PairInput {
  index: number;
  home: DirtFeatureRow;
  away: DirtFeatureRow;
}

export function oracleComputePairModelOutput(pair: PairInput): OraclePairModelOutput {
  const comparison = comparisonScore(pair.home, pair.away);
  return {
    index: pair.index,
    matchAUrl: pair.home.matchUrl,
    matchBUrl: pair.away.matchUrl,
    logRegP1: logRegProbability(pair.home, pair.away),
    markovP1: markovProbability(pair.home, pair.away, comparison),
    bradleyP1: bradleyProbability(comparison),
  };
}

export function oracleAggregateIndexPairs(
  homeRows: DirtFeatureRow[],
  awayRows: DirtFeatureRow[],
  requestedPairs = 5,
): OracleAggregateResult {
  const pairCount = Math.min(requestedPairs, homeRows.length, awayRows.length);
  const pairOutputs: OraclePairModelOutput[] = [];
  for (let index = 0; index < pairCount; index += 1) {
    const home = homeRows[index];
    const away = awayRows[index];
    if (!home || !away) {
      continue;
    }
    pairOutputs.push(oracleComputePairModelOutput({ index, home, away }));
  }

  const logRegSeries = pickSeries(pairOutputs, "logRegP1");
  const markovSeries = pickSeries(pairOutputs, "markovP1");
  const bradleySeries = pickSeries(pairOutputs, "bradleyP1");
  const pcaOutcome = historyPcaProbability(
    homeRows.slice(0, pairOutputs.length),
    awayRows.slice(0, pairOutputs.length),
  );
  const pcaP1 = pcaOutcome.probability;

  const modelProbabilities = {
    logRegP1: averageOrUndefined(logRegSeries),
    markovP1: averageOrUndefined(markovSeries),
    bradleyP1: averageOrUndefined(bradleySeries),
    pcaP1,
    finalP1: 50,
  };
  const validPairOutputs = {
    logReg: logRegSeries.length,
    markov: markovSeries.length,
    bradley: bradleySeries.length,
    pca: Number.isFinite(pcaP1) ? requestedPairs : 0,
  };
  const reliabilities = {
    logReg:
      ratio(validPairOutputs.logReg, requestedPairs) * (modelStability(logRegSeries) ?? 0),
    markov:
      ratio(validPairOutputs.markov, requestedPairs) * (modelStability(markovSeries) ?? 0),
    bradley:
      ratio(validPairOutputs.bradley, requestedPairs) * (modelStability(bradleySeries) ?? 0),
    pca:
      ratio(validPairOutputs.pca, requestedPairs) * (pcaOutcome.stability ?? 0),
  };
  const weights = calibrateWeights(modelProbabilities, reliabilities);
  modelProbabilities.finalP1 = weightedProbability(modelProbabilities, weights);

  const warnings: string[] = [];
  if (
    !Number.isFinite(modelProbabilities.logRegP1) &&
    !Number.isFinite(modelProbabilities.markovP1) &&
    !Number.isFinite(modelProbabilities.bradleyP1) &&
    !Number.isFinite(modelProbabilities.pcaP1)
  ) {
    warnings.push("all_models_unavailable");
  }
  if (pairOutputs.length < requestedPairs) {
    warnings.push(`valid_pairs=${pairOutputs.length}/${requestedPairs}`);
  }

  return {
    requestedPairs,
    validPairs: pairOutputs.length,
    pairOutputs,
    modelProbabilities,
    validPairOutputs,
    reliabilities,
    weights,
    warnings,
  };
}

function logRegProbability(home: DirtFeatureRow, away: DirtFeatureRow): number | undefined {
  let sumHome = 0;
  let sumAway = 0;
  let count = 0;

  for (const key of STABLE14) {
    const h = home[key];
    const a = away[key];
    if (!Number.isFinite(h) || !Number.isFinite(a) || h < 0 || a < 0) {
      continue;
    }

    if (INVERTED.has(key)) {
      sumHome += 1 / (1 + Math.max(h, 0));
      sumAway += 1 / (1 + Math.max(a, 0));
    } else {
      sumHome += clamp(h, 0, 100) / 100;
      sumAway += clamp(a, 0, 100) / 100;
    }
    count += 1;
  }

  if (count <= 0) {
    return undefined;
  }

  const z = ((sumHome / count) - (sumAway / count)) * 5;
  return clamp(sigmoid(z) * 100, 0, 100);
}

function comparisonScore(home: DirtFeatureRow, away: DirtFeatureRow): ComparisonScore {
  let winsA = 0;
  let winsB = 0;

  for (const key of STABLE14) {
    const h = home[key];
    const a = away[key];
    if (!Number.isFinite(h) || !Number.isFinite(a)) {
      continue;
    }

    if (INVERTED.has(key)) {
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

  return { winsA, winsB };
}

function markovProbability(
  home: DirtFeatureRow,
  away: DirtFeatureRow,
  comparison: ComparisonScore,
): number {
  const serve1 = toProbability(home.first_serve_points_won, 0.6);
  const serve2 = toProbability(away.first_serve_points_won, 0.6);
  const ret1 = toProbability(home.first_serve_return_points_won, 0.4);
  const ret2 = toProbability(away.first_serve_return_points_won, 0.4);

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
  const markovP1 =
    markovRawHome + markovRawAway > 0
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
  const m = STABLE14.length;
  const n = samples.length;
  if (n < 2) {
    return {};
  }

  const x = samples.map((sample) => STABLE14.map((key) => sample[key]));
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
  const pc1 = firstEigenVector(cov, m);
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
  };
}

function calibrateWeights(
  probs: { logRegP1?: number; markovP1?: number; bradleyP1?: number; pcaP1?: number },
  reliabilities: { logReg: number; markov: number; bradley: number; pca: number },
): { logReg: number; markov: number; bradley: number; pca: number } {
  const raw = {
    logReg: weightedSlot(BASE_WEIGHTS.logReg, reliabilities.logReg, probs.logRegP1),
    markov: weightedSlot(BASE_WEIGHTS.markov, reliabilities.markov, probs.markovP1),
    bradley: weightedSlot(BASE_WEIGHTS.bradley, reliabilities.bradley, probs.bradleyP1),
    pca: weightedSlot(BASE_WEIGHTS.pca, reliabilities.pca, probs.pcaP1),
  };
  const total = raw.logReg + raw.markov + raw.bradley + raw.pca;
  if (total <= 0) {
    return { logReg: 0.25, markov: 0.25, bradley: 0.25, pca: 0.25 };
  }
  return {
    logReg: raw.logReg / total,
    markov: raw.markov / total,
    bradley: raw.bradley / total,
    pca: raw.pca / total,
  };
}

function weightedSlot(base: number, reliability: number, probability: number | undefined): number {
  if (!Number.isFinite(probability)) {
    return 0;
  }
  const rel = clamp(reliability, 0.05, 1);
  return base * rel;
}

function weightedProbability(
  probs: { logRegP1?: number; markovP1?: number; bradleyP1?: number; pcaP1?: number },
  weights: { logReg: number; markov: number; bradley: number; pca: number },
): number {
  const slots: Array<{ p?: number; w: number }> = [
    { p: probs.logRegP1, w: weights.logReg },
    { p: probs.markovP1, w: weights.markov },
    { p: probs.bradleyP1, w: weights.bradley },
    { p: probs.pcaP1, w: weights.pca },
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

function pickSeries(
  pairOutputs: OraclePairModelOutput[],
  key: "logRegP1" | "markovP1" | "bradleyP1" | "pcaP1",
): number[] {
  return pairOutputs
    .map((pair) => pair[key])
    .filter((value): value is number => Number.isFinite(value));
}

function averageOrUndefined(values: number[]): number | undefined {
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

function modelStability(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  return clamp(1 - sampleSd(values) / 20, 0.25, 1);
}

function covarianceMatrix(
  z: number[][],
  m: number,
  n: number,
  shrinkageLambda: number,
): number[][] {
  const out = new Array<number[]>(m);
  const den = Math.max(1, n - 1);
  for (let i = 0; i < m; i += 1) {
    out[i] = new Array<number>(m).fill(0);
  }
  for (let i = 0; i < m; i += 1) {
    for (let j = 0; j < m; j += 1) {
      let sum = 0;
      for (let row = 0; row < n; row += 1) {
        sum += z[row]![i]! * z[row]![j]!;
      }
      out[i]![j] = sum / den;
    }
  }
  const lambda = clamp(shrinkageLambda, 0, 1);
  if (lambda > 0) {
    for (let i = 0; i < m; i += 1) {
      for (let j = 0; j < m; j += 1) {
        const diagonal = i === j ? 1 : 0;
        out[i]![j] = (1 - lambda) * out[i]![j]! + lambda * diagonal;
      }
    }
  }
  return out;
}

function firstEigenVector(cov: number[][], n: number): number[] | undefined {
  let v = new Array<number>(n).fill(1 / Math.sqrt(n));
  for (let step = 0; step < 30; step += 1) {
    const next = multiplyMatrixVector(cov, v);
    const norm = vectorNorm(next);
    if (!Number.isFinite(norm) || norm <= 0) {
      return undefined;
    }
    v = next.map((value) => value / norm);
  }
  if ((v[0] || 0) < 0) {
    v = v.map((value) => -value);
  }
  return v;
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

function vectorNorm(values: number[]): number {
  let sumSq = 0;
  for (const value of values) {
    sumSq += value * value;
  }
  return Math.sqrt(sumSq);
}

function toProbability(value: number, fallbackValue: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallbackValue;
  }
  const normalized = value > 1 ? value / 100 : value;
  return clamp(normalized, 0, 1);
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}
