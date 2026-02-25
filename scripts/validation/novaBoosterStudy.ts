import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  toThresholdRows,
  type ThresholdAnalysisRow,
} from "./novaHistoryThresholds.js";

const DEFAULT_TOP_K = 20;
const DEFAULT_MIN_OVERRIDES = 8;

const D1_GATE_THRESHOLDS = [0.35, 0.4, 0.45, 0.5, 0.55, 0.6] as const;
const D1_OVERRIDE_THRESHOLDS = [0.18, 0.24, 0.3, 0.36, 0.42] as const;
const F1_RISK_THRESHOLDS = [0.45, 0.5, 0.55, 0.6, 0.65] as const;
const F1_META_MARGIN_THRESHOLDS = [0.03, 0.05, 0.07, 0.1, 0.12] as const;

type Side = "A" | "B";
type SideOrNeutral = Side | "neutral";

interface JoinedLikeRow {
  winnerSide?: string;
  hybridPick?: string;
  mahalPick?: string;
  matchupPick?: string;
  mroaPick?: string;
  [key: string]: unknown;
}

export interface BoosterStudyRow extends ThresholdAnalysisRow {
  winnerSide: Side;
  historySide?: Side;
  novaSide: Side;
  logisticSide?: SideOrNeutral;
  markovSide?: SideOrNeutral;
  bradleySide?: SideOrNeutral;
  pcaSide?: SideOrNeutral;
  hybridSide?: Side;
  mahalSide?: Side;
  matchupSide?: Side;
  mroaSide?: Side;
  coreMeanP1?: number;
  coreMedianP1?: number;
  coreAgainstNova: number;
  coreWithNova: number;
  shadowAgainstNovaCount: number;
  shadowWithNovaCount: number;
  pcaExtreme: boolean;
  coreDispersionHigh: boolean;
  riskScoreD1: number;
}

export interface BinaryLogitModel {
  featureNames: string[];
  means: number[];
  stds: number[];
  weights: number[]; // intercept + feature weights
  config: {
    learningRate: number;
    epochs: number;
    l2Lambda: number;
  };
}

export interface BoosterDecisionRow {
  matchUrl: string;
  label: string;
  novaPick: Side;
  pick: Side;
  actualWinner: Side;
  correct: boolean;
  novaCorrect: boolean;
  gateOpen: boolean;
  overridden: boolean;
  overrideDirection?: Side;
  riskValue: number;
  sideValue: number;
  sideMargin: number;
}

export interface AccuracySummary {
  hit: number;
  total: number;
  rate: number;
}

export interface BoosterSubsetMetric {
  name: string;
  n: number;
  booster: AccuracySummary;
  nova: AccuracySummary;
  liftVsNova: number;
}

export interface BoosterEvaluationSummary {
  overall: AccuracySummary;
  novaOverall: AccuracySummary;
  deltaVsNovaOverall: number;
  overridesTotal: number;
  overridesCorrect: number;
  overridesWrong: number;
  netCorrections: number;
  subsetMetrics: BoosterSubsetMetric[];
  bestSubsetLiftName?: string;
  bestSubsetLift?: number;
  bestSubsetN?: number;
}

export interface BoosterDeterministicCandidate {
  kind: "deterministic";
  candidateId: string;
  gateThreshold: number;
  overrideThreshold: number;
  train: BoosterEvaluationSummary;
  valid: BoosterEvaluationSummary;
  passesCriteria: boolean;
}

export interface BoosterFittedCandidate {
  kind: "fitted";
  candidateId: string;
  riskThreshold: number;
  metaMarginThreshold: number;
  train: BoosterEvaluationSummary;
  valid: BoosterEvaluationSummary;
  passesCriteria: boolean;
}

export interface BoosterStudyReport {
  config: {
    trainJoinedFile: string;
    validJoinedFile: string;
    topK: number;
    minOverrides: number;
    d1GateThresholds: number[];
    d1OverrideThresholds: number[];
    f1RiskThresholds: number[];
    f1MetaMarginThresholds: number[];
    skipDeterministic: boolean;
    skipFitted: boolean;
  };
  dataset: {
    trainRows: number;
    validRows: number;
  };
  baselines: {
    train: {
      nova: AccuracySummary;
      history: AccuracySummary;
    };
    valid: {
      nova: AccuracySummary;
      history: AccuracySummary;
    };
  };
  deterministic?: {
    candidates: BoosterDeterministicCandidate[];
    shortlist: BoosterDeterministicCandidate[];
    best?: BoosterDeterministicCandidate;
  };
  fitted?: {
    modelStage1: BinaryLogitModel;
    modelStage2: BinaryLogitModel;
    candidates: BoosterFittedCandidate[];
    shortlist: BoosterFittedCandidate[];
    best?: BoosterFittedCandidate;
  };
}

interface FittedFeatureRow {
  features: Record<string, number>;
  novaCorrect: boolean;
  winnerSide: Side;
}

