import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  buildSignalReliabilityRows,
  canonicalizeMatchUrl,
  probabilityToSide,
  type SignalReliabilityRow,
} from "./agreementConfidenceStudy.js";
import {
  buildCheckmarkStudyRows,
  type CheckmarkStudyRow,
} from "./checkmarkCalibrationStudy.js";

type ProbSide = "home" | "away" | "neutral";

type TierFlags = { qualifying: boolean; unknown: boolean };

export interface TournamentTierInfo {
  tierScore: number;
  flags: TierFlags;
}

export interface WindowTargetSpec {
  enabled: boolean;
  target: number;
  used: number;
  reliability: number;
  degraded: boolean;
}

export interface WindowPlan {
  w10: WindowTargetSpec;
  w5: WindowTargetSpec;
  w3: WindowTargetSpec;
}

export interface DeepHistoryPerMatchFeature {
  matchUrl: string;
  candidateIndex: number;
  tournament?: string;
  dateText?: string;
  resultText?: string;
  scoreText?: string;
  serveCore: number;
  returnCore: number;
  controlCore: number;
  disciplineCore: number;
  tpwCore: number;
  oppStatsQ01?: number;
  tierScore: number;
  qualifying: boolean;
  oppStrengthComposite?: number;
  scoreParsed?: boolean;
  oppProxyUsable?: boolean;
}

export interface CachedPlayerDeepHistory {
  schemaVersion: number;
  key: string;
  targetMatchUrl: string;
  side: "A" | "B";
  playerName: string;
  profileUrl?: string;
  collectedAt: string;
  historyTechTarget: number;
  historyTechScanLimit: number;
  historyStatsMissBudget: number;
  recentCandidatesFound: number;
  recentCandidatesUsable: number;
  parsedTechMatches: number;
  collectionDiagnostics: {
    profileFound: boolean;
    recentCandidatePool: number;
    scanScanned: number;
    scanAccepted: number;
    techMissing: number;
    metricsIncomplete: number;
    parseErrors: number;
    nonSinglesHistory: number;
    errors: number;
  };
  records: DeepHistoryPerMatchFeature[];
}

export interface DeepHistoryCacheFile {
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  entries: Record<string, CachedPlayerDeepHistory>;
}

export interface BaseStudyRow {
  split: "train" | "valid";
  matchUrl: string;
  label: string;
  playerAName: string;
  playerBName: string;
  actualWinnerName?: string;
  mainPick: string;
  mainCorrect: boolean;
  confidencePct: number;
  methodsCount: number;
  agreementCount: number;
  agreementRatio: number | null;
  agreementText: string;
  historyPick?: string;
  historyNovaSame: boolean;
  novaP1?: number;
  novaMargin?: number;
  novaPick?: string;
  logRegP1?: number;
  markovP1?: number;
  bradleyP1?: number;
  bradleyMargin?: number;
  pcaP1?: number;
  logisticMargin?: number;
  novaLogisticAgree: boolean;
  modelSpreadCore?: number;
  pcaDeviation?: number;
  mainPickSide?: "A" | "B";
}

export interface TrendStrengthRow extends BaseStudyRow {
  nTechA: number;
  nTechB: number;
  techTrendCoverageScore: number;
  techTrendCoverageMin: number;
  trendWindowFallbackFlag: boolean;
  oppProxyCoverageA: number;
  oppProxyCoverageB: number;
  oppProxyCoverage: number;
  controlEdge_W10?: number;
  controlEdge_W5?: number;
  controlEdge_W3?: number;
  returnEdge_W10?: number;
  returnEdge_W5?: number;
  returnEdge_W3?: number;
  tpwEdge_W10?: number;
  tpwEdge_W5?: number;
  tpwEdge_W3?: number;
  oppStrengthEdge_W5?: number;
  tierEdge_W5?: number;
  volatilityEdge_W5?: number;
  controlTrend_3v5?: number;
  controlTrend_5v10?: number;
  returnTrend_3v5?: number;
  tpwTrend_3v5?: number;
  trendAcceleration?: number;
  trendCoherence?: number;
  strengthA?: number;
  strengthB?: number;
  strengthEdge?: number;
  stabilityA?: number;
  stabilityB?: number;
  stabilityEdge?: number;
  formTechA?: number;
  formTechB?: number;
  formTechEdge?: number;
  formPlusA?: number;
  formPlusB?: number;
  formPlusEdge?: number;
  relStrengthA?: number;
  relStrengthB?: number;
  relStabilityA?: number;
  relStabilityB?: number;
  relFormTechA?: number;
  relFormTechB?: number;
  relFormPlusA?: number;
  relFormPlusB?: number;
  scoreCoverageA?: number;
  scoreCoverageB?: number;
}

export interface SkipMetrics {
  total: number;
  skipped: number;
  kept: number;
  skipRate: number;
  keptHitRate: number;
  keptErrorRate: number;
  skippedHitRate: number;
  skippedErrorRate: number;
  deltaKeptVsMain: number;
}

interface CandidateEval {
  ruleId: string;
  rule: string;
  tags: string[];
  ruleFamily: string;
  train: SkipMetrics;
  valid: SkipMetrics;
  deltaKeptVsAgreementConfidenceBaseline: number;
  deltaKeptVsNovaLogitConfBaseline: number;
  deltaKeptVsBestExistingFilter: number;
  deltaKeptVsBestTrendStrengthBaseline?: number;
  passesCriteria: boolean;
}

export interface StudyReport {
  config: {
    trainJoinedFile: string;
    trainPredictionsFile: string;
    validJoinedFile: string;
    validPredictionsFile: string;
    entryUrl: string;
    historyTechTarget: number;
    historyTechScanLimit: number;
    historyStatsMissBudget: number;
    minBucketSize: number;
    topK: number;
    headed: boolean;
    slowMo: number;
    timeoutMs: number;
    maxGotoRetries: number;
    cacheDeepHistoryFile: string;
    skipDeterministic: boolean;
    skipFitted: boolean;
    thresholds: {
      agreement: number[];
      confidence: number[];
      trendCoherence: number[];
      trendDown: number[];
      trendCombo: number[];
      oppStrengthAdverse: number[];
      tierAdverse: number[];
      volatilityRisk: number[];
      coverageR: number[];
      oppProxyCoverage: number[];
      relMin?: number[];
      scoreCoverage?: number[];
      indexForm?: number[];
      indexStability?: number[];
      indexStrength?: number[];
    };
    baselineFilters: {
      agreementConfidenceSkip: string;
      novaLogitConfSend: string;
    };
  };
  datasets: {
    train: { baseRows: number; usableRows: number };
    valid: { baseRows: number; usableRows: number };
    deepCollection: {
      requestedPlayers: number;
      cacheHits: number;
      cacheMisses: number;
      collectedPlayers: number;
      failedPlayers: number;
    };
  };
  baselines: {
    train: BaselineSummary;
    valid: BaselineSummary;
    bestExistingFilterValidKeptHitRate: number;
    bestTrendStrengthBaselineValidKeptHitRate?: number;
  };
  candidateResults: CandidateEval[];
  topCandidates: CandidateEval[];
  recommendations: {
    improves: boolean;
    best?: CandidateEval;
    maxPrecision?: CandidateEval;
    balanced?: CandidateEval;
    coveragePreserving?: CandidateEval;
    conclusion: string;
  };
  ablationSummary?: {
    metaOnlyBestValid?: number;
    trendOnlyBestValid?: number;
    strengthOnlyBestValid?: number;
    combinedBestValid?: number;
    indexTechOnlyBestValid?: number;
    indexTechPlusScoreBestValid?: number;
    indexCombinedBestValid?: number;
  };
  indexCorrelations?: {
    train: Record<string, number | undefined>;
    valid: Record<string, number | undefined>;
  };
  indexRecommendation?: {
    preferredFormVariant: "tech-only" | "tech+score";
    rationale: string;
  };
}

interface BaselineSummary {
  mainOverallHitRate: number;
  total: number;
  noFilter: SkipMetrics;
  agreementConfidenceBaseline: SkipMetrics;
  novaLogitConfBaseline: SkipMetrics;
}

interface CandidateDefinition {
  ruleId: string;
  rule: string;
  tags: string[];
  ruleFamily: string;
  predicate: (row: TrendStrengthRow) => boolean;
}

interface Args {
  trainJoinedFile: string;
  trainPredictionsFile: string;
  validJoinedFile: string;
  validPredictionsFile: string;
  entryUrl: string;
  historyTechTarget: number;
  historyTechScanLimit: number;
  historyStatsMissBudget: number;
  headed: boolean;
  slowMo: number;
  timeoutMs: number;
  maxGotoRetries: number;
  minBucketSize: number;
  topK: number;
  skipFitted: boolean;
  skipDeterministic: boolean;
  cacheDeepHistoryFile: string;
  reportJson: string;
  reportMd: string;
}

interface DeepHistoryPairCacheEntry {
  matchUrl: string;
  playerA?: CachedPlayerDeepHistory;
  playerB?: CachedPlayerDeepHistory;
}

interface PerPlayerWindowAgg {
  nAvailable: number;
  windows: {
    w10?: WindowAggregate;
    w5?: WindowAggregate;
    w3?: WindowAggregate;
  };
  plan: WindowPlan;
  techTrendCoverageScore: number;
  techTrendCoverageMin: number;
  trendWindowFallbackFlag: boolean;
  oppProxyCoverage: number;
}

interface WindowAggregate {
  n: number;
  reliability: number;
  meanServeCore: number;
  meanReturnCore: number;
  meanControlCore: number;
  meanDisciplineCore: number;
  meanTPWCore: number;
  volatilityCore: number;
  meanOppStrength: number;
  qualifyingShare: number;
  tierMean: number;
  scoreMomentum?: number;
  scoreCoverage?: number;
}

interface PerPlayerIndices {
  strength?: number;
  stability?: number;
  formTech?: number;
  formPlus?: number;
  relStrength?: number;
  relStability?: number;
  relFormTech?: number;
  relFormPlus?: number;
  scoreCoverage?: number;
}

interface PerMatchScoreFeatures {
  scoreParsed: boolean;
  matchWonSign?: number;
  setMarginNorm?: number;
  gameMarginNorm?: number;
  scoreMomentum?: number;
}

const CACHE_SCHEMA_VERSION = 1;
const DEFAULT_ENTRY_URL = "https://www.flashscore.co.ke/tennis/";
const DEFAULT_HISTORY_TECH_TARGET = 10;
const DEFAULT_HISTORY_TECH_SCAN_LIMIT = 80;
const DEFAULT_HISTORY_STATS_MISS_BUDGET = 0;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_GOTO_RETRIES = 4;
const DEFAULT_MIN_BUCKET_SIZE = 8;
const DEFAULT_TOP_K = 20;
const DEFAULT_CACHE_FILE = "tmp/nova-trend-strength-49to100-cache.json";
const DEFAULT_REPORT_JSON = "tmp/nova-trend-strength-49to100-report.json";
const DEFAULT_REPORT_MD = "tmp/nova-trend-strength-49to100-report.md";

const AGREEMENT_THRESHOLDS = [1, 2, 3] as const;
const CONFIDENCE_THRESHOLDS = [50, 52, 55, 58] as const;
const TREND_COHERENCE_THRESHOLDS = [0.34, 0.5, 0.67, 1.0] as const;
const TREND_DOWN_THRESHOLDS = [-0.10, -0.06, -0.03, 0] as const;
const TREND_COMBO_THRESHOLDS = [-0.18, -0.12, -0.08, -0.04, 0] as const;
const OPP_STRENGTH_ADVERSE_THRESHOLDS = [-0.20, -0.12, -0.08, -0.04] as const;
const TIER_ADVERSE_THRESHOLDS = [-0.25, -0.15, -0.10, -0.05] as const;
const VOLATILITY_RISK_THRESHOLDS = [0.05, 0.10, 0.15] as const;
const COVERAGE_R_THRESHOLDS = [0.45, 0.60, 0.75] as const;
const OPP_PROXY_COVERAGE_THRESHOLDS = [0.50, 0.70, 0.85] as const;
const REL_MIN_THRESHOLDS = [0.45, 0.60, 0.75] as const;
const SCORE_COVERAGE_THRESHOLDS = [0.40, 0.60, 0.80] as const;
const INDEX_FORM_THRESHOLDS = [-12, -8, -5, -3, 0] as const;
const INDEX_STAB_THRESHOLDS = [-10, -6, -3, 0] as const;
const INDEX_STRENGTH_THRESHOLDS = [-10, -6, -3, 0] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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

