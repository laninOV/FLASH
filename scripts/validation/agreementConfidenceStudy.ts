import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

type ProbabilitySide = "home" | "away" | "neutral";
type WinnerSide = "home" | "away";

const DEFAULT_MIN_BUCKET_SIZE = 8;
const DEFAULT_TOP_K = 15;

const AGREEMENT_THRESHOLDS = [0, 1, 2, 3] as const;
const CONFIDENCE_THRESHOLDS = [50, 52, 55, 58, 60] as const;

const CONFIDENCE_BINS = [
  { label: "<=50", test: (v: number) => v <= 50 },
  { label: "(50, 52]", test: (v: number) => v > 50 && v <= 52 },
  { label: "(52, 55]", test: (v: number) => v > 52 && v <= 55 },
  { label: "(55, 58]", test: (v: number) => v > 55 && v <= 58 },
  { label: "(58, 60]", test: (v: number) => v > 58 && v <= 60 },
  { label: "(60, 62]", test: (v: number) => v > 60 && v <= 62 },
  { label: "(62, 65]", test: (v: number) => v > 62 && v <= 65 },
  { label: "(65, 70]", test: (v: number) => v > 65 && v <= 70 },
  { label: ">70", test: (v: number) => v > 70 },
] as const;

const MATRIX_CONFIDENCE_BINS = [
  { label: "<=50", test: (v: number) => v <= 50 },
  { label: "(50,58]", test: (v: number) => v > 50 && v <= 58 },
  { label: "(58,65]", test: (v: number) => v > 58 && v <= 65 },
  { label: ">65", test: (v: number) => v > 65 },
] as const;

const MATRIX_AGREEMENT_GROUPS = [
  { label: "<=1", test: (v: number) => v <= 1 },
  { label: "2", test: (v: number) => v === 2 },
  { label: "3", test: (v: number) => v === 3 },
  { label: "4", test: (v: number) => v === 4 },
  { label: "5", test: (v: number) => v >= 5 },
] as const;

interface JoinedLikeRow {
  matchUrl?: string;
  label?: string;
  actualWinnerName?: string;
  winnerName?: string;
  actualWinner?: string;
  winnerSide?: string;
  mainPick?: string;
  novaPick?: string;
  mainCorrect?: boolean;
  novaCorrect?: boolean;
  confidencePct?: number;
  mainConfidence?: number;
  logRegP1?: number;
  markovP1?: number;
  bradleyP1?: number;
  pcaP1?: number;
  novaP1?: number;
  [key: string]: unknown;
}

interface PredictionLike {
  matchUrl?: string;
  matchLabel?: string;
  playerAName?: string;
  playerBName?: string;
  predictedWinner?: string;
  confidence?: number;
  modelSummary?: {
    dirt?: {
      modelProbabilities?: {
        logRegP1?: number;
        markovP1?: number;
        bradleyP1?: number;
        pcaP1?: number;
      };
    };
    novaEdge?: {
      p1?: number;
    };
  };
  [key: string]: unknown;
}

export interface MethodsAgreementSummary {
  methodsCount: number;
  agreementCount: number;
  agreementRatio: number | null;
  agreementText: string;
}

export interface SignalReliabilityRow {
  matchUrl: string;
  label: string;
  actualWinnerName?: string;
  playerAName: string;
  playerBName: string;
  mainPick: string;
  mainCorrect: boolean;
  mainWrong: boolean;
  novaPick?: string;
  novaCorrect?: boolean;
  novaWrong?: boolean;
  confidencePct: number;
  methodsCount: number;
  agreementCount: number;
  agreementRatio: number | null;
  agreementText: string;
  logRegP1?: number;
  markovP1?: number;
  bradleyP1?: number;
  pcaP1?: number;
  novaP1?: number;
  logisticMargin?: number;
  novaMargin?: number;
  lowConfidence50: boolean;
  lowAgreement1: boolean;
  lowAgreement2: boolean;
}

export interface AccuracyBlock {
  hit: number;
  total: number;
  rate: number;
}

export interface WilsonInterval {
  low: number;
  high: number;
}

export interface BucketAccuracyRow {
  label: string;
  n: number;
  hit: number;
  hitRate: number;
  errorRate: number;
  wilson95Low: number;
  wilson95High: number;
}

export interface MatrixCell {
  agreementGroup: string;
  confidenceGroup: string;
  n: number;
  hit: number;
  hitRate: number;
  errorRate: number;
}

export interface MatrixRow {
  agreementGroup: string;
  cells: MatrixCell[];
}

export interface CorrelationSummary {
  spearmanAgreementVsMainCorrect: number;
  spearmanConfidenceVsMainCorrect: number;
  pointBiserialAgreementVsMainCorrect: number;
  pointBiserialConfidenceVsMainCorrect: number;
}

export interface SkipRuleMetrics {
  total: number;
  skipped: number;
  kept: number;
  skipRate: number;
  skippedHitRate: number;
  skippedErrorRate: number;
  keptHitRate: number;
  keptErrorRate: number;
  mainOverallHitRate: number;
  mainOverallErrorRate: number;
  deltaKeptVsMain: number;
}