interface FittedBoosterModels {
  stage1: BinaryLogitModel;
  stage2: BinaryLogitModel;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sigmoid(z: number): number {
  const x = clamp(z, -30, 30);
  return 1 / (1 + Math.exp(-x));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeLooseName(value: string | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function parseLabelSides(label: string): { a?: string; b?: string } {
  if (typeof label !== "string" || label.trim() === "") return {};
  const split = label.split(/\s+vs\s+/i);
  if (split.length < 2) return {};
  return {
    a: split[0]?.trim(),
    b: split.slice(1).join(" vs ").trim(),
  };
}

function pickSideFromP1(p1: number | undefined): SideOrNeutral | undefined {
  if (!isFiniteNumber(p1)) return undefined;
  if (p1 > 50) return "A";
  if (p1 < 50) return "B";
  return "neutral";
}

function sideSign(side: Side | undefined): number {
  if (side === "A") return 1;
  if (side === "B") return -1;
  return 0;
}

function sideOrNeutralSign(side: SideOrNeutral | undefined): number {
  if (side === "A") return 1;
  if (side === "B") return -1;
  return 0;
}

function coerceWinnerSide(raw: ThresholdAnalysisRow): Side | undefined {
  const value = (raw.raw as JoinedLikeRow).winnerSide;
  if (value === "A" || value === "B") return value;
  return undefined;
}

function inferPickSideFromName(pickName: string | undefined, row: ThresholdAnalysisRow): Side | undefined {
  if (typeof pickName !== "string" || pickName.trim() === "") return undefined;
  const { a, b } = parseLabelSides(row.label);
  const normPick = normalizeLooseName(pickName);
  if (!normPick) return undefined;
  if (a && normalizeLooseName(a) === normPick) return "A";
  if (b && normalizeLooseName(b) === normPick) return "B";

  const winnerSide = coerceWinnerSide(row);
  const actualName = normalizeLooseName(row.actualWinnerName);
  if (winnerSide && actualName && normPick === actualName) {
    return winnerSide;
  }

  // Fallback: if we know winner side and names failed to normalize match, assume non-winner is the opposite.
  if (winnerSide && actualName && normPick !== actualName) {
    return winnerSide === "A" ? "B" : "A";
  }
  return undefined;
}

function coreSides(row: ThresholdAnalysisRow): Array<SideOrNeutral | undefined> {
  return [
    pickSideFromP1(row.logRegP1),
    pickSideFromP1(row.markovP1),
    pickSideFromP1(row.bradleyP1),
    pickSideFromP1(row.pcaP1),
  ];
}

function readShadowPick(raw: ThresholdAnalysisRow, key: "hybridPick" | "mahalPick" | "matchupPick" | "mroaPick"): string | undefined {
  const value = (raw.raw as JoinedLikeRow)[key];
  return typeof value === "string" ? value : undefined;
}

export function computeRiskScoreD1(row: {
  novaMargin: number;
  novaLogisticAgree: boolean;
  logisticMargin?: number;
  confidencePct?: number;
  modelSpreadCore?: number;
  pcaDeviation?: number;
  agreementHN: boolean;
  shadowAgainstNovaCount: number;
}): number {
  const fNovaWeak = clamp((8 - row.novaMargin) / 8, 0, 1);
  const fLogitConflict = row.novaLogisticAgree ? 0 : clamp((row.logisticMargin ?? 0) / 12, 0, 1);
  const fConfWeak = clamp((62 - (row.confidencePct ?? 50)) / 18, 0, 1);
  const fCoreSpread = clamp(((row.modelSpreadCore ?? 20) - 20) / 30, 0, 1);
  const fPcaOutlier = clamp(((row.pcaDeviation ?? 10) - 10) / 20, 0, 1);
  const fHistoryDisagree = row.agreementHN ? 0 : 1;
  const fShadowAgainst = clamp(row.shadowAgainstNovaCount / 3, 0, 1);

  return round3(
    0.2 * fNovaWeak +
      0.22 * fLogitConflict +
      0.16 * fConfWeak +
      0.12 * fCoreSpread +
      0.1 * fPcaOutlier +
      0.1 * fHistoryDisagree +
      0.1 * fShadowAgainst,
  );
}

export function toBoosterRows(rows: ThresholdAnalysisRow[]): BoosterStudyRow[] {
  const out: BoosterStudyRow[] = [];
  for (const row of rows) {
    const winnerSide = coerceWinnerSide(row);
    if (!winnerSide) continue;

    const novaSideRaw = inferPickSideFromName(row.novaPick, row);
    if (!novaSideRaw) continue;

    const historySide = inferPickSideFromName(row.historyPick, row);
    const hybridSide = inferPickSideFromName(readShadowPick(row, "hybridPick"), row);
    const mahalSide = inferPickSideFromName(readShadowPick(row, "mahalPick"), row);
    const matchupSide = inferPickSideFromName(readShadowPick(row, "matchupPick"), row);
    const mroaSide = inferPickSideFromName(readShadowPick(row, "mroaPick"), row);

    const logitSide = pickSideFromP1(row.logRegP1);
    const markovSide = pickSideFromP1(row.markovP1);
    const bradleySide = pickSideFromP1(row.bradleyP1);
    const pcaSide = pickSideFromP1(row.pcaP1);
    const coreSideValues = [logitSide, markovSide, bradleySide, pcaSide];
    const coreAgainstNova = coreSideValues.filter(
      (side) => side !== undefined && side !== "neutral" && side !== novaSideRaw,
    ).length;
    const coreWithNova = coreSideValues.filter((side) => side !== undefined && side !== "neutral" && side === novaSideRaw).length;

    const shadowSides = [matchupSide, mroaSide, mahalSide, hybridSide];
    const shadowAgainstNovaCount = shadowSides.filter((side) => side && side !== novaSideRaw).length;
    const shadowWithNovaCount = shadowSides.filter((side) => side && side === novaSideRaw).length;

    const coreValues = [row.logRegP1, row.markovP1, row.bradleyP1, row.pcaP1].filter(isFiniteNumber);
    const coreMeanP1 = coreValues.length > 0 ? round3(mean(coreValues)) : undefined;
    const coreMedianP1 = coreValues.length > 0 ? round3(median(coreValues)) : undefined;

    const boosterRowBase = {
      ...row,
      winnerSide,
      historySide,
      novaSide: novaSideRaw,
      logisticSide: logitSide,
      markovSide,
      bradleySide,
      pcaSide,
      hybridSide,
      mahalSide,
      matchupSide,
      mroaSide,
      coreMeanP1,
      coreMedianP1,
      coreAgainstNova,
      coreWithNova,
      shadowAgainstNovaCount,
      shadowWithNovaCount,
      pcaExtreme: (row.pcaDeviation ?? -Infinity) >= 15,
      coreDispersionHigh: (row.modelSpreadCore ?? -Infinity) >= 35,
    } satisfies Omit<BoosterStudyRow, "riskScoreD1">;
    const riskScoreD1 = computeRiskScoreD1({
      novaMargin: row.novaMargin,
      novaLogisticAgree: row.novaLogisticAgree,
      logisticMargin: row.logisticMargin,
      confidencePct: row.confidencePct,
      modelSpreadCore: row.modelSpreadCore,
      pcaDeviation: row.pcaDeviation,
      agreementHN: row.agreementHN,
      shadowAgainstNovaCount,
    });

    out.push({
      ...boosterRowBase,
      riskScoreD1,
    });
  }
  return out;
}

function riskGateOpenD1(row: BoosterStudyRow, gateThreshold: number): boolean {
  return row.riskScoreD1 >= gateThreshold;
}

function computeOverrideSideScoreD1(row: BoosterStudyRow): number {
  const sLogit = clamp(((row.logRegP1 ?? 50) - 50) / 15, -1, 1);
  const sMarkov = clamp(((row.markovP1 ?? 50) - 50) / 15, -1, 1);
  const sBradley = clamp(((row.bradleyP1 ?? 50) - 50) / 15, -1, 1);
  const sPca = clamp(((row.pcaP1 ?? 50) - 50) / 25, -1, 1);
  const sHistory = sideSign(row.historySide);
  const sMatchup = sideSign(row.matchupSide);
  const sMroa = sideSign(row.mroaSide);
  const sMahal = sideSign(row.mahalSide);
  const sHybrid = sideSign(row.hybridSide);
  return round3(
    0.24 * sLogit +
      0.1 * sMarkov +
      0.14 * sBradley +
      0.08 * sPca +
      0.16 * sHistory +
      0.12 * sMatchup +
      0.1 * sMroa +
      0.04 * sMahal +
      0.02 * sHybrid,
  );
}

function sideFromSignedScore(score: number): Side | undefined {
  if (score > 0) return "A";
  if (score < 0) return "B";
  return undefined;
}

export function applyDeterministicBooster(
  rows: BoosterStudyRow[],
  gateThreshold: number,
  overrideThreshold: number,
): BoosterDecisionRow[] {
  return rows.map((row) => {
    const gateOpen = riskGateOpenD1(row, gateThreshold);
    const sideScore = computeOverrideSideScoreD1(row);
    const sideMargin = Math.abs(sideScore);
    const overrideDirection = sideFromSignedScore(sideScore);
    let pick = row.novaSide;
    let overridden = false;
    if (gateOpen && overrideDirection && sideMargin >= overrideThreshold && overrideDirection !== row.novaSide) {
      pick = overrideDirection;
      overridden = true;
    }
    return {
      matchUrl: row.matchUrl,
      label: row.label,
      novaPick: row.novaSide,
      pick,
      actualWinner: row.winnerSide,
      correct: pick === row.winnerSide,
      novaCorrect: row.novaSide === row.winnerSide,
      gateOpen,
      overridden,
      overrideDirection,
      riskValue: row.riskScoreD1,
      sideValue: sideScore,
      sideMargin: round3(sideMargin),
    };
  });
}

function parseBooleanFlag(argv: string[], key: string): boolean {
  return argv.includes(`--${key}`);
}

function readArg(argv: string[], key: string): string | undefined {
  const token = `--${key}`;
  const idx = argv.findIndex((value) => value === token);
  if (idx < 0) return undefined;
  const next = argv[idx + 1];
  if (!next || next.startsWith("--")) return undefined;
  return next;
}

function readIntArg(argv: string[], key: string): number | undefined {
  const raw = readArg(argv, key);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || !Number.isFinite(value)) {
    throw new Error(`--${key} must be an integer`);
  }
  return value;
}

function accuracyFromFlags(flags: boolean[]): AccuracySummary {
  const total = flags.length;
  const hit = flags.filter(Boolean).length;
  return { hit, total, rate: total > 0 ? hit / total : 0 };
}

function evaluateSubsets(rows: BoosterStudyRow[], decisions: BoosterDecisionRow[]): BoosterSubsetMetric[] {
  const paired = rows.map((row, index) => ({ row, decision: decisions[index]! }));
  const subsets: Array<{ name: string; predicate: (r: BoosterStudyRow, d: BoosterDecisionRow) => boolean }> = [
    { name: "gateOpen", predicate: (_r, d) => d.gateOpen },
    { name: "overridden", predicate: (_r, d) => d.overridden },
    { name: "disagreeHN", predicate: (r) => !r.agreementHN },
    { name: "novaLogisticConflict", predicate: (r) => !r.novaLogisticAgree },
    { name: "lowConfidence", predicate: (r) => (r.confidencePct ?? Infinity) < 55 },
    { name: "lowNovaMargin", predicate: (r) => r.novaMargin < 6 },
  ];
  return subsets.map(({ name, predicate }) => {
    const matched = paired.filter(({ row, decision }) => predicate(row, decision));
    const booster = accuracyFromFlags(matched.map(({ decision }) => decision.correct));
    const nova = accuracyFromFlags(matched.map(({ decision }) => decision.novaCorrect));
    return {
      name,
      n: matched.length,
      booster,
      nova,
      liftVsNova: booster.rate - nova.rate,
    };
  });
}

function summarizeEvaluation(rows: BoosterStudyRow[], decisions: BoosterDecisionRow[]): BoosterEvaluationSummary {
  const overall = accuracyFromFlags(decisions.map((d) => d.correct));
  const novaOverall = accuracyFromFlags(decisions.map((d) => d.novaCorrect));
  const overrides = decisions.filter((d) => d.overridden);
  const overridesCorrect = overrides.filter((d) => d.correct).length;
  const overridesWrong = overrides.length - overridesCorrect;
  const subsetMetrics = evaluateSubsets(rows, decisions);
  const meaningfulSubsets = subsetMetrics.filter((metric) => metric.n >= 8);
  const bestSubset = meaningfulSubsets.sort((a, b) => {
    if (b.liftVsNova !== a.liftVsNova) return b.liftVsNova - a.liftVsNova;
    if (b.n !== a.n) return b.n - a.n;
    return a.name.localeCompare(b.name);
  })[0];
  return {
    overall,
    novaOverall,
    deltaVsNovaOverall: overall.rate - novaOverall.rate,
    overridesTotal: overrides.length,
    overridesCorrect,
    overridesWrong,
    netCorrections: overridesCorrect - overridesWrong,
    subsetMetrics,
    bestSubsetLiftName: bestSubset?.name,
    bestSubsetLift: bestSubset?.liftVsNova,
    bestSubsetN: bestSubset?.n,
  };
}

function candidatePassesCriteria(summary: BoosterEvaluationSummary, minOverrides: number): boolean {
  if (summary.deltaVsNovaOverall < 0) return false;
  if (summary.overridesTotal < minOverrides) return false;
  return summary.subsetMetrics.some((metric) => metric.n >= 8 && metric.liftVsNova >= 0.05);
}

function sortDeterministicCandidates(a: BoosterDeterministicCandidate, b: BoosterDeterministicCandidate): number {
  if (Number(b.passesCriteria) !== Number(a.passesCriteria)) return Number(b.passesCriteria) - Number(a.passesCriteria);
  if (b.valid.overall.rate !== a.valid.overall.rate) return b.valid.overall.rate - a.valid.overall.rate;
  if (b.valid.deltaVsNovaOverall !== a.valid.deltaVsNovaOverall) return b.valid.deltaVsNovaOverall - a.valid.deltaVsNovaOverall;
  if (b.valid.netCorrections !== a.valid.netCorrections) return b.valid.netCorrections - a.valid.netCorrections;
  if (b.valid.overridesTotal !== a.valid.overridesTotal) return b.valid.overridesTotal - a.valid.overridesTotal;
  return a.candidateId.localeCompare(b.candidateId);
}

function sortFittedCandidates(a: BoosterFittedCandidate, b: BoosterFittedCandidate): number {
  if (Number(b.passesCriteria) !== Number(a.passesCriteria)) return Number(b.passesCriteria) - Number(a.passesCriteria);
  if (b.valid.overall.rate !== a.valid.overall.rate) return b.valid.overall.rate - a.valid.overall.rate;
  if (b.valid.deltaVsNovaOverall !== a.valid.deltaVsNovaOverall) return b.valid.deltaVsNovaOverall - a.valid.deltaVsNovaOverall;
  if (b.valid.netCorrections !== a.valid.netCorrections) return b.valid.netCorrections - a.valid.netCorrections;
  if (b.valid.overridesTotal !== a.valid.overridesTotal) return b.valid.overridesTotal - a.valid.overridesTotal;
  return a.candidateId.localeCompare(b.candidateId);
}

function baselineForRows(rows: BoosterStudyRow[]) {
  return {
    nova: accuracyFromFlags(rows.map((r) => r.novaCorrect)),
    history: accuracyFromFlags(rows.map((r) => r.historyCorrect)),
  };
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function signedPp(value: number): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}pp`;
}

function deriveFittedFeatures(row: BoosterStudyRow): Record<string, number> {
  const logitNeutral = row.logisticSide === "neutral" ? 1 : 0;
  const coreMeanP1 = row.coreMeanP1 ?? 50;
  const coreMedianP1 = row.coreMedianP1 ?? 50;
  return {
    novaP1_centered: (row.novaP1 - 50) / 50,
    novaMargin_norm: row.novaMargin / 25,
    confidencePct_centered: ((row.confidencePct ?? 50) - 50) / 25,
    logRegP1_centered: ((row.logRegP1 ?? 50) - 50) / 50,
    logisticMargin_norm: (row.logisticMargin ?? 0) / 25,
    markovP1_centered: ((row.markovP1 ?? 50) - 50) / 50,
    bradleyP1_centered: ((row.bradleyP1 ?? 50) - 50) / 50,
    pcaP1_centered: ((row.pcaP1 ?? 50) - 50) / 50,
    modelSpreadCore_norm: (row.modelSpreadCore ?? 0) / 50,
    pcaDeviation_norm: (row.pcaDeviation ?? 0) / 50,
    coreMeanP1_centered: (coreMeanP1 - 50) / 50,
    coreMedianP1_centered: (coreMedianP1 - 50) / 50,
    riskScore_D1: row.riskScoreD1,
    agreementHN: row.agreementHN ? 1 : 0,
    novaLogisticAgree: row.novaLogisticAgree ? 1 : 0,
    logisticNeutral: logitNeutral,
    shadowAgainstNova_norm: row.shadowAgainstNovaCount / 4,
    shadowWithNova_norm: row.shadowWithNovaCount / 4,
    historyEqualsA: row.historySide === "A" ? 1 : 0,
    novaEqualsA: row.novaSide === "A" ? 1 : 0,
  };
}

function toFittedFeatureRows(rows: BoosterStudyRow[]): FittedFeatureRow[] {
  return rows.map((row) => ({
    features: deriveFittedFeatures(row),
    novaCorrect: row.novaCorrect,
    winnerSide: row.winnerSide,
  }));
}

function featureNamesFromRows(rows: FittedFeatureRow[]): string[] {
  const first = rows[0];
  if (!first) return [];
  return Object.keys(first.features).sort();
}

function standardizeRows(rows: FittedFeatureRow[], featureNames: string[]) {
  const means: number[] = [];
  const stds: number[] = [];
  for (const name of featureNames) {
    const values = rows.map((row) => row.features[name] ?? 0);
    const m = mean(values);
    const variance = mean(values.map((value) => (value - m) ** 2));
    const std = variance > 1e-12 ? Math.sqrt(variance) : 1;
    means.push(m);
    stds.push(std);
  }
  return { means, stds };
}

function vectorizeRow(
  features: Record<string, number>,
  featureNames: string[],
  means: number[],
  stds: number[],
): number[] {
  return featureNames.map((name, idx) => {
    const raw = features[name] ?? 0;
    const std = stds[idx] ?? 1;
    const meanVal = means[idx] ?? 0;
    return std !== 0 ? (raw - meanVal) / std : raw - meanVal;
  });
}

export function trainBinaryLogit(
  samples: Array<{ features: Record<string, number>; target: 0 | 1 }>,
  options?: { epochs?: number; learningRate?: number; l2Lambda?: number },
): BinaryLogitModel {
  const epochs = options?.epochs ?? 2000;
  const learningRate = options?.learningRate ?? 0.05;
  const l2Lambda = options?.l2Lambda ?? 0.8;
  if (samples.length === 0) {
    throw new Error("trainBinaryLogit requires at least one sample");
  }
  const featureNames = Object.keys(samples[0]!.features).sort();
  const fittedRows: FittedFeatureRow[] = samples.map((sample) => ({
    features: sample.features,
    novaCorrect: sample.target === 0, // unused
    winnerSide: sample.target === 1 ? "A" : "B", // unused
  }));
  const { means, stds } = standardizeRows(fittedRows, featureNames);
  const x = samples.map((sample) => vectorizeRow(sample.features, featureNames, means, stds));
  const y = samples.map((sample) => sample.target);
  const d = featureNames.length;
  const weights = new Array<number>(d + 1).fill(0);

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const grads = new Array<number>(d + 1).fill(0);
    for (let i = 0; i < x.length; i += 1) {
      const xi = x[i]!;
      let z = weights[0]!;
      for (let j = 0; j < d; j += 1) {
        z += (weights[j + 1] ?? 0) * (xi[j] ?? 0);
      }
      const p = sigmoid(z);
      const error = p - (y[i] ?? 0);
      grads[0] = (grads[0] ?? 0) + error;
      for (let j = 0; j < d; j += 1) {
        grads[j + 1] = (grads[j + 1] ?? 0) + error * (xi[j] ?? 0);
      }
    }

    const n = x.length;
    grads[0] = (grads[0] ?? 0) / n;
    for (let j = 0; j < d; j += 1) {
      const avgGrad = (grads[j + 1] ?? 0) / n;
      const penalty = l2Lambda * (weights[j + 1] ?? 0);
      grads[j + 1] = avgGrad + penalty;
    }

    weights[0] = (weights[0] ?? 0) - learningRate * (grads[0] ?? 0);
    for (let j = 0; j < d; j += 1) {
      weights[j + 1] = (weights[j + 1] ?? 0) - learningRate * (grads[j + 1] ?? 0);
    }
  }

  return {
    featureNames,
    means: means.map(round3),
    stds: stds.map(round3),
    weights: weights.map(round3),
    config: {
      learningRate,
      epochs,
      l2Lambda,
    },
  };
}

export function predictBinaryLogit(model: BinaryLogitModel, features: Record<string, number>): number {
  const vector = vectorizeRow(features, model.featureNames, model.means, model.stds);
  let z = model.weights[0] ?? 0;
  for (let i = 0; i < model.featureNames.length; i += 1) {
    z += (model.weights[i + 1] ?? 0) * (vector[i] ?? 0);
  }
  return sigmoid(z);
}

function trainFittedBooster(trainRows: BoosterStudyRow[]): FittedBoosterModels {
  const featureRows = toFittedFeatureRows(trainRows);
  const stage1 = trainBinaryLogit(
    featureRows.map((row) => ({ features: row.features, target: row.novaCorrect ? 0 : 1 })),
  );
  const stage2 = trainBinaryLogit(
    featureRows.map((row) => ({ features: row.features, target: row.winnerSide === "A" ? 1 : 0 })),
  );
  return { stage1, stage2 };
}

export function applyFittedBooster(
  rows: BoosterStudyRow[],
  models: FittedBoosterModels,
  riskThreshold: number,
  metaMarginThreshold: number,
): BoosterDecisionRow[] {
  return rows.map((row) => {
    const features = deriveFittedFeatures(row);
    const riskProb = predictBinaryLogit(models.stage1, features);
    const metaP1 = predictBinaryLogit(models.stage2, features);
    const metaPick: Side = metaP1 > 0.5 ? "A" : "B";
    const metaMargin = Math.abs(metaP1 - 0.5);
    const gateOpen = riskProb >= riskThreshold;

    let pick = row.novaSide;
    let overridden = false;
    if (gateOpen && metaMargin >= metaMarginThreshold && metaPick !== row.novaSide) {
      pick = metaPick;
      overridden = true;
    }

    return {
      matchUrl: row.matchUrl,
      label: row.label,
      novaPick: row.novaSide,
      pick,
      actualWinner: row.winnerSide,
      correct: pick === row.winnerSide,
      novaCorrect: row.novaSide === row.winnerSide,
      gateOpen,
      overridden,
      overrideDirection: metaPick,
      riskValue: round3(riskProb),
      sideValue: round3(metaP1),
      sideMargin: round3(metaMargin),
    };
  });
}

function buildDeterministicCandidates(
  trainRows: BoosterStudyRow[],
  validRows: BoosterStudyRow[],
  minOverrides: number,
): BoosterDeterministicCandidate[] {
  const candidates: BoosterDeterministicCandidate[] = [];
  for (const gateThreshold of D1_GATE_THRESHOLDS) {
    for (const overrideThreshold of D1_OVERRIDE_THRESHOLDS) {
      const trainEval = summarizeEvaluation(
        trainRows,
        applyDeterministicBooster(trainRows, gateThreshold, overrideThreshold),
      );
      const validEval = summarizeEvaluation(
        validRows,
        applyDeterministicBooster(validRows, gateThreshold, overrideThreshold),
      );
      candidates.push({
        kind: "deterministic",
        candidateId: `D1_gate_${gateThreshold.toFixed(2)}_ovr_${overrideThreshold.toFixed(2)}`,
        gateThreshold,
        overrideThreshold,
        train: trainEval,
        valid: validEval,
        passesCriteria: candidatePassesCriteria(validEval, minOverrides),
      });
    }
  }
  return candidates.sort(sortDeterministicCandidates);
}

function buildFittedCandidates(
  trainRows: BoosterStudyRow[],
  validRows: BoosterStudyRow[],
  models: FittedBoosterModels,
  minOverrides: number,
): BoosterFittedCandidate[] {
  const candidates: BoosterFittedCandidate[] = [];
  for (const riskThreshold of F1_RISK_THRESHOLDS) {
    for (const metaMarginThreshold of F1_META_MARGIN_THRESHOLDS) {
      const trainEval = summarizeEvaluation(trainRows, applyFittedBooster(trainRows, models, riskThreshold, metaMarginThreshold));
      const validEval = summarizeEvaluation(validRows, applyFittedBooster(validRows, models, riskThreshold, metaMarginThreshold));
      candidates.push({
        kind: "fitted",
        candidateId: `F1_risk_${riskThreshold.toFixed(2)}_meta_${metaMarginThreshold.toFixed(2)}`,
        riskThreshold,
        metaMarginThreshold,
        train: trainEval,
        valid: validEval,
        passesCriteria: candidatePassesCriteria(validEval, minOverrides),
      });
    }
  }
  return candidates.sort(sortFittedCandidates);
}

export function analyzeNovaBoosterStudy(
  trainRows: BoosterStudyRow[],
  validRows: BoosterStudyRow[],
  options?: {
    topK?: number;
    minOverrides?: number;
    skipDeterministic?: boolean;
    skipFitted?: boolean;
    trainJoinedFile?: string;
    validJoinedFile?: string;
  },
): BoosterStudyReport {
  const topK = options?.topK ?? DEFAULT_TOP_K;
  const minOverrides = options?.minOverrides ?? DEFAULT_MIN_OVERRIDES;
  const skipDeterministic = options?.skipDeterministic ?? false;
  const skipFitted = options?.skipFitted ?? false;

  const report: BoosterStudyReport = {
    config: {
      trainJoinedFile: options?.trainJoinedFile ?? "",
      validJoinedFile: options?.validJoinedFile ?? "",
      topK,
      minOverrides,
      d1GateThresholds: [...D1_GATE_THRESHOLDS],
      d1OverrideThresholds: [...D1_OVERRIDE_THRESHOLDS],
      f1RiskThresholds: [...F1_RISK_THRESHOLDS],
      f1MetaMarginThresholds: [...F1_META_MARGIN_THRESHOLDS],
      skipDeterministic,
      skipFitted,
    },
    dataset: {
      trainRows: trainRows.length,
      validRows: validRows.length,
    },
    baselines: {
      train: baselineForRows(trainRows),
      valid: baselineForRows(validRows),
    },
  };

  if (!skipDeterministic) {
    const candidates = buildDeterministicCandidates(trainRows, validRows, minOverrides);
    report.deterministic = {
      candidates,
      shortlist: candidates.slice(0, topK),
      best: candidates[0],
    };
  }

  if (!skipFitted) {
    const models = trainFittedBooster(trainRows);
    const candidates = buildFittedCandidates(trainRows, validRows, models, minOverrides);
    report.fitted = {
      modelStage1: models.stage1,
      modelStage2: models.stage2,
      candidates,
      shortlist: candidates.slice(0, topK),
      best: candidates[0],
    };
  }

  return report;
}

function renderSubsetLines(summary: BoosterEvaluationSummary, prefix: string): string[] {
  const order = ["gateOpen", "overridden", "disagreeHN", "novaLogisticConflict", "lowConfidence", "lowNovaMargin"];
  const metrics = [...summary.subsetMetrics].sort((a, b) => {
    const ia = order.indexOf(a.name);
    const ib = order.indexOf(b.name);
    if (ia >= 0 && ib >= 0 && ia !== ib) return ia - ib;
    if (ia >= 0 && ib < 0) return -1;
    if (ia < 0 && ib >= 0) return 1;
    return a.name.localeCompare(b.name);
  });
  return metrics.map(
    (m) =>
      `${prefix}${m.name}: n=${m.n} booster=${m.booster.hit}/${m.booster.total} (${percent(m.booster.rate)}) ` +
      `NOVA=${m.nova.hit}/${m.nova.total} (${percent(m.nova.rate)}) lift=${signedPp(m.liftVsNova)}`,
  );
}

function formatEvalShort(label: string, evalSummary: BoosterEvaluationSummary): string {
  return (
    `${label}: ${evalSummary.overall.hit}/${evalSummary.overall.total} (${percent(evalSummary.overall.rate)}) ` +
    `| vs NOVA ${signedPp(evalSummary.deltaVsNovaOverall)} | overrides=${evalSummary.overridesTotal} ` +
    `(good=${evalSummary.overridesCorrect}, bad=${evalSummary.overridesWrong}, net=${evalSummary.netCorrections})` +
    (typeof evalSummary.bestSubsetLift === "number" && evalSummary.bestSubsetLiftName
      ? ` | best subset ${evalSummary.bestSubsetLiftName} ${signedPp(evalSummary.bestSubsetLift)} (n=${evalSummary.bestSubsetN ?? 0})`
      : "")
  );
}

export function formatNovaBoosterStudyReport(report: BoosterStudyReport): string {
  const lines: string[] = [];
  lines.push("=== NOVA BOOSTER STUDY (audit-only) ===");
  lines.push(`Train joined: ${report.config.trainJoinedFile}`);
  lines.push(`Valid joined: ${report.config.validJoinedFile}`);
  lines.push(`Rows: train=${report.dataset.trainRows}, valid=${report.dataset.validRows}`);
  lines.push(`Criteria: min_overrides=${report.config.minOverrides}, no overall drop vs NOVA`);
  lines.push("");
  lines.push("Baselines:");
  lines.push(
    `- Train NOVA=${report.baselines.train.nova.hit}/${report.baselines.train.nova.total} (${percent(report.baselines.train.nova.rate)}) ` +
      `| HISTORY=${report.baselines.train.history.hit}/${report.baselines.train.history.total} (${percent(report.baselines.train.history.rate)})`,
  );
  lines.push(
    `- Valid NOVA=${report.baselines.valid.nova.hit}/${report.baselines.valid.nova.total} (${percent(report.baselines.valid.nova.rate)}) ` +
      `| HISTORY=${report.baselines.valid.history.hit}/${report.baselines.valid.history.total} (${percent(report.baselines.valid.history.rate)})`,
  );
  lines.push("");

  if (report.deterministic) {
    lines.push("Top deterministic (D1) candidates:");
    for (const candidate of report.deterministic.shortlist.slice(0, 5)) {
      lines.push(
        `- ${candidate.candidateId} | gate=${candidate.gateThreshold.toFixed(2)} ovr=${candidate.overrideThreshold.toFixed(
          2,
        )} | passes=${candidate.passesCriteria ? "yes" : "no"}`,
      );
      lines.push(`  ${formatEvalShort("Train", candidate.train)}`);
      lines.push(`  ${formatEvalShort("Valid", candidate.valid)}`);
    }
    lines.push("");
    if (report.deterministic.best) {
      lines.push("Best D1 subset diagnostics (VALID):");
      lines.push(...renderSubsetLines(report.deterministic.best.valid, "  - "));
      lines.push("");
    }
  }

  if (report.fitted) {
    lines.push("Top fitted (F1) candidates:");
    for (const candidate of report.fitted.shortlist.slice(0, 5)) {
      lines.push(
        `- ${candidate.candidateId} | risk=${candidate.riskThreshold.toFixed(2)} metaMargin=${candidate.metaMarginThreshold.toFixed(
          2,
        )} | passes=${candidate.passesCriteria ? "yes" : "no"}`,
      );
      lines.push(`  ${formatEvalShort("Train", candidate.train)}`);
      lines.push(`  ${formatEvalShort("Valid", candidate.valid)}`);
    }
    lines.push("");
    if (report.fitted.best) {
      lines.push("Best F1 subset diagnostics (VALID):");
      lines.push(...renderSubsetLines(report.fitted.best.valid, "  - "));
      lines.push("");
    }
  }

  const bestOverall = [
    report.deterministic?.best
      ? {
          name: "D1",
          rate: report.deterministic.best.valid.overall.rate,
          delta: report.deterministic.best.valid.deltaVsNovaOverall,
          passes: report.deterministic.best.passesCriteria,
          id: report.deterministic.best.candidateId,
        }
      : undefined,
    report.fitted?.best
      ? {
          name: "F1",
          rate: report.fitted.best.valid.overall.rate,
          delta: report.fitted.best.valid.deltaVsNovaOverall,
          passes: report.fitted.best.passesCriteria,
          id: report.fitted.best.candidateId,
        }
      : undefined,
  ]
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((a, b) => {
      if (Number(b.passes) !== Number(a.passes)) return Number(b.passes) - Number(a.passes);
      if (b.rate !== a.rate) return b.rate - a.rate;
      if (b.delta !== a.delta) return b.delta - a.delta;
      return a.name.localeCompare(b.name);
    })[0];

  if (bestOverall) {
    lines.push(
      `Best booster candidate on VALID: ${bestOverall.name} (${bestOverall.id}) | hitRate=${percent(bestOverall.rate)} | vs NOVA ${signedPp(
        bestOverall.delta,
      )} | passes=${bestOverall.passes ? "yes" : "no"}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

export function formatNovaBoosterStudyMarkdown(report: BoosterStudyReport): string {
  const lines: string[] = [];
  lines.push("# NOVA Booster Study (audit-only)");
  lines.push(`- Train joined: \`${report.config.trainJoinedFile}\``);
  lines.push(`- Valid joined: \`${report.config.validJoinedFile}\``);
  lines.push(`- Train rows: ${report.dataset.trainRows}`);
  lines.push(`- Valid rows: ${report.dataset.validRows}`);
  lines.push(`- Min overrides: ${report.config.minOverrides}`);
  lines.push("");
  lines.push("## Baselines");
  lines.push(`- Train NOVA: ${report.baselines.train.nova.hit}/${report.baselines.train.nova.total} (${percent(report.baselines.train.nova.rate)})`);
  lines.push(`- Train HISTORY: ${report.baselines.train.history.hit}/${report.baselines.train.history.total} (${percent(report.baselines.train.history.rate)})`);
  lines.push(`- Valid NOVA: ${report.baselines.valid.nova.hit}/${report.baselines.valid.nova.total} (${percent(report.baselines.valid.nova.rate)})`);
  lines.push(`- Valid HISTORY: ${report.baselines.valid.history.hit}/${report.baselines.valid.history.total} (${percent(report.baselines.valid.history.rate)})`);
  lines.push("");

  const renderCandidateTable = <T extends BoosterDeterministicCandidate | BoosterFittedCandidate>(
    title: string,
    rows: T[],
    kind: "D1" | "F1",
  ) => {
    lines.push(`## ${title}`);
    if (rows.length === 0) {
      lines.push("- (none)");
      lines.push("");
      return;
    }
    lines.push(
      "| candidate_id | valid hitRate | vs NOVA | overrides | net | best subset lift | passes | train hitRate |",
    );
    lines.push("|---|---:|---:|---:|---:|---:|:---:|---:|");
    for (const row of rows.slice(0, report.config.topK)) {
      const valid = row.valid;
      const train = row.train;
      lines.push(
        `| ${row.candidateId} | ${(valid.overall.rate * 100).toFixed(1)}% | ${signedPp(valid.deltaVsNovaOverall)} | ${valid.overridesTotal} | ${valid.netCorrections} | ${
          typeof valid.bestSubsetLift === "number" ? signedPp(valid.bestSubsetLift) : "-"
        } | ${row.passesCriteria ? "yes" : "no"} | ${(train.overall.rate * 100).toFixed(1)}% |`,
      );
    }
    lines.push("");
    const best = kind === "D1" ? report.deterministic?.best : report.fitted?.best;
    if (best) {
      lines.push(`### Best ${kind} subset diagnostics (valid)`);
      lines.push("| subset | n | booster | NOVA | lift |");
      lines.push("|---|---:|---:|---:|---:|");
      for (const metric of best.valid.subsetMetrics) {
        lines.push(
          `| ${metric.name} | ${metric.n} | ${(metric.booster.rate * 100).toFixed(1)}% | ${(metric.nova.rate * 100).toFixed(
            1,
          )}% | ${signedPp(metric.liftVsNova)} |`,
        );
      }
      lines.push("");
    }
  };

  if (report.deterministic) renderCandidateTable("Deterministic (D1) Candidates", report.deterministic.shortlist, "D1");
  if (report.fitted) renderCandidateTable("Fitted (F1) Candidates", report.fitted.shortlist, "F1");
  return `${lines.join("\n")}\n`;
}

function parseRowsFromJoined(raw: unknown, fileLabel: string): BoosterStudyRow[] {
  if (!Array.isArray(raw)) {
    throw new Error(`${fileLabel} must be a JSON array`);
  }
  const thresholdRows = toThresholdRows(raw);
  return toBoosterRows(thresholdRows);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const trainJoinedFile = (readArg(argv, "train-joined-file") || "").trim();
  const validJoinedFile = (readArg(argv, "valid-joined-file") || "").trim();
  const topK = readIntArg(argv, "top-k") ?? DEFAULT_TOP_K;
  const minOverrides = readIntArg(argv, "min-overrides") ?? DEFAULT_MIN_OVERRIDES;
  const reportJsonPath = readArg(argv, "report-json");
  const reportMdPath = readArg(argv, "report-md");
  const rowsJsonPath = readArg(argv, "rows-json");
  const skipFitted = parseBooleanFlag(argv, "skip-fitted");
  const skipDeterministic = parseBooleanFlag(argv, "skip-deterministic");
  if (!trainJoinedFile) throw new Error("--train-joined-file is required");
  if (!validJoinedFile) throw new Error("--valid-joined-file is required");
  if (topK <= 0) throw new Error("--top-k must be > 0");
  if (minOverrides <= 0) throw new Error("--min-overrides must be > 0");
  if (skipFitted && skipDeterministic) throw new Error("Cannot skip both deterministic and fitted");

  const rawTrain = JSON.parse(await readFile(trainJoinedFile, "utf8")) as unknown;
  const rawValid = JSON.parse(await readFile(validJoinedFile, "utf8")) as unknown;
  const trainRows = parseRowsFromJoined(rawTrain, "train joined file");
  const validRows = parseRowsFromJoined(rawValid, "valid joined file");

  const report = analyzeNovaBoosterStudy(trainRows, validRows, {
    topK,
    minOverrides,
    skipFitted,
    skipDeterministic,
    trainJoinedFile,
    validJoinedFile,
  });

  if (reportJsonPath) {
    await writeFile(reportJsonPath, JSON.stringify(report, null, 2), "utf8");
  }
  if (reportMdPath) {
    await writeFile(reportMdPath, formatNovaBoosterStudyMarkdown(report), "utf8");
  }
  if (rowsJsonPath) {
    const rowsDebug = {
      train: trainRows,
      valid: validRows,
    };
    await writeFile(rowsJsonPath, JSON.stringify(rowsDebug, null, 2), "utf8");
  }
  process.stdout.write(formatNovaBoosterStudyReport(report));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const msg = error instanceof Error ? error.stack || error.message : String(error);
    process.stderr.write(`${msg}\n`);
    process.exit(1);
  });
}