function safeRate(hit: number, total: number): number {
  return total > 0 ? hit / total : 0;
}

function normalizeLooseName(value: string | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function readArg(argv: string[], key: string): string | undefined {
  const token = `--${key}`;
  const index = argv.findIndex((v) => v === token);
  if (index < 0) return undefined;
  const next = argv[index + 1];
  if (!next || next.startsWith("--")) return undefined;
  return next;
}

function readIntArg(argv: string[], key: string): number | undefined {
  const raw = readArg(argv, key);
  if (typeof raw !== "string") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || !Number.isFinite(n)) {
    throw new Error(`--${key} must be an integer`);
  }
  return n;
}

function readBoolFlag(argv: string[], key: string, fallback: boolean): boolean {
  if (argv.includes(`--no-${key}`)) return false;
  if (argv.includes(`--${key}`)) return true;
  return fallback;
}

function ensureDirFor(file: string): Promise<void> {
  const idx = file.lastIndexOf("/");
  if (idx <= 0) return Promise.resolve();
  return mkdir(file.slice(0, idx), { recursive: true }).then(() => undefined);
}

export function inferTournamentTierScore(tournament: string | undefined): TournamentTierInfo {
  const raw = String(tournament || "").trim();
  const text = raw.toLowerCase();
  const qualifying = /\bqualif(?:ying|ication)?\b|\bqualification\b/.test(text);
  const flags: TierFlags = { qualifying, unknown: false };
  if (!text) {
    flags.unknown = true;
    return { tierScore: 0.5, flags };
  }

  if (/(australian open|roland garros|wimbledon|us open|grand slam)/i.test(raw)) {
    return { tierScore: 1.0, flags };
  }
  if (/(atp finals|wta finals|masters\s*1000|\bmasters\b|\b1000\b)/i.test(raw)) {
    return { tierScore: 0.9, flags };
  }
  if (/(\batp\s*500\b|\bwta\s*500\b)/i.test(raw)) {
    return { tierScore: 0.8, flags };
  }
  if (/(\batp\s*250\b|\bwta\s*250\b)/i.test(raw)) {
    return { tierScore: 0.7, flags };
  }
  if (/(challenger|atp challenger|\bwta\s*125\b)/i.test(raw)) {
    return { tierScore: 0.55, flags };
  }
  if (/(\bitf\b|\bm15\b|\bm25\b|\bw15\b|\bw25\b|futures)/i.test(raw)) {
    return { tierScore: 0.35, flags };
  }
  flags.unknown = true;
  return { tierScore: 0.5, flags };
}

export function computeOpponentStatsQuality01(input: {
  total_points_won?: number;
  return_points_won?: number;
  total_games_won?: number;
  service_games_won?: number;
  return_games_won?: number;
}): number | undefined {
  const req = [
    input.total_points_won,
    input.return_points_won,
    input.total_games_won,
    input.service_games_won,
    input.return_games_won,
  ];
  if (req.some((v) => !isFiniteNumber(v))) return undefined;
  const score =
    0.30 * (input.total_points_won as number) +
    0.20 * (input.return_points_won as number) +
    0.20 * (input.total_games_won as number) +
    0.15 * (input.service_games_won as number) +
    0.15 * (input.return_games_won as number);
  return round3(clamp((score - 35) / 30, 0, 1));
}

export function combineOpponentStrengthProxy(oppStatsQ01: number | undefined, tierScore: number): number | undefined {
  if (!isFiniteNumber(oppStatsQ01)) return undefined;
  return round3(clamp(0.65 * oppStatsQ01 + 0.35 * tierScore, 0, 1));
}

export function computeWindowPlan(nAvailable: number): WindowPlan {
  const planFor = (target: number, minEnable: number): WindowTargetSpec => {
    if (!Number.isFinite(nAvailable) || nAvailable < minEnable) {
      return { enabled: false, target, used: 0, reliability: 0, degraded: false };
    }
    const used = Math.min(target, Math.max(0, Math.floor(nAvailable)));
    const reliability = round3(clamp(used / target, 0, 1));
    return { enabled: true, target, used, reliability, degraded: used < target };
  };
  return {
    w10: planFor(10, 6),
    w5: planFor(5, 4),
    w3: planFor(3, 2),
  };
}

function recencyWeight(windowName: "w10" | "w5" | "w3", index: number, count: number): number {
  if (windowName === "w3") {
    const arr = [1.0, 0.8, 0.65];
    return arr[index] ?? Math.max(0.4, 1 - index * 0.2);
  }
  const max = windowName === "w10" ? 1.0 : 1.0;
  const min = windowName === "w10" ? 0.55 : 0.60;
  if (count <= 1) return max;
  const t = index / (count - 1);
  return max + (min - max) * t;
}

function weightedMean(values: number[], weights: number[]): number {
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0 || values.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) sum += values[i]! * (weights[i] ?? 0);
  return sum / sumW;
}

function weightedVariance(values: number[], weights: number[]): number {
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0 || values.length <= 1) return 0;
  const mu = weightedMean(values, weights);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    const d = (values[i] ?? 0) - mu;
    sum += (weights[i] ?? 0) * d * d;
  }
  return sum / sumW;
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function pearsonBinary(values: Array<number | undefined>, target01: Array<number | undefined>): number | undefined {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const x = values[i];
    const y = target01[i];
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) continue;
    xs.push(x);
    ys.push(y);
  }
  if (xs.length < 3) return undefined;
  const mx = mean(xs);
  const my = mean(ys);
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const dx = (xs[i] ?? 0) - mx;
    const dy = (ys[i] ?? 0) - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx <= 0 || vy <= 0) return undefined;
  return round3(cov / Math.sqrt(vx * vy));
}

function signOf(value: number | undefined): -1 | 0 | 1 {
  if (!isFiniteNumber(value) || Math.abs(value) < 1e-9) return 0;
  return value > 0 ? 1 : -1;
}

function computeTrendCoherence(values: Array<number | undefined>): number | undefined {
  const signs = values.map(signOf).filter((s) => s !== 0);
  if (signs.length === 0) return undefined;
  const pos = signs.filter((s) => s > 0).length;
  const neg = signs.filter((s) => s < 0).length;
  return round3(Math.max(pos, neg) / signs.length);
}

function parseScoreTextWin(resultText: string | undefined): boolean | undefined {
  const raw = String(resultText || "").trim();
  if (!raw) return undefined;
  const m = raw.match(/(?:^|\s)([WLВП])(?:\s|$)/u);
  if (!m) return undefined;
  const token = m[1]?.toUpperCase();
  if (token === "W" || token === "В") return true;
  if (token === "L" || token === "П") return false;
  return undefined;
}

function parseResultMarkerSign(resultText: string | undefined): 1 | -1 | undefined {
  const win = parseScoreTextWin(resultText);
  if (win === true) return 1;
  if (win === false) return -1;
  return undefined;
}

function parseSetMarginNormFromScore(scoreText: string | undefined): number | undefined {
  const text = String(scoreText || "").trim();
  if (!text) return undefined;
  const m = text.match(/^(\d+)\s*[-:]\s*(\d+)/);
  if (!m) return undefined;
  const left = Number(m[1]);
  const right = Number(m[2]);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return undefined;
  if (left <= 5 && right <= 5) {
    return clamp((left - right) / 2, -1, 1);
  }
  return undefined;
}

function parseGameMarginNormFromScore(scoreText: string | undefined): number | undefined {
  const text = String(scoreText || "").trim();
  if (!text) return undefined;
  const pairs = [...text.matchAll(/(\d+)\s*[-:]\s*(\d+)/g)];
  if (!pairs.length) return undefined;
  const nums = pairs
    .map((m) => [Number(m[1]), Number(m[2])] as const)
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  const gamePairs = nums.filter(([a, b]) => a > 3 || b > 3);
  if (!gamePairs.length) return undefined;
  const margin = gamePairs.reduce((acc, [a, b]) => acc + (a - b), 0);
  return clamp(margin / 12, -1, 1);
}

export function parseScoreMomentumFeatures(input: { resultText?: string; scoreText?: string }): PerMatchScoreFeatures {
  const matchWonSign = parseResultMarkerSign(input.resultText);
  const setMarginNorm = parseSetMarginNormFromScore(input.scoreText);
  const gameMarginNorm = parseGameMarginNormFromScore(input.scoreText);
  const scoreParsed = matchWonSign !== undefined || setMarginNorm !== undefined || gameMarginNorm !== undefined;
  let scoreMomentum: number | undefined;
  if (scoreParsed) {
    scoreMomentum = clamp(
      0.65 * (matchWonSign ?? 0) + 0.20 * (setMarginNorm ?? 0) + 0.15 * (gameMarginNorm ?? 0),
      -1,
      1,
    );
  }
  return {
    scoreParsed,
    matchWonSign,
    setMarginNorm,
    gameMarginNorm,
    scoreMomentum: isFiniteNumber(scoreMomentum) ? round3(scoreMomentum) : undefined,
  };
}

function normalizePickSide(mainPick: string, playerAName: string, playerBName: string): "A" | "B" | undefined {
  const pick = normalizeLooseName(mainPick);
  const a = normalizeLooseName(playerAName);
  const b = normalizeLooseName(playerBName);
  if (!pick || !a || !b) return undefined;
  if (pick === a) return "A";
  if (pick === b) return "B";
  if (a.includes(pick) || pick.includes(a)) return "A";
  if (b.includes(pick) || pick.includes(b)) return "B";
  const pickLast = pick.split(/\s+/).filter(Boolean).at(-1);
  const aLast = a.split(/\s+/).filter(Boolean).at(-1);
  const bLast = b.split(/\s+/).filter(Boolean).at(-1);
  if (pickLast && aLast && pickLast.length >= 3 && pickLast === aLast) return "A";
  if (pickLast && bLast && pickLast.length >= 3 && pickLast === bLast) return "B";
  return undefined;
}

function orientByPick(value: number | undefined, side: "A" | "B" | undefined): number | undefined {
  if (!isFiniteNumber(value) || !side) return undefined;
  return side === "A" ? value : -value;
}

function normalizePercent(v: number | undefined): number {
  if (!isFiniteNumber(v)) return 0;
  return clamp(v / 100, 0, 1.2);
}

function disciplineFrom(firstServePct: number | undefined, doubleFaults: number | undefined): number {
  const fs = normalizePercent(firstServePct);
  const dfInv = 1 / (1 + Math.max(0, isFiniteNumber(doubleFaults) ? doubleFaults : 0));
  return 0.75 * dfInv + 0.25 * fs;
}

function serveCoreFrom(row: DirtRowsPair): number {
  const p = row.player;
  return (
    0.18 * normalizePercent(p.first_serve_points_won) +
    0.22 * normalizePercent(p.second_serve_points_won) +
    0.24 * normalizePercent(p.total_service_points_won) +
    0.22 * normalizePercent(p.service_games_won) +
    0.14 * normalizePercent(p.break_points_saved)
  );
}

function returnCoreFrom(row: DirtRowsPair): number {
  const p = row.player;
  return (
    0.18 * normalizePercent(p.first_serve_return_points_won) +
    0.20 * normalizePercent(p.second_serve_return_points_won) +
    0.26 * normalizePercent(p.return_points_won) +
    0.20 * normalizePercent(p.return_games_won) +
    0.16 * normalizePercent(p.break_points_converted)
  );
}

function controlCoreFrom(row: DirtRowsPair): number {
  const p = row.player;
  return 0.6 * normalizePercent(p.total_points_won) + 0.4 * normalizePercent(p.total_games_won);
}

function tpwCoreFrom(row: DirtRowsPair): number {
  return normalizePercent(row.player.total_points_won);
}

interface RequiredLikeDirt {
  first_serve: number;
  first_serve_points_won: number;
  second_serve_points_won: number;
  break_points_saved: number;
  double_faults: number;
  first_serve_return_points_won: number;
  second_serve_return_points_won: number;
  break_points_converted: number;
  total_service_points_won: number;
  return_points_won: number;
  total_points_won: number;
  service_games_won: number;
  return_games_won: number;
  total_games_won: number;
}

interface DirtRowsPair {
  player: RequiredLikeDirt;
  opponent: RequiredLikeDirt;
}

