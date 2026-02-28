import {
  canonicalDirtMetricKey,
  type RequiredDirtMetricKey,
} from "./requiredMetrics.js";
import { metricValueToNumber } from "./metricNormalization.js";
import type { HistoricalMatchTechStats, PlayerStateFeature } from "../types.js";

export interface TournamentTierInfo {
  tierScore: number;
  flags: { qualifying: boolean; unknown: boolean };
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

export interface WindowAggregate {
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
  controlTrendSlope?: number;
  returnTrendSlope?: number;
  tpwTrendSlope?: number;
  scoreTrendSlope?: number;
  scoreMomentum?: number;
  scoreCoverage?: number;
}

export interface PerPlayerWindowAgg {
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

export interface PerPlayerIndices {
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

export interface PerMatchScoreFeatures {
  scoreParsed: boolean;
  matchWonSign?: number;
  setMarginNorm?: number;
  gameMarginNorm?: number;
  scoreMomentum?: number;
}

export interface PlayerStateWindowSeries {
  w10?: number;
  w5?: number;
  w3?: number;
}

export interface PlayerStateSeriesResult {
  nTech: number;
  hasW10: boolean;
  hasW5: boolean;
  hasW3: boolean;
  degradedW10: boolean;
  degradedW5: boolean;
  degradedW3: boolean;
  stability: PlayerStateWindowSeries;
  formTech: PlayerStateWindowSeries;
  formPlus: PlayerStateWindowSeries;
  strength: PlayerStateWindowSeries;
}

export interface PairStateContrastOptions {
  gain?: PlayerStateWindowSeries;
  capShift?: number;
  fullCoverageGapTarget?: number;
  nearZeroDiff?: number;
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizePercent(value: number | undefined): number {
  if (!isFiniteNumber(value)) {
    return 0;
  }
  return clamp(value / 100, 0, 1.2);
}

export function inferTournamentTierScore(tournament: string | undefined): TournamentTierInfo {
  const raw = String(tournament || "").trim();
  const text = raw.toLowerCase();
  const qualifying = /\bqualif(?:ying|ication)?\b|\bqualification\b/.test(text);
  const flags = { qualifying, unknown: false };
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
  if (req.some((value) => !isFiniteNumber(value))) {
    return undefined;
  }
  const score =
    0.3 * (input.total_points_won as number) +
    0.2 * (input.return_points_won as number) +
    0.2 * (input.total_games_won as number) +
    0.15 * (input.service_games_won as number) +
    0.15 * (input.return_games_won as number);
  return round3(clamp((score - 35) / 30, 0, 1));
}

export function combineOpponentStrengthProxy(
  oppStatsQ01: number | undefined,
  tierScore: number,
): number | undefined {
  if (!isFiniteNumber(oppStatsQ01)) {
    return undefined;
  }
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
  const max = 1.0;
  const min = windowName === "w10" ? 0.55 : 0.6;
  if (count <= 1) {
    return max;
  }
  const t = index / (count - 1);
  return max + (min - max) * t;
}

function weightedMean(values: number[], weights: number[]): number {
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0 || values.length === 0) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i]! * (weights[i] ?? 0);
  }
  return sum / sumW;
}

function weightedVariance(values: number[], weights: number[]): number {
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0 || values.length <= 1) {
    return 0;
  }
  const mu = weightedMean(values, weights);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    const d = (values[i] ?? 0) - mu;
    sum += (weights[i] ?? 0) * d * d;
  }
  return sum / sumW;
}

function mean(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function sampleSd(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }
  const mu = mean(values);
  let sumSq = 0;
  for (const value of values) {
    const diff = value - mu;
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / (values.length - 1));
}

function weightedSlopeFromRecent(values: Array<number | undefined>): number | undefined {
  if (values.length < 2) {
    return undefined;
  }
  const chronological = [...values].reverse();
  const n = chronological.length;

  let points = 0;
  let sumW = 0;
  let sumWX = 0;
  let sumWY = 0;
  let sumWXX = 0;
  let sumWXY = 0;

  for (let i = 0; i < n; i += 1) {
    const y = chronological[i];
    if (!isFiniteNumber(y)) {
      continue;
    }
    points += 1;
    const x = i;
    const recencyWeight = n <= 1 ? 1 : 0.75 + 0.35 * (i / (n - 1));
    const w = recencyWeight;
    sumW += w;
    sumWX += w * x;
    sumWY += w * y;
    sumWXX += w * x * x;
    sumWXY += w * x * y;
  }

  if (points < 2 || sumW <= 0) {
    return undefined;
  }

  const den = sumW * sumWXX - sumWX * sumWX;
  if (Math.abs(den) < 1e-9) {
    return 0;
  }
  return round3((sumW * sumWXY - sumWX * sumWY) / den);
}

