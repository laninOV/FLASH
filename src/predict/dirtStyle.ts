import { normalizeWhitespace } from "../normalize.js";
import type {
  HistoricalMatchTechStats,
  HistoryModuleResult,
  MetricValue,
  PlayerRecentStats,
} from "../types.js";

const COMPARISON_METRICS: string[] = [
  "aces",
  "double_faults",
  "first_serve",
  "first_serve_points_won",
  "second_serve_points_won",
  "break_points_saved",
  "break_points_faced",
  "service_games_won",
  "return_games_won",
  "first_serve_return_points_won",
  "second_serve_return_points_won",
  "break_points_converted",
  "total_service_points_won",
  "return_points_won",
  "total_points_won",
  "total_games_won",
];

const PCA_FEATURES: string[] = [
  "aces",
  "double_faults",
  "first_serve",
  "first_serve_points_won",
  "second_serve_points_won",
  "break_points_saved",
  "break_points_faced",
  "service_games_played",
  "service_games_won",
  "total_service_points_won",
  "first_serve_return_points_won",
  "second_serve_return_points_won",
  "break_points_converted",
  "return_games_played",
  "return_games_won",
  "return_points_won",
  "total_points_won",
  "total_games_won",
];

const INVERTED_METRICS = new Set(["double_faults", "break_points_faced"]);
const COUNT_METRICS = new Set([
  "aces",
  "double_faults",
  "break_points_faced",
  "service_games_played",
  "return_games_played",
]);

const KEY_ALIASES: Record<string, string> = {
  aces: "aces",
  ace: "aces",
  double_fault: "double_faults",
  double_faults: "double_faults",
  first_serve: "first_serve",
  "1st_serve": "first_serve",
  first_serve_points_won: "first_serve_points_won",
  "1st_serve_points_won": "first_serve_points_won",
  second_serve_points_won: "second_serve_points_won",
  "2nd_serve_points_won": "second_serve_points_won",
  break_points_saved: "break_points_saved",
  break_points_faced: "break_points_faced",
  first_serve_return_points_won: "first_serve_return_points_won",
  "1st_serve_return_points_won": "first_serve_return_points_won",
  second_serve_return_points_won: "second_serve_return_points_won",
  "2nd_serve_return_points_won": "second_serve_return_points_won",
  break_points_converted: "break_points_converted",
  break_points_conversion: "break_points_converted",
  break_points_conversions: "break_points_converted",
  service_games_played: "service_games_played",
  return_games_played: "return_games_played",
  service_games_won: "service_games_won",
  return_games_won: "return_games_won",
  total_service_points_won: "total_service_points_won",
  total_return_points_won: "return_points_won",
  return_points_won: "return_points_won",
  total_points_won: "total_points_won",
  total_games_won: "total_games_won",
};

export interface DirtModelWeights {
  logReg: number;
  markov: number;
  bradley: number;
  pca: number;
}

const BASE_MODEL_WEIGHTS: DirtModelWeights = {
  logReg: 0.32,
  markov: 0.28,
  bradley: 0.2,
  pca: 0.2,
};

export interface DirtPlayerAggregate {
  means: Record<string, number>;
  matchRows: Array<Record<string, number>>;
  playerId?: number;
}

export interface DirtModelRunResult {
  logRegP1?: number;
  markovP1?: number;
  bradleyP1?: number;
  pcaP1?: number;
  finalP1: number;
  activeModels: number;
  comparisonCount: number;
  comparisonCoverage: number;
  pcaSampleSize: number;
  pclassEv?: number;
  pclassDep?: number;
  baseWeights: DirtModelWeights;
  reliabilities: DirtModelWeights;
  weights: DirtModelWeights;
  warnings: string[];
}

interface ComparisonScore {
  winsA: number;
  winsB: number;
  compared: number;
}