function windowAggregate(records: DeepHistoryPerMatchFeature[], windowName: "w10" | "w5" | "w3", spec: WindowTargetSpec): WindowAggregate | undefined {
  if (!spec.enabled || spec.used <= 0) return undefined;
  const subset = records.slice(0, spec.used);
  if (!subset.length) return undefined;
  const weightsRaw = subset.map((r, i) => {
    const wr = recencyWeight(windowName, i, subset.length);
    const opp = isFiniteNumber(r.oppStrengthComposite) ? r.oppStrengthComposite : 0.5;
    return wr * (0.85 + 0.30 * opp);
  });
  const sumW = weightsRaw.reduce((a, b) => a + b, 0) || 1;
  const weights = weightsRaw.map((w) => w / sumW);
  const serve = subset.map((r) => r.serveCore);
  const ret = subset.map((r) => r.returnCore);
  const ctl = subset.map((r) => r.controlCore);
  const dis = subset.map((r) => r.disciplineCore);
  const tpw = subset.map((r) => r.tpwCore);
  const oppStrength = subset.map((r) => (isFiniteNumber(r.oppStrengthComposite) ? r.oppStrengthComposite : 0.5));
  const tier = subset.map((r) => r.tierScore);
  const qual = subset.map((r) => (r.qualifying ? 1 : 0));
  const scoreMomVals: number[] = [];
  const scoreMomWeights: number[] = [];
  subset.forEach((r, idx) => {
    const score = parseScoreMomentumFeatures({ resultText: r.resultText, scoreText: r.scoreText });
    if (isFiniteNumber(score.scoreMomentum)) {
      scoreMomVals.push(score.scoreMomentum);
      scoreMomWeights.push(weights[idx] ?? 0);
    }
  });
  const vServe = weightedVariance(serve, weights);
  const vRet = weightedVariance(ret, weights);
  const vCtl = weightedVariance(ctl, weights);
  const volatility = mean([vServe, vRet, vCtl]);

  return {
    n: subset.length,
    reliability: spec.reliability,
    meanServeCore: round3(weightedMean(serve, weights)),
    meanReturnCore: round3(weightedMean(ret, weights)),
    meanControlCore: round3(weightedMean(ctl, weights)),
    meanDisciplineCore: round3(weightedMean(dis, weights)),
    meanTPWCore: round3(weightedMean(tpw, weights)),
    volatilityCore: round3(volatility),
    meanOppStrength: round3(weightedMean(oppStrength, weights)),
    qualifyingShare: round3(weightedMean(qual, weights)),
    tierMean: round3(weightedMean(tier, weights)),
    scoreMomentum: scoreMomVals.length ? round3(weightedMean(scoreMomVals, scoreMomWeights)) : undefined,
    scoreCoverage: round3(scoreMomVals.length / subset.length),
  };
}

export function computePlayerWindowAggregates(records: DeepHistoryPerMatchFeature[]): PerPlayerWindowAgg {
  const plan = computeWindowPlan(records.length);
  const w10 = windowAggregate(records, "w10", plan.w10);
  const w5 = windowAggregate(records, "w5", plan.w5);
  const w3 = windowAggregate(records, "w3", plan.w3);
  const coverageVals = [plan.w10.reliability, plan.w5.reliability, plan.w3.reliability];
  const techTrendCoverageMin = round3(Math.min(...coverageVals));
  const techTrendCoverageScore = round3(0.4 * coverageVals[0] + 0.35 * coverageVals[1] + 0.25 * coverageVals[2]);
  const trendWindowFallbackFlag = !!(plan.w10.degraded || plan.w5.degraded || plan.w3.degraded);
  const oppProxyCoverage = records.length > 0
    ? round3(records.filter((r) => isFiniteNumber(r.oppStrengthComposite)).length / records.length)
    : 0;

  return {
    nAvailable: records.length,
    windows: { w10, w5, w3 },
    plan,
    techTrendCoverageScore,
    techTrendCoverageMin,
    trendWindowFallbackFlag,
    oppProxyCoverage,
  };
}

function fallbackPenaltyFromPlan(plan: WindowPlan): number {
  let disabledTargets = 0;
  if (!plan.w10.enabled) disabledTargets += 1;
  if (!plan.w5.enabled) disabledTargets += 1;
  if (!plan.w3.enabled) disabledTargets += 1;
  return round3(0.12 * disabledTargets);
}

function normalizeWindowMix(parts: Array<{ value: number | undefined; weight: number }>): number | undefined {
  const usable = parts.filter((p) => isFiniteNumber(p.value) && p.weight > 0);
  if (!usable.length) return undefined;
  const sumW = usable.reduce((acc, p) => acc + p.weight, 0) || 1;
  const out = usable.reduce((acc, p) => acc + (p.value as number) * p.weight, 0) / sumW;
  return round3(out);
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function computePerPlayerStrengthIndex(agg: PerPlayerWindowAgg): { strength?: number; relStrength?: number } {
  const fp = fallbackPenaltyFromPlan(agg.plan);
  const w10 = agg.windows.w10;
  const w5 = agg.windows.w5;
  const w3 = agg.windows.w3;
  const strengthW = (w: WindowAggregate | undefined): number | undefined => {
    if (!w) return undefined;
    const raw =
      0.22 * w.meanServeCore +
      0.24 * w.meanReturnCore +
      0.28 * w.meanControlCore +
      0.10 * w.meanDisciplineCore +
      0.16 * w.meanTPWCore;
    const oppAdj = 0.85 + 0.30 * ((w.meanOppStrength ?? 0.5) - 0.5);
    return clamp(raw * oppAdj, 0, 1.25);
  };
  const base = normalizeWindowMix([
    { value: strengthW(w10), weight: 0.45 },
    { value: strengthW(w5), weight: 0.35 },
    { value: strengthW(w3), weight: 0.20 },
  ]);
  if (!isFiniteNumber(base)) return {};
  const baseScaled = clamp(100 * base, 0, 100);
  const relStrength = clamp(agg.techTrendCoverageScore - fp + 0.10 * agg.oppProxyCoverage, 0.35, 1.0);
  const strength = clamp(50 + (baseScaled - 50) * relStrength, 0, 100);
  return { strength: round3(strength), relStrength: round3(relStrength) };
}

function computePerPlayerStabilityIndex(agg: PerPlayerWindowAgg): { stability?: number; relStability?: number } {
  const fp = fallbackPenaltyFromPlan(agg.plan);
  const w10 = agg.windows.w10;
  const w5 = agg.windows.w5;
  const w3 = agg.windows.w3;

  const volScore = (w: WindowAggregate | undefined): number | undefined => {
    if (!w) return undefined;
    return clamp01(1 - (w.volatilityCore ?? 0) / 0.18);
  };

  const consistencyPair = (a: number | undefined, b: number | undefined): number | undefined => {
    if (!isFiniteNumber(a) || !isFiniteNumber(b)) return undefined;
    return clamp01(1 - Math.abs(a - b) / 0.12);
  };

  const consistencyScore = normalizeWindowMix([
    { value: consistencyPair(w3?.meanControlCore, w5?.meanControlCore), weight: 1 / 3 },
    { value: consistencyPair(w3?.meanReturnCore, w5?.meanReturnCore), weight: 1 / 3 },
    { value: consistencyPair(w3?.meanTPWCore, w5?.meanTPWCore), weight: 1 / 3 },
  ]);

  const base01 = normalizeWindowMix([
    { value: volScore(w10), weight: 0.45 },
    { value: volScore(w5), weight: 0.25 },
    { value: volScore(w3), weight: 0.10 },
    { value: consistencyScore, weight: 0.20 },
  ]);
  if (!isFiniteNumber(base01)) return {};
  const base = clamp(100 * base01, 0, 100);
  const relStability = clamp(agg.techTrendCoverageScore - fp, 0.30, 1.0);
  const stability = clamp(50 + (base - 50) * relStability, 0, 100);
  return { stability: round3(stability), relStability: round3(relStability) };
}

interface FormTechComputation {
  formTech?: number;
  relFormTech?: number;
  formTechCentered?: number;
}

function computePerPlayerFormIndexTech(agg: PerPlayerWindowAgg): FormTechComputation {
  const fp = fallbackPenaltyFromPlan(agg.plan);
  const w10 = agg.windows.w10;
  const w5 = agg.windows.w5;
  const w3 = agg.windows.w3;

  const controlTrend = isFiniteNumber(w3?.meanControlCore) && isFiniteNumber(w5?.meanControlCore)
    ? (w3!.meanControlCore - w5!.meanControlCore)
    : undefined;
  const returnTrend = isFiniteNumber(w3?.meanReturnCore) && isFiniteNumber(w5?.meanReturnCore)
    ? (w3!.meanReturnCore - w5!.meanReturnCore)
    : undefined;
  const tpwTrend = isFiniteNumber(w3?.meanTPWCore) && isFiniteNumber(w5?.meanTPWCore)
    ? (w3!.meanTPWCore - w5!.meanTPWCore)
    : undefined;
  const midTrend = isFiniteNumber(w5?.meanControlCore) && isFiniteNumber(w10?.meanControlCore)
    ? (w5!.meanControlCore - w10!.meanControlCore)
    : 0;
  const trendAcceleration = isFiniteNumber(controlTrend) ? (controlTrend - (midTrend ?? 0)) : undefined;
  const trendCoherence = computeTrendCoherence([controlTrend, returnTrend, tpwTrend]);

  const nControlTrend = isFiniteNumber(controlTrend) ? clamp(controlTrend / 0.10, -1, 1) : 0;
  const nReturnTrend = isFiniteNumber(returnTrend) ? clamp(returnTrend / 0.10, -1, 1) : 0;
  const nTPWTrend = isFiniteNumber(tpwTrend) ? clamp(tpwTrend / 0.10, -1, 1) : 0;
  const nAccel = isFiniteNumber(trendAcceleration) ? clamp(trendAcceleration / 0.12, -1, 1) : 0;
  const cohCentered = isFiniteNumber(trendCoherence) ? clamp(2 * trendCoherence - 1, -1, 1) : 0;

  const centered = clamp(
    0.32 * nControlTrend +
    0.28 * nReturnTrend +
    0.20 * nTPWTrend +
    0.10 * nAccel +
    0.10 * cohCentered,
    -1,
    1,
  );
  const formBase = clamp(50 + 35 * centered, 0, 100);

  const relW10 = agg.plan.w10.reliability;
  const relW5 = agg.plan.w5.reliability;
  const relW3 = agg.plan.w3.reliability;
  const relForm = clamp(0.20 + 0.50 * relW3 + 0.20 * relW5 + 0.10 * relW10 - fp, 0.20, 1.0);
  const formTech = clamp(50 + (formBase - 50) * relForm, 0, 100);

  return {
    formTech: round3(formTech),
    relFormTech: round3(relForm),
    formTechCentered: round3(centered),
  };
}

function computePerPlayerFormIndexTechPlusScore(
  agg: PerPlayerWindowAgg,
  tech: FormTechComputation,
): { formPlus?: number; relFormPlus?: number; scoreCoverage?: number } {
  if (!isFiniteNumber(tech.formTech) || !isFiniteNumber(tech.relFormTech) || !isFiniteNumber(tech.formTechCentered)) {
    return {};
  }
  const w10 = agg.windows.w10;
  const w5 = agg.windows.w5;
  const w3 = agg.windows.w3;

  const scoreTrend_3v5 = isFiniteNumber(w3?.scoreMomentum) && isFiniteNumber(w5?.scoreMomentum)
    ? (w3!.scoreMomentum! - w5!.scoreMomentum!)
    : undefined;
  const scoreTrend_5v10 = isFiniteNumber(w5?.scoreMomentum) && isFiniteNumber(w10?.scoreMomentum)
    ? (w5!.scoreMomentum! - w10!.scoreMomentum!)
    : undefined;
  const nScoreTrend = isFiniteNumber(scoreTrend_3v5) ? clamp(scoreTrend_3v5 / 0.8, -1, 1) : 0;
  const nScoreAccel = isFiniteNumber(scoreTrend_3v5) ? clamp(((scoreTrend_3v5 ?? 0) - (scoreTrend_5v10 ?? 0)) / 1.0, -1, 1) : 0;
  const scoreCentered = clamp(0.70 * nScoreTrend + 0.30 * nScoreAccel, -1, 1);

  const formPlusCentered = clamp(0.80 * (tech.formTechCentered as number) + 0.20 * scoreCentered, -1, 1);
  let formPlusBase = clamp(50 + 35 * formPlusCentered, 0, 100);

  const scoreCoverage = normalizeWindowMix([
    { value: w10?.scoreCoverage, weight: 0.45 },
    { value: w5?.scoreCoverage, weight: 0.35 },
    { value: w3?.scoreCoverage, weight: 0.20 },
  ]) ?? 0;

  const relScore = clamp(scoreCoverage, 0, 1);
  const relFormPlus = clamp(0.80 * (tech.relFormTech as number) + 0.20 * relScore, 0.20, 1.0);
  formPlusBase = clamp(50 + (formPlusBase - 50) * relFormPlus, 0, 100);
  return {
    formPlus: round3(formPlusBase),
    relFormPlus: round3(relFormPlus),
    scoreCoverage: round3(scoreCoverage),
  };
}

export function computePerPlayerIndices(agg: PerPlayerWindowAgg): PerPlayerIndices {
  const strength = computePerPlayerStrengthIndex(agg);
  const stability = computePerPlayerStabilityIndex(agg);
  const formTech = computePerPlayerFormIndexTech(agg);
  const formPlus = computePerPlayerFormIndexTechPlusScore(agg, formTech);
  return {
    strength: strength.strength,
    stability: stability.stability,
    formTech: formTech.formTech,
    formPlus: formPlus.formPlus,
    relStrength: strength.relStrength,
    relStability: stability.relStability,
    relFormTech: formTech.relFormTech,
    relFormPlus: formPlus.relFormPlus,
    scoreCoverage: formPlus.scoreCoverage,
  };
}

function edge(a: number | undefined, b: number | undefined): number | undefined {
  if (!isFiniteNumber(a) || !isFiniteNumber(b)) return undefined;
  return round3(a - b);
}

function mergeToTrendStrengthRow(base: BaseStudyRow, playerARec: DeepHistoryPerMatchFeature[], playerBRec: DeepHistoryPerMatchFeature[]): TrendStrengthRow {
  const aggA = computePlayerWindowAggregates(playerARec);
  const aggB = computePlayerWindowAggregates(playerBRec);
  const idxA = computePerPlayerIndices(aggA);
  const idxB = computePerPlayerIndices(aggB);
  const w10A = aggA.windows.w10;
  const w10B = aggB.windows.w10;
  const w5A = aggA.windows.w5;
  const w5B = aggB.windows.w5;
  const w3A = aggA.windows.w3;
  const w3B = aggB.windows.w3;

  const controlEdge_W10 = edge(w10A?.meanControlCore, w10B?.meanControlCore);
  const controlEdge_W5 = edge(w5A?.meanControlCore, w5B?.meanControlCore);
  const controlEdge_W3 = edge(w3A?.meanControlCore, w3B?.meanControlCore);
  const returnEdge_W10 = edge(w10A?.meanReturnCore, w10B?.meanReturnCore);
  const returnEdge_W5 = edge(w5A?.meanReturnCore, w5B?.meanReturnCore);
  const returnEdge_W3 = edge(w3A?.meanReturnCore, w3B?.meanReturnCore);
  const tpwEdge_W10 = edge(w10A?.meanTPWCore, w10B?.meanTPWCore);
  const tpwEdge_W5 = edge(w5A?.meanTPWCore, w5B?.meanTPWCore);
  const tpwEdge_W3 = edge(w3A?.meanTPWCore, w3B?.meanTPWCore);
  const oppStrengthEdge_W5 = edge(w5A?.meanOppStrength, w5B?.meanOppStrength);
  const tierEdge_W5 = edge(w5A?.tierMean, w5B?.tierMean);
  const volatilityEdge_W5 = edge(w5B?.volatilityCore, w5A?.volatilityCore);

  const controlTrend_3v5 = edge(controlEdge_W3, controlEdge_W5);
  const controlTrend_5v10 = edge(controlEdge_W5, controlEdge_W10);
  const returnTrend_3v5 = edge(returnEdge_W3, returnEdge_W5);
  const tpwTrend_3v5 = edge(tpwEdge_W3, tpwEdge_W5);
  const trendAcceleration = edge(controlTrend_3v5, controlTrend_5v10);
  const trendCoherence = computeTrendCoherence([controlTrend_3v5, returnTrend_3v5, tpwTrend_3v5]);

  return {
    ...base,
    nTechA: aggA.nAvailable,
    nTechB: aggB.nAvailable,
    techTrendCoverageScore: round3((aggA.techTrendCoverageScore + aggB.techTrendCoverageScore) / 2),
    techTrendCoverageMin: round3(Math.min(aggA.techTrendCoverageMin, aggB.techTrendCoverageMin)),
    trendWindowFallbackFlag: aggA.trendWindowFallbackFlag || aggB.trendWindowFallbackFlag,
    oppProxyCoverageA: aggA.oppProxyCoverage,
    oppProxyCoverageB: aggB.oppProxyCoverage,
    oppProxyCoverage: round3((aggA.oppProxyCoverage + aggB.oppProxyCoverage) / 2),
    controlEdge_W10,
    controlEdge_W5,
    controlEdge_W3,
    returnEdge_W10,
    returnEdge_W5,
    returnEdge_W3,
    tpwEdge_W10,
    tpwEdge_W5,
    tpwEdge_W3,
    oppStrengthEdge_W5,
    tierEdge_W5,
    volatilityEdge_W5,
    controlTrend_3v5,
    controlTrend_5v10,
    returnTrend_3v5,
    tpwTrend_3v5,
    trendAcceleration,
    trendCoherence,
    strengthA: idxA.strength,
    strengthB: idxB.strength,
    strengthEdge: edge(idxA.strength, idxB.strength),
    stabilityA: idxA.stability,
    stabilityB: idxB.stability,
    stabilityEdge: edge(idxA.stability, idxB.stability),
    formTechA: idxA.formTech,
    formTechB: idxB.formTech,
    formTechEdge: edge(idxA.formTech, idxB.formTech),
    formPlusA: idxA.formPlus,
    formPlusB: idxB.formPlus,
    formPlusEdge: edge(idxA.formPlus, idxB.formPlus),
    relStrengthA: idxA.relStrength,
    relStrengthB: idxB.relStrength,
    relStabilityA: idxA.relStability,
    relStabilityB: idxB.relStability,
    relFormTechA: idxA.relFormTech,
    relFormTechB: idxB.relFormTech,
    relFormPlusA: idxA.relFormPlus,
    relFormPlusB: idxB.relFormPlus,
    scoreCoverageA: idxA.scoreCoverage,
    scoreCoverageB: idxB.scoreCoverage,
  };
}

export async function loadDeepHistoryCache(file: string): Promise<DeepHistoryCacheFile> {
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<DeepHistoryCacheFile>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.schemaVersion !== CACHE_SCHEMA_VERSION ||
      !parsed.entries ||
      typeof parsed.entries !== "object"
    ) {
      return {
        schemaVersion: CACHE_SCHEMA_VERSION,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        entries: {},
      };
    }
    return {
      schemaVersion: CACHE_SCHEMA_VERSION,
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      entries: parsed.entries as Record<string, CachedPlayerDeepHistory>,
    };
  } catch {
    return {
      schemaVersion: CACHE_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      entries: {},
    };
  }
}