export interface SkipRuleCandidate {
  ruleId: string;
  rule: string;
  family: "primary_and" | "secondary_agreement" | "secondary_confidence" | "secondary_or";
  agreementThresholdA: number | null;
  confidenceThresholdC: number | null;
  train: SkipRuleMetrics;
  valid: SkipRuleMetrics;
  passesValidCriteria: boolean;
}

export interface HypothesisCheck {
  rule: string;
  train: SkipRuleMetrics;
  valid: SkipRuleMetrics;
}

export interface DatasetSummary {
  inputJoinedRows: number;
  inputPredictionRows: number;
  usableRows: number;
  joinedWithoutPrediction: number;
  predictionUrlDuplicates: number;
  invalidJoinedRows: number;
}

export interface AgreementConfidenceDatasetReport {
  dataset: DatasetSummary;
  baseline: {
    main: AccuracyBlock;
    nova?: AccuracyBlock;
  };
  agreementDistribution: Array<{ agreementText: string; n: number }>;
  agreementAccuracy: BucketAccuracyRow[];
  confidenceAccuracy: BucketAccuracyRow[];
  agreementConfidenceMatrix: MatrixRow[];
  correlations: CorrelationSummary;
}

export interface AgreementConfidenceStudyReport {
  config: {
    trainJoinedFile: string;
    trainPredictionsFile: string;
    validJoinedFile: string;
    validPredictionsFile: string;
    minBucketSize: number;
    topK: number;
    skipSecondary: boolean;
    agreementThresholds: number[];
    confidenceThresholds: number[];
  };
  train: AgreementConfidenceDatasetReport;
  valid: AgreementConfidenceDatasetReport;
  hypothesis: HypothesisCheck;
  skipRuleCandidates: SkipRuleCandidate[];
  topSkipCandidates: SkipRuleCandidate[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readArg(argv: string[], key: string): string | undefined {
  const token = `--${key}`;
  const index = argv.findIndex((value) => value === token);
  if (index < 0) return undefined;
  const next = argv[index + 1];
  if (!next || next.startsWith("--")) return undefined;
  return next;
}

function readIntArg(argv: string[], key: string, fallback: number): number {
  const raw = readArg(argv, key);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || !Number.isFinite(value)) {
    throw new Error(`--${key} must be an integer`);
  }
  return value;
}

function hasFlag(argv: string[], key: string): boolean {
  return argv.includes(`--${key}`);
}

function normalizeName(value: string | undefined): string {
  return String(value || "").trim();
}

export function canonicalizeMatchUrl(input: string | undefined): string | undefined {
  const raw = String(input || "").trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    const pathname = url.pathname.replace(/\/+$/g, "");
    url.pathname = pathname || "/";
    const mid = url.searchParams.get("mid");
    url.search = mid ? `?mid=${mid}` : "";
    return url.toString().replace(/\/\?mid=/, "?mid=");
  } catch {
    return raw.replace(/\/\?mid=/, "?mid=").replace(/\/+$/g, "");
  }
}

export function probabilityToSide(p1: number): ProbabilitySide {
  if (p1 > 50) return "home";
  if (p1 < 50) return "away";
  return "neutral";
}

export function winnerToSide(
  predictedWinner: string | undefined,
  playerA: string,
  playerB: string,
): WinnerSide | undefined {
  const winner = normalizeName(predictedWinner).toLowerCase();
  if (!winner) return undefined;
  if (winner === playerA.toLowerCase()) return "home";
  if (winner === playerB.toLowerCase()) return "away";
  return undefined;
}

export function computeMethodsAgreement(
  predictedWinner: string | undefined,
  playerA: string,
  playerB: string,
  probabilities: Array<number | undefined>,
): MethodsAgreementSummary {
  const winnerSide = winnerToSide(predictedWinner, playerA, playerB);
  let methodsCount = 0;
  let agreementCount = 0;
  for (const value of probabilities) {
    if (!isFiniteNumber(value)) continue;
    methodsCount += 1;
    const side = probabilityToSide(value);
    if (winnerSide && side !== "neutral" && side === winnerSide) {
      agreementCount += 1;
    }
  }
  if (methodsCount === 0) {
    return { methodsCount: 0, agreementCount: 0, agreementRatio: null, agreementText: "-/-" };
  }
  return {
    methodsCount,
    agreementCount,
    agreementRatio: agreementCount / methodsCount,
    agreementText: `${agreementCount}/${methodsCount}`,
  };
}

interface ExtractedPredictionForJoin {
  matchUrl: string;
  label: string;
  playerAName: string;
  playerBName: string;
  predictedWinner: string;
  confidencePct?: number;
  logRegP1?: number;
  markovP1?: number;
  bradleyP1?: number;
  pcaP1?: number;
  novaP1?: number;
}

function coerceNumber(value: unknown): number | undefined {
  return isFiniteNumber(value) ? value : undefined;
}