function signOf(value: number | undefined): -1 | 0 | 1 {
  if (!isFiniteNumber(value) || Math.abs(value) < 1e-9) {
    return 0;
  }
  return value > 0 ? 1 : -1;
}

function computeTrendCoherence(values: Array<number | undefined>): number | undefined {
  const signs = values.map(signOf).filter((s) => s !== 0);
  if (!signs.length) {
    return undefined;
  }
  const pos = signs.filter((s) => s > 0).length;
  const neg = signs.filter((s) => s < 0).length;
  return round3(Math.max(pos, neg) / signs.length);
}

function parseScoreTextWin(resultText: string | undefined): boolean | undefined {
  const raw = String(resultText || "").trim();
  if (!raw) {
    return undefined;
  }
  const m = raw.match(/(?:^|\s)([WLВП])(?:\s|$)/u);
  if (!m) {
    return undefined;
  }
  const token = m[1]?.toUpperCase();
  if (token === "W" || token === "В") {
    return true;
  }
  if (token === "L" || token === "П") {
    return false;
  }
  return undefined;
}

function parseResultMarkerSign(resultText: string | undefined): 1 | -1 | undefined {
  const win = parseScoreTextWin(resultText);
  if (win === true) {
    return 1;
  }
  if (win === false) {
    return -1;
  }
  return undefined;
}

function parseSetMarginNormFromScore(scoreText: string | undefined): number | undefined {
  const text = String(scoreText || "").trim();
  if (!text) {
    return undefined;
  }
  const m = text.match(/^(\d+)\s*[-:]\s*(\d+)/);
  if (!m) {
    return undefined;
  }
  const left = Number(m[1]);
  const right = Number(m[2]);
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return undefined;
  }
  if (left <= 5 && right <= 5) {
    return clamp((left - right) / 2, -1, 1);
  }
  return undefined;
}

function parseGameMarginNormFromScore(scoreText: string | undefined): number | undefined {
  const text = String(scoreText || "").trim();
  if (!text) {
    return undefined;
  }
  const pairs = [...text.matchAll(/(\d+)\s*[-:]\s*(\d+)/g)];
  if (!pairs.length) {
    return undefined;
  }
  const nums = pairs
    .map((m) => [Number(m[1]), Number(m[2])] as const)
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  const gamePairs = nums.filter(([a, b]) => a > 3 || b > 3);
  if (!gamePairs.length) {
    return undefined;
  }
  const margin = gamePairs.reduce((acc, [a, b]) => acc + (a - b), 0);
  return clamp(margin / 12, -1, 1);
}