export async function saveDeepHistoryCache(file: string, cache: DeepHistoryCacheFile): Promise<void> {
  await ensureDirFor(file);
  cache.updatedAt = new Date().toISOString();
  await writeFile(file, JSON.stringify(cache, null, 2), "utf8");
}

interface BuildBaseRowsResult {
  train: BaseStudyRow[];
  valid: BaseStudyRow[];
  datasets: {
    train: { baseRows: number; usableRows: number };
    valid: { baseRows: number; usableRows: number };
  };
}

function mergeMetaRows(signalRows: SignalReliabilityRow[], checkRows: CheckmarkStudyRow[], split: "train" | "valid"): BaseStudyRow[] {
  const checkByUrl = new Map(checkRows.map((r) => [r.matchUrl, r] as const));
  const out: BaseStudyRow[] = [];
  for (const s of signalRows) {
    const c = checkByUrl.get(s.matchUrl);
    if (!c) continue;
    const novaSide = isFiniteNumber(s.novaP1) ? probabilityToSide(s.novaP1) : undefined;
    const logitSide = isFiniteNumber(s.logRegP1) ? probabilityToSide(s.logRegP1) : undefined;
    const novaLogisticAgree =
      !!novaSide && !!logitSide && novaSide !== "neutral" && logitSide !== "neutral" && novaSide === logitSide;
    const base: BaseStudyRow = {
      split,
      matchUrl: s.matchUrl,
      label: s.label,
      playerAName: s.playerAName,
      playerBName: s.playerBName,
      actualWinnerName: s.actualWinnerName,
      mainPick: s.mainPick,
      mainCorrect: s.mainCorrect,
      confidencePct: s.confidencePct,
      methodsCount: s.methodsCount,
      agreementCount: s.agreementCount,
      agreementRatio: s.agreementRatio,
      agreementText: s.agreementText,
      historyPick: c.historyPick,
      historyNovaSame: c.historyNovaSame,
      novaP1: s.novaP1,
      novaMargin: s.novaMargin,
      novaPick: s.novaPick,
      logRegP1: s.logRegP1,
      markovP1: s.markovP1,
      bradleyP1: s.bradleyP1,
      bradleyMargin: c.bradleyMargin,
      pcaP1: s.pcaP1,
      logisticMargin: s.logisticMargin,
      novaLogisticAgree,
      modelSpreadCore: c.modelSpreadCore,
      pcaDeviation: c.pcaDeviation,
      mainPickSide: normalizePickSide(s.mainPick, s.playerAName, s.playerBName),
    };
    out.push(base);
  }
  return out;
}

async function loadJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8"));
}

async function buildBaseRows(args: Args): Promise<BuildBaseRowsResult> {
  const [trainJoinedRaw, trainPredRaw, validJoinedRaw, validPredRaw] = await Promise.all([
    loadJson(args.trainJoinedFile),
    loadJson(args.trainPredictionsFile),
    loadJson(args.validJoinedFile),
    loadJson(args.validPredictionsFile),
  ]);

  const trainSignal = buildSignalReliabilityRows(trainJoinedRaw, trainPredRaw);
  const validSignal = buildSignalReliabilityRows(validJoinedRaw, validPredRaw);
  const trainCheck = buildCheckmarkStudyRows(trainJoinedRaw, trainPredRaw);
  const validCheck = buildCheckmarkStudyRows(validJoinedRaw, validPredRaw);

  return {
    train: mergeMetaRows(trainSignal.rows, trainCheck.rows, "train"),
    valid: mergeMetaRows(validSignal.rows, validCheck.rows, "valid"),
    datasets: {
      train: { baseRows: trainSignal.datasetSummary.usableRows, usableRows: trainSignal.rows.length },
      valid: { baseRows: validSignal.datasetSummary.usableRows, usableRows: validSignal.rows.length },
    },
  };
}

function baselineAgreementConfidenceSkip(row: TrendStrengthRow): boolean {
  return row.agreementCount <= 3 && row.confidencePct <= 55;
}

function baselineNovaLogitConfSend(row: TrendStrengthRow): boolean {
  return row.novaLogisticAgree && (row.novaMargin ?? 0) >= 4 && row.confidencePct >= 50;
}

function computeSkipMetrics(rows: TrendStrengthRow[], skipPredicate: (row: TrendStrengthRow) => boolean): SkipMetrics {
  const total = rows.length;
  const skippedRows = rows.filter(skipPredicate);
  const keptRows = rows.filter((r) => !skipPredicate(r));
  const mainOverallHitRate = safeRate(rows.filter((r) => r.mainCorrect).length, total);
  const keptHitRate = safeRate(keptRows.filter((r) => r.mainCorrect).length, keptRows.length);
  const skippedHitRate = safeRate(skippedRows.filter((r) => r.mainCorrect).length, skippedRows.length);
  return {
    total,
    skipped: skippedRows.length,
    kept: keptRows.length,
    skipRate: round3(safeRate(skippedRows.length, total)),
    keptHitRate: round3(keptHitRate),
    keptErrorRate: round3(1 - keptHitRate),
    skippedHitRate: round3(skippedHitRate),
    skippedErrorRate: round3(1 - skippedHitRate),
    deltaKeptVsMain: round3(keptHitRate - mainOverallHitRate),
  };
}

export function evaluateSkipRuleMetrics(rows: TrendStrengthRow[], predicate: (row: TrendStrengthRow) => boolean): SkipMetrics {
  return computeSkipMetrics(rows, predicate);
}