function extractPredictionForJoin(item: unknown): ExtractedPredictionForJoin | undefined {
  if (!item || typeof item !== "object") return undefined;
  const row = item as PredictionLike;
  const canonicalUrl = canonicalizeMatchUrl(typeof row.matchUrl === "string" ? row.matchUrl : undefined);
  if (!canonicalUrl) return undefined;
  const modelProb = row.modelSummary?.dirt?.modelProbabilities;
  const confidencePct = isFiniteNumber(row.confidence) ? row.confidence * 100 : undefined;
  return {
    matchUrl: canonicalUrl,
    label: typeof row.matchLabel === "string" ? row.matchLabel : "",
    playerAName: typeof row.playerAName === "string" ? row.playerAName : "",
    playerBName: typeof row.playerBName === "string" ? row.playerBName : "",
    predictedWinner: typeof row.predictedWinner === "string" ? row.predictedWinner : "",
    confidencePct,
    logRegP1: coerceNumber(modelProb?.logRegP1),
    markovP1: coerceNumber(modelProb?.markovP1),
    bradleyP1: coerceNumber(modelProb?.bradleyP1),
    pcaP1: coerceNumber(modelProb?.pcaP1),
    novaP1: coerceNumber(row.modelSummary?.novaEdge?.p1),
  };
}

function extractJoinedRow(item: unknown): JoinedLikeRow | undefined {
  if (!item || typeof item !== "object") return undefined;
  return item as JoinedLikeRow;
}

interface BuildRowsResult {
  rows: SignalReliabilityRow[];
  datasetSummary: DatasetSummary;
}

export function buildSignalReliabilityRows(
  joinedRaw: unknown,
  predictionsRaw: unknown,
): BuildRowsResult {
  if (!Array.isArray(joinedRaw)) throw new Error("Joined data must be a JSON array");
  if (!Array.isArray(predictionsRaw)) throw new Error("Predictions data must be a JSON array");

  const predictionIndex = new Map<string, ExtractedPredictionForJoin>();
  let predictionUrlDuplicates = 0;
  for (const item of predictionsRaw) {
    const extracted = extractPredictionForJoin(item);
    if (!extracted) continue;
    if (predictionIndex.has(extracted.matchUrl)) {
      predictionUrlDuplicates += 1;
      continue;
    }
    predictionIndex.set(extracted.matchUrl, extracted);
  }

  const rows: SignalReliabilityRow[] = [];
  let joinedWithoutPrediction = 0;
  let invalidJoinedRows = 0;

  for (const item of joinedRaw) {
    const joined = extractJoinedRow(item);
    if (!joined) {
      invalidJoinedRows += 1;
      continue;
    }
    const canonicalUrl = canonicalizeMatchUrl(typeof joined.matchUrl === "string" ? joined.matchUrl : undefined);
    if (!canonicalUrl) {
      invalidJoinedRows += 1;
      continue;
    }
    const pred = predictionIndex.get(canonicalUrl);
    if (!pred) {
      joinedWithoutPrediction += 1;
      continue;
    }
    const mainCorrect = isBoolean(joined.mainCorrect) ? joined.mainCorrect : undefined;
    if (mainCorrect === undefined) {
      invalidJoinedRows += 1;
      continue;
    }
    const mainPick =
      typeof joined.mainPick === "string"
        ? joined.mainPick
        : pred.predictedWinner;
    const confidencePct =
      coerceNumber(joined.confidencePct) ??
      (isFiniteNumber(joined.mainConfidence) ? joined.mainConfidence * 100 : undefined) ??
      pred.confidencePct ??
      50;

    const logRegP1 = coerceNumber(joined.logRegP1) ?? pred.logRegP1;
    const markovP1 = coerceNumber(joined.markovP1) ?? pred.markovP1;
    const bradleyP1 = coerceNumber(joined.bradleyP1) ?? pred.bradleyP1;
    const pcaP1 = coerceNumber(joined.pcaP1) ?? pred.pcaP1;
    const novaP1 = coerceNumber(joined.novaP1) ?? pred.novaP1;

    const methods = computeMethodsAgreement(mainPick, pred.playerAName, pred.playerBName, [
      logRegP1,
      markovP1,
      bradleyP1,
      pcaP1,
      novaP1,
    ]);

    if (methods.methodsCount === 0) {
      invalidJoinedRows += 1;
      continue;
    }

    const novaCorrect = isBoolean(joined.novaCorrect) ? joined.novaCorrect : undefined;
    rows.push({
      matchUrl: canonicalUrl,
      label:
        (typeof joined.label === "string" && joined.label) ||
        pred.label ||
        "",
      actualWinnerName:
        typeof joined.actualWinnerName === "string"
          ? joined.actualWinnerName
          : typeof joined.winnerName === "string"
            ? joined.winnerName
            : typeof joined.actualWinner === "string"
              ? joined.actualWinner
              : undefined,
      playerAName: pred.playerAName,
      playerBName: pred.playerBName,
      mainPick,
      mainCorrect,
      mainWrong: !mainCorrect,
      novaPick: typeof joined.novaPick === "string" ? joined.novaPick : undefined,
      novaCorrect,
      novaWrong: typeof novaCorrect === "boolean" ? !novaCorrect : undefined,
      confidencePct: round3(clamp(confidencePct, 0, 100)),
      methodsCount: methods.methodsCount,
      agreementCount: methods.agreementCount,
      agreementRatio: methods.agreementRatio === null ? null : round3(methods.agreementRatio),
      agreementText: methods.agreementText,
      logRegP1,
      markovP1,
      bradleyP1,
      pcaP1,
      novaP1,
      logisticMargin: isFiniteNumber(logRegP1) ? round3(Math.abs(logRegP1 - 50)) : undefined,
      novaMargin: isFiniteNumber(novaP1) ? round3(Math.abs(novaP1 - 50)) : undefined,
      lowConfidence50: confidencePct <= 50,
      lowAgreement1: methods.agreementCount <= 1,
      lowAgreement2: methods.agreementCount <= 2,
    });
  }

  return {
    rows,
    datasetSummary: {
      inputJoinedRows: joinedRaw.length,
      inputPredictionRows: predictionsRaw.length,
      usableRows: rows.length,
      joinedWithoutPrediction,
      predictionUrlDuplicates,
      invalidJoinedRows,
    },
  };
}

