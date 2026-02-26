import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  buildSignalReliabilityRows,
  canonicalizeMatchUrl,
  probabilityToSide,
  type SignalReliabilityRow,
} from "./agreementConfidenceStudy.js";

const DEFAULT_TOP_K = 20;
const DEFAULT_MIN_CHECKMARKED = 8;

const NOVA_MARGIN_THRESHOLDS = [4, 6, 8, 10] as const;
const BT_MARGIN_THRESHOLDS = [0, 4, 6, 8, 10, 12] as const;
const CONFIDENCE_THRESHOLDS = [51, 53, 55, 58, 60] as const;
const SPREAD_THRESHOLDS = [25, 30, 35, 40, 45, 50] as const;
const PCA_DEVIATION_THRESHOLDS = [10, 15, 20, 25, 30, 35] as const;

const DEFAULT_BASELINE_SPLIT_THRESHOLDS = {
  spreadHigh: 35,
  pcaOutlier: 20,
};

type ProbSide = "home" | "away" | "neutral";

interface JoinedLikeRow {
  matchUrl?: string;
  label?: string;
  mainCorrect?: boolean;
  historyPick?: string;
  novaPick?: string;
  mainPick?: string;
  actualWinner?: string;
  actualWinnerName?: string;
  winnerName?: string;
  confidencePct?: number;
  mainConfidence?: number;
  logRegP1?: number;
  markovP1?: number;
  bradleyP1?: number;
  pcaP1?: number;
  novaP1?: number;
  modelSpreadCore?: number;
  pcaDeviation?: number;
  [key: string]: unknown;
}

export interface CheckmarkStudyRow {
  matchUrl: string;
  label: string;
  actualWinnerName?: string;
  mainPick: string;
  historyPick?: string;
  novaPick?: string;
  mainCorrect: boolean;
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
  novaMargin?: number;
  bradleyMargin?: number;
  modelSpreadCore?: number;
  pcaDeviation?: number;
  historyNovaSame: boolean;
  novaPickSide?: ProbSide;
  btPick?: ProbSide;
  novaBtAgree: boolean;
}

export interface AccuracySummary {
  hit: number;
  total: number;
  rate: number;
}

export interface CheckmarkRuleMetrics {
  total: number;
  nCheckmarked: number;
  coverage: number;
  hit: number;
  hitRate: number;
  errorRate: number;
}

export interface CheckmarkCandidate {
  ruleId: string;
  rule: string;
  tags: string[];
  train: CheckmarkRuleMetrics;
  valid: CheckmarkRuleMetrics;
  deltaVsBaselineCheckmarkPrecision: number;
  coverageDeltaVsBaseline: number;
  precisionDrop: number;
  passesCriteria: boolean;
}

export interface BaselineSplitRow {
  bucket: string;
  n: number;
  hit: number;
  hitRate: number;
  errorRate: number;
}

export interface BaselineDiagnostics {
  baselineAll: CheckmarkRuleMetrics;
  byAgreement45: BaselineSplitRow[];
  byConfidenceBand: BaselineSplitRow[];
  byBtAgree: BaselineSplitRow[];
  bySpreadBand: BaselineSplitRow[];
  byPcaOutlier: BaselineSplitRow[];
  falsePositives: Array<{
    label: string;
    matchUrl: string;
    agreementText: string;
    confidencePct: number;
    novaP1?: number;
    bradleyP1?: number;
    modelSpreadCore?: number;
    pcaDeviation?: number;
    mainPick: string;
    actualWinnerName?: string;
  }>;
}

export interface CheckmarkCalibrationDatasetSummary {
  joinedRows: number;
  predictionRows: number;
  usableRows: number;
  joinedWithoutPrediction: number;
  invalidJoinedRows: number;
  predictionUrlDuplicates: number;
}

export interface CheckmarkCalibrationStudyReport {
  config: {
    trainJoinedFile: string;
    trainPredictionsFile: string;
    validJoinedFile: string;
    validPredictionsFile: string;
    topK: number;
    minCheckmarked: number;
    skipBt: boolean;
    skipSpread: boolean;
    novaMarginThresholds: number[];
    btMarginThresholds: number[];
    confidenceThresholds: number[];
    spreadThresholds: number[];
    pcaDeviationThresholds: number[];
    baselineSplitThresholds: {
      spreadHigh: number;
      pcaOutlier: number;
    };
  };
  train: {
    dataset: CheckmarkCalibrationDatasetSummary;
    mainBaseline: AccuracySummary;
    currentCheckmarkBaseline: CheckmarkRuleMetrics;
    diagnostics: BaselineDiagnostics;
  };
  valid: {
    dataset: CheckmarkCalibrationDatasetSummary;
    mainBaseline: AccuracySummary;
    currentCheckmarkBaseline: CheckmarkRuleMetrics;
    diagnostics: BaselineDiagnostics;
  };
  candidates: CheckmarkCandidate[];
  topCandidates: CheckmarkCandidate[];
  recommendations: {
    best?: CheckmarkCandidate;
    maxPrecision?: CheckmarkCandidate;
    balanced?: CheckmarkCandidate;
    conservative?: CheckmarkCandidate;
    baselineRuleId: string;
    baselineValidPrecision: number;
  };
}