function summarizeBaselines(rows: TrendStrengthRow[]): BaselineSummary {
  const noFilter = computeSkipMetrics(rows, () => false);
  const ac = computeSkipMetrics(rows, baselineAgreementConfidenceSkip);
  const nlc = computeSkipMetrics(rows, (row) => !baselineNovaLogitConfSend(row));
  return {
    mainOverallHitRate: noFilter.keptHitRate,
    total: rows.length,
    noFilter,
    agreementConfidenceBaseline: ac,
    novaLogitConfBaseline: nlc,
  };
}

function getBestExistingFilterKeptHitRate(summary: BaselineSummary): number {
  return Math.max(summary.agreementConfidenceBaseline.keptHitRate, summary.novaLogitConfBaseline.keptHitRate);
}

function pushCandidate(map: Map<string, CandidateDefinition>, c: CandidateDefinition): void {
  if (!map.has(c.ruleId)) map.set(c.ruleId, c);
}

function createCandidate(
  ruleId: string,
  rule: string,
  tags: string[],
  predicate: (row: TrendStrengthRow) => boolean,
  ruleFamily?: string,
): CandidateDefinition {
  return { ruleId, rule, tags, predicate, ruleFamily: ruleFamily || tags[0] || "other" };
}

function weakMeta(row: TrendStrengthRow, a: number, c: number): boolean {
  return row.agreementCount <= a && row.confidencePct <= c;
}

function minDefined(values: Array<number | undefined>): number | undefined {
  const usable = values.filter(isFiniteNumber) as number[];
  if (!usable.length) return undefined;
  return Math.min(...usable);
}

function indexReliabilityMin(row: TrendStrengthRow, kind: "strength" | "stability" | "formTech" | "formPlus"): number | undefined {
  if (kind === "strength") return minDefined([row.relStrengthA, row.relStrengthB]);
  if (kind === "stability") return minDefined([row.relStabilityA, row.relStabilityB]);
  if (kind === "formTech") return minDefined([row.relFormTechA, row.relFormTechB]);
  return minDefined([row.relFormPlusA, row.relFormPlusB]);
}

function scoreCoverageMin(row: TrendStrengthRow): number | undefined {
  return minDefined([row.scoreCoverageA, row.scoreCoverageB]);
}

function generateCandidates(): CandidateDefinition[] {
  const out = new Map<string, CandidateDefinition>();
  for (const a of AGREEMENT_THRESHOLDS) {
    for (const c of CONFIDENCE_THRESHOLDS) {
      for (const r of COVERAGE_R_THRESHOLDS) {
        for (const tc of TREND_COHERENCE_THRESHOLDS) {
          pushCandidate(
            out,
            createCandidate(
              `t_coh_a${a}_c${c}_r${fmtInt(r)}_tc${fmtInt(tc)}`,
              `skip if agreement<=${a} && conf<=${c} && cov>=${r} && trendCoherence<${tc}`,
              ["trend", "meta"],
              (row) =>
                weakMeta(row, a, c) &&
                row.techTrendCoverageScore >= r &&
                isFiniteNumber(row.trendCoherence) &&
                (row.trendCoherence as number) < tc,
              "trend",
            ),
          );
        }
        for (const td of TREND_DOWN_THRESHOLDS) {
          pushCandidate(
            out,
            createCandidate(
              `t_ctrl_a${a}_c${c}_r${fmtInt(r)}_td${fmtInt(td)}`,
              `skip if agreement<=${a} && conf<=${c} && cov>=${r} && picked(controlTrend_3v5)<${td}`,
              ["trend", "meta", "control"],
              (row) => {
                const oriented = orientByPick(row.controlTrend_3v5, row.mainPickSide);
                return weakMeta(row, a, c) && row.techTrendCoverageScore >= r && isFiniteNumber(oriented) && oriented < td;
              },
              "trend",
            ),
          );
        }
        for (const tcombo of TREND_COMBO_THRESHOLDS) {
          pushCandidate(
            out,
            createCandidate(
              `t_combo_a${a}_c${c}_r${fmtInt(r)}_t${fmtInt(tcombo)}`,
              `skip if agreement<=${a} && conf<=${c} && cov>=${r} && picked(controlTrend_3v5+returnTrend_3v5)<${tcombo}`,
              ["trend", "meta", "combo"],
              (row) => {
                const ctl = orientByPick(row.controlTrend_3v5, row.mainPickSide) ?? 0;
                const ret = orientByPick(row.returnTrend_3v5, row.mainPickSide) ?? 0;
                const has = isFiniteNumber(orientByPick(row.controlTrend_3v5, row.mainPickSide)) || isFiniteNumber(orientByPick(row.returnTrend_3v5, row.mainPickSide));
                return weakMeta(row, a, c) && row.techTrendCoverageScore >= r && has && ctl + ret < tcombo;
              },
              "trend",
            ),
          );
        }
      }
      for (const p of OPP_PROXY_COVERAGE_THRESHOLDS) {
        for (const tOpp of OPP_STRENGTH_ADVERSE_THRESHOLDS) {
          pushCandidate(
            out,
            createCandidate(
              `s_opp_a${a}_c${c}_p${fmtInt(p)}_o${fmtInt(tOpp)}`,
              `skip if agreement<=${a} && conf<=${c} && oppCov>=${p} && picked(oppStrengthEdge_W5)<${tOpp}`,
              ["strength", "meta", "opp"],
              (row) => {
                const e = orientByPick(row.oppStrengthEdge_W5, row.mainPickSide);
                return weakMeta(row, a, c) && row.oppProxyCoverage >= p && isFiniteNumber(e) && e < tOpp;
              },
              "strength",
            ),
          );
        }
        for (const tTier of TIER_ADVERSE_THRESHOLDS) {
          pushCandidate(
            out,
            createCandidate(
              `s_tier_a${a}_c${c}_p${fmtInt(p)}_t${fmtInt(tTier)}`,
              `skip if agreement<=${a} && conf<=${c} && oppCov>=${p} && picked(tierEdge_W5)<${tTier}`,
              ["strength", "meta", "tier"],
              (row) => {
                const e = orientByPick(row.tierEdge_W5, row.mainPickSide);
                return weakMeta(row, a, c) && row.oppProxyCoverage >= p && isFiniteNumber(e) && e < tTier;
              },
              "strength",
            ),
          );
        }
      }
      for (const r of COVERAGE_R_THRESHOLDS) {
        for (const p of OPP_PROXY_COVERAGE_THRESHOLDS) {
          for (const tcombo of TREND_COMBO_THRESHOLDS) {
            for (const tOpp of OPP_STRENGTH_ADVERSE_THRESHOLDS) {
              pushCandidate(
                out,
                createCandidate(
                  `ts_combo_opp_a${a}_c${c}_r${fmtInt(r)}_p${fmtInt(p)}_t${fmtInt(tcombo)}_o${fmtInt(tOpp)}`,
                  `skip if weakMeta && cov>=${r} && oppCov>=${p} && picked(trendCombo)<${tcombo} && picked(oppStrengthEdge_W5)<${tOpp}`,
                  ["combined", "trend", "strength", "opp"],
                  (row) => {
                    const ctl = orientByPick(row.controlTrend_3v5, row.mainPickSide) ?? 0;
                    const ret = orientByPick(row.returnTrend_3v5, row.mainPickSide) ?? 0;
                    const trendHas = isFiniteNumber(orientByPick(row.controlTrend_3v5, row.mainPickSide)) || isFiniteNumber(orientByPick(row.returnTrend_3v5, row.mainPickSide));
                    const opp = orientByPick(row.oppStrengthEdge_W5, row.mainPickSide);
                    return (
                      weakMeta(row, a, c) &&
                      row.techTrendCoverageScore >= r &&
                      row.oppProxyCoverage >= p &&
                      trendHas &&
                      ctl + ret < tcombo &&
                      isFiniteNumber(opp) &&
                      opp < tOpp
                    );
                  },
                  "combined",
                ),
              );
            }
            for (const tTier of TIER_ADVERSE_THRESHOLDS) {
              pushCandidate(
                out,
                createCandidate(
                  `ts_combo_tier_a${a}_c${c}_r${fmtInt(r)}_p${fmtInt(p)}_t${fmtInt(tcombo)}_te${fmtInt(tTier)}`,
                  `skip if weakMeta && cov>=${r} && oppCov>=${p} && picked(trendCombo)<${tcombo} && picked(tierEdge_W5)<${tTier}`,
                  ["combined", "trend", "strength", "tier"],
                  (row) => {
                    const ctl = orientByPick(row.controlTrend_3v5, row.mainPickSide) ?? 0;
                    const ret = orientByPick(row.returnTrend_3v5, row.mainPickSide) ?? 0;
                    const trendHas = isFiniteNumber(orientByPick(row.controlTrend_3v5, row.mainPickSide)) || isFiniteNumber(orientByPick(row.returnTrend_3v5, row.mainPickSide));
                    const tier = orientByPick(row.tierEdge_W5, row.mainPickSide);
                    return (
                      weakMeta(row, a, c) &&
                      row.techTrendCoverageScore >= r &&
                      row.oppProxyCoverage >= p &&
                      trendHas &&
                      ctl + ret < tcombo &&
                      isFiniteNumber(tier) &&
                      tier < tTier
                    );
                  },
                  "combined",
                ),
              );
            }
          }
        }
      }
      for (const v of VOLATILITY_RISK_THRESHOLDS) {
        pushCandidate(
          out,
          createCandidate(
            `s_vol_a${a}_c${c}_v${fmtInt(v)}`,
            `skip if agreement<=${a} && conf<=${c} && picked(volatilityEdge_W5)<${v}`,
            ["strength", "volatility", "meta"],
            (row) => {
              const ve = orientByPick(row.volatilityEdge_W5, row.mainPickSide);
              return weakMeta(row, a, c) && isFiniteNumber(ve) && ve < v;
            },
            "strength",
          ),
        );
      }

      // Index families (I1-I5): tech-only and tech+score variants
      for (const relMin of REL_MIN_THRESHOLDS) {
        for (const tf of INDEX_FORM_THRESHOLDS) {
          pushCandidate(
            out,
            createCandidate(
              `i1_formtech_a${a}_c${c}_r${fmtInt(relMin)}_f${fmtInt(tf)}`,
              `skip if weakMeta && relFormTech>=${relMin} && picked(formTechEdge)<${tf}`,
              ["index", "form", "tech-only", "meta"],
              (row) => {
                const e = orientByPick(row.formTechEdge, row.mainPickSide);
                const rel = indexReliabilityMin(row, "formTech");
                return weakMeta(row, a, c) && isFiniteNumber(rel) && rel >= relMin && isFiniteNumber(e) && e < tf;
              },
              "index-form-tech",
            ),
          );
        }
        for (const ts of INDEX_STAB_THRESHOLDS) {
          pushCandidate(
            out,
            createCandidate(
              `i2_stab_a${a}_c${c}_r${fmtInt(relMin)}_s${fmtInt(ts)}`,
              `skip if weakMeta && relStab>=${relMin} && picked(stabilityEdge)<${ts}`,
              ["index", "stability", "tech-only", "meta"],
              (row) => {
                const e = orientByPick(row.stabilityEdge, row.mainPickSide);
                const rel = indexReliabilityMin(row, "stability");
                return weakMeta(row, a, c) && isFiniteNumber(rel) && rel >= relMin && isFiniteNumber(e) && e < ts;
              },
              "index-stability",
            ),
          );
        }
        for (const sf of SCORE_COVERAGE_THRESHOLDS) {
          for (const tf of INDEX_FORM_THRESHOLDS) {
            pushCandidate(
              out,
              createCandidate(
                `i1_formplus_a${a}_c${c}_r${fmtInt(relMin)}_sc${fmtInt(sf)}_f${fmtInt(tf)}`,
                `skip if weakMeta && relFormPlus>=${relMin} && scoreCov>=${sf} && picked(formPlusEdge)<${tf}`,
                ["index", "form", "tech+score", "meta"],
                (row) => {
                  const e = orientByPick(row.formPlusEdge, row.mainPickSide);
                  const rel = indexReliabilityMin(row, "formPlus");
                  const sc = scoreCoverageMin(row);
                  return (
                    weakMeta(row, a, c) &&
                    isFiniteNumber(rel) && rel >= relMin &&
                    isFiniteNumber(sc) && sc >= sf &&
                    isFiniteNumber(e) && e < tf
                  );
                },
                "index-form-plus",
              ),
            );
          }
        }
      }

      for (const relMin of REL_MIN_THRESHOLDS) {
        for (const p of OPP_PROXY_COVERAGE_THRESHOLDS) {
          for (const tStr of INDEX_STRENGTH_THRESHOLDS) {
            for (const tOpp of OPP_STRENGTH_ADVERSE_THRESHOLDS) {
              pushCandidate(
                out,
                createCandidate(
                  `i3_strength_opp_a${a}_c${c}_r${fmtInt(relMin)}_p${fmtInt(p)}_s${fmtInt(tStr)}_o${fmtInt(tOpp)}`,
                  `skip if weakMeta && relStrength>=${relMin} && oppCov>=${p} && picked(strengthEdge)<${tStr} && picked(oppStrengthEdge_W5)<${tOpp}`,
                  ["index", "strength", "meta", "opp"],
                  (row) => {
                    const eS = orientByPick(row.strengthEdge, row.mainPickSide);
                    const eOpp = orientByPick(row.oppStrengthEdge_W5, row.mainPickSide);
                    const rel = indexReliabilityMin(row, "strength");
                    return (
                      weakMeta(row, a, c) &&
                      isFiniteNumber(rel) && rel >= relMin &&
                      row.oppProxyCoverage >= p &&
                      isFiniteNumber(eS) && eS < tStr &&
                      isFiniteNumber(eOpp) && eOpp < tOpp
                    );
                  },
                  "index-strength",
                ),
              );
            }
          }
          for (const tf of INDEX_FORM_THRESHOLDS) {
            for (const ts of INDEX_STAB_THRESHOLDS) {
              pushCandidate(
                out,
                createCandidate(
                  `i4_formtech_stab_a${a}_c${c}_r${fmtInt(relMin)}_p${fmtInt(p)}_f${fmtInt(tf)}_s${fmtInt(ts)}`,
                  `skip if weakMeta && relFormTech/Stab>=${relMin} && oppCov>=${p} && picked(formTechEdge)<${tf} && picked(stabilityEdge)<${ts}`,
                  ["index", "combined", "tech-only", "meta"],
                  (row) => {
                    const eF = orientByPick(row.formTechEdge, row.mainPickSide);
                    const eSt = orientByPick(row.stabilityEdge, row.mainPickSide);
                    const relF = indexReliabilityMin(row, "formTech");
                    const relS = indexReliabilityMin(row, "stability");
                    return (
                      weakMeta(row, a, c) &&
                      row.oppProxyCoverage >= p &&
                      isFiniteNumber(relF) && relF >= relMin &&
                      isFiniteNumber(relS) && relS >= relMin &&
                      isFiniteNumber(eF) && eF < tf &&
                      isFiniteNumber(eSt) && eSt < ts
                    );
                  },
                  "index-combined-tech",
                ),
              );
            }
          }
          for (const sf of SCORE_COVERAGE_THRESHOLDS) {
            for (const tf of INDEX_FORM_THRESHOLDS) {
              for (const tTier of TIER_ADVERSE_THRESHOLDS) {
                pushCandidate(
                  out,
                  createCandidate(
                    `i4_formplus_tier_a${a}_c${c}_r${fmtInt(relMin)}_p${fmtInt(p)}_sc${fmtInt(sf)}_f${fmtInt(tf)}_te${fmtInt(tTier)}`,
                    `skip if weakMeta && relFormPlus>=${relMin} && scoreCov>=${sf} && oppCov>=${p} && picked(formPlusEdge)<${tf} && picked(tierEdge_W5)<${tTier}`,
                    ["index", "combined", "tech+score", "meta", "tier"],
                    (row) => {
                      const eF = orientByPick(row.formPlusEdge, row.mainPickSide);
                      const eTier = orientByPick(row.tierEdge_W5, row.mainPickSide);
                      const relF = indexReliabilityMin(row, "formPlus");
                      const sc = scoreCoverageMin(row);
                      return (
                        weakMeta(row, a, c) &&
                        row.oppProxyCoverage >= p &&
                        isFiniteNumber(relF) && relF >= relMin &&
                        isFiniteNumber(sc) && sc >= sf &&
                        isFiniteNumber(eF) && eF < tf &&
                        isFiniteNumber(eTier) && eTier < tTier
                      );
                    },
                    "index-combined-plus",
                  ),
                );
              }
            }
          }
        }
      }
    }
  }
  return [...out.values()];
}