function computeAccuracy(rows: SignalReliabilityRow[], key: "mainCorrect" | "novaCorrect"): AccuracyBlock {
  let hit = 0;
  let total = 0;
  for (const row of rows) {
    const value = row[key];
    if (typeof value !== "boolean") continue;
    total += 1;
    if (value) hit += 1;
  }
  return {
    hit,
    total,
    rate: total > 0 ? round3(hit / total) : 0,
  };
}

export function wilson95(hit: number, total: number): WilsonInterval {
  if (total <= 0) return { low: 0, high: 0 };
  const z = 1.959963984540054;
  const p = hit / total;
  const denom = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denom;
  const margin =
    (z *
      Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) /
    denom;
  return { low: round3(Math.max(0, center - margin)), high: round3(Math.min(1, center + margin)) };
}

function summarizeBucket(rows: SignalReliabilityRow[]): BucketAccuracyRow {
  const total = rows.length;
  const hit = rows.filter((row) => row.mainCorrect).length;
  const rate = total > 0 ? hit / total : 0;
  const ci = wilson95(hit, total);
  return {
    label: "",
    n: total,
    hit,
    hitRate: round3(rate),
    errorRate: round3(total > 0 ? 1 - rate : 0),
    wilson95Low: ci.low,
    wilson95High: ci.high,
  };
}

function groupByAgreementText(rows: SignalReliabilityRow[]): Array<{ agreementText: string; n: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.agreementText, (counts.get(row.agreementText) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => {
      const [aNum] = a[0].split("/");
      const [bNum] = b[0].split("/");
      return Number(aNum) - Number(bNum);
    })
    .map(([agreementText, n]) => ({ agreementText, n }));
}

function buildAgreementAccuracy(rows: SignalReliabilityRow[]): BucketAccuracyRow[] {
  const out: BucketAccuracyRow[] = [];
  const exactValues = [0, 1, 2, 3, 4, 5];
  for (const value of exactValues) {
    const subset = rows.filter((row) => row.agreementCount === value);
    if (subset.length === 0) continue;
    const summary = summarizeBucket(subset);
    summary.label = String(value);
    out.push(summary);
  }
  const grouped: Array<{ label: string; test: (v: number) => boolean }> = [
    { label: "<=1", test: (v) => v <= 1 },
    { label: "<=2", test: (v) => v <= 2 },
    { label: ">=4", test: (v) => v >= 4 },
    { label: "==methods", test: (_v) => false },
  ];
  for (const g of grouped) {
    const subset =
      g.label === "==methods"
        ? rows.filter((row) => row.methodsCount > 0 && row.agreementCount === row.methodsCount)
        : rows.filter((row) => g.test(row.agreementCount));
    if (subset.length === 0) continue;
    const summary = summarizeBucket(subset);
    summary.label = g.label;
    out.push(summary);
  }
  return out;
}

function confidenceBinLabel(confidencePct: number): string {
  for (const bin of CONFIDENCE_BINS) {
    if (bin.test(confidencePct)) return bin.label;
  }
  return ">70";
}

function matrixConfidenceBinLabel(confidencePct: number): string {
  for (const bin of MATRIX_CONFIDENCE_BINS) {
    if (bin.test(confidencePct)) return bin.label;
  }
  return ">65";
}

function agreementMatrixGroupLabel(agreementCount: number): string {
  for (const group of MATRIX_AGREEMENT_GROUPS) {
    if (group.test(agreementCount)) return group.label;
  }
  return "5";
}

function buildConfidenceAccuracy(rows: SignalReliabilityRow[]): BucketAccuracyRow[] {
  return CONFIDENCE_BINS.map((bin) => {
    const subset = rows.filter((row) => bin.test(row.confidencePct));
    const summary = summarizeBucket(subset);
    summary.label = bin.label;
    return summary;
  }).filter((row) => row.n > 0);
}