export function runDirtStyleModels(
  playerAStats: PlayerRecentStats,
  playerBStats: PlayerRecentStats,
): DirtModelRunResult {
  const warnings: string[] = [];

  const home = aggregatePlayerHistory(playerAStats);
  const away = aggregatePlayerHistory(playerBStats);

  const comparison = computeComparisonScore(home.means, away.means);
  if (comparison.compared === 0) {
    warnings.push("comparison_metrics_missing");
  }

  const logRegP1 = logisticRegressionProbability(home.means, away.means);
  const markovP1 = markovProbability(home.means, away.means, comparison);
  const bradleyP1 = bradleyProbability(comparison);
  const pcaP1 = pcaProbability(home, away);

  const comparisonCoverage = clamp(comparison.compared / COMPARISON_METRICS.length, 0, 1);
  const markovInputCoverage = markovFeatureCoverage(home.means, away.means);
  const pcaSampleSize = home.matchRows.length + away.matchRows.length;
  const pcaCoverage = pcaFeatureCoverage(home.means, away.means);

  const reliabilities: DirtModelWeights = {
    logReg: comparisonCoverage,
    markov: clamp(comparisonCoverage * (0.4 + 0.6 * markovInputCoverage), 0, 1),
    bradley: comparisonCoverage,
    pca: clamp(pcaCoverage * clamp((pcaSampleSize - 2) / 8, 0, 1), 0, 1),
  };

  if (typeof logRegP1 !== "number") {
    warnings.push("logreg_unavailable");
  }
  if (typeof markovP1 !== "number") {
    warnings.push("markov_unavailable");
  }
  if (typeof bradleyP1 !== "number") {
    warnings.push("bradley_unavailable");
  }
  if (typeof pcaP1 !== "number") {
    warnings.push("pca_unavailable");
  }

  const weights = calibrateModelWeights(
    BASE_MODEL_WEIGHTS,
    reliabilities,
    {
      logReg: logRegP1,
      markov: markovP1,
      bradley: bradleyP1,
      pca: pcaP1,
    },
  );
  const finalP1 = weightedProbability(
    {
      logReg: logRegP1,
      markov: markovP1,
      bradley: bradleyP1,
      pca: pcaP1,
    },
    weights,
  );

  return {
    logRegP1,
    markovP1,
    bradleyP1,
    pcaP1,
    finalP1: clamp(finalP1, 0, 100),
    activeModels: activeModelCount({ logReg: logRegP1, markov: markovP1, bradley: bradleyP1, pca: pcaP1 }),
    comparisonCount: comparison.compared,
    comparisonCoverage,
    pcaSampleSize,
    pclassEv: home.playerId,
    pclassDep: away.playerId,
    baseWeights: { ...BASE_MODEL_WEIGHTS },
    reliabilities,
    weights,
    warnings,
  };
}