function fmtInt(v: number): string {
  return String(v).replace(/\./g, "p").replace(/^-/, "m");
}

function evaluateCandidates(trainRows: TrendStrengthRow[], validRows: TrendStrengthRow[], minBucketSize: number): { candidates: CandidateEval[]; topCandidates: CandidateEval[]; } {
  const defs = generateCandidates();
  const baseTrain = summarizeBaselines(trainRows);
  const baseValid = summarizeBaselines(validRows);
  const bestExistingValid = getBestExistingFilterKeptHitRate(baseValid);
  let results: CandidateEval[] = defs.map((def) => {
    const train = computeSkipMetrics(trainRows, def.predicate);
    const valid = computeSkipMetrics(validRows, def.predicate);
    const deltaVsAgreementConfidenceBaseline = round3(valid.keptHitRate - baseValid.agreementConfidenceBaseline.keptHitRate);
    const deltaVsNovaLogitConfBaseline = round3(valid.keptHitRate - baseValid.novaLogitConfBaseline.keptHitRate);
    const deltaVsBestExistingFilter = round3(valid.keptHitRate - bestExistingValid);
    const passesCriteria =
      valid.skipped >= minBucketSize &&
      valid.keptHitRate >= baseValid.mainOverallHitRate &&
      (valid.keptHitRate >= bestExistingValid - 0.02 || valid.skipRate < Math.min(baseValid.agreementConfidenceBaseline.skipRate, baseValid.novaLogitConfBaseline.skipRate)) &&
      valid.deltaKeptVsMain >= train.deltaKeptVsMain - 0.08;

    return {
      ruleId: def.ruleId,
      rule: def.rule,
      tags: def.tags,
      ruleFamily: def.ruleFamily,
      train,
      valid,
      deltaKeptVsAgreementConfidenceBaseline: deltaVsAgreementConfidenceBaseline,
      deltaKeptVsNovaLogitConfBaseline: deltaVsNovaLogitConfBaseline,
      deltaKeptVsBestExistingFilter: deltaVsBestExistingFilter,
      passesCriteria,
    };
  });

  const bestTrendStrengthBaselineValid = results
    .filter((c) => !c.tags.includes("index") && c.valid.skipped >= minBucketSize)
    .map((c) => c.valid.keptHitRate)
    .sort((a, b) => b - a)[0];
  results = results.map((c) => ({
    ...c,
    deltaKeptVsBestTrendStrengthBaseline: isFiniteNumber(bestTrendStrengthBaselineValid)
      ? round3(c.valid.keptHitRate - (bestTrendStrengthBaselineValid as number))
      : undefined,
  }));

  const topCandidates = results
    .filter((c) => c.valid.skipped >= minBucketSize)
    .sort((a, b) => {
      if (b.valid.keptHitRate !== a.valid.keptHitRate) return b.valid.keptHitRate - a.valid.keptHitRate;
      if (b.deltaKeptVsBestExistingFilter !== a.deltaKeptVsBestExistingFilter) return b.deltaKeptVsBestExistingFilter - a.deltaKeptVsBestExistingFilter;
      if (b.valid.skipped !== a.valid.skipped) return b.valid.skipped - a.valid.skipped;
      return a.valid.skipRate - b.valid.skipRate;
    })
    .slice(0, 20);

  return { candidates: results, topCandidates };
}

function computeIndexCorrelations(rows: TrendStrengthRow[]): Record<string, number | undefined> {
  const target = rows.map((r) => (r.mainCorrect ? 1 : 0));
  return {
    strengthEdge: pearsonBinary(rows.map((r) => r.strengthEdge), target),
    stabilityEdge: pearsonBinary(rows.map((r) => r.stabilityEdge), target),
    formTechEdge: pearsonBinary(rows.map((r) => r.formTechEdge), target),
    formPlusEdge: pearsonBinary(rows.map((r) => r.formPlusEdge), target),
  };
}

function bestValidHit(candidates: CandidateEval[], tagIncludes: string[]): number | undefined {
  return candidates
    .filter((c) => tagIncludes.every((t) => c.tags.includes(t)))
    .map((c) => c.valid.keptHitRate)
    .sort((a, b) => b - a)[0];
}

function buildIndexAblationSummary(candidates: CandidateEval[]): StudyReport["ablationSummary"] {
  const out: NonNullable<StudyReport["ablationSummary"]> = {
    metaOnlyBestValid: candidates.filter((c) => c.tags.includes("meta") && !c.tags.includes("trend") && !c.tags.includes("strength") && !c.tags.includes("index")).map((c) => c.valid.keptHitRate).sort((a,b)=>b-a)[0],
    trendOnlyBestValid: candidates.filter((c) => c.tags.includes("trend") && !c.tags.includes("strength") && !c.tags.includes("index")).map((c) => c.valid.keptHitRate).sort((a,b)=>b-a)[0],
    strengthOnlyBestValid: candidates.filter((c) => c.tags.includes("strength") && !c.tags.includes("trend") && !c.tags.includes("index")).map((c) => c.valid.keptHitRate).sort((a,b)=>b-a)[0],
    combinedBestValid: candidates.filter((c) => c.tags.includes("combined") && !c.tags.includes("index")).map((c) => c.valid.keptHitRate).sort((a,b)=>b-a)[0],
    indexTechOnlyBestValid: bestValidHit(candidates, ["index", "tech-only"]),
    indexTechPlusScoreBestValid: bestValidHit(candidates, ["index", "tech+score"]),
    indexCombinedBestValid: bestValidHit(candidates, ["index", "combined"]),
  };
  return out;
}

function buildIndexRecommendation(candidates: CandidateEval[]): StudyReport["indexRecommendation"] {
  const bestTech = candidates
    .filter((c) => c.tags.includes("index") && c.tags.includes("tech-only"))
    .sort((a, b) => b.valid.keptHitRate - a.valid.keptHitRate)[0];
  const bestPlus = candidates
    .filter((c) => c.tags.includes("index") && c.tags.includes("tech+score"))
    .sort((a, b) => b.valid.keptHitRate - a.valid.keptHitRate)[0];
  if (!bestTech && !bestPlus) {
    return { preferredFormVariant: "tech-only", rationale: "No index candidates available." };
  }
  if (!bestPlus) {
    return { preferredFormVariant: "tech-only", rationale: "No tech+score candidate produced usable validation metrics." };
  }
  if (!bestTech) {
    return { preferredFormVariant: "tech+score", rationale: "Only tech+score candidates available." };
  }
  if (bestPlus.valid.keptHitRate > bestTech.valid.keptHitRate + 0.01) {
    return {
      preferredFormVariant: "tech+score",
      rationale: `tech+score best keptHit=${formatPct(bestPlus.valid.keptHitRate)} vs tech-only ${formatPct(bestTech.valid.keptHitRate)} on validation`,
    };
  }
  return {
    preferredFormVariant: "tech-only",
    rationale: `tech-only is simpler and not meaningfully worse on validation (${formatPct(bestTech.valid.keptHitRate)} vs ${formatPct(bestPlus.valid.keptHitRate)})`,
  };
}