interface BuildRowsResult {
  rows: CheckmarkStudyRow[];
  dataset: CheckmarkCalibrationDatasetSummary;
}

interface CandidateDefinition {
  ruleId: string;
  rule: string;
  tags: string[];
  predicate: (row: CheckmarkStudyRow) => boolean;
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

function normalizeLooseName(value: string | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function safeRate(hit: number, total: number): number {
  return total > 0 ? hit / total : 0;
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

function accuracyFromRows(rows: CheckmarkStudyRow[]): AccuracySummary {
  const hit = rows.filter((row) => row.mainCorrect).length;
  const total = rows.length;
  return { hit, total, rate: round3(safeRate(hit, total)) };
}

function toMetrics(totalRows: CheckmarkStudyRow[], subset: CheckmarkStudyRow[]): CheckmarkRuleMetrics {
  const total = totalRows.length;
  const nCheckmarked = subset.length;
  const hit = subset.filter((row) => row.mainCorrect).length;
  const hitRate = safeRate(hit, nCheckmarked);
  return {
    total,
    nCheckmarked,
    coverage: round3(safeRate(nCheckmarked, total)),
    hit,
    hitRate: round3(hitRate),
    errorRate: round3(nCheckmarked > 0 ? 1 - hitRate : 0),
  };
}

function selectRows(rows: CheckmarkStudyRow[], predicate: (row: CheckmarkStudyRow) => boolean): CheckmarkStudyRow[] {
  return rows.filter(predicate);
}

export function evaluateCheckmarkRule(
  rows: CheckmarkStudyRow[],
  predicate: (row: CheckmarkStudyRow) => boolean,
): CheckmarkRuleMetrics {
  return toMetrics(rows, selectRows(rows, predicate));
}

function splitRows(rows: CheckmarkStudyRow[], labeler: (row: CheckmarkStudyRow) => string): BaselineSplitRow[] {
  const groups = new Map<string, CheckmarkStudyRow[]>();
  for (const row of rows) {
    const label = labeler(row);
    const group = groups.get(label);
    if (group) {
      group.push(row);
    } else {
      groups.set(label, [row]);
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([bucket, subset]) => {
      const hit = subset.filter((row) => row.mainCorrect).length;
      const n = subset.length;
      const rate = safeRate(hit, n);
      return { bucket, n, hit, hitRate: round3(rate), errorRate: round3(1 - rate) };
    });
}

function confidenceBand(conf: number): string {
  if (conf <= 50) return "<=50";
  if (conf <= 55) return "50-55";
  if (conf <= 60) return "55-60";
  return ">60";
}

function agreementBand(row: CheckmarkStudyRow): string {
  if (row.methodsCount !== 5) return `${row.agreementText}*`;
  if (row.agreementCount === 4) return "4/5";
  if (row.agreementCount === 5) return "5/5";
  return `${row.agreementCount}/5`;
}

function buildBaselineDiagnostics(
  rows: CheckmarkStudyRow[],
  splitThresholds = DEFAULT_BASELINE_SPLIT_THRESHOLDS,
): BaselineDiagnostics {
  const baselineRows = rows.filter(isCurrentBaselineCheckmarked);
  return {
    baselineAll: toMetrics(rows, baselineRows),
    byAgreement45: splitRows(baselineRows, (row) => agreementBand(row)),
    byConfidenceBand: splitRows(baselineRows, (row) => confidenceBand(row.confidencePct)),
    byBtAgree: splitRows(baselineRows, (row) => (row.novaBtAgree ? "BT agree" : "BT disagree")),
    bySpreadBand: splitRows(baselineRows, (row) => {
      if (!isFiniteNumber(row.modelSpreadCore)) return "spread:unknown";
      return row.modelSpreadCore > splitThresholds.spreadHigh ? "spread:high" : "spread:low";
    }),
    byPcaOutlier: splitRows(baselineRows, (row) => {
      if (!isFiniteNumber(row.pcaDeviation)) return "pca:unknown";
      return row.pcaDeviation > splitThresholds.pcaOutlier ? "pca:outlier" : "pca:normal";
    }),
    falsePositives: baselineRows
      .filter((row) => !row.mainCorrect)
      .map((row) => ({
        label: row.label,
        matchUrl: row.matchUrl,
        agreementText: row.agreementText,
        confidencePct: round3(row.confidencePct),
        novaP1: row.novaP1,
        bradleyP1: row.bradleyP1,
        modelSpreadCore: row.modelSpreadCore,
        pcaDeviation: row.pcaDeviation,
        mainPick: row.mainPick,
        actualWinnerName: row.actualWinnerName,
      })),
  };
}

function coerceNumber(value: unknown): number | undefined {
  return isFiniteNumber(value) ? value : undefined;
}

function normalizeProbSide(value: number | undefined): ProbSide | undefined {
  if (!isFiniteNumber(value)) return undefined;
  return probabilityToSide(value);
}

export function buildCheckmarkStudyRows(joinedRaw: unknown, predictionsRaw: unknown): BuildRowsResult {
  const built = buildSignalReliabilityRows(joinedRaw, predictionsRaw);
  if (!Array.isArray(joinedRaw)) throw new Error("Joined data must be a JSON array");

  const joinedIndex = new Map<string, JoinedLikeRow>();
  for (const item of joinedRaw) {
    if (!item || typeof item !== "object") continue;
    const row = item as JoinedLikeRow;
    const canonicalUrl = canonicalizeMatchUrl(typeof row.matchUrl === "string" ? row.matchUrl : undefined);
    if (!canonicalUrl || joinedIndex.has(canonicalUrl)) continue;
    joinedIndex.set(canonicalUrl, row);
  }

  const out: CheckmarkStudyRow[] = [];
  for (const row of built.rows) {
    const joined = joinedIndex.get(row.matchUrl);
    if (!joined) continue;

    const historyPick = typeof joined.historyPick === "string" ? joined.historyPick : undefined;
    const novaPick = typeof joined.novaPick === "string" ? joined.novaPick : row.novaPick;
    const historyNovaSame =
      !!normalizeLooseName(historyPick) &&
      !!normalizeLooseName(novaPick) &&
      normalizeLooseName(historyPick) === normalizeLooseName(novaPick);

    const bradleyP1 = coerceNumber(joined.bradleyP1) ?? row.bradleyP1;
    const novaP1 = coerceNumber(joined.novaP1) ?? row.novaP1;
    const btPick = normalizeProbSide(bradleyP1);
    const novaPickSide = normalizeProbSide(novaP1);
    const novaBtAgree =
      btPick !== undefined &&
      novaPickSide !== undefined &&
      btPick !== "neutral" &&
      novaPickSide !== "neutral" &&
      btPick === novaPickSide;

    out.push({
      matchUrl: row.matchUrl,
      label: row.label,
      actualWinnerName:
        row.actualWinnerName ??
        (typeof joined.actualWinnerName === "string"
          ? joined.actualWinnerName
          : typeof joined.winnerName === "string"
            ? joined.winnerName
            : typeof joined.actualWinner === "string"
              ? joined.actualWinner
              : undefined),
      mainPick: typeof joined.mainPick === "string" ? joined.mainPick : row.mainPick,
      historyPick,
      novaPick,
      mainCorrect: isBoolean(joined.mainCorrect) ? joined.mainCorrect : row.mainCorrect,
      confidencePct: coerceNumber(joined.confidencePct) ?? row.confidencePct,
      methodsCount: row.methodsCount,
      agreementCount: row.agreementCount,
      agreementRatio: row.agreementRatio,
      agreementText: row.agreementText,
      logRegP1: coerceNumber(joined.logRegP1) ?? row.logRegP1,
      markovP1: coerceNumber(joined.markovP1) ?? row.markovP1,
      bradleyP1,
      pcaP1: coerceNumber(joined.pcaP1) ?? row.pcaP1,
      novaP1,
      novaMargin: coerceNumber(joined.novaMargin) ?? row.novaMargin,
      bradleyMargin: isFiniteNumber(bradleyP1) ? round3(Math.abs(bradleyP1 - 50)) : undefined,
      modelSpreadCore: coerceNumber(joined.modelSpreadCore),
      pcaDeviation: coerceNumber(joined.pcaDeviation),
      historyNovaSame,
      novaPickSide,
      btPick,
      novaBtAgree,
    });
  }

  return {
    rows: out,
    dataset: {
      joinedRows: built.datasetSummary.inputJoinedRows,
      predictionRows: built.datasetSummary.inputPredictionRows,
      usableRows: out.length,
      joinedWithoutPrediction: built.datasetSummary.joinedWithoutPrediction,
      invalidJoinedRows: built.datasetSummary.invalidJoinedRows,
      predictionUrlDuplicates: built.datasetSummary.predictionUrlDuplicates,
    },
  };
}

export function isCurrentBaselineCheckmarked(row: CheckmarkStudyRow): boolean {
  return row.historyNovaSame && row.methodsCount === 5 && row.agreementCount >= 4 && row.confidencePct > 50;
}

function createCandidate(ruleId: string, rule: string, tags: string[], predicate: (row: CheckmarkStudyRow) => boolean): CandidateDefinition {
  return { ruleId, rule, tags, predicate };
}

function pushCandidate(map: Map<string, CandidateDefinition>, candidate: CandidateDefinition): void {
  if (!map.has(candidate.ruleId)) {
    map.set(candidate.ruleId, candidate);
  }
}

function generateCandidates(options: {
  skipBt: boolean;
  skipSpread: boolean;
}): CandidateDefinition[] {
  const out = new Map<string, CandidateDefinition>();

  pushCandidate(
    out,
    createCandidate(
      "baseline_current",
      "history==nova && methods=5 && agreement>=4 && confidence>50",
      ["baseline"],
      isCurrentBaselineCheckmarked,
    ),
  );

  if (!options.skipBt) {
    pushCandidate(
      out,
      createCandidate(
        "bt_confirm_only",
        "baseline + novaBtAgree",
        ["bt"],
        (row) => isCurrentBaselineCheckmarked(row) && row.novaBtAgree,
      ),
    );
    for (const tBt of BT_MARGIN_THRESHOLDS) {
      pushCandidate(
        out,
        createCandidate(
          `bt_confirm_bt_ge_${tBt}`,
          `baseline + novaBtAgree + bradleyMargin>=${tBt}`,
          ["bt", "bt-margin"],
          (row) =>
            isCurrentBaselineCheckmarked(row) &&
            row.novaBtAgree &&
            isFiniteNumber(row.bradleyMargin) &&
            row.bradleyMargin >= tBt,
        ),
      );
      for (const tNova of NOVA_MARGIN_THRESHOLDS) {
        pushCandidate(
          out,
          createCandidate(
            `bt_confirm_nova_ge_${tNova}_bt_ge_${tBt}`,
            `baseline + novaBtAgree + novaMargin>=${tNova} + bradleyMargin>=${tBt}`,
            ["bt", "bt-margin", "nova-margin"],
            (row) =>
              isCurrentBaselineCheckmarked(row) &&
              row.novaBtAgree &&
              isFiniteNumber(row.bradleyMargin) &&
              row.bradleyMargin >= tBt &&
              isFiniteNumber(row.novaMargin) &&
              row.novaMargin >= tNova,
          ),
        );
      }
    }
  }

  if (!options.skipSpread) {
    for (const tSpread of SPREAD_THRESHOLDS) {
      pushCandidate(
        out,
        createCandidate(
          `spread_le_${tSpread}`,
          `baseline + modelSpreadCore<=${tSpread}`,
          ["spread"],
          (row) => isCurrentBaselineCheckmarked(row) && isFiniteNumber(row.modelSpreadCore) && row.modelSpreadCore <= tSpread,
        ),
      );
    }
    for (const tPca of PCA_DEVIATION_THRESHOLDS) {
      pushCandidate(
        out,
        createCandidate(
          `pca_dev_le_${tPca}`,
          `baseline + pcaDeviation<=${tPca}`,
          ["pca"],
          (row) => isCurrentBaselineCheckmarked(row) && isFiniteNumber(row.pcaDeviation) && row.pcaDeviation <= tPca,
        ),
      );
    }
    for (const tSpread of SPREAD_THRESHOLDS) {
      for (const tPca of PCA_DEVIATION_THRESHOLDS) {
        pushCandidate(
          out,
          createCandidate(
            `spread_le_${tSpread}_pca_dev_le_${tPca}`,
            `baseline + modelSpreadCore<=${tSpread} + pcaDeviation<=${tPca}`,
            ["spread", "pca"],
            (row) =>
              isCurrentBaselineCheckmarked(row) &&
              isFiniteNumber(row.modelSpreadCore) &&
              row.modelSpreadCore <= tSpread &&
              isFiniteNumber(row.pcaDeviation) &&
              row.pcaDeviation <= tPca,
          ),
        );
      }
    }
  }

  if (!options.skipBt && !options.skipSpread) {
    for (const tBt of BT_MARGIN_THRESHOLDS) {
      for (const tSpread of SPREAD_THRESHOLDS) {
        for (const tPca of PCA_DEVIATION_THRESHOLDS) {
          pushCandidate(
            out,
            createCandidate(
              `combo_bt_ge_${tBt}_spread_le_${tSpread}_pca_dev_le_${tPca}`,
              `baseline + novaBtAgree + bradleyMargin>=${tBt} + spread<=${tSpread} + pcaDev<=${tPca}`,
              ["combo", "bt", "spread", "pca"],
              (row) =>
                isCurrentBaselineCheckmarked(row) &&
                row.novaBtAgree &&
                isFiniteNumber(row.bradleyMargin) &&
                row.bradleyMargin >= tBt &&
                isFiniteNumber(row.modelSpreadCore) &&
                row.modelSpreadCore <= tSpread &&
                isFiniteNumber(row.pcaDeviation) &&
                row.pcaDeviation <= tPca,
            ),
          );
          for (const tConf of CONFIDENCE_THRESHOLDS) {
            pushCandidate(
              out,
              createCandidate(
                `combo_bt_ge_${tBt}_spread_le_${tSpread}_pca_dev_le_${tPca}_conf_ge_${tConf}`,
                `baseline + novaBtAgree + bradleyMargin>=${tBt} + spread<=${tSpread} + pcaDev<=${tPca} + confidence>=${tConf}`,
                ["combo", "bt", "spread", "pca", "strict-confidence"],
                (row) =>
                  isCurrentBaselineCheckmarked(row) &&
                  row.novaBtAgree &&
                  isFiniteNumber(row.bradleyMargin) &&
                  row.bradleyMargin >= tBt &&
                  isFiniteNumber(row.modelSpreadCore) &&
                  row.modelSpreadCore <= tSpread &&
                  isFiniteNumber(row.pcaDeviation) &&
                  row.pcaDeviation <= tPca &&
                  row.confidencePct >= tConf,
              ),
            );
          }
          for (const tNova of NOVA_MARGIN_THRESHOLDS) {
            pushCandidate(
              out,
              createCandidate(
                `combo_bt_ge_${tBt}_spread_le_${tSpread}_pca_dev_le_${tPca}_nova_ge_${tNova}`,
                `baseline + novaBtAgree + bradleyMargin>=${tBt} + spread<=${tSpread} + pcaDev<=${tPca} + novaMargin>=${tNova}`,
                ["combo", "bt", "spread", "pca", "nova-margin"],
                (row) =>
                  isCurrentBaselineCheckmarked(row) &&
                  row.novaBtAgree &&
                  isFiniteNumber(row.bradleyMargin) &&
                  row.bradleyMargin >= tBt &&
                  isFiniteNumber(row.modelSpreadCore) &&
                  row.modelSpreadCore <= tSpread &&
                  isFiniteNumber(row.pcaDeviation) &&
                  row.pcaDeviation <= tPca &&
                  isFiniteNumber(row.novaMargin) &&
                  row.novaMargin >= tNova,
              ),
            );
            for (const tConf of CONFIDENCE_THRESHOLDS) {
              pushCandidate(
                out,
                createCandidate(
                  `combo_bt_ge_${tBt}_spread_le_${tSpread}_pca_dev_le_${tPca}_nova_ge_${tNova}_conf_ge_${tConf}`,
                  `baseline + novaBtAgree + bradleyMargin>=${tBt} + spread<=${tSpread} + pcaDev<=${tPca} + novaMargin>=${tNova} + confidence>=${tConf}`,
                  ["combo", "bt", "spread", "pca", "nova-margin", "strict-confidence"],
                  (row) =>
                    isCurrentBaselineCheckmarked(row) &&
                    row.novaBtAgree &&
                    isFiniteNumber(row.bradleyMargin) &&
                    row.bradleyMargin >= tBt &&
                    isFiniteNumber(row.modelSpreadCore) &&
                    row.modelSpreadCore <= tSpread &&
                    isFiniteNumber(row.pcaDeviation) &&
                    row.pcaDeviation <= tPca &&
                    isFiniteNumber(row.novaMargin) &&
                    row.novaMargin >= tNova &&
                    row.confidencePct >= tConf,
                ),
              );
            }
          }
        }
      }
    }
  }

  return [...out.values()];
}

function evaluateCandidate(
  candidate: CandidateDefinition,
  trainRows: CheckmarkStudyRow[],
  validRows: CheckmarkStudyRow[],
  trainBaseline: CheckmarkRuleMetrics,
  validBaseline: CheckmarkRuleMetrics,
  minCheckmarked: number,
): CheckmarkCandidate {
  const train = evaluateCheckmarkRule(trainRows, candidate.predicate);
  const valid = evaluateCheckmarkRule(validRows, candidate.predicate);
  const delta = round3(valid.hitRate - validBaseline.hitRate);
  const coverageDelta = round3(valid.coverage - validBaseline.coverage);
  const precisionDrop = round3(valid.hitRate - train.hitRate);
  const passesCriteria =
    valid.nCheckmarked >= minCheckmarked &&
    valid.hitRate >= validBaseline.hitRate &&
    precisionDrop > -0.1;
  void trainBaseline;
  return {
    ruleId: candidate.ruleId,
    rule: candidate.rule,
    tags: candidate.tags,
    train,
    valid,
    deltaVsBaselineCheckmarkPrecision: delta,
    coverageDeltaVsBaseline: coverageDelta,
    precisionDrop,
    passesCriteria,
  };
}

function sortCandidates(candidates: CheckmarkCandidate[]): CheckmarkCandidate[] {
  return [...candidates].sort((a, b) => {
    if (b.valid.hitRate !== a.valid.hitRate) return b.valid.hitRate - a.valid.hitRate;
    if (b.deltaVsBaselineCheckmarkPrecision !== a.deltaVsBaselineCheckmarkPrecision) {
      return b.deltaVsBaselineCheckmarkPrecision - a.deltaVsBaselineCheckmarkPrecision;
    }
    if (b.valid.nCheckmarked !== a.valid.nCheckmarked) return b.valid.nCheckmarked - a.valid.nCheckmarked;
    if (b.valid.coverage !== a.valid.coverage) return b.valid.coverage - a.valid.coverage;
    if (b.precisionDrop !== a.precisionDrop) return b.precisionDrop - a.precisionDrop;
    return a.ruleId.localeCompare(b.ruleId);
  });
}

function pickBestBy<T>(items: T[], score: (value: T) => number): T | undefined {
  if (items.length === 0) return undefined;
  let best = items[0]!;
  let bestScore = score(best);
  for (let i = 1; i < items.length; i += 1) {
    const current = items[i]!;
    const currentScore = score(current);
    if (currentScore > bestScore) {
      best = current;
      bestScore = currentScore;
    }
  }
  return best;
}

export function analyzeCheckmarkCalibrationStudy(
  trainRows: CheckmarkStudyRow[],
  validRows: CheckmarkStudyRow[],
  options?: {
    topK?: number;
    minCheckmarked?: number;
    skipBt?: boolean;
    skipSpread?: boolean;
  },
): Pick<CheckmarkCalibrationStudyReport, "candidates" | "topCandidates" | "recommendations" | "train" | "valid"> {
  const topK = options?.topK ?? DEFAULT_TOP_K;
  const minCheckmarked = options?.minCheckmarked ?? DEFAULT_MIN_CHECKMARKED;
  const skipBt = options?.skipBt ?? false;
  const skipSpread = options?.skipSpread ?? false;

  const trainBaselineMain = accuracyFromRows(trainRows);
  const validBaselineMain = accuracyFromRows(validRows);
  const trainBaselineCheckmark = evaluateCheckmarkRule(trainRows, isCurrentBaselineCheckmarked);
  const validBaselineCheckmark = evaluateCheckmarkRule(validRows, isCurrentBaselineCheckmarked);

  const candidates = sortCandidates(
    generateCandidates({ skipBt, skipSpread }).map((candidate) =>
      evaluateCandidate(candidate, trainRows, validRows, trainBaselineCheckmark, validBaselineCheckmark, minCheckmarked),
    ),
  );

  const topCandidates = candidates.slice(0, topK);
  const shortlist = candidates.filter((candidate) => candidate.passesCriteria);
  const best = shortlist[0];
  const maxPrecision = pickBestBy(shortlist, (c) => c.valid.hitRate * 1000 + c.valid.nCheckmarked);
  const balanced = pickBestBy(shortlist, (c) => {
    const delta = Math.max(0, c.deltaVsBaselineCheckmarkPrecision);
    return 0.65 * c.valid.hitRate + 0.25 * c.valid.coverage + 0.1 * delta;
  });
  const conservative = pickBestBy(shortlist, (c) => {
    const coveragePenalty = Math.abs(c.coverageDeltaVsBaseline);
    return c.valid.hitRate - 0.2 * coveragePenalty + 0.01 * c.valid.coverage;
  });

  return {
    train: {
      dataset: {
        joinedRows: trainRows.length,
        predictionRows: 0,
        usableRows: trainRows.length,
        joinedWithoutPrediction: 0,
        invalidJoinedRows: 0,
        predictionUrlDuplicates: 0,
      },
      mainBaseline: trainBaselineMain,
      currentCheckmarkBaseline: trainBaselineCheckmark,
      diagnostics: buildBaselineDiagnostics(trainRows),
    },
    valid: {
      dataset: {
        joinedRows: validRows.length,
        predictionRows: 0,
        usableRows: validRows.length,
        joinedWithoutPrediction: 0,
        invalidJoinedRows: 0,
        predictionUrlDuplicates: 0,
      },
      mainBaseline: validBaselineMain,
      currentCheckmarkBaseline: validBaselineCheckmark,
      diagnostics: buildBaselineDiagnostics(validRows),
    },
    candidates,
    topCandidates,
    recommendations: {
      best,
      maxPrecision,
      balanced,
      conservative,
      baselineRuleId: "baseline_current",
      baselineValidPrecision: validBaselineCheckmark.hitRate,
    },
  };
}

function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatMetricsBlock(label: string, metrics: CheckmarkRuleMetrics): string[] {
  return [
    `${label}: n=${metrics.nCheckmarked}/${metrics.total} (${formatPct(metrics.coverage)}), hit=${metrics.hit}/${metrics.nCheckmarked || 0}, precision=${formatPct(metrics.hitRate)}`,
  ];
}

function formatSplitTable(title: string, rows: BaselineSplitRow[]): string[] {
  const out = [title];
  for (const row of rows) {
    out.push(`- ${row.bucket}: n=${row.n}, hit=${row.hit}/${row.n}, precision=${formatPct(row.hitRate)}`);
  }
  return out;
}

export function formatCheckmarkCalibrationReportMd(report: CheckmarkCalibrationStudyReport): string {
  const lines: string[] = [];
  lines.push("# Checkmark Calibration Study (49→100)");
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Train usable: ${report.train.dataset.usableRows}`);
  lines.push(`- Valid usable: ${report.valid.dataset.usableRows}`);
  lines.push(`- Train main baseline: ${formatPct(report.train.mainBaseline.rate)} (${report.train.mainBaseline.hit}/${report.train.mainBaseline.total})`);
  lines.push(`- Valid main baseline: ${formatPct(report.valid.mainBaseline.rate)} (${report.valid.mainBaseline.hit}/${report.valid.mainBaseline.total})`);
  lines.push(`- Train current ✅✅✅: ${formatPct(report.train.currentCheckmarkBaseline.hitRate)} (n=${report.train.currentCheckmarkBaseline.nCheckmarked})`);
  lines.push(`- Valid current ✅✅✅: ${formatPct(report.valid.currentCheckmarkBaseline.hitRate)} (n=${report.valid.currentCheckmarkBaseline.nCheckmarked})`);
  if (report.recommendations.best) {
    const best = report.recommendations.best;
    lines.push(`- Best candidate: \`${best.ruleId}\` -> valid precision ${formatPct(best.valid.hitRate)} (n=${best.valid.nCheckmarked}), Δvs baseline ${formatPct(best.deltaVsBaselineCheckmarkPrecision)}`);
  } else {
    lines.push("- Best candidate: none passed shortlist criteria");
  }
  lines.push("");
  lines.push("## Top Candidates");
  lines.push("");
  lines.push("| Rule ID | Tags | Valid n | Valid precision | Δ vs baseline | Coverage | Train precision | Precision drop | Passes | ");
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|:---:|");
  for (const c of report.topCandidates) {
    lines.push(
      `| \`${c.ruleId}\` | ${c.tags.join(",")} | ${c.valid.nCheckmarked} | ${formatPct(c.valid.hitRate)} | ${formatPct(c.deltaVsBaselineCheckmarkPrecision)} | ${formatPct(c.valid.coverage)} | ${formatPct(c.train.hitRate)} | ${formatPct(c.precisionDrop)} | ${c.passesCriteria ? "yes" : "no"} |`,
    );
  }
  lines.push("");
  lines.push("## Why false-positive ✅✅✅ can pass (baseline splits)");
  lines.push("");
  lines.push(...formatSplitTable("### Valid: baseline by Agreement (4/5 vs 5/5 and more)", report.valid.diagnostics.byAgreement45));
  lines.push("");
  lines.push(...formatSplitTable("### Valid: baseline by Confidence bands", report.valid.diagnostics.byConfidenceBand));
  lines.push("");
  lines.push(...formatSplitTable("### Valid: baseline by BT agree/disagree", report.valid.diagnostics.byBtAgree));
  lines.push("");
  lines.push(...formatSplitTable("### Valid: baseline by Spread band", report.valid.diagnostics.bySpreadBand));
  lines.push("");
  lines.push(...formatSplitTable("### Valid: baseline by PCA outlier", report.valid.diagnostics.byPcaOutlier));
  lines.push("");
  lines.push("## Baseline false-positive ✅✅✅ examples (valid)");
  for (const row of report.valid.diagnostics.falsePositives.slice(0, 20)) {
    lines.push(
      `- ${row.label} | agr=${row.agreementText} conf=${row.confidencePct.toFixed(1)} nova=${row.novaP1 ?? "-"} bt=${row.bradleyP1 ?? "-"} spread=${row.modelSpreadCore ?? "-"} pcaDev=${row.pcaDeviation ?? "-"} | pick=${row.mainPick} | fact=${row.actualWinnerName ?? "-"}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function readJsonFile(path: string): Promise<unknown> {
  return readFile(path, "utf8").then((text) => JSON.parse(text));
}

function readRequiredArg(argv: string[], key: string): string {
  const value = readArg(argv, key);
  if (!value) throw new Error(`Missing --${key}`);
  return value;
}

async function runCli(argv: string[]): Promise<void> {
  const trainJoinedFile = readRequiredArg(argv, "train-joined-file");
  const trainPredictionsFile = readRequiredArg(argv, "train-predictions-file");
  const validJoinedFile = readRequiredArg(argv, "valid-joined-file");
  const validPredictionsFile = readRequiredArg(argv, "valid-predictions-file");
  const topK = readIntArg(argv, "top-k", DEFAULT_TOP_K);
  const minCheckmarked = readIntArg(argv, "min-checkmarked", DEFAULT_MIN_CHECKMARKED);
  const reportJson = readArg(argv, "report-json");
  const reportMd = readArg(argv, "report-md");
  const skipBt = hasFlag(argv, "skip-bt");
  const skipSpread = hasFlag(argv, "skip-spread");

  const [trainJoinedRaw, trainPredRaw, validJoinedRaw, validPredRaw] = await Promise.all([
    readJsonFile(trainJoinedFile),
    readJsonFile(trainPredictionsFile),
    readJsonFile(validJoinedFile),
    readJsonFile(validPredictionsFile),
  ]);

  const trainBuilt = buildCheckmarkStudyRows(trainJoinedRaw, trainPredRaw);
  const validBuilt = buildCheckmarkStudyRows(validJoinedRaw, validPredRaw);

  const analysis = analyzeCheckmarkCalibrationStudy(trainBuilt.rows, validBuilt.rows, {
    topK,
    minCheckmarked,
    skipBt,
    skipSpread,
  });

  const report: CheckmarkCalibrationStudyReport = {
    config: {
      trainJoinedFile,
      trainPredictionsFile,
      validJoinedFile,
      validPredictionsFile,
      topK,
      minCheckmarked,
      skipBt,
      skipSpread,
      novaMarginThresholds: [...NOVA_MARGIN_THRESHOLDS],
      btMarginThresholds: [...BT_MARGIN_THRESHOLDS],
      confidenceThresholds: [...CONFIDENCE_THRESHOLDS],
      spreadThresholds: [...SPREAD_THRESHOLDS],
      pcaDeviationThresholds: [...PCA_DEVIATION_THRESHOLDS],
      baselineSplitThresholds: { ...DEFAULT_BASELINE_SPLIT_THRESHOLDS },
    },
    train: {
      ...analysis.train,
      dataset: trainBuilt.dataset,
    },
    valid: {
      ...analysis.valid,
      dataset: validBuilt.dataset,
    },
    candidates: analysis.candidates,
    topCandidates: analysis.topCandidates,
    recommendations: analysis.recommendations,
  };

  if (reportJson) {
    await writeFile(reportJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  if (reportMd) {
    await writeFile(reportMd, formatCheckmarkCalibrationReportMd(report), "utf8");
  }

  const baseline = report.valid.currentCheckmarkBaseline;
  console.log("=== Checkmark Calibration Study ===");
  console.log(`Train usable: ${report.train.dataset.usableRows}`);
  console.log(`Valid usable: ${report.valid.dataset.usableRows}`);
  console.log(`Valid main baseline: ${report.valid.mainBaseline.hit}/${report.valid.mainBaseline.total} (${formatPct(report.valid.mainBaseline.rate)})`);
  console.log(`Valid current ✅✅✅ baseline: ${baseline.hit}/${baseline.nCheckmarked} (${formatPct(baseline.hitRate)}), coverage ${formatPct(baseline.coverage)}`);
  if (report.recommendations.best) {
    const best = report.recommendations.best;
    console.log(`Best candidate: ${best.ruleId} | valid ${best.valid.hit}/${best.valid.nCheckmarked} (${formatPct(best.valid.hitRate)}) | Δ ${formatPct(best.deltaVsBaselineCheckmarkPrecision)} | passes=${best.passesCriteria}`);
  } else {
    console.log("Best candidate: none passed shortlist criteria");
  }
}

export async function main(argv: string[]): Promise<void> {
  await runCli(argv);
}

const cliEntry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === cliEntry) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