export function calibrateModelWeights(
  base: DirtModelWeights,
  reliabilities: DirtModelWeights,
  probabilities: Partial<DirtModelWeights>,
): DirtModelWeights {
  const raw: DirtModelWeights = {
    logReg: weightedSlot(base.logReg, reliabilities.logReg, probabilities.logReg),
    markov: weightedSlot(base.markov, reliabilities.markov, probabilities.markov),
    bradley: weightedSlot(base.bradley, reliabilities.bradley, probabilities.bradley),
    pca: weightedSlot(base.pca, reliabilities.pca, probabilities.pca),
  };

  const total = raw.logReg + raw.markov + raw.bradley + raw.pca;
  if (total <= 0) {
    return {
      logReg: 0.25,
      markov: 0.25,
      bradley: 0.25,
      pca: 0.25,
    };
  }

  return {
    logReg: raw.logReg / total,
    markov: raw.markov / total,
    bradley: raw.bradley / total,
    pca: raw.pca / total,
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
  return sum / total;
}

function weightedSlot(baseWeight: number, reliability: number, probability: number | undefined): number {
  if (!Number.isFinite(probability)) {
    return 0;
  }
  const rel = clamp(reliability, 0.05, 1);
  return baseWeight * rel;
}

function activeModelCount(probabilities: {
  logReg?: number;
  markov?: number;
  bradley?: number;
  pca?: number;
}): number {
  return [probabilities.logReg, probabilities.markov, probabilities.bradley, probabilities.pca].filter(
    (value): value is number => Number.isFinite(value),
  ).length;
}

function markovFeatureCoverage(homeMeans: Record<string, number>, awayMeans: Record<string, number>): number {
  const keys = [
    homeMeans.first_serve_points_won,
    awayMeans.first_serve_points_won,
    homeMeans.first_serve_return_points_won,
    awayMeans.first_serve_return_points_won,
  ];
  const present = keys.filter((value) => Number.isFinite(value)).length;
  return present / keys.length;
}

function pcaFeatureCoverage(homeMeans: Record<string, number>, awayMeans: Record<string, number>): number {
  let present = 0;
  let total = 0;
  for (const key of PCA_FEATURES) {
    total += 2;
    if (Number.isFinite(homeMeans[key])) {
      present += 1;
    }
    if (Number.isFinite(awayMeans[key])) {
      present += 1;
    }
  }
  if (total <= 0) {
    return 0;
  }
  return present / total;
}

export function buildDirtModules(result: DirtModelRunResult): HistoryModuleResult[] {
  return [
    probabilityToModule("LOGREG", result.logRegP1),
    probabilityToModule("MARKOV", result.markovP1),
    probabilityToModule("BRADLEY", result.bradleyP1),
    probabilityToModule("PCA", result.pcaP1),
  ];
}

export function aggregatePlayerHistory(stats: PlayerRecentStats): DirtPlayerAggregate {
  const matches = stats.parsedMatches
    .map((match) => matchMetrics(match))
    .filter((row) => Object.keys(row).length > 0);

  const buckets = new Map<string, number[]>();
  for (const row of matches) {
    for (const [key, value] of Object.entries(row)) {
      if (!Number.isFinite(value)) {
        continue;
      }
      const list = buckets.get(key) ?? [];
      list.push(value);
      buckets.set(key, list);
    }
  }

  const means: Record<string, number> = {};
  for (const [key, values] of buckets.entries()) {
    if (values.length === 0) {
      continue;
    }
    means[key] = average(values);
  }

  return {
    means,
    matchRows: matches,
    playerId: extractPlayerId(stats.profileUrl),
  };
}

export function logisticRegressionProbability(
  homeMeans: Record<string, number>,
  awayMeans: Record<string, number>,
): number | undefined {
  let sumHome = 0;
  let sumAway = 0;
  let count = 0;

  for (const key of COMPARISON_METRICS) {
    const home = homeMeans[key];
    const away = awayMeans[key];
    if (!Number.isFinite(home) || !Number.isFinite(away)) {
      continue;
    }
    if (home <= 0 || away <= 0) {
      continue;
    }

    if (INVERTED_METRICS.has(key)) {
      sumHome += 1 / (1 + home);
      sumAway += 1 / (1 + away);
    } else {
      sumHome += home / 100;
      sumAway += away / 100;
    }
    count += 1;
  }

  if (count === 0) {
    return undefined;
  }

  const meanHome = sumHome / count;
  const meanAway = sumAway / count;
  return clamp(sigmoid((meanHome - meanAway) * 5) * 100, 0, 100);
}

export function computeComparisonScore(
  homeMeans: Record<string, number>,
  awayMeans: Record<string, number>,
): ComparisonScore {
  let winsA = 0;
  let winsB = 0;
  let compared = 0;

  for (const key of COMPARISON_METRICS) {
    const home = homeMeans[key];
    const away = awayMeans[key];
    if (!Number.isFinite(home) || !Number.isFinite(away)) {
      continue;
    }
    compared += 1;

    if (INVERTED_METRICS.has(key)) {
      if (home < away) {
        winsA += 1;
      } else if (away < home) {
        winsB += 1;
      } else {
        winsA += 0.5;
        winsB += 0.5;
      }
      continue;
    }

    if (home > away) {
      winsA += 1;
    } else if (away > home) {
      winsB += 1;
    } else {
      winsA += 0.5;
      winsB += 0.5;
    }
  }

  return { winsA, winsB, compared };
}

export function markovProbability(
  homeMeans: Record<string, number>,
  awayMeans: Record<string, number>,
  comparison: ComparisonScore,
): number | undefined {
  const serve1 = normalizeProbability(homeMeans.first_serve_points_won, 0.6);
  const serve2 = normalizeProbability(awayMeans.first_serve_points_won, 0.6);
  const ret1 = normalizeProbability(homeMeans.first_serve_return_points_won, 0.4);
  const ret2 = normalizeProbability(awayMeans.first_serve_return_points_won, 0.4);

  const matrix: number[][] = [
    [0, 0, ret2, 1 - ret2],
    [0, 0, ret2, 1 - ret2],
    [ret1, 1 - ret1, 0, 0],
    [ret1, 1 - ret1, 0, 0],
  ];

  let state: number[] = [
    0.5 * serve1,
    0.5 * (1 - serve1),
    0.5 * serve2,
    0.5 * (1 - serve2),
  ];

  for (let step = 0; step < 20; step += 1) {
    const next = [0, 0, 0, 0];
    for (let i = 0; i < 4; i += 1) {
      for (let j = 0; j < 4; j += 1) {
        next[i] += state[j] * matrix[j]![i]!;
      }
    }
    state = next;
  }

  const markovRawHome = state[0]! + state[3]!;
  const markovRawAway = state[1]! + state[2]!;
  const markovDen = markovRawHome + markovRawAway;
  const markovP1 = markovDen > 0 ? (markovRawHome / markovDen) * 100 : 50;

  const scoreDen = comparison.winsA + comparison.winsB;
  const scoreP1 = scoreDen > 0 ? (comparison.winsA / scoreDen) * 100 : 50;

  const blended = markovP1 * 0.8 + scoreP1 * 0.2;
  return clamp(blended, 0, 100);
}

export function bradleyProbability(comparison: ComparisonScore): number | undefined {
  const den = comparison.winsA + comparison.winsB;
  if (den <= 0) {
    return undefined;
  }
  return clamp((comparison.winsA / den) * 100, 0, 100);
}

export function pcaProbability(
  home: DirtPlayerAggregate,
  away: DirtPlayerAggregate,
): number | undefined {
  const sourceRows = [...home.matchRows, ...away.matchRows];
  if (sourceRows.length < 2) {
    return undefined;
  }

  const m = PCA_FEATURES.length;
  const n = sourceRows.length;
  const rows = sourceRows.map((row) =>
    PCA_FEATURES.map((feature) => {
      const value = row[feature];
      return Number.isFinite(value) ? value : Number.NaN;
    }),
  );

  const means = new Array<number>(m).fill(0);
  for (let j = 0; j < m; j += 1) {
    const values = rows
      .map((row) => row[j]!)
      .filter((value) => Number.isFinite(value));
    means[j] = values.length > 0 ? average(values) : 0;
  }

  const x = rows.map((row) =>
    row.map((value, index) => (Number.isFinite(value) ? value : means[index]!)),
  );

  const sds = new Array<number>(m).fill(1);
  for (let j = 0; j < m; j += 1) {
    const values = x.map((row) => row[j]!);
    sds[j] = sampleSd(values);
    if (!Number.isFinite(sds[j]) || sds[j]! <= 0) {
      sds[j] = 1;
    }
  }

  const z = x.map((row) => row.map((value, index) => (value - means[index]!) / sds[index]!));
  const cov = covarianceMatrix(z, m, n);
  const pc1 = firstEigenvector(cov, m);
  if (!pc1) {
    return undefined;
  }

  const x1 = PCA_FEATURES.map((feature, index) => fallback(home.means[feature], means[index]!));
  const x2 = PCA_FEATURES.map((feature, index) => fallback(away.means[feature], means[index]!));
  const z1 = x1.map((value, index) => (value - means[index]!) / sds[index]!);
  const z2 = x2.map((value, index) => (value - means[index]!) / sds[index]!);

  const s1 = dot(pc1, z1);
  const s2 = dot(pc1, z2);
  const delta = s1 - s2;
  return clamp(sigmoid(delta * 1.5) * 100, 0, 100);
}

function matchMetrics(match: HistoricalMatchTechStats): Record<string, number> {
  const out = new Map<string, { value: number; quality: number }>();
  for (const row of match.rows) {
    const key = canonicalMetricKey(row.metricKey, row.metricLabel);
    if (!key) {
      continue;
    }
    const numeric = metricToNumber(row.playerValue, key);
    if (typeof numeric !== "number" || !Number.isFinite(numeric)) {
      continue;
    }
    const quality = metricQuality(row.playerValue);
    const prev = out.get(key);
    if (!prev || quality > prev.quality) {
      out.set(key, { value: numeric, quality });
    }
  }

  const rowData: Record<string, number> = {};
  for (const [key, value] of out.entries()) {
    rowData[key] = value.value;
  }
  return rowData;
}

function metricToNumber(value: MetricValue, key: string): number | undefined {
  const isCount = COUNT_METRICS.has(key);

  if (typeof value.percent === "number" && Number.isFinite(value.percent)) {
    if (isCount) {
      return value.percent;
    }
    return value.percent <= 1 ? value.percent * 100 : value.percent;
  }

  if (
    typeof value.made === "number" &&
    Number.isFinite(value.made) &&
    typeof value.total === "number" &&
    Number.isFinite(value.total) &&
    value.total > 0
  ) {
    if (isCount) {
      return value.made;
    }
    return (value.made / value.total) * 100;
  }

  return undefined;
}

function metricQuality(value: MetricValue): number {
  if (typeof value.total === "number" && Number.isFinite(value.total) && value.total > 0) {
    return 1000 + value.total;
  }
  if (typeof value.percent === "number" && Number.isFinite(value.percent)) {
    return 100;
  }
  return 0;
}

function canonicalMetricKey(metricKey: string, metricLabel: string): string {
  const fromKey = aliasKey(metricKey);
  if (fromKey) {
    return fromKey;
  }

  const labelKey = aliasKey(metricLabelToKey(metricLabel));
  if (labelKey) {
    return labelKey;
  }
  return "";
}

function aliasKey(raw: string): string {
  const key = normalizeWhitespace(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!key) {
    return "";
  }
  return KEY_ALIASES[key] || key;
}

function metricLabelToKey(label: string): string {
  return normalizeWhitespace(label || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeProbability(value: number | undefined, fallbackValue: number): number {
  if (!Number.isFinite(value) || (value || 0) <= 0) {
    return fallbackValue;
  }
  const normalized = (value || 0) > 1 ? (value || 0) / 100 : (value || 0);
  return clamp(normalized, 0, 1);
}

function covarianceMatrix(z: number[][], m: number, n: number): number[][] {
  const den = Math.max(n - 1, 1);
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
  return cov;
}

function firstEigenvector(cov: number[][], m: number): number[] | undefined {
  let vector = new Array<number>(m).fill(1 / Math.sqrt(m));
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
  let out = 0;
  for (let i = 0; i < a.length; i += 1) {
    out += a[i]! * b[i]!;
  }
  return out;
}

function sampleSd(values: number[]): number {
  if (values.length < 2) {
    return 1;
  }
  const mean = average(values);
  let sumSq = 0;
  for (const value of values) {
    const delta = value - mean;
    sumSq += delta * delta;
  }
  return Math.sqrt(sumSq / (values.length - 1));
}

function vectorNorm(vector: number[]): number {
  let sum = 0;
  for (const value of vector) {
    sum += value * value;
  }
  return Math.sqrt(sum);
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

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function fallback(value: number | undefined, fallbackValue: number): number {
  if (Number.isFinite(value)) {
    return value as number;
  }
  return fallbackValue;
}

function extractPlayerId(url: string | undefined): number | undefined {
  const match = normalizeWhitespace(url || "").match(/\/player\/(\d+)/i);
  if (!match?.[1]) {
    return undefined;
  }
  const id = Number(match[1]);
  if (!Number.isFinite(id)) {
    return undefined;
  }
  return id;
}

function probabilityToModule(name: string, p1: number | undefined): HistoryModuleResult {
  if (!Number.isFinite(p1)) {
    return {
      name,
      side: "neutral",
      strength: 0,
      explain: [],
      flags: ["unavailable"],
    };
  }

  const home = p1 as number;
  const away = 100 - home;
  const delta = home - away;
  return {
    name,
    side: delta > 0 ? "home" : delta < 0 ? "away" : "neutral",
    strength: Math.abs(delta) / 10,
    explain: [`P1=${home.toFixed(1)} P2=${away.toFixed(1)}`],
    flags: [],
  };
}