function makeRecommendations(topCandidates: CandidateEval[], validBaseline: BaselineSummary): StudyReport["recommendations"] {
  const comparable = topCandidates.filter((c) => c.valid.skipped >= 8);
  const best = comparable.find((c) => c.passesCriteria);
  const maxPrecision = comparable[0];
  const balanced = comparable
    .filter((c) => c.valid.keptHitRate >= validBaseline.mainOverallHitRate)
    .sort((a, b) => {
      const sa = a.valid.keptHitRate * 0.7 + (1 - a.valid.skipRate) * 0.3;
      const sb = b.valid.keptHitRate * 0.7 + (1 - b.valid.skipRate) * 0.3;
      if (sb !== sa) return sb - sa;
      return b.valid.skipped - a.valid.skipped;
    })[0];
  const coveragePreserving = comparable
    .filter((c) => c.valid.skipRate <= 0.25)
    .sort((a, b) => b.valid.keptHitRate - a.valid.keptHitRate)[0];

  const improves = !!best && best.valid.keptHitRate > Math.max(validBaseline.agreementConfidenceBaseline.keptHitRate, validBaseline.novaLogitConfBaseline.keptHitRate);
  const conclusion = improves
    ? `Trend+strength filters show improvement over existing baselines (best keptHitRate=${round1((best!.valid.keptHitRate) * 100)}%).`
    : "No trend+strength candidate clearly outperforms simpler existing filters on validation; keep simpler filters.";
  return { improves, best, maxPrecision, balanced, coveragePreserving, conclusion };
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatSkipMetrics(m: SkipMetrics): string {
  return `kept=${m.kept}/${m.total} keptHit=${formatPct(m.keptHitRate)} skip=${m.skipped} (${formatPct(m.skipRate)}) deltaVsMain=${(m.deltaKeptVsMain * 100).toFixed(1)}pp`;
}

function formatMarkdown(report: StudyReport): string {
  const lines: string[] = [];
  lines.push("# NOVA+ Trend/Strength Filter Study");
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Train usable rows: ${report.datasets.train.usableRows}`);
  lines.push(`- Valid usable rows: ${report.datasets.valid.usableRows}`);
  lines.push(`- Deep collection: cacheHits=${report.datasets.deepCollection.cacheHits}, cacheMisses=${report.datasets.deepCollection.cacheMisses}, collected=${report.datasets.deepCollection.collectedPlayers}, failed=${report.datasets.deepCollection.failedPlayers}`);
  lines.push(`- Baseline main valid hit-rate: ${formatPct(report.baselines.valid.mainOverallHitRate)}`);
  lines.push(`- Baseline Agreement+Confidence filter (valid): ${formatSkipMetrics(report.baselines.valid.agreementConfidenceBaseline)}`);
  lines.push(`- Baseline NOVA+L+C filter (valid): ${formatSkipMetrics(report.baselines.valid.novaLogitConfBaseline)}`);
  if (typeof report.baselines.bestTrendStrengthBaselineValidKeptHitRate === "number") {
    lines.push(`- Best pre-index trend/strength candidate (valid keptHit): ${formatPct(report.baselines.bestTrendStrengthBaselineValidKeptHitRate)}`);
  }
  if (report.indexRecommendation) {
    lines.push(`- Preferred form variant: ${report.indexRecommendation.preferredFormVariant}`);
    lines.push(`- Form rationale: ${report.indexRecommendation.rationale}`);
  }
  lines.push(`- Conclusion: ${report.recommendations.conclusion}`);
  lines.push("");
  if (report.indexCorrelations) {
    lines.push("## Index Correlations (valid)");
    lines.push("");
    const c = report.indexCorrelations.valid;
    lines.push(`- strengthEdge ↔ mainCorrect: ${c.strengthEdge ?? "-"}`);
    lines.push(`- stabilityEdge ↔ mainCorrect: ${c.stabilityEdge ?? "-"}`);
    lines.push(`- formTechEdge ↔ mainCorrect: ${c.formTechEdge ?? "-"}`);
    lines.push(`- formPlusEdge ↔ mainCorrect: ${c.formPlusEdge ?? "-"}`);
    lines.push("");
  }
  lines.push("## Top Candidates (valid)");
  lines.push("");
  lines.push("| ruleId | family | valid keptHit | valid skipRate | skipped | ΔvsMain | ΔvsAC | ΔvsNLC | ΔvsTrend | passes |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---:|:---:|");
  for (const c of report.topCandidates.slice(0, report.config.topK)) {
    lines.push(
      `| ${c.ruleId} | ${c.ruleFamily} | ${formatPct(c.valid.keptHitRate)} | ${formatPct(c.valid.skipRate)} | ${c.valid.skipped} | ${(c.valid.deltaKeptVsMain * 100).toFixed(1)}pp | ${(c.deltaKeptVsAgreementConfidenceBaseline * 100).toFixed(1)}pp | ${(c.deltaKeptVsNovaLogitConfBaseline * 100).toFixed(1)}pp | ${typeof c.deltaKeptVsBestTrendStrengthBaseline === "number" ? `${(c.deltaKeptVsBestTrendStrengthBaseline * 100).toFixed(1)}pp` : "-"} | ${c.passesCriteria ? "yes" : "no"} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

async function writeReports(report: StudyReport, reportJson: string, reportMd: string): Promise<void> {
  await ensureDirFor(reportJson);
  await ensureDirFor(reportMd);
  await writeFile(reportJson, JSON.stringify(report, null, 2), "utf8");
  await writeFile(reportMd, formatMarkdown(report), "utf8");
}

function parseArgs(argv: string[]): Args {
  const trainJoinedFile = readArg(argv, "train-joined-file");
  const trainPredictionsFile = readArg(argv, "train-predictions-file");
  const validJoinedFile = readArg(argv, "valid-joined-file");
  const validPredictionsFile = readArg(argv, "valid-predictions-file");
  if (!trainJoinedFile || !trainPredictionsFile || !validJoinedFile || !validPredictionsFile) {
    throw new Error("Required: --train-joined-file --train-predictions-file --valid-joined-file --valid-predictions-file");
  }
  return {
    trainJoinedFile,
    trainPredictionsFile,
    validJoinedFile,
    validPredictionsFile,
    entryUrl: (readArg(argv, "entry-url") || DEFAULT_ENTRY_URL).trim() || DEFAULT_ENTRY_URL,
    historyTechTarget: readIntArg(argv, "history-tech-target") ?? DEFAULT_HISTORY_TECH_TARGET,
    historyTechScanLimit: readIntArg(argv, "history-tech-scan-limit") ?? DEFAULT_HISTORY_TECH_SCAN_LIMIT,
    historyStatsMissBudget: readIntArg(argv, "history-stats-miss-budget") ?? DEFAULT_HISTORY_STATS_MISS_BUDGET,
    headed: readBoolFlag(argv, "headed", false),
    slowMo: readIntArg(argv, "slow-mo") ?? 0,
    timeoutMs: readIntArg(argv, "timeout-ms") ?? DEFAULT_TIMEOUT_MS,
    maxGotoRetries: readIntArg(argv, "max-goto-retries") ?? DEFAULT_MAX_GOTO_RETRIES,
    minBucketSize: readIntArg(argv, "min-bucket-size") ?? DEFAULT_MIN_BUCKET_SIZE,
    topK: readIntArg(argv, "top-k") ?? DEFAULT_TOP_K,
    skipFitted: readBoolFlag(argv, "skip-fitted", false),
    skipDeterministic: readBoolFlag(argv, "skip-deterministic", false),
    cacheDeepHistoryFile: readArg(argv, "cache-deep-history-file") || DEFAULT_CACHE_FILE,
    reportJson: readArg(argv, "report-json") || DEFAULT_REPORT_JSON,
    reportMd: readArg(argv, "report-md") || DEFAULT_REPORT_MD,
  };
}

function candidateKey(matchUrl: string, side: "A" | "B"): string {
  return `${matchUrl}::${side}`;
}

function sortByCandidateIndexThenDate(a: DeepHistoryPerMatchFeature, b: DeepHistoryPerMatchFeature): number {
  return a.candidateIndex - b.candidateIndex;
}

async function deepCollectPlayer(
  deps: {
    page: import("playwright").Page;
    logger: { debug: (m: string) => void; warn: (m: string) => void; info: (m: string) => void };
    config: import("../../src/types.js").RunConfig;
    extractMatchPageRef: typeof import("../../src/extract/matchPage.js").extractMatchPageRef;
    extractRecentMatchesFromProfile: typeof import("../../src/extract/playerProfile.js").extractRecentMatchesFromProfile;
    extractTechStatsFromMatch: typeof import("../../src/extract/techStats.js").extractTechStatsFromMatch;
    scanTechHistoryCandidates: typeof import("../../src/orchestrator/historyScan.js").scanTechHistoryCandidates;
    extractDirtFeatureRow: typeof import("../../src/predict/requiredMetrics.js").extractDirtFeatureRow;
    canonicalDirtMetricKey: typeof import("../../src/predict/requiredMetrics.js").canonicalDirtMetricKey;
    metricValueToNumber: typeof import("../../src/predict/metricNormalization.js").metricValueToNumber;
  },
  cache: DeepHistoryCacheFile,
  row: BaseStudyRow,
  side: "A" | "B",
  stats: { cacheHits: number; cacheMisses: number; collectedPlayers: number; failedPlayers: number; requestedPlayers: number },
  historyTechTarget: number,
  historyTechScanLimit: number,
  historyStatsMissBudget: number,
): Promise<CachedPlayerDeepHistory> {
  const key = candidateKey(row.matchUrl, side);
  stats.requestedPlayers += 1;
  const cached = cache.entries[key];
  if (cached && cached.schemaVersion === CACHE_SCHEMA_VERSION) {
    stats.cacheHits += 1;
    return cached;
  }
  stats.cacheMisses += 1;

  const pseudoDayMatch: import("../../src/types.js").DayMatchRef = {
    id: `study-${side}-${Math.abs(hashString(row.matchUrl))}`,
    url: row.matchUrl,
    playerAName: row.playerAName,
    playerBName: row.playerBName,
    status: "finished",
  };

  try {
    const matchRef = await deps.extractMatchPageRef(deps.page, pseudoDayMatch, deps.config, deps.logger as any);
    const playerRef = side === "A" ? matchRef.players[0] : matchRef.players[1];
    const profile = await deps.extractRecentMatchesFromProfile(deps.page, playerRef, deps.config, deps.logger as any, {
      excludeMatchUrl: row.matchUrl,
      needCount: historyTechTarget,
      scanLimit: historyTechScanLimit,
    });
    const candidates = profile.matches;
    const byUrl = new Map<string, import("../../src/types.js").RecentMatchRef>();
    candidates.forEach((c, idx) => byUrl.set(canonicalizeMatchUrl(c.url) || c.url, { ...c, parsedAt: String(idx) }));

    const scan = await deps.scanTechHistoryCandidates({
      playerName: playerRef.name,
      candidates,
      needCount: historyTechTarget,
      statsMissBudget: historyStatsMissBudget,
      logger: deps.logger as any,
      parseMatch: async (candidate) => deps.extractTechStatsFromMatch(deps.page, candidate.url, playerRef.name, deps.config, deps.logger as any),
    });

    const records: DeepHistoryPerMatchFeature[] = [];
    for (const parsed of scan.parsedMatches) {
      const pair = extractDirtRowsPair(parsed, deps.canonicalDirtMetricKey, deps.metricValueToNumber);
      if (!pair) continue;
      const canon = canonicalizeMatchUrl(parsed.matchUrl) || parsed.matchUrl;
      const recent = byUrl.get(canon);
      const tier = inferTournamentTierScore(recent?.tournament);
      const oppStatsQ01 = computeOpponentStatsQuality01({
        total_points_won: pair.opponent.total_points_won,
        return_points_won: pair.opponent.return_points_won,
        total_games_won: pair.opponent.total_games_won,
        service_games_won: pair.opponent.service_games_won,
        return_games_won: pair.opponent.return_games_won,
      });
      const oppStrengthComposite = combineOpponentStrengthProxy(oppStatsQ01, tier.tierScore);
      const scoreFeatures = parseScoreMomentumFeatures({ resultText: recent?.resultText, scoreText: recent?.scoreText });
      records.push({
        matchUrl: parsed.matchUrl,
        candidateIndex: Number.parseInt(recent?.parsedAt || "0", 10) || 0,
        tournament: recent?.tournament,
        dateText: recent?.dateText,
        resultText: recent?.resultText,
        scoreText: recent?.scoreText,
        serveCore: round3(serveCoreFrom(pair)),
        returnCore: round3(returnCoreFrom(pair)),
        controlCore: round3(controlCoreFrom(pair)),
        disciplineCore: round3(disciplineFrom(pair.player.first_serve, pair.player.double_faults)),
        tpwCore: round3(tpwCoreFrom(pair)),
        oppStatsQ01,
        tierScore: tier.tierScore,
        qualifying: tier.flags.qualifying,
        oppStrengthComposite,
        scoreParsed: scoreFeatures.scoreParsed,
        oppProxyUsable: isFiniteNumber(oppStrengthComposite),
      });
    }
    records.sort(sortByCandidateIndexThenDate);

    const entry: CachedPlayerDeepHistory = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      key,
      targetMatchUrl: row.matchUrl,
      side,
      playerName: playerRef.name,
      profileUrl: playerRef.profileUrl,
      collectedAt: new Date().toISOString(),
      historyTechTarget,
      historyTechScanLimit,
      historyStatsMissBudget,
      recentCandidatesFound: profile.candidatePool,
      recentCandidatesUsable: candidates.length,
      parsedTechMatches: records.length,
      collectionDiagnostics: {
        profileFound: !!playerRef.profileUrl,
        recentCandidatePool: profile.candidatePool,
        scanScanned: scan.scanned,
        scanAccepted: scan.parsedMatches.length,
        techMissing: scan.techMissing,
        metricsIncomplete: scan.metricsIncomplete,
        parseErrors: scan.parseErrors,
        nonSinglesHistory: scan.nonSinglesHistory,
        errors: scan.errors.length,
      },
      records,
    };
    cache.entries[key] = entry;
    stats.collectedPlayers += 1;
    return entry;
  } catch (error) {
    stats.failedPlayers += 1;
    const failed: CachedPlayerDeepHistory = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      key,
      targetMatchUrl: row.matchUrl,
      side,
      playerName: side === "A" ? row.playerAName : row.playerBName,
      collectedAt: new Date().toISOString(),
      historyTechTarget,
      historyTechScanLimit,
      historyStatsMissBudget,
      recentCandidatesFound: 0,
      recentCandidatesUsable: 0,
      parsedTechMatches: 0,
      collectionDiagnostics: {
        profileFound: false,
        recentCandidatePool: 0,
        scanScanned: 0,
        scanAccepted: 0,
        techMissing: 0,
        metricsIncomplete: 0,
        parseErrors: 0,
        nonSinglesHistory: 0,
        errors: 1,
      },
      records: [],
    };
    cache.entries[key] = failed;
    (deps.logger as any).warn(`Deep history collection failed for ${row.label} [${side}]: ${error instanceof Error ? error.message : String(error)}`);
    return failed;
  }
}

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  }
  return h;
}