function buildAgreementConfidenceMatrix(rows: SignalReliabilityRow[]): MatrixRow[] {
  const rowLabels = MATRIX_AGREEMENT_GROUPS.map((g) => g.label);
  const colLabels = MATRIX_CONFIDENCE_BINS.map((g) => g.label);
  return rowLabels.map((rowLabel) => ({
    agreementGroup: rowLabel,
    cells: colLabels.map((colLabel) => {
      const subset = rows.filter(
        (row) =>
          agreementMatrixGroupLabel(row.agreementCount) === rowLabel &&
          matrixConfidenceBinLabel(row.confidencePct) === colLabel,
      );
      const hit = subset.filter((row) => row.mainCorrect).length;
      const n = subset.length;
      const hitRate = n > 0 ? hit / n : 0;
      return {
        agreementGroup: rowLabel,
        confidenceGroup: colLabel,
        n,
        hit,
        hitRate: round3(hitRate),
        errorRate: round3(n > 0 ? 1 - hitRate : 0),
      };
    }),
  }));
}

function rankWithAverageTies(values: number[]): number[] {
  const indexed = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length).fill(0);
  let i = 0;
  while (i < indexed.length) {
    let j = i + 1;
    while (j < indexed.length && indexed[j]!.value === indexed[i]!.value) j += 1;
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k += 1) {
      ranks[indexed[k]!.index] = avgRank;
    }
    i = j;
  }
  return ranks;
}

export function pearsonCorrelation(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length === 0) return 0;
  const n = xs.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX <= 0 || varY <= 0) return 0;
  return round3(cov / Math.sqrt(varX * varY));
}

export function spearmanRho(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length === 0) return 0;
  return pearsonCorrelation(rankWithAverageTies(xs), rankWithAverageTies(ys));
}

function computeCorrelations(rows: SignalReliabilityRow[]): CorrelationSummary {
  const agreementX: number[] = [];
  const confidenceX: number[] = [];
  const targetY: number[] = [];
  for (const row of rows) {
    if (row.agreementRatio === null) continue;
    agreementX.push(row.agreementRatio);
    confidenceX.push(row.confidencePct);
    targetY.push(row.mainCorrect ? 1 : 0);
  }
  return {
    spearmanAgreementVsMainCorrect: spearmanRho(agreementX, targetY),
    spearmanConfidenceVsMainCorrect: spearmanRho(confidenceX, targetY),
    pointBiserialAgreementVsMainCorrect: pearsonCorrelation(agreementX, targetY),
    pointBiserialConfidenceVsMainCorrect: pearsonCorrelation(confidenceX, targetY),
  };
}

function analyzeDataset(
  rows: SignalReliabilityRow[],
  datasetSummary: DatasetSummary,
): AgreementConfidenceDatasetReport {
  return {
    dataset: datasetSummary,
    baseline: {
      main: computeAccuracy(rows, "mainCorrect"),
      nova: computeAccuracy(rows, "novaCorrect"),
    },
    agreementDistribution: groupByAgreementText(rows),
    agreementAccuracy: buildAgreementAccuracy(rows),
    confidenceAccuracy: buildConfidenceAccuracy(rows),
    agreementConfidenceMatrix: buildAgreementConfidenceMatrix(rows),
    correlations: computeCorrelations(rows),
  };
}

function safeRate(hit: number, total: number): number {
  return total > 0 ? hit / total : 0;
}

export function evaluateSkipRule(
  rows: SignalReliabilityRow[],
  skipPredicate: (row: SignalReliabilityRow) => boolean,
): SkipRuleMetrics {
  const total = rows.length;
  const skippedRows = rows.filter(skipPredicate);
  const keptRows = rows.filter((row) => !skipPredicate(row));
  const skippedHit = skippedRows.filter((row) => row.mainCorrect).length;
  const keptHit = keptRows.filter((row) => row.mainCorrect).length;
  const totalHit = rows.filter((row) => row.mainCorrect).length;
  const skippedTotal = skippedRows.length;
  const keptTotal = keptRows.length;
  const totalRate = safeRate(totalHit, total);
  const skippedRate = safeRate(skippedHit, skippedTotal);
  const keptRate = safeRate(keptHit, keptTotal);
  return {
    total,
    skipped: skippedTotal,
    kept: keptTotal,
    skipRate: round3(safeRate(skippedTotal, total)),
    skippedHitRate: round3(skippedRate),
    skippedErrorRate: round3(skippedTotal > 0 ? 1 - skippedRate : 0),
    keptHitRate: round3(keptRate),
    keptErrorRate: round3(keptTotal > 0 ? 1 - keptRate : 0),
    mainOverallHitRate: round3(totalRate),
    mainOverallErrorRate: round3(total > 0 ? 1 - totalRate : 0),
    deltaKeptVsMain: round3(keptRate - totalRate),
  };
}