export function parseScoreMomentumFeatures(input: {
  resultText?: string;
  scoreText?: string;
}): PerMatchScoreFeatures {
  const matchWonSign = parseResultMarkerSign(input.resultText);
  const setMarginNorm = parseSetMarginNormFromScore(input.scoreText);
  const gameMarginNorm = parseGameMarginNormFromScore(input.scoreText);
  const scoreParsed =
    matchWonSign !== undefined || setMarginNorm !== undefined || gameMarginNorm !== undefined;
  let scoreMomentum: number | undefined;
  if (scoreParsed) {
    scoreMomentum = clamp(
      0.65 * (matchWonSign ?? 0) +
        0.2 * (setMarginNorm ?? 0) +
        0.15 * (gameMarginNorm ?? 0),
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
    0.2 * normalizePercent(p.second_serve_return_points_won) +
    0.26 * normalizePercent(p.return_points_won) +
    0.2 * normalizePercent(p.return_games_won) +
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

function windowAggregate(
  records: PlayerStateFeature[],
  windowName: "w10" | "w5" | "w3",
  spec: WindowTargetSpec,
): WindowAggregate | undefined {
  if (!spec.enabled || spec.used <= 0) {
    return undefined;
  }
  const subset = records.slice(0, spec.used);
  if (!subset.length) {
    return undefined;
  }
  const weightsRaw = subset.map((record, i) => {
    const wr = recencyWeight(windowName, i, subset.length);
    const opp = isFiniteNumber(record.oppStrengthComposite) ? record.oppStrengthComposite : 0.5;
    return wr * (0.85 + 0.3 * opp);
  });
  const sumW = weightsRaw.reduce((a, b) => a + b, 0) || 1;
  const weights = weightsRaw.map((w) => w / sumW);

  const serve = subset.map((r) => r.serveCore);
  const ret = subset.map((r) => r.returnCore);
  const ctl = subset.map((r) => r.controlCore);
  const dis = subset.map((r) => r.disciplineCore);
  const tpw = subset.map((r) => r.tpwCore);
  const oppStrength = subset.map((r) =>
    isFiniteNumber(r.oppStrengthComposite) ? r.oppStrengthComposite : 0.5,
  );
  const tier = subset.map((r) => r.tierScore);
  const qual = subset.map((r) => (r.qualifying ? 1 : 0));

  const scoreMomVals: number[] = [];
  const scoreMomWeights: number[] = [];
  const scoreSeries: Array<number | undefined> = [];
  subset.forEach((r, idx) => {
    const score = parseScoreMomentumFeatures({ resultText: r.resultText, scoreText: r.scoreText });
    scoreSeries.push(score.scoreMomentum);
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
    controlTrendSlope: weightedSlopeFromRecent(ctl),
    returnTrendSlope: weightedSlopeFromRecent(ret),
    tpwTrendSlope: weightedSlopeFromRecent(tpw),
    scoreTrendSlope: weightedSlopeFromRecent(scoreSeries),
    scoreMomentum: scoreMomVals.length
      ? round3(weightedMean(scoreMomVals, scoreMomWeights))
      : undefined,
    scoreCoverage: round3(scoreMomVals.length / subset.length),
  };
}

export function computePlayerWindowAggregates(records: PlayerStateFeature[]): PerPlayerWindowAgg {
  const plan = computeWindowPlan(records.length);
  const w10 = windowAggregate(records, "w10", plan.w10);
  const w5 = windowAggregate(records, "w5", plan.w5);
  const w3 = windowAggregate(records, "w3", plan.w3);
  const coverageVals = [plan.w10.reliability, plan.w5.reliability, plan.w3.reliability];
  const techTrendCoverageMin = round3(Math.min(...coverageVals));
  const techTrendCoverageScore = round3(
    0.4 * coverageVals[0] + 0.35 * coverageVals[1] + 0.25 * coverageVals[2],
  );
  const trendWindowFallbackFlag = !!(plan.w10.degraded || plan.w5.degraded || plan.w3.degraded);
  const oppProxyCoverage = records.length
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

function windowDegradedPenalty(spec: WindowTargetSpec): number {
  if (!spec.enabled || !spec.degraded) {
    return 0;
  }
  const missing = clamp(1 - spec.reliability, 0, 1);
  return round3(clamp(0.06 + 0.18 * missing, 0, 0.24));
}

function normalizeSlope(value: number | undefined, scale: number): number {
  if (!isFiniteNumber(value) || !Number.isFinite(scale) || scale <= 0) {
    return 0;
  }
  return clamp(value / scale, -1, 1);
}

function computeWindowStrengthIndex(
  window: WindowAggregate | undefined,
  spec: WindowTargetSpec,
): { value?: number; rel?: number } {
  if (!window || !spec.enabled) {
    return {};
  }
  const raw =
    0.24 * window.meanServeCore +
    0.26 * window.meanReturnCore +
    0.26 * window.meanControlCore +
    0.1 * window.meanDisciplineCore +
    0.14 * window.meanTPWCore;
  const oppAdj =
    0.88 +
    0.26 * ((window.meanOppStrength ?? 0.5) - 0.5) +
    0.06 * ((window.tierMean ?? 0.5) - 0.5) -
    0.05 * (window.qualifyingShare ?? 0);
  const raw01 = clamp(raw * oppAdj, 0, 1);
  const centered = (raw01 - 0.52) / 0.075;
  const base = clamp(50 + 34 * Math.tanh(centered), 0, 100);
  const rel = clamp(
    0.38 +
      0.5 * spec.reliability +
      0.12 * clamp(window.meanOppStrength ?? 0.5, 0, 1) -
      windowDegradedPenalty(spec),
    0.22,
    1.0,
  );
  return {
    value: round3(clamp(50 + (base - 50) * rel, 0, 100)),
    rel: round3(rel),
  };
}

function computeWindowStabilityIndex(
  window: WindowAggregate | undefined,
  spec: WindowTargetSpec,
): { value?: number; rel?: number } {
  if (!window || !spec.enabled) {
    return {};
  }
  const volScore = clamp(1 - (window.volatilityCore ?? 0) / 0.16, 0, 1);
  const coreSpread = sampleSd([
    window.meanServeCore,
    window.meanReturnCore,
    window.meanControlCore,
    window.meanTPWCore,
  ]);
  const balanceScore = clamp(1 - coreSpread / 0.14, 0, 1);
  const trendCoherence =
    computeTrendCoherence([
      window.controlTrendSlope,
      window.returnTrendSlope,
      window.tpwTrendSlope,
    ]) ?? 0.5;
  const trendCoherence01 = clamp(trendCoherence, 0, 1);
  const base01 = clamp(0.5 * volScore + 0.2 * balanceScore + 0.3 * trendCoherence01, 0, 1);
  const base = clamp(50 + 32 * Math.tanh((base01 - 0.6) / 0.2), 0, 100);
  const rel = clamp(0.36 + 0.58 * spec.reliability - windowDegradedPenalty(spec), 0.22, 1.0);
  return {
    value: round3(clamp(50 + (base - 50) * rel, 0, 100)),
    rel: round3(rel),
  };
}

interface WindowFormTechIndex {
  value?: number;
  rel?: number;
  centered?: number;
}

function computeWindowFormTechIndex(
  window: WindowAggregate | undefined,
  spec: WindowTargetSpec,
): WindowFormTechIndex {
  if (!window || !spec.enabled) {
    return {};
  }

  const nControl = normalizeSlope(window.controlTrendSlope, 0.07);
  const nReturn = normalizeSlope(window.returnTrendSlope, 0.07);
  const nTpw = normalizeSlope(window.tpwTrendSlope, 0.065);
  const coherence =
    computeTrendCoherence([
      window.controlTrendSlope,
      window.returnTrendSlope,
      window.tpwTrendSlope,
    ]) ?? 0.5;
  const cohCentered = clamp(2 * coherence - 1, -1, 1);
  const centered = clamp(
    0.34 * nControl + 0.28 * nReturn + 0.22 * nTpw + 0.16 * cohCentered,
    -1,
    1,
  );
  const trendPulse = clamp((Math.abs(nControl) + Math.abs(nReturn) + Math.abs(nTpw)) / 3, 0, 1);
  const base = clamp(50 + 36 * centered, 0, 100);
  const rel = clamp(
    0.3 +
      0.45 * spec.reliability +
      0.15 * trendPulse +
      0.1 * clamp(coherence, 0, 1) -
      windowDegradedPenalty(spec),
    0.22,
    1.0,
  );
  const value = clamp(50 + (base - 50) * rel, 0, 100);

  return {
    value: round3(value),
    rel: round3(rel),
    centered: round3(centered),
  };
}

function computeWindowFormPlusIndex(
  window: WindowAggregate | undefined,
  spec: WindowTargetSpec,
  tech: WindowFormTechIndex,
): { value?: number; rel?: number; scoreCoverage?: number } {
  if (!window || !spec.enabled || !isFiniteNumber(tech.centered) || !isFiniteNumber(tech.rel)) {
    return {};
  }
  const scoreCentered = normalizeSlope(window.scoreTrendSlope, 0.35);
  const scoreCoverage = clamp(window.scoreCoverage ?? 0, 0, 1);
  const scoreWeight = 0.08 + 0.22 * scoreCoverage;
  const combinedCentered = clamp((1 - scoreWeight) * tech.centered + scoreWeight * scoreCentered, -1, 1);
  const base = clamp(50 + 36 * combinedCentered, 0, 100);
  const rel = clamp(
    0.78 * tech.rel + 0.22 * scoreCoverage - windowDegradedPenalty(spec),
    0.22,
    1.0,
  );
  return {
    value: round3(clamp(50 + (base - 50) * rel, 0, 100)),
    rel: round3(rel),
    scoreCoverage: round3(scoreCoverage),
  };
}

function computeWindowLocalIndices(
  window: WindowAggregate | undefined,
  spec: WindowTargetSpec,
): PerPlayerIndices {
  if (!window || !spec.enabled) {
    return {};
  }
  const strength = computeWindowStrengthIndex(window, spec);
  const stability = computeWindowStabilityIndex(window, spec);
  const formTech = computeWindowFormTechIndex(window, spec);
  const formPlus = computeWindowFormPlusIndex(window, spec, formTech);
  return {
    strength: strength.value,
    stability: stability.value,
    formTech: formTech.value,
    formPlus: formPlus.value,
    relStrength: strength.rel,
    relStability: stability.rel,
    relFormTech: formTech.rel,
    relFormPlus: formPlus.rel,
    scoreCoverage: formPlus.scoreCoverage,
  };
}

function fallbackPenaltyFromPlan(plan: WindowPlan): number {
  let penalty = 0;
  if (plan.w10.enabled && plan.w10.degraded) {
    penalty += 0.08;
  }
  if (plan.w5.enabled && plan.w5.degraded) {
    penalty += 0.06;
  }
  if (plan.w3.enabled && plan.w3.degraded) {
    penalty += 0.04;
  }
  return round3(clamp(penalty, 0, 0.24));
}

function normalizeWindowMix(parts: Array<{ value: number | undefined; weight: number }>): number | undefined {
  const usable = parts.filter((part) => isFiniteNumber(part.value) && part.weight > 0);
  if (!usable.length) {
    return undefined;
  }
  const sumW = usable.reduce((acc, part) => acc + part.weight, 0) || 1;
  const out =
    usable.reduce((acc, part) => acc + (part.value as number) * part.weight, 0) / sumW;
  return round3(out);
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function computePerPlayerStrengthIndex(
  agg: PerPlayerWindowAgg,
): { strength?: number; relStrength?: number } {
  const fp = fallbackPenaltyFromPlan(agg.plan);
  const w10 = agg.windows.w10;
  const w5 = agg.windows.w5;
  const w3 = agg.windows.w3;

  const strengthW = (window: WindowAggregate | undefined): number | undefined => {
    if (!window) {
      return undefined;
    }
    const raw =
      0.22 * window.meanServeCore +
      0.24 * window.meanReturnCore +
      0.28 * window.meanControlCore +
      0.1 * window.meanDisciplineCore +
      0.16 * window.meanTPWCore;
    const oppAdj = 0.85 + 0.3 * ((window.meanOppStrength ?? 0.5) - 0.5);
    return clamp(raw * oppAdj, 0, 1.25);
  };

  const base = normalizeWindowMix([
    { value: strengthW(w10), weight: 0.45 },
    { value: strengthW(w5), weight: 0.35 },
    { value: strengthW(w3), weight: 0.2 },
  ]);
  if (!isFiniteNumber(base)) {
    return {};
  }
  const baseScaled = clamp(100 * base, 0, 100);
  const relStrength = clamp(
    agg.techTrendCoverageScore - fp + 0.1 * agg.oppProxyCoverage,
    0.35,
    1.0,
  );
  const strength = clamp(50 + (baseScaled - 50) * relStrength, 0, 100);
  return {
    strength: round3(strength),
    relStrength: round3(relStrength),
  };
}

function computePerPlayerStabilityIndex(
  agg: PerPlayerWindowAgg,
): { stability?: number; relStability?: number } {
  const fp = fallbackPenaltyFromPlan(agg.plan);
  const w10 = agg.windows.w10;
  const w5 = agg.windows.w5;
  const w3 = agg.windows.w3;

  const volScore = (window: WindowAggregate | undefined): number | undefined => {
    if (!window) {
      return undefined;
    }
    return clamp01(1 - (window.volatilityCore ?? 0) / 0.18);
  };

  const consistencyPair = (a: number | undefined, b: number | undefined): number | undefined => {
    if (!isFiniteNumber(a) || !isFiniteNumber(b)) {
      return undefined;
    }
    return clamp01(1 - Math.abs(a - b) / 0.12);
  };

  const consistencyScore = normalizeWindowMix([
    {
      value: consistencyPair(w3?.meanControlCore, w5?.meanControlCore),
      weight: 1 / 3,
    },
    { value: consistencyPair(w3?.meanReturnCore, w5?.meanReturnCore), weight: 1 / 3 },
    { value: consistencyPair(w3?.meanTPWCore, w5?.meanTPWCore), weight: 1 / 3 },
  ]);

  const base01 = normalizeWindowMix([
    { value: volScore(w10), weight: 0.45 },
    { value: volScore(w5), weight: 0.25 },
    { value: volScore(w3), weight: 0.1 },
    { value: consistencyScore, weight: 0.2 },
  ]);
  if (!isFiniteNumber(base01)) {
    return {};
  }
  const base = clamp(100 * base01, 0, 100);
  const relStability = clamp(agg.techTrendCoverageScore - fp, 0.3, 1.0);
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

  const controlTrend =
    isFiniteNumber(w3?.meanControlCore) && isFiniteNumber(w5?.meanControlCore)
      ? w3!.meanControlCore - w5!.meanControlCore
      : undefined;
  const returnTrend =
    isFiniteNumber(w3?.meanReturnCore) && isFiniteNumber(w5?.meanReturnCore)
      ? w3!.meanReturnCore - w5!.meanReturnCore
      : undefined;
  const tpwTrend =
    isFiniteNumber(w3?.meanTPWCore) && isFiniteNumber(w5?.meanTPWCore)
      ? w3!.meanTPWCore - w5!.meanTPWCore
      : undefined;
  const midTrend =
    isFiniteNumber(w5?.meanControlCore) && isFiniteNumber(w10?.meanControlCore)
      ? w5!.meanControlCore - w10!.meanControlCore
      : 0;
  const trendAcceleration = isFiniteNumber(controlTrend)
    ? controlTrend - (midTrend ?? 0)
    : undefined;
  const trendCoherence = computeTrendCoherence([controlTrend, returnTrend, tpwTrend]);

  const nControlTrend = isFiniteNumber(controlTrend) ? clamp(controlTrend / 0.1, -1, 1) : 0;
  const nReturnTrend = isFiniteNumber(returnTrend) ? clamp(returnTrend / 0.1, -1, 1) : 0;
  const nTPWTrend = isFiniteNumber(tpwTrend) ? clamp(tpwTrend / 0.1, -1, 1) : 0;
  const nAccel = isFiniteNumber(trendAcceleration)
    ? clamp(trendAcceleration / 0.12, -1, 1)
    : 0;
  const cohCentered = isFiniteNumber(trendCoherence)
    ? clamp(2 * trendCoherence - 1, -1, 1)
    : 0;

  const centered = clamp(
    0.32 * nControlTrend +
      0.28 * nReturnTrend +
      0.2 * nTPWTrend +
      0.1 * nAccel +
      0.1 * cohCentered,
    -1,
    1,
  );
  const formBase = clamp(50 + 35 * centered, 0, 100);

  const relW10 = agg.plan.w10.reliability;
  const relW5 = agg.plan.w5.reliability;
  const relW3 = agg.plan.w3.reliability;
  const relForm = clamp(0.2 + 0.5 * relW3 + 0.2 * relW5 + 0.1 * relW10 - fp, 0.2, 1.0);
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
  if (
    !isFiniteNumber(tech.formTech) ||
    !isFiniteNumber(tech.relFormTech) ||
    !isFiniteNumber(tech.formTechCentered)
  ) {
    return {};
  }

  const w10 = agg.windows.w10;
  const w5 = agg.windows.w5;
  const w3 = agg.windows.w3;

  const scoreTrend3v5 =
    isFiniteNumber(w3?.scoreMomentum) && isFiniteNumber(w5?.scoreMomentum)
      ? w3!.scoreMomentum! - w5!.scoreMomentum!
      : undefined;
  const scoreTrend5v10 =
    isFiniteNumber(w5?.scoreMomentum) && isFiniteNumber(w10?.scoreMomentum)
      ? w5!.scoreMomentum! - w10!.scoreMomentum!
      : undefined;

  const nScoreTrend = isFiniteNumber(scoreTrend3v5) ? clamp(scoreTrend3v5 / 0.8, -1, 1) : 0;
  const nScoreAccel = isFiniteNumber(scoreTrend3v5)
    ? clamp(((scoreTrend3v5 ?? 0) - (scoreTrend5v10 ?? 0)) / 1.0, -1, 1)
    : 0;
  const scoreCentered = clamp(0.7 * nScoreTrend + 0.3 * nScoreAccel, -1, 1);

  const formPlusCentered = clamp(
    0.8 * (tech.formTechCentered as number) + 0.2 * scoreCentered,
    -1,
    1,
  );
  let formPlusBase = clamp(50 + 35 * formPlusCentered, 0, 100);

  const scoreCoverage =
    normalizeWindowMix([
      { value: w10?.scoreCoverage, weight: 0.45 },
      { value: w5?.scoreCoverage, weight: 0.35 },
      { value: w3?.scoreCoverage, weight: 0.2 },
    ]) ?? 0;

  const relScore = clamp(scoreCoverage, 0, 1);
  const relFormPlus = clamp(0.8 * (tech.relFormTech as number) + 0.2 * relScore, 0.2, 1.0);
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

export function buildPlayerStateSeries(features: PlayerStateFeature[]): PlayerStateSeriesResult {
  const ordered = [...features]
    .filter((f) => Number.isFinite(f.candidateIndex))
    .sort((a, b) => a.candidateIndex - b.candidateIndex);
  const nTech = ordered.length;

  const computeWindow = (
    windowName: "w10" | "w5" | "w3",
    target: number,
    minEnable: number,
  ): { enabled: boolean; degraded: boolean; indices: PerPlayerIndices } => {
    if (nTech < minEnable) {
      return { enabled: false, degraded: false, indices: {} };
    }
    const used = Math.min(target, nTech);
    const subset = ordered.slice(0, used);
    const spec: WindowTargetSpec = {
      enabled: true,
      target,
      used,
      reliability: round3(clamp(used / target, 0, 1)),
      degraded: used < target,
    };
    const aggregate = windowAggregate(subset, windowName, spec);
    return {
      enabled: true,
      degraded: spec.degraded,
      indices: computeWindowLocalIndices(aggregate, spec),
    };
  };

  const w10 = computeWindow("w10", 10, 6);
  const w5 = computeWindow("w5", 5, 4);
  const w3 = computeWindow("w3", 3, 2);

  return {
    nTech,
    hasW10: w10.enabled,
    hasW5: w5.enabled,
    hasW3: w3.enabled,
    degradedW10: w10.degraded,
    degradedW5: w5.degraded,
    degradedW3: w3.degraded,
    stability: {
      w10: w10.indices.stability,
      w5: w5.indices.stability,
      w3: w3.indices.stability,
    },
    formTech: {
      w10: w10.indices.formTech,
      w5: w5.indices.formTech,
      w3: w3.indices.formTech,
    },
    formPlus: {
      w10: w10.indices.formPlus,
      w5: w5.indices.formPlus,
      w3: w3.indices.formPlus,
    },
    strength: {
      w10: w10.indices.strength,
      w5: w5.indices.strength,
      w3: w3.indices.strength,
    },
  };
}

const STATE_METRICS = ["stability", "formTech", "formPlus", "strength"] as const;
type StateMetricName = (typeof STATE_METRICS)[number];
const STATE_WINDOWS = ["w10", "w5", "w3"] as const;
type StateWindowName = (typeof STATE_WINDOWS)[number];

const DEFAULT_PAIR_CONTRAST_OPTIONS: Required<PairStateContrastOptions> = {
  gain: { w10: 0.45, w5: 0.38, w3: 0.3 },
  capShift: 5.5,
  fullCoverageGapTarget: 4,
  nearZeroDiff: 0.35,
};

export function applyPairStateContrast(
  playerA: PlayerStateSeriesResult,
  playerB: PlayerStateSeriesResult,
  options: PairStateContrastOptions = {},
): { playerA: PlayerStateSeriesResult; playerB: PlayerStateSeriesResult } {
  const resolved: Required<PairStateContrastOptions> = {
    gain: {
      w10: options.gain?.w10 ?? DEFAULT_PAIR_CONTRAST_OPTIONS.gain.w10,
      w5: options.gain?.w5 ?? DEFAULT_PAIR_CONTRAST_OPTIONS.gain.w5,
      w3: options.gain?.w3 ?? DEFAULT_PAIR_CONTRAST_OPTIONS.gain.w3,
    },
    capShift: options.capShift ?? DEFAULT_PAIR_CONTRAST_OPTIONS.capShift,
    fullCoverageGapTarget:
      options.fullCoverageGapTarget ?? DEFAULT_PAIR_CONTRAST_OPTIONS.fullCoverageGapTarget,
    nearZeroDiff: options.nearZeroDiff ?? DEFAULT_PAIR_CONTRAST_OPTIONS.nearZeroDiff,
  };

  const outA = clonePlayerStateSeries(playerA);
  const outB = clonePlayerStateSeries(playerB);
  const isFullCoverage10 = outA.nTech >= 10 && outB.nTech >= 10;

  for (const metric of STATE_METRICS) {
    for (const windowName of STATE_WINDOWS) {
      const aVal = outA[metric][windowName];
      const bVal = outB[metric][windowName];
      if (!isFiniteNumber(aVal) || !isFiniteNumber(bVal)) {
        continue;
      }
      const gain = clamp(resolved.gain[windowName] ?? 0, 0, 1.5);
      const rawDiff = aVal - bVal;
      const shift = clamp(rawDiff * gain, -resolved.capShift, resolved.capShift);
      let nextA = clamp(aVal + shift, 0, 100);
      let nextB = clamp(bVal - shift, 0, 100);

      const supportsGapFloor = metric !== "stability";
      if (
        supportsGapFloor &&
        isFullCoverage10 &&
        Math.abs(rawDiff) > resolved.nearZeroDiff &&
        resolved.fullCoverageGapTarget > 0
      ) {
        const gap = Math.abs(nextA - nextB);
        if (gap < resolved.fullCoverageGapTarget) {
          const extra = (resolved.fullCoverageGapTarget - gap) / 2;
          const dir = rawDiff >= 0 ? 1 : -1;
          nextA = clamp(nextA + dir * extra, 0, 100);
          nextB = clamp(nextB - dir * extra, 0, 100);
        }
      }

      outA[metric][windowName] = round3(nextA);
      outB[metric][windowName] = round3(nextB);
    }
  }

  return { playerA: outA, playerB: outB };
}

function clonePlayerStateSeries(state: PlayerStateSeriesResult): PlayerStateSeriesResult {
  return {
    ...state,
    stability: { ...state.stability },
    formTech: { ...state.formTech },
    formPlus: { ...state.formPlus },
    strength: { ...state.strength },
  };
}

function extractDirtRowsPair(parsed: HistoricalMatchTechStats): DirtRowsPair | null {
  type Key = keyof RequiredLikeDirt;
  const outPlayer: Partial<RequiredLikeDirt> = {};
  const outOpp: Partial<RequiredLikeDirt> = {};
  const countMetrics = new Set<RequiredDirtMetricKey>(["double_faults"]);
  for (const row of parsed.rows) {
    const key = canonicalDirtMetricKey(row.metricKey, row.metricLabel) as Key | undefined;
    if (!key) {
      continue;
    }
    const isCount = countMetrics.has(key as RequiredDirtMetricKey);
    const p = metricValueToNumber(row.playerValue, { isCountMetric: isCount, smoothRatio: true });
    const o = metricValueToNumber(row.opponentValue, { isCountMetric: isCount, smoothRatio: true });
    if (isFiniteNumber(p)) {
      outPlayer[key] = p;
    }
    if (isFiniteNumber(o)) {
      outOpp[key] = o;
    }
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
  if (required.some((key) => !isFiniteNumber(outPlayer[key]) || !isFiniteNumber(outOpp[key]))) {
    return null;
  }
  return {
    player: outPlayer as RequiredLikeDirt,
    opponent: outOpp as RequiredLikeDirt,
  };
}

export function buildPlayerStateFeature(
  parsed: HistoricalMatchTechStats,
  meta: {
    candidateIndex: number;
    tournament?: string;
    resultText?: string;
    scoreText?: string;
  },
): PlayerStateFeature | undefined {
  const pair = extractDirtRowsPair(parsed);
  if (!pair) {
    return undefined;
  }
  const tier = inferTournamentTierScore(meta.tournament);
  const oppStatsQ01 = computeOpponentStatsQuality01({
    total_points_won: pair.opponent.total_points_won,
    return_points_won: pair.opponent.return_points_won,
    total_games_won: pair.opponent.total_games_won,
    service_games_won: pair.opponent.service_games_won,
    return_games_won: pair.opponent.return_games_won,
  });
  const oppStrengthComposite = combineOpponentStrengthProxy(oppStatsQ01, tier.tierScore);

  return {
    matchUrl: parsed.matchUrl,
    candidateIndex: Math.max(0, Math.trunc(meta.candidateIndex)),
    tournament: meta.tournament,
    resultText: meta.resultText,
    scoreText: meta.scoreText,
    serveCore: round3(serveCoreFrom(pair)),
    returnCore: round3(returnCoreFrom(pair)),
    controlCore: round3(controlCoreFrom(pair)),
    disciplineCore: round3(disciplineFrom(pair.player.first_serve, pair.player.double_faults)),
    tpwCore: round3(tpwCoreFrom(pair)),
    oppStatsQ01,
    oppStrengthComposite,
    tierScore: tier.tierScore,
    qualifying: tier.flags.qualifying,
  };
}