function extractDirtRowsPair(
  parsed: import("../../src/types.js").HistoricalMatchTechStats,
  canonicalDirtMetricKey: typeof import("../../src/predict/requiredMetrics.js").canonicalDirtMetricKey,
  metricValueToNumber: typeof import("../../src/predict/metricNormalization.js").metricValueToNumber,
): DirtRowsPair | null {
  type Key = keyof RequiredLikeDirt;
  const outPlayer: Partial<RequiredLikeDirt> = {};
  const outOpp: Partial<RequiredLikeDirt> = {};
  const countMetrics = new Set<string>(["double_faults"]);
  for (const row of parsed.rows) {
    const key = canonicalDirtMetricKey(row.metricKey, row.metricLabel) as Key | undefined;
    if (!key) continue;
    const isCount = countMetrics.has(key);
    const p = metricValueToNumber(row.playerValue, { isCountMetric: isCount, smoothRatio: true });
    const o = metricValueToNumber(row.opponentValue, { isCountMetric: isCount, smoothRatio: true });
    if (isFiniteNumber(p)) outPlayer[key] = p;
    if (isFiniteNumber(o)) outOpp[key] = o;
  }
  const required: Array<keyof RequiredLikeDirt> = [
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
  if (required.some((k) => !isFiniteNumber(outPlayer[k]) || !isFiniteNumber(outOpp[k]))) {
    return null;
  }
  return { player: outPlayer as RequiredLikeDirt, opponent: outOpp as RequiredLikeDirt };
}

async function buildTrendStrengthRows(args: Args, baseRowsTrain: BaseStudyRow[], baseRowsValid: BaseStudyRow[], cache: DeepHistoryCacheFile): Promise<{ train: TrendStrengthRow[]; valid: TrendStrengthRow[]; deepStats: StudyReport["datasets"]["deepCollection"] }> {
  const allRows = [...baseRowsTrain, ...baseRowsValid];
  const uniqueRows = new Map<string, BaseStudyRow>();
  for (const row of allRows) {
    if (!uniqueRows.has(row.matchUrl)) uniqueRows.set(row.matchUrl, row);
  }

  const deepStats = { requestedPlayers: 0, cacheHits: 0, cacheMisses: 0, collectedPlayers: 0, failedPlayers: 0 };

  if (args.skipDeterministic && args.skipFitted) {
    throw new Error("Both --skip-deterministic and --skip-fitted enabled: nothing to compute.");
  }

  let session: import("../../src/browser.js").BrowserSession | undefined;
  let deps: any;
  try {
    const needsCollection = [...uniqueRows.values()].some((row) => !cache.entries[candidateKey(row.matchUrl, "A")] || !cache.entries[candidateKey(row.matchUrl, "B")]);
    if (needsCollection) {
      const [browserMod, loggerMod, matchPageMod, profileMod, techMod, historyScanMod, reqMetricsMod, metricNormMod] = await Promise.all([
        import("../../src/browser.js"),
        import("../../src/logger.js"),
        import("../../src/extract/matchPage.js"),
        import("../../src/extract/playerProfile.js"),
        import("../../src/extract/techStats.js"),
        import("../../src/orchestrator/historyScan.js"),
        import("../../src/predict/requiredMetrics.js"),
        import("../../src/predict/metricNormalization.js"),
      ]);
      const config: import("../../src/types.js").RunConfig = {
        entryUrl: args.entryUrl,
        status: "finished",
        limit: undefined,
        recentCount: args.historyTechTarget,
        headed: args.headed,
        slowMo: args.slowMo,
        timeoutMs: args.timeoutMs,
        telegram: false,
        console: false,
        maxGotoRetries: args.maxGotoRetries,
        historyStatsMissBudget: args.historyStatsMissBudget,
        tgSendMaxRpm: 0,
        telegramToken: undefined,
        telegramChatId: undefined,
      };
      session = await browserMod.createBrowserSession(config);
      deps = {
        page: session.page,
        logger: new loggerMod.Logger({ debugEnabled: false }),
        config,
        extractMatchPageRef: matchPageMod.extractMatchPageRef,
        extractRecentMatchesFromProfile: profileMod.extractRecentMatchesFromProfile,
        extractTechStatsFromMatch: techMod.extractTechStatsFromMatch,
        scanTechHistoryCandidates: historyScanMod.scanTechHistoryCandidates,
        extractDirtFeatureRow: reqMetricsMod.extractDirtFeatureRow,
        canonicalDirtMetricKey: reqMetricsMod.canonicalDirtMetricKey,
        metricValueToNumber: metricNormMod.metricValueToNumber,
      };

      for (const row of uniqueRows.values()) {
        await deepCollectPlayer(deps, cache, row, "A", deepStats, args.historyTechTarget, args.historyTechScanLimit, args.historyStatsMissBudget);
        await deepCollectPlayer(deps, cache, row, "B", deepStats, args.historyTechTarget, args.historyTechScanLimit, args.historyStatsMissBudget);
      }
    }
  } finally {
    if (session) {
      const browserMod = await import("../../src/browser.js");
      await browserMod.closeBrowserSession(session);
    }
  }

  const toRows = (rows: BaseStudyRow[]): TrendStrengthRow[] => rows.map((row) => {
    const a = cache.entries[candidateKey(row.matchUrl, "A")]?.records || [];
    const b = cache.entries[candidateKey(row.matchUrl, "B")]?.records || [];
    return mergeToTrendStrengthRow(row, a, b);
  });

  return {
    train: toRows(baseRowsTrain),
    valid: toRows(baseRowsValid),
    deepStats,
  };
}

async function runStudy(args: Args): Promise<StudyReport> {
  const base = await buildBaseRows(args);
  const cache = await loadDeepHistoryCache(args.cacheDeepHistoryFile);
  const trend = await buildTrendStrengthRows(args, base.train, base.valid, cache);
  await saveDeepHistoryCache(args.cacheDeepHistoryFile, cache);

  const baselinesTrain = summarizeBaselines(trend.train);
  const baselinesValid = summarizeBaselines(trend.valid);
  const { candidates, topCandidates } = evaluateCandidates(trend.train, trend.valid, args.minBucketSize);
  const recommendations = makeRecommendations(topCandidates, baselinesValid);
  const indexCorrelations = {
    train: computeIndexCorrelations(trend.train),
    valid: computeIndexCorrelations(trend.valid),
  };
  const ablationSummary = buildIndexAblationSummary(candidates);
  const indexRecommendation = buildIndexRecommendation(candidates);
  const bestTrendStrengthBaselineValidKeptHitRate = candidates
    .filter((c) => !c.tags.includes("index") && c.valid.skipped >= args.minBucketSize)
    .map((c) => c.valid.keptHitRate)
    .sort((a, b) => b - a)[0];

  const report: StudyReport = {
    config: {
      trainJoinedFile: args.trainJoinedFile,
      trainPredictionsFile: args.trainPredictionsFile,
      validJoinedFile: args.validJoinedFile,
      validPredictionsFile: args.validPredictionsFile,
      entryUrl: args.entryUrl,
      historyTechTarget: args.historyTechTarget,
      historyTechScanLimit: args.historyTechScanLimit,
      historyStatsMissBudget: args.historyStatsMissBudget,
      minBucketSize: args.minBucketSize,
      topK: args.topK,
      headed: args.headed,
      slowMo: args.slowMo,
      timeoutMs: args.timeoutMs,
      maxGotoRetries: args.maxGotoRetries,
      cacheDeepHistoryFile: args.cacheDeepHistoryFile,
      skipDeterministic: args.skipDeterministic,
      skipFitted: args.skipFitted,
      thresholds: {
        agreement: [...AGREEMENT_THRESHOLDS],
        confidence: [...CONFIDENCE_THRESHOLDS],
        trendCoherence: [...TREND_COHERENCE_THRESHOLDS],
        trendDown: [...TREND_DOWN_THRESHOLDS],
        trendCombo: [...TREND_COMBO_THRESHOLDS],
        oppStrengthAdverse: [...OPP_STRENGTH_ADVERSE_THRESHOLDS],
        tierAdverse: [...TIER_ADVERSE_THRESHOLDS],
        volatilityRisk: [...VOLATILITY_RISK_THRESHOLDS],
        coverageR: [...COVERAGE_R_THRESHOLDS],
        oppProxyCoverage: [...OPP_PROXY_COVERAGE_THRESHOLDS],
        relMin: [...REL_MIN_THRESHOLDS],
        scoreCoverage: [...SCORE_COVERAGE_THRESHOLDS],
        indexForm: [...INDEX_FORM_THRESHOLDS],
        indexStability: [...INDEX_STAB_THRESHOLDS],
        indexStrength: [...INDEX_STRENGTH_THRESHOLDS],
      },
      baselineFilters: {
        agreementConfidenceSkip: "agreement<=3 && confidence<=55",
        novaLogitConfSend: "novaLogisticAgree && novaMargin>=4 && confidence>=50 (skip = !send)",
      },
    },
    datasets: {
      train: base.datasets.train,
      valid: base.datasets.valid,
      deepCollection: trend.deepStats,
    },
    baselines: {
      train: baselinesTrain,
      valid: baselinesValid,
      bestExistingFilterValidKeptHitRate: getBestExistingFilterKeptHitRate(baselinesValid),
      bestTrendStrengthBaselineValidKeptHitRate,
    },
    candidateResults: candidates,
    topCandidates: topCandidates.slice(0, args.topK),
    recommendations,
    ablationSummary,
    indexCorrelations,
    indexRecommendation,
  };

  return report;
}

function printSummary(report: StudyReport): void {
  // concise console output for long runs
  process.stdout.write(`NOVA+ Trend/Strength Study\n`);
  process.stdout.write(`Train=${report.datasets.train.usableRows}, Valid=${report.datasets.valid.usableRows}\n`);
  process.stdout.write(`Baselines valid: main=${formatPct(report.baselines.valid.mainOverallHitRate)}, AC=${formatPct(report.baselines.valid.agreementConfidenceBaseline.keptHitRate)}, NLC=${formatPct(report.baselines.valid.novaLogitConfBaseline.keptHitRate)}\n`);
  process.stdout.write(`Deep collection: cacheHits=${report.datasets.deepCollection.cacheHits}, cacheMisses=${report.datasets.deepCollection.cacheMisses}, collected=${report.datasets.deepCollection.collectedPlayers}, failed=${report.datasets.deepCollection.failedPlayers}\n`);
  if (report.recommendations.best) {
    process.stdout.write(`Best candidate: ${report.recommendations.best.ruleId} | valid keptHit=${formatPct(report.recommendations.best.valid.keptHitRate)} | skipRate=${formatPct(report.recommendations.best.valid.skipRate)} | passes=${report.recommendations.best.passesCriteria}\n`);
  } else {
    process.stdout.write(`No passing candidate found.\n`);
  }
  process.stdout.write(`${report.recommendations.conclusion}\n`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await runStudy(args);
  await writeReports(report, args.reportJson, args.reportMd);
  printSummary(report);
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (entrypoint && import.meta.url === entrypoint) {
  main().catch((error) => {
    process.stderr.write(`Fatal error: ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