function buildSkipRuleCandidates(
  trainRows: SignalReliabilityRow[],
  validRows: SignalReliabilityRow[],
  options: { minBucketSize: number; topK: number; skipSecondary: boolean },
): { all: SkipRuleCandidate[]; top: SkipRuleCandidate[]; hypothesis: HypothesisCheck } {
  const defs: Array<{
    ruleId: string;
    rule: string;
    family: SkipRuleCandidate["family"];
    agreementThresholdA: number | null;
    confidenceThresholdC: number | null;
    predicate: (row: SignalReliabilityRow) => boolean;
  }> = [];

  for (const a of AGREEMENT_THRESHOLDS) {
    for (const c of CONFIDENCE_THRESHOLDS) {
      defs.push({
        ruleId: `skip_agree_le_${a}_and_conf_le_${c}`,
        rule: `skip if agreementCount <= ${a} && confidencePct <= ${c}`,
        family: "primary_and",
        agreementThresholdA: a,
        confidenceThresholdC: c,
        predicate: (row) => row.agreementCount <= a && row.confidencePct <= c,
      });
    }
  }

  if (!options.skipSecondary) {
    for (const a of AGREEMENT_THRESHOLDS) {
      defs.push({
        ruleId: `skip_agree_le_${a}`,
        rule: `skip if agreementCount <= ${a}`,
        family: "secondary_agreement",
        agreementThresholdA: a,
        confidenceThresholdC: null,
        predicate: (row) => row.agreementCount <= a,
      });
    }
    for (const c of CONFIDENCE_THRESHOLDS) {
      defs.push({
        ruleId: `skip_conf_le_${c}`,
        rule: `skip if confidencePct <= ${c}`,
        family: "secondary_confidence",
        agreementThresholdA: null,
        confidenceThresholdC: c,
        predicate: (row) => row.confidencePct <= c,
      });
    }
    for (const a of AGREEMENT_THRESHOLDS) {
      for (const c of CONFIDENCE_THRESHOLDS) {
        defs.push({
          ruleId: `skip_agree_le_${a}_or_conf_le_${c}`,
          rule: `skip if agreementCount <= ${a} || confidencePct <= ${c}`,
          family: "secondary_or",
          agreementThresholdA: a,
          confidenceThresholdC: c,
          predicate: (row) => row.agreementCount <= a || row.confidencePct <= c,
        });
      }
    }
  }

  const all = defs.map((def) => {
    const train = evaluateSkipRule(trainRows, def.predicate);
    const valid = evaluateSkipRule(validRows, def.predicate);
    const passesValidCriteria =
      valid.skipped >= options.minBucketSize &&
      valid.keptHitRate >= valid.mainOverallHitRate &&
      (train.deltaKeptVsMain - valid.deltaKeptVsMain) <= 0.05;
    return {
      ruleId: def.ruleId,
      rule: def.rule,
      family: def.family,
      agreementThresholdA: def.agreementThresholdA,
      confidenceThresholdC: def.confidenceThresholdC,
      train,
      valid,
      passesValidCriteria,
    } satisfies SkipRuleCandidate;
  });

  const hypothesisRuleId = "skip_agree_le_1_and_conf_le_50";
  const hypothesisCandidate = all.find((c) => c.ruleId === hypothesisRuleId);
  if (!hypothesisCandidate) {
    throw new Error("Primary hypothesis candidate missing");
  }

  const shortlist = all
    .filter((candidate) => {
      if (candidate.train.skipped < options.minBucketSize) return false;
      if (candidate.train.keptHitRate < candidate.train.mainOverallHitRate) return false;
      return true;
    })
    .sort((a, b) => {
      if (b.train.keptHitRate !== a.train.keptHitRate) return b.train.keptHitRate - a.train.keptHitRate;
      if (b.train.deltaKeptVsMain !== a.train.deltaKeptVsMain) return b.train.deltaKeptVsMain - a.train.deltaKeptVsMain;
      if (b.train.skipped !== a.train.skipped) return b.train.skipped - a.train.skipped;
      return a.train.skipRate - b.train.skipRate;
    })
    .slice(0, options.topK);

  return {
    all,
    top: shortlist,
    hypothesis: {
      rule: hypothesisCandidate.rule,
      train: hypothesisCandidate.train,
      valid: hypothesisCandidate.valid,
    },
  };
}

function formatAccuracyBlock(block: AccuracyBlock): string {
  return `${block.hit}/${block.total} (${round1(block.rate * 100)}%)`;
}

function formatSkipMetricsLine(metrics: SkipRuleMetrics): string {
  return `skipped=${metrics.skipped}/${metrics.total} (${round1(metrics.skipRate * 100)}%), keptHit=${round1(
    metrics.keptHitRate * 100,
  )}%, deltaKeptVsMain=${round1(metrics.deltaKeptVsMain * 100)}pp`;
}

function formatMarkdownTable(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
  return [head, sep, body].filter(Boolean).join("\n");
}

export function formatAgreementConfidenceReportMd(report: AgreementConfidenceStudyReport): string {
  const lines: string[] = [];
  lines.push("# Agreement + Confidence Study (49→100)");
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Train usable rows: ${report.train.dataset.usableRows}`);
  lines.push(`- Valid usable rows: ${report.valid.dataset.usableRows}`);
  lines.push(`- Train main baseline: ${formatAccuracyBlock(report.train.baseline.main)}`);
  lines.push(`- Valid main baseline: ${formatAccuracyBlock(report.valid.baseline.main)}`);
  if (report.valid.baseline.nova) {
    lines.push(`- Valid NOVA baseline (context): ${formatAccuracyBlock(report.valid.baseline.nova)}`);
  }
  lines.push(
    `- Correlation (valid): agreementRatio↔mainCorrect=${report.valid.correlations.spearmanAgreementVsMainCorrect}, confidencePct↔mainCorrect=${report.valid.correlations.spearmanConfidenceVsMainCorrect}`,
  );
  lines.push("");
  lines.push("## Hypothesis Check");
  lines.push(`- Rule: \`${report.hypothesis.rule}\``);
  lines.push(`- Train: ${formatSkipMetricsLine(report.hypothesis.train)}`);
  lines.push(`- Valid: ${formatSkipMetricsLine(report.hypothesis.valid)}`);
  lines.push("");

  lines.push("## Accuracy by Agreement (valid)");
  lines.push(
    formatMarkdownTable(
      ["Agreement", "n", "Hit", "HitRate", "ErrorRate", "Wilson95"],
      report.valid.agreementAccuracy.map((row) => [
        row.label,
        String(row.n),
        String(row.hit),
        `${round1(row.hitRate * 100)}%`,
        `${round1(row.errorRate * 100)}%`,
        `[${round1(row.wilson95Low * 100)}%, ${round1(row.wilson95High * 100)}%]`,
      ]),
    ),
  );
  lines.push("");

  lines.push("## Accuracy by Confidence (valid)");
  lines.push(
    formatMarkdownTable(
      ["Confidence", "n", "Hit", "HitRate", "ErrorRate", "Wilson95"],
      report.valid.confidenceAccuracy.map((row) => [
        row.label,
        String(row.n),
        String(row.hit),
        `${round1(row.hitRate * 100)}%`,
        `${round1(row.errorRate * 100)}%`,
        `[${round1(row.wilson95Low * 100)}%, ${round1(row.wilson95High * 100)}%]`,
      ]),
    ),
  );
  lines.push("");

  lines.push("## Agreement × Confidence Matrix (valid, hitRate / n)");
  const matrixHeaders = ["Agreement \\ Confidence", ...MATRIX_CONFIDENCE_BINS.map((bin) => bin.label)];
  const matrixRows = report.valid.agreementConfidenceMatrix.map((row) => [
    row.agreementGroup,
    ...row.cells.map((cell) => `${round1(cell.hitRate * 100)}% / ${cell.n}`),
  ]);
  lines.push(formatMarkdownTable(matrixHeaders, matrixRows));
  lines.push("");

  lines.push("## Top SKIP Candidates");
  lines.push(
    formatMarkdownTable(
      [
        "Rule",
        "Train skipped",
        "Train keptHit",
        "Train Δ",
        "Valid skipped",
        "Valid keptHit",
        "Valid Δ",
        "Valid skippedErr",
        "Passes",
      ],
      report.topSkipCandidates.map((candidate) => [
        `\`${candidate.ruleId}\``,
        `${candidate.train.skipped}/${candidate.train.total}`,
        `${round1(candidate.train.keptHitRate * 100)}%`,
        `${round1(candidate.train.deltaKeptVsMain * 100)}pp`,
        `${candidate.valid.skipped}/${candidate.valid.total}`,
        `${round1(candidate.valid.keptHitRate * 100)}%`,
        `${round1(candidate.valid.deltaKeptVsMain * 100)}pp`,
        `${round1(candidate.valid.skippedErrorRate * 100)}%`,
        candidate.passesValidCriteria ? "yes" : "no",
      ]),
    ),
  );
  lines.push("");
  return lines.join("\n");
}

export function analyzeAgreementConfidenceStudy(
  trainRows: SignalReliabilityRow[],
  validRows: SignalReliabilityRow[],
  options: { minBucketSize: number; topK: number; skipSecondary: boolean },
  meta: {
    trainJoinedFile?: string;
    trainPredictionsFile?: string;
    validJoinedFile?: string;
    validPredictionsFile?: string;
    trainDatasetSummary?: DatasetSummary;
    validDatasetSummary?: DatasetSummary;
  } = {},
): AgreementConfidenceStudyReport {
  const emptyDatasetSummary = (): DatasetSummary => ({
    inputJoinedRows: trainRows.length,
    inputPredictionRows: 0,
    usableRows: trainRows.length,
    joinedWithoutPrediction: 0,
    predictionUrlDuplicates: 0,
    invalidJoinedRows: 0,
  });
  const trainDatasetSummary = meta.trainDatasetSummary ?? emptyDatasetSummary();
  const validDatasetSummary = meta.validDatasetSummary ?? {
    ...emptyDatasetSummary(),
    usableRows: validRows.length,
    inputJoinedRows: validRows.length,
  };

  const train = analyzeDataset(trainRows, trainDatasetSummary);
  const valid = analyzeDataset(validRows, validDatasetSummary);
  const skipRules = buildSkipRuleCandidates(trainRows, validRows, options);

  return {
    config: {
      trainJoinedFile: meta.trainJoinedFile || "",
      trainPredictionsFile: meta.trainPredictionsFile || "",
      validJoinedFile: meta.validJoinedFile || "",
      validPredictionsFile: meta.validPredictionsFile || "",
      minBucketSize: options.minBucketSize,
      topK: options.topK,
      skipSecondary: options.skipSecondary,
      agreementThresholds: [...AGREEMENT_THRESHOLDS],
      confidenceThresholds: [...CONFIDENCE_THRESHOLDS],
    },
    train,
    valid,
    hypothesis: skipRules.hypothesis,
    skipRuleCandidates: skipRules.all,
    topSkipCandidates: skipRules.top,
  };
}

function formatConsoleSummary(report: AgreementConfidenceStudyReport): string {
  const lines: string[] = [];
  lines.push("=== AGREEMENT + CONFIDENCE STUDY (49→100) ===");
  lines.push(
    `Train rows=${report.train.dataset.usableRows}, Valid rows=${report.valid.dataset.usableRows}, minBucket=${report.config.minBucketSize}`,
  );
  lines.push(`Train main=${formatAccuracyBlock(report.train.baseline.main)} | NOVA=${formatAccuracyBlock(report.train.baseline.nova ?? { hit: 0, total: 0, rate: 0 })}`);
  lines.push(`Valid main=${formatAccuracyBlock(report.valid.baseline.main)} | NOVA=${formatAccuracyBlock(report.valid.baseline.nova ?? { hit: 0, total: 0, rate: 0 })}`);
  lines.push(
    `Correlations (valid): agreement rho=${report.valid.correlations.spearmanAgreementVsMainCorrect}, confidence rho=${report.valid.correlations.spearmanConfidenceVsMainCorrect}`,
  );
  lines.push("");
  lines.push(`HYPOTHESIS (${report.hypothesis.rule})`);
  lines.push(`Train: ${formatSkipMetricsLine(report.hypothesis.train)}`);
  lines.push(`Valid: ${formatSkipMetricsLine(report.hypothesis.valid)}`);
  lines.push("");
  lines.push("Top SKIP candidates (valid-focused view):");
  for (const candidate of report.topSkipCandidates.slice(0, 10)) {
    lines.push(
      `- ${candidate.ruleId}: valid keptHit=${round1(candidate.valid.keptHitRate * 100)}% (Δ ${round1(
        candidate.valid.deltaKeptVsMain * 100,
      )}pp), skipped=${candidate.valid.skipped}/${candidate.valid.total}, skippedErr=${round1(
        candidate.valid.skippedErrorRate * 100,
      )}%, passes=${candidate.passesValidCriteria ? "yes" : "no"}`,
    );
  }
  if (report.topSkipCandidates.length === 0) {
    lines.push("- no candidates met train shortlist conditions");
  }
  return lines.join("\n");
}

async function readJsonArray(path: string): Promise<unknown[]> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`${path}: expected JSON array`);
  }
  return parsed;
}

async function runCli(argv: string[]): Promise<void> {
  const trainJoinedFile = (readArg(argv, "train-joined-file") || "").trim();
  const trainPredictionsFile = (readArg(argv, "train-predictions-file") || "").trim();
  const validJoinedFile = (readArg(argv, "valid-joined-file") || "").trim();
  const validPredictionsFile = (readArg(argv, "valid-predictions-file") || "").trim();
  if (!trainJoinedFile || !trainPredictionsFile || !validJoinedFile || !validPredictionsFile) {
    throw new Error(
      "Usage: node --import tsx scripts/validation/agreementConfidenceStudy.ts --train-joined-file <path> --train-predictions-file <path> --valid-joined-file <path> --valid-predictions-file <path> [--min-bucket-size 8] [--top-k 15] [--report-json path] [--report-md path] [--skip-secondary]",
    );
  }

  const minBucketSize = readIntArg(argv, "min-bucket-size", DEFAULT_MIN_BUCKET_SIZE);
  const topK = readIntArg(argv, "top-k", DEFAULT_TOP_K);
  const reportJsonPath = readArg(argv, "report-json");
  const reportMdPath = readArg(argv, "report-md");
  const skipSecondary = hasFlag(argv, "skip-secondary");

  const [trainJoinedRaw, trainPredictionsRaw, validJoinedRaw, validPredictionsRaw] = await Promise.all([
    readJsonArray(trainJoinedFile),
    readJsonArray(trainPredictionsFile),
    readJsonArray(validJoinedFile),
    readJsonArray(validPredictionsFile),
  ]);

  const trainBuild = buildSignalReliabilityRows(trainJoinedRaw, trainPredictionsRaw);
  const validBuild = buildSignalReliabilityRows(validJoinedRaw, validPredictionsRaw);

  const report = analyzeAgreementConfidenceStudy(
    trainBuild.rows,
    validBuild.rows,
    { minBucketSize, topK, skipSecondary },
    {
      trainJoinedFile,
      trainPredictionsFile,
      validJoinedFile,
      validPredictionsFile,
      trainDatasetSummary: trainBuild.datasetSummary,
      validDatasetSummary: validBuild.datasetSummary,
    },
  );

  console.log(formatConsoleSummary(report));

  if (reportJsonPath) {
    await writeFile(reportJsonPath, JSON.stringify(report, null, 2) + "\n", "utf8");
    console.log(`Saved JSON report to ${reportJsonPath}`);
  }
  if (reportMdPath) {
    await writeFile(reportMdPath, formatAgreementConfidenceReportMd(report), "utf8");
    console.log(`Saved Markdown report to ${reportMdPath}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

