import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const DEFAULT_MIN_BUCKET_SIZE = 8;
const DEFAULT_TOP_K = 15;
const DEFAULT_INCLUDE_CONFIDENCE = true;
const DEFAULT_INCLUDE_SPREAD = false;
const NOVA_MARGIN_THRESHOLDS = [2, 4, 6, 8, 10, 12, 15, 18, 20] as const;
const LOGISTIC_MARGIN_THRESHOLDS = [0, 2, 4, 6, 8, 10, 12, 15] as const;
const LOGISTIC_CONFLICT_THRESHOLDS = [6, 8, 10, 12] as const;
const CONFIDENCE_THRESHOLDS = [50, 55, 58, 60, 62, 65, 68, 70, 75] as const;
const SPREAD_THRESHOLDS = [20, 25, 30, 35, 40, 50] as const;

export interface ThresholdJoinedRow {
  matchUrl?: string;
  label?: string;
  actualWinner?: string;
  actualWinnerName?: string;
  winnerName?: string;
  historyPick?: string;
  mainPick?: string;
  novaPick?: string;
  historyCorrect?: boolean;
  mainCorrect?: boolean;
  novaCorrect?: boolean;
  agreementHN?: boolean;
  novaP1?: number;
  novaP2?: number;
  novaMargin?: number;
  mainConfidence?: number;
  confidencePct?: number;
  mainProbP1?: number;
  logRegP1?: number;
  markovP1?: number;
  bradleyP1?: number;
  pcaP1?: number;
  modelSpreadCore?: number;
  pcaDeviation?: number;
  [key: string]: unknown;
}

export interface ThresholdAnalysisRow {
  matchUrl: string;
  label: string;
  actualWinnerName?: string;
  historyPick?: string;
  novaPick?: string;
  historyCorrect: boolean;
  novaCorrect: boolean;
  agreementHN: boolean;
  novaP1: number;
  novaMargin: number;
  logisticPick?: "A" | "B" | "neutral";
  logisticMargin?: number;
  novaLogisticAgree: boolean;
  confidencePct?: number;
  mainProbP1?: number;
  logRegP1?: number;
  markovP1?: number;
  bradleyP1?: number;
  pcaP1?: number;
  modelSpreadCore?: number;
  pcaDeviation?: number;
  raw: ThresholdJoinedRow;
}

export interface AccuracyBlock {
  hit: number;
  total: number;
  rate: number;
}

export interface CandidateRuleResult {
  ruleId: string;
  ruleType: "strategy" | "filter";
  ruleFamily: string;
  tags: string[];
  rule: string;
  pickPolicy: string;
  n: number;
  coverage: number;
  hit: number;
  total: number;
  hitRate: number;
  novaHitRateOnSameGroup: number;
  historyHitRateOnSameGroup: number;
  liftVsNova: number;
  liftVsHistory: number;
  balanceScore?: number;
  disagreeRowsCovered?: number;
  disagreeRowsUsingNOVA?: number;
  disagreeRowsUsingHISTORY?: number;
  unstable: boolean;
}

export interface ThresholdAnalysisReport {
  config: {
    joinedFile?: string;
    minBucketSize: number;
    topK: number;
    includeConfidence: boolean;
    includeSpread: boolean;
    novaMarginThresholds: number[];
    logisticMarginThresholds: number[];
    logisticConflictThresholds: number[];
    confidenceThresholds: number[];
    spreadThresholds: number[];
  };
  dataset: {
    totalRawRows: number;
    usableRows: number;
    droppedRows: number;
  };
  baseline: {
    nova: AccuracyBlock;
    history: AccuracyBlock;
    agree: {
      total: number;
      nova: AccuracyBlock;
      history: AccuracyBlock;
      common: AccuracyBlock;
    };
    disagree: {
      total: number;
      nova: AccuracyBlock;
      history: AccuracyBlock;
    };
  };
  strategyCandidates: CandidateRuleResult[];
  filterCandidates: CandidateRuleResult[];
  shortlist: {
    strategy: CandidateRuleResult[];
    filter: CandidateRuleResult[];
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

type SidePick = "A" | "B" | "neutral";

function pickSideFromP1(p1: number | undefined): SidePick | undefined {
  if (!isFiniteNumber(p1)) return undefined;
  if (p1 > 50) return "A";
  if (p1 < 50) return "B";
  return "neutral";
}

function normalizeLooseName(value: string | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function readArg(argv: string[], key: string): string | undefined {
  const token = `--${key}`;
  const index = argv.findIndex((value) => value === token);
  if (index < 0) return undefined;
  const next = argv[index + 1];
  if (!next || next.startsWith("--")) return undefined;
  return next;
}

function readIntArg(argv: string[], key: string): number | undefined {
  const raw = readArg(argv, key);
  if (typeof raw !== "string") return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || !Number.isFinite(value)) {
    throw new Error(`--${key} must be an integer`);
  }
  return value;
}

function readBoolFlag(argv: string[], key: string, fallback: boolean): boolean {
  const token = `--${key}`;
  const noToken = `--no-${key}`;
  if (argv.includes(noToken)) return false;
  if (argv.includes(token)) return true;
  return fallback;
}

function computeModelSpreadCore(row: ThresholdJoinedRow): number | undefined {
  const values = [row.logRegP1, row.markovP1, row.bradleyP1, row.pcaP1].filter(isFiniteNumber);
  if (values.length < 2) return undefined;
  return round3(Math.max(...values) - Math.min(...values));
}

function computePcaDeviation(row: ThresholdJoinedRow): number | undefined {
  const pca = row.pcaP1;
  const core = [row.logRegP1, row.markovP1, row.bradleyP1].filter(isFiniteNumber);
  if (!isFiniteNumber(pca) || core.length !== 3) return undefined;
  return round3(Math.abs(pca - (core[0]! + core[1]! + core[2]!) / 3));
}

function coerceBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function coerceNumber(value: unknown): number | undefined {
  return isFiniteNumber(value) ? value : undefined;
}

export function toThresholdRows(rawRows: unknown[]): ThresholdAnalysisRow[] {
  if (!Array.isArray(rawRows)) {
    throw new Error("Joined data must be a JSON array");
  }
  const out: ThresholdAnalysisRow[] = [];
  for (const item of rawRows) {
    if (!item || typeof item !== "object") continue;
    const row = item as ThresholdJoinedRow;
    const historyCorrect = coerceBoolean(row.historyCorrect ?? row.mainCorrect);
    const novaCorrect = coerceBoolean(row.novaCorrect);
    const novaP1 = coerceNumber(row.novaP1);
    const historyPick = typeof (row.historyPick ?? row.mainPick) === "string" ? String(row.historyPick ?? row.mainPick) : undefined;
    const novaPick = typeof row.novaPick === "string" ? row.novaPick : undefined;
    const agreementHN =
      coerceBoolean(row.agreementHN) ??
      (() => {
        const h = normalizeLooseName(historyPick);
        const n = normalizeLooseName(novaPick);
        return h && n ? h === n : undefined;
      })();
    const novaMargin = coerceNumber(row.novaMargin) ?? (isFiniteNumber(novaP1) ? Math.abs(novaP1 - 50) : undefined);
    const logRegP1 = isFiniteNumber(row.logRegP1) ? row.logRegP1 : undefined;
    const logisticPick = pickSideFromP1(logRegP1);
    const logisticMargin = isFiniteNumber(logRegP1) ? Math.abs(logRegP1 - 50) : undefined;
    const novaPickSide = pickSideFromP1(novaP1);
    const novaLogisticAgree =
      novaPickSide !== undefined &&
      logisticPick !== undefined &&
      novaPickSide !== "neutral" &&
      logisticPick !== "neutral" &&
      novaPickSide === logisticPick;
    if (
      historyCorrect === undefined ||
      novaCorrect === undefined ||
      agreementHN === undefined ||
      !isFiniteNumber(novaP1) ||
      !isFiniteNumber(novaMargin)
    ) {
      continue;
    }
    const mainConfidence = coerceNumber(row.mainConfidence);
    const confidencePct =
      coerceNumber(row.confidencePct) ?? (isFiniteNumber(mainConfidence) ? mainConfidence * 100 : undefined);
    out.push({
      matchUrl: typeof row.matchUrl === "string" ? row.matchUrl : "",
      label: typeof row.label === "string" ? row.label : "",
      actualWinnerName:
        typeof row.actualWinnerName === "string"
          ? row.actualWinnerName
          : typeof row.actualWinner === "string"
            ? row.actualWinner
            : typeof row.winnerName === "string"
              ? row.winnerName
              : undefined,
      historyPick,
      novaPick,
      historyCorrect,
      novaCorrect,
      agreementHN,
      novaP1: round3(novaP1),
      novaMargin: round3(novaMargin),
      logisticPick,
      logisticMargin: isFiniteNumber(logisticMargin) ? round3(logisticMargin) : undefined,
      novaLogisticAgree,
      confidencePct: isFiniteNumber(confidencePct) ? round3(confidencePct) : undefined,
      mainProbP1: isFiniteNumber(row.mainProbP1) ? round3(row.mainProbP1) : undefined,
      logRegP1: isFiniteNumber(logRegP1) ? round3(logRegP1) : undefined,
      markovP1: isFiniteNumber(row.markovP1) ? round3(row.markovP1) : undefined,
      bradleyP1: isFiniteNumber(row.bradleyP1) ? round3(row.bradleyP1) : undefined,
      pcaP1: isFiniteNumber(row.pcaP1) ? round3(row.pcaP1) : undefined,
      modelSpreadCore: coerceNumber(row.modelSpreadCore) ?? computeModelSpreadCore(row),
      pcaDeviation: coerceNumber(row.pcaDeviation) ?? computePcaDeviation(row),
      raw: row,
    });
  }
  return out;
}

function makeAccuracy(values: boolean[]): AccuracyBlock {
  const total = values.length;
  const hit = values.filter(Boolean).length;
  return { hit, total, rate: total > 0 ? hit / total : 0 };
}

function subset(rows: ThresholdAnalysisRow[], predicate: (row: ThresholdAnalysisRow) => boolean): ThresholdAnalysisRow[] {
  return rows.filter(predicate);
}

function baselineOnGroup(rows: ThresholdAnalysisRow[]) {
  return {
    nova: makeAccuracy(rows.map((row) => row.novaCorrect)),
    history: makeAccuracy(rows.map((row) => row.historyCorrect)),
  };
}

type PickSource = "nova" | "history" | "common";

function evaluateRule(
  rows: ThresholdAnalysisRow[],
  totalCompared: number,
  params: {
    ruleId: string;
    ruleType: "strategy" | "filter";
    ruleFamily: string;
    tags?: string[];
    rule: string;
    pickPolicy: string;
    predicate: (row: ThresholdAnalysisRow) => boolean;
    pickSource: (row: ThresholdAnalysisRow) => PickSource;
  },
): CandidateRuleResult | undefined {
  const matched = rows.filter(params.predicate);
  if (matched.length === 0) return undefined;

  const picks = matched.map((row) => params.pickSource(row));
  const corrects = matched.map((row, index) => {
    const pick = picks[index]!;
    if (pick === "nova") return row.novaCorrect;
    if (pick === "history") return row.historyCorrect;
    return row.agreementHN ? row.novaCorrect : row.novaCorrect;
  });
  const own = makeAccuracy(corrects);
  const baselines = baselineOnGroup(matched);
  const disagreeRowsCovered = matched.filter((row) => !row.agreementHN).length;
  const disagreeRowsUsingNOVA = matched.reduce((acc, row, index) => {
    return !row.agreementHN && picks[index] === "nova" ? acc + 1 : acc;
  }, 0);
  const disagreeRowsUsingHISTORY = matched.reduce((acc, row, index) => {
    return !row.agreementHN && picks[index] === "history" ? acc + 1 : acc;
  }, 0);
  const liftVsNova = own.rate - baselines.nova.rate;
  const liftVsHistory = own.rate - baselines.history.rate;
  const balanceScore =
    params.ruleType === "filter"
      ? 0.5 * own.rate + 0.3 * (totalCompared > 0 ? matched.length / totalCompared : 0) + 0.2 * Math.max(0, liftVsNova)
      : undefined;

  return {
    ruleId: params.ruleId,
    ruleType: params.ruleType,
    ruleFamily: params.ruleFamily,
    tags: [...new Set(params.tags ?? [])],
    rule: params.rule,
    pickPolicy: params.pickPolicy,
    n: matched.length,
    coverage: totalCompared > 0 ? matched.length / totalCompared : 0,
    hit: own.hit,
    total: own.total,
    hitRate: own.rate,
    novaHitRateOnSameGroup: baselines.nova.rate,
    historyHitRateOnSameGroup: baselines.history.rate,
    liftVsNova,
    liftVsHistory,
    balanceScore,
    disagreeRowsCovered,
    disagreeRowsUsingNOVA,
    disagreeRowsUsingHISTORY,
    unstable: matched.length < 12,
  };
}

function sortStrategyCandidates(a: CandidateRuleResult, b: CandidateRuleResult): number {
  if (b.hitRate !== a.hitRate) return b.hitRate - a.hitRate;
  if (b.liftVsNova !== a.liftVsNova) return b.liftVsNova - a.liftVsNova;
  if (b.liftVsHistory !== a.liftVsHistory) return b.liftVsHistory - a.liftVsHistory;
  if (b.n !== a.n) return b.n - a.n;
  if (b.coverage !== a.coverage) return b.coverage - a.coverage;
  return a.ruleId.localeCompare(b.ruleId);
}

function sortFilterCandidates(a: CandidateRuleResult, b: CandidateRuleResult): number {
  if ((b.balanceScore ?? -Infinity) !== (a.balanceScore ?? -Infinity)) {
    return (b.balanceScore ?? -Infinity) - (a.balanceScore ?? -Infinity);
  }
  if (b.hitRate !== a.hitRate) return b.hitRate - a.hitRate;
  if (b.n !== a.n) return b.n - a.n;
  if (b.liftVsNova !== a.liftVsNova) return b.liftVsNova - a.liftVsNova;
  if (b.coverage !== a.coverage) return b.coverage - a.coverage;
  return a.ruleId.localeCompare(b.ruleId);
}

function uniqByRuleId(rows: CandidateRuleResult[]): CandidateRuleResult[] {
  const seen = new Set<string>();
  const out: CandidateRuleResult[] = [];
  for (const row of rows) {
    if (seen.has(row.ruleId)) continue;
    seen.add(row.ruleId);
    out.push(row);
  }
  return out;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function rateBlockText(block: AccuracyBlock): string {
  return `${block.hit}/${block.total} (${percent(block.rate)})`;
}

export function analyzeNOVAHistoryThresholds(
  rows: ThresholdAnalysisRow[],
  options?: {
    minBucketSize?: number;
    topK?: number;
    includeConfidence?: boolean;
    includeSpread?: boolean;
    joinedFile?: string;
  },
): ThresholdAnalysisReport {
  const minBucketSize = options?.minBucketSize ?? DEFAULT_MIN_BUCKET_SIZE;
  const topK = options?.topK ?? DEFAULT_TOP_K;
  const includeConfidence = options?.includeConfidence ?? DEFAULT_INCLUDE_CONFIDENCE;
  const includeSpread = options?.includeSpread ?? DEFAULT_INCLUDE_SPREAD;

  const usableRows = [...rows];
  const totalCompared = usableRows.length;

  const agreeRows = subset(usableRows, (row) => row.agreementHN);
  const disagreeRows = subset(usableRows, (row) => !row.agreementHN);

  const baseline = {
    nova: makeAccuracy(usableRows.map((row) => row.novaCorrect)),
    history: makeAccuracy(usableRows.map((row) => row.historyCorrect)),
    agree: {
      total: agreeRows.length,
      nova: makeAccuracy(agreeRows.map((row) => row.novaCorrect)),
      history: makeAccuracy(agreeRows.map((row) => row.historyCorrect)),
      common: makeAccuracy(agreeRows.map((row) => row.novaCorrect)),
    },
    disagree: {
      total: disagreeRows.length,
      nova: makeAccuracy(disagreeRows.map((row) => row.novaCorrect)),
      history: makeAccuracy(disagreeRows.map((row) => row.historyCorrect)),
    },
  };

  const strategyCandidates: CandidateRuleResult[] = [];
  const filterCandidates: CandidateRuleResult[] = [];
  const push = (target: CandidateRuleResult[], row: CandidateRuleResult | undefined) => {
    if (row) target.push(row);
  };
  const logisticMarginOf = (row: ThresholdAnalysisRow) => row.logisticMargin ?? -Infinity;
  const confidencePctOf = (row: ThresholdAnalysisRow) => row.confidencePct ?? -Infinity;
  const logisticExists = (row: ThresholdAnalysisRow) => row.logisticPick !== undefined;

  push(
    strategyCandidates,
    evaluateRule(usableRows, totalCompared, {
      ruleId: "always_nova",
      ruleType: "strategy",
      ruleFamily: "baseline",
      tags: ["baseline", "nova"],
      rule: "always pick NOVA",
      pickPolicy: "NOVA",
      predicate: () => true,
      pickSource: () => "nova",
    }),
  );
  push(
    strategyCandidates,
    evaluateRule(usableRows, totalCompared, {
      ruleId: "always_history",
      ruleType: "strategy",
      ruleFamily: "baseline",
      tags: ["baseline", "history"],
      rule: "always pick HISTORY",
      pickPolicy: "HISTORY",
      predicate: () => true,
      pickSource: () => "history",
    }),
  );
  push(
    strategyCandidates,
    evaluateRule(usableRows, totalCompared, {
      ruleId: "agree_common_else_nova",
      ruleType: "strategy",
      ruleFamily: "baseline",
      tags: ["baseline", "agree", "disagree", "nova"],
      rule: "if agree -> common; else NOVA",
      pickPolicy: "agree=common; disagree=NOVA",
      predicate: () => true,
      pickSource: (row) => (row.agreementHN ? "common" : "nova"),
    }),
  );
  push(
    strategyCandidates,
    evaluateRule(usableRows, totalCompared, {
      ruleId: "agree_common_else_history",
      ruleType: "strategy",
      ruleFamily: "baseline",
      tags: ["baseline", "agree", "disagree", "history"],
      rule: "if agree -> common; else HISTORY",
      pickPolicy: "agree=common; disagree=HISTORY",
      predicate: () => true,
      pickSource: (row) => (row.agreementHN ? "common" : "history"),
    }),
  );

  for (const t of NOVA_MARGIN_THRESHOLDS) {
    push(
      strategyCandidates,
      evaluateRule(usableRows, totalCompared, {
        ruleId: `chooser_disagree_nova_ge_${t}_else_history`,
        ruleType: "strategy",
        ruleFamily: "chooser_margin_disagree",
        tags: ["chooser", "nova", "history", "margin", "disagree"],
        rule:
          `if agree -> common; if disagree and novaMargin>=${t} -> NOVA; ` +
          `if disagree and novaMargin<${t} -> HISTORY`,
        pickPolicy: `agree=common; disagree threshold NOVA>=${t}`,
        predicate: () => true,
        pickSource: (row) => (row.agreementHN ? "common" : row.novaMargin >= t ? "nova" : "history"),
      }),
    );

    push(
      filterCandidates,
      evaluateRule(usableRows, totalCompared, {
        ruleId: `send_agree_novaMargin_ge_${t}_pick_common`,
        ruleType: "filter",
        ruleFamily: "filter_agree_margin",
        tags: ["filter", "agree", "margin", "common"],
        rule: `send only if agreementHN=true and novaMargin>=${t}; pick common`,
        pickPolicy: "COMMON (agree subgroup)",
        predicate: (row) => row.agreementHN && row.novaMargin >= t,
        pickSource: () => "common",
      }),
    );
    push(
      filterCandidates,
      evaluateRule(usableRows, totalCompared, {
        ruleId: `send_disagree_novaMargin_ge_${t}_pick_nova`,
        ruleType: "filter",
        ruleFamily: "filter_disagree_margin",
        tags: ["filter", "disagree", "margin", "nova"],
        rule: `send only if agreementHN=false and novaMargin>=${t}; pick NOVA`,
        pickPolicy: "NOVA on disagree subgroup",
        predicate: (row) => !row.agreementHN && row.novaMargin >= t,
        pickSource: () => "nova",
      }),
    );
    push(
      filterCandidates,
      evaluateRule(usableRows, totalCompared, {
        ruleId: `send_disagree_novaMargin_lt_${t}_pick_history`,
        ruleType: "filter",
        ruleFamily: "filter_disagree_margin_inverse",
        tags: ["filter", "disagree", "margin", "history"],
        rule: `send only if agreementHN=false and novaMargin<${t}; pick HISTORY`,
        pickPolicy: "HISTORY on disagree subgroup",
        predicate: (row) => !row.agreementHN && row.novaMargin < t,
        pickSource: () => "history",
      }),
    );
    push(
      filterCandidates,
      evaluateRule(usableRows, totalCompared, {
        ruleId: `send_novaMargin_ge_${t}_pick_nova`,
        ruleType: "filter",
        ruleFamily: "filter_global_margin",
        tags: ["filter", "global", "margin", "nova"],
        rule: `send only if novaMargin>=${t}; pick NOVA`,
        pickPolicy: "NOVA",
        predicate: (row) => row.novaMargin >= t,
        pickSource: () => "nova",
      }),
    );

    if (includeConfidence) {
      for (const c of CONFIDENCE_THRESHOLDS) {
        push(
          strategyCandidates,
          evaluateRule(usableRows, totalCompared, {
            ruleId: `chooser_disagree_nova_ge_${t}_conf_ge_${c}_else_history`,
            ruleType: "strategy",
            ruleFamily: "chooser_margin_conf_disagree",
            tags: ["chooser", "nova", "history", "margin", "confidence", "disagree"],
            rule:
              `if agree -> common; if disagree and novaMargin>=${t} and confidence>=${c}% -> NOVA; else HISTORY`,
            pickPolicy: `agree=common; disagree NOVA if margin>=${t} & conf>=${c}%`,
            predicate: () => true,
            pickSource: (row) =>
              row.agreementHN
                ? "common"
                : row.novaMargin >= t && (row.confidencePct ?? -Infinity) >= c
                  ? "nova"
                  : "history",
          }),
        );
      }
    }

    if (includeSpread) {
      for (const s of SPREAD_THRESHOLDS) {
        push(
          strategyCandidates,
          evaluateRule(usableRows, totalCompared, {
            ruleId: `chooser_disagree_nova_ge_${t}_spread_le_${s}_else_history`,
            ruleType: "strategy",
            ruleFamily: "chooser_margin_spread_disagree",
            tags: ["chooser", "nova", "history", "margin", "spread", "disagree"],
            rule:
              `if agree -> common; if disagree and novaMargin>=${t} and modelSpreadCore<=${s} -> NOVA; else HISTORY`,
            pickPolicy: `agree=common; disagree NOVA if margin>=${t} & spread<=${s}`,
            predicate: () => true,
            pickSource: (row) =>
              row.agreementHN
                ? "common"
                : row.novaMargin >= t && isFiniteNumber(row.modelSpreadCore) && row.modelSpreadCore <= s
                  ? "nova"
                  : "history",
          }),
        );
      }
    }
  }

  // Logistic-linked filters and chooser rules (NOVA + Logistic + Confidence)
  push(
    filterCandidates,
    evaluateRule(usableRows, totalCompared, {
      ruleId: "send_novaLogisticAgree_pick_nova",
      ruleType: "filter",
      ruleFamily: "filter_global_logistic_agree",
      tags: ["filter", "global", "logistic", "direction", "nova"],
      rule: "send only if NOVA and Logistic pick same side; pick NOVA",
      pickPolicy: "NOVA",
      predicate: (row) => row.novaLogisticAgree,
      pickSource: () => "nova",
    }),
  );
  push(
    filterCandidates,
    evaluateRule(usableRows, totalCompared, {
      ruleId: "send_disagree_novaLogisticAgree_pick_nova",
      ruleType: "filter",
      ruleFamily: "filter_disagree_logistic_agree",
      tags: ["filter", "disagree", "logistic", "direction", "nova"],
      rule: "send only if agreementHN=false and NOVA/Logistic agree; pick NOVA",
      pickPolicy: "NOVA on disagree subgroup",
      predicate: (row) => !row.agreementHN && row.novaLogisticAgree,
      pickSource: () => "nova",
    }),
  );

  for (const lt of LOGISTIC_MARGIN_THRESHOLDS) {
    push(
      filterCandidates,
      evaluateRule(usableRows, totalCompared, {
        ruleId: `send_novaLogisticAgree_logit_ge_${lt}_pick_nova`,
        ruleType: "filter",
        ruleFamily: "filter_global_logistic_agree_margin",
        tags: ["filter", "global", "logistic", "direction", "logistic-margin", "nova"],
        rule: `send only if NOVA/Logistic agree and logisticMargin>=${lt}; pick NOVA`,
        pickPolicy: "NOVA",
        predicate: (row) => row.novaLogisticAgree && logisticMarginOf(row) >= lt,
        pickSource: () => "nova",
      }),
    );
    push(
      filterCandidates,
      evaluateRule(usableRows, totalCompared, {
        ruleId: `send_disagree_novaLogisticAgree_logit_ge_${lt}_pick_nova`,
        ruleType: "filter",
        ruleFamily: "filter_disagree_logistic_agree_margin",
        tags: ["filter", "disagree", "logistic", "direction", "logistic-margin", "nova"],
        rule: `send only if agreementHN=false and NOVA/Logistic agree and logisticMargin>=${lt}; pick NOVA`,
        pickPolicy: "NOVA on disagree subgroup",
        predicate: (row) => !row.agreementHN && row.novaLogisticAgree && logisticMarginOf(row) >= lt,
        pickSource: () => "nova",
      }),
    );
    for (const nt of NOVA_MARGIN_THRESHOLDS) {
      push(
        filterCandidates,
        evaluateRule(usableRows, totalCompared, {
          ruleId: `send_nova_margin_ge_${nt}_logit_ge_${lt}_pick_nova`,
          ruleType: "filter",
          ruleFamily: "filter_global_margin_logit",
          tags: ["filter", "global", "margin", "logistic-margin", "nova"],
          rule: `send only if novaMargin>=${nt} and logisticMargin>=${lt}; pick NOVA`,
          pickPolicy: "NOVA",
          predicate: (row) => row.novaMargin >= nt && logisticMarginOf(row) >= lt,
          pickSource: () => "nova",
        }),
      );
      push(
        filterCandidates,
        evaluateRule(usableRows, totalCompared, {
          ruleId: `send_disagree_nova_margin_ge_${nt}_logit_ge_${lt}_pick_nova`,
          ruleType: "filter",
          ruleFamily: "filter_disagree_margin_logit",
          tags: ["filter", "disagree", "margin", "logistic-margin", "nova"],
          rule: `send only if agreementHN=false and novaMargin>=${nt} and logisticMargin>=${lt}; pick NOVA`,
          pickPolicy: "NOVA on disagree subgroup",
          predicate: (row) => !row.agreementHN && row.novaMargin >= nt && logisticMarginOf(row) >= lt,
          pickSource: () => "nova",
        }),
      );
      push(
        filterCandidates,
        evaluateRule(usableRows, totalCompared, {
          ruleId: `send_novaLogisticAgree_nova_ge_${nt}_logit_ge_${lt}_pick_nova`,
          ruleType: "filter",
          ruleFamily: "filter_global_nova_logit_confirmed",
          tags: ["filter", "global", "margin", "logistic", "direction", "logistic-margin", "nova"],
          rule: `send only if NOVA/Logistic agree and novaMargin>=${nt} and logisticMargin>=${lt}; pick NOVA`,
          pickPolicy: "NOVA",
          predicate: (row) => row.novaLogisticAgree && row.novaMargin >= nt && logisticMarginOf(row) >= lt,
          pickSource: () => "nova",
        }),
      );
      push(
        filterCandidates,
        evaluateRule(usableRows, totalCompared, {
          ruleId: `send_disagree_novaLogisticAgree_nova_ge_${nt}_logit_ge_${lt}_pick_nova`,
          ruleType: "filter",
          ruleFamily: "filter_disagree_nova_logit_confirmed",
          tags: ["filter", "disagree", "margin", "logistic", "direction", "logistic-margin", "nova"],
          rule:
            `send only if agreementHN=false and NOVA/Logistic agree and novaMargin>=${nt} and logisticMargin>=${lt}; pick NOVA`,
          pickPolicy: "NOVA on disagree subgroup",
          predicate: (row) =>
            !row.agreementHN && row.novaLogisticAgree && row.novaMargin >= nt && logisticMarginOf(row) >= lt,
          pickSource: () => "nova",
        }),
      );

      push(
        strategyCandidates,
        evaluateRule(usableRows, totalCompared, {
          ruleId: `chooser_disagree_novaLogitAgree_logit_ge_${lt}_else_history`,
          ruleType: "strategy",
          ruleFamily: "chooser_logistic_confirm_disagree",
          tags: ["chooser", "disagree", "logistic", "direction", "logistic-margin", "nova", "history"],
          rule: `if agree -> common; if disagree and NOVA/Logistic agree and logisticMargin>=${lt} -> NOVA; else HISTORY`,
          pickPolicy: `agree=common; disagree NOVA if logit agrees & logitMargin>=${lt}`,
          predicate: () => true,
          pickSource: (row) =>
            row.agreementHN ? "common" : row.novaLogisticAgree && logisticMarginOf(row) >= lt ? "nova" : "history",
        }),
      );
      push(
        strategyCandidates,
        evaluateRule(usableRows, totalCompared, {
          ruleId: `chooser_disagree_nova_ge_${nt}_logit_ge_${lt}_else_history`,
          ruleType: "strategy",
          ruleFamily: "chooser_margin_logit_disagree",
          tags: ["chooser", "disagree", "margin", "logistic-margin", "nova", "history"],
          rule: `if agree -> common; if disagree and novaMargin>=${nt} and logisticMargin>=${lt} -> NOVA; else HISTORY`,
          pickPolicy: `agree=common; disagree NOVA if novaMargin>=${nt} & logitMargin>=${lt}`,
          predicate: () => true,
          pickSource: (row) =>
            row.agreementHN ? "common" : row.novaMargin >= nt && logisticMarginOf(row) >= lt ? "nova" : "history",
        }),
      );
      push(
        strategyCandidates,
        evaluateRule(usableRows, totalCompared, {
          ruleId: `chooser_disagree_novaLogitAgree_nova_ge_${nt}_else_history`,
          ruleType: "strategy",
          ruleFamily: "chooser_nova_margin_logit_direction_disagree",
          tags: ["chooser", "disagree", "margin", "logistic", "direction", "nova", "history"],
          rule: `if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=${nt} -> NOVA; else HISTORY`,
          pickPolicy: `agree=common; disagree NOVA if logit agrees & novaMargin>=${nt}`,
          predicate: () => true,
          pickSource: (row) =>
            row.agreementHN ? "common" : row.novaLogisticAgree && row.novaMargin >= nt ? "nova" : "history",
        }),
      );
      push(
        strategyCandidates,
        evaluateRule(usableRows, totalCompared, {
          ruleId: `chooser_disagree_novaLogitAgree_nova_ge_${nt}_logit_ge_${lt}_else_history`,
          ruleType: "strategy",
          ruleFamily: "chooser_nova_logit_doubleconfirm_disagree",
          tags: ["chooser", "disagree", "margin", "logistic", "direction", "logistic-margin", "nova", "history"],
          rule:
            `if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=${nt} and logisticMargin>=${lt} -> NOVA; else HISTORY`,
          pickPolicy: `agree=common; disagree NOVA if logit agrees & novaMargin>=${nt} & logitMargin>=${lt}`,
          predicate: () => true,
          pickSource: (row) =>
            row.agreementHN
              ? "common"
              : row.novaLogisticAgree && row.novaMargin >= nt && logisticMarginOf(row) >= lt
                ? "nova"
                : "history",
        }),
      );

      if (includeConfidence) {
        for (const c of CONFIDENCE_THRESHOLDS) {
          push(
            filterCandidates,
            evaluateRule(usableRows, totalCompared, {
              ruleId: `send_nova_margin_ge_${nt}_conf_ge_${c}_pick_nova`,
              ruleType: "filter",
              ruleFamily: "filter_global_margin_conf",
              tags: ["filter", "global", "margin", "confidence", "nova"],
              rule: `send only if novaMargin>=${nt} and confidence>=${c}%; pick NOVA`,
              pickPolicy: "NOVA",
              predicate: (row) => row.novaMargin >= nt && confidencePctOf(row) >= c,
              pickSource: () => "nova",
            }),
          );
          push(
            filterCandidates,
            evaluateRule(usableRows, totalCompared, {
              ruleId: `send_novaLogisticAgree_nova_ge_${nt}_conf_ge_${c}_pick_nova`,
              ruleType: "filter",
              ruleFamily: "filter_global_nova_logit_conf",
              tags: ["filter", "global", "margin", "logistic", "direction", "confidence", "nova"],
              rule: `send only if NOVA/Logistic agree and novaMargin>=${nt} and confidence>=${c}%; pick NOVA`,
              pickPolicy: "NOVA",
              predicate: (row) => row.novaLogisticAgree && row.novaMargin >= nt && confidencePctOf(row) >= c,
              pickSource: () => "nova",
            }),
          );
          push(
            filterCandidates,
            evaluateRule(usableRows, totalCompared, {
              ruleId: `send_disagree_novaLogisticAgree_nova_ge_${nt}_conf_ge_${c}_pick_nova`,
              ruleType: "filter",
              ruleFamily: "filter_disagree_nova_logit_conf",
              tags: ["filter", "disagree", "margin", "logistic", "direction", "confidence", "nova"],
              rule:
                `send only if agreementHN=false and NOVA/Logistic agree and novaMargin>=${nt} and confidence>=${c}%; pick NOVA`,
              pickPolicy: "NOVA on disagree subgroup",
              predicate: (row) =>
                !row.agreementHN && row.novaLogisticAgree && row.novaMargin >= nt && confidencePctOf(row) >= c,
              pickSource: () => "nova",
            }),
          );
          push(
            filterCandidates,
            evaluateRule(usableRows, totalCompared, {
              ruleId: `send_disagree_novaLogisticAgree_logit_ge_${lt}_conf_ge_${c}_pick_nova`,
              ruleType: "filter",
              ruleFamily: "filter_disagree_logit_conf",
              tags: ["filter", "disagree", "logistic", "direction", "logistic-margin", "confidence", "nova"],
              rule:
                `send only if agreementHN=false and NOVA/Logistic agree and logisticMargin>=${lt} and confidence>=${c}%; pick NOVA`,
              pickPolicy: "NOVA on disagree subgroup",
              predicate: (row) =>
                !row.agreementHN && row.novaLogisticAgree && logisticMarginOf(row) >= lt && confidencePctOf(row) >= c,
              pickSource: () => "nova",
            }),
          );
          push(
            filterCandidates,
            evaluateRule(usableRows, totalCompared, {
              ruleId: `send_disagree_novaLogisticAgree_nova_ge_${nt}_logit_ge_${lt}_conf_ge_${c}_pick_nova`,
              ruleType: "filter",
              ruleFamily: "filter_disagree_nova_logit_conf_full",
              tags: ["filter", "disagree", "margin", "logistic", "direction", "logistic-margin", "confidence", "nova"],
              rule:
                `send only if agreementHN=false and NOVA/Logistic agree and novaMargin>=${nt} and logisticMargin>=${lt} and confidence>=${c}%; pick NOVA`,
              pickPolicy: "NOVA on disagree subgroup",
              predicate: (row) =>
                !row.agreementHN &&
                row.novaLogisticAgree &&
                row.novaMargin >= nt &&
                logisticMarginOf(row) >= lt &&
                confidencePctOf(row) >= c,
              pickSource: () => "nova",
            }),
          );

          push(
            strategyCandidates,
            evaluateRule(usableRows, totalCompared, {
              ruleId: `chooser_disagree_novaLogitAgree_logit_ge_${lt}_conf_ge_${c}_else_history`,
              ruleType: "strategy",
              ruleFamily: "chooser_logistic_confirm_conf_disagree",
              tags: ["chooser", "disagree", "logistic", "direction", "logistic-margin", "confidence", "nova", "history"],
              rule:
                `if agree -> common; if disagree and NOVA/Logistic agree and logisticMargin>=${lt} and confidence>=${c}% -> NOVA; else HISTORY`,
              pickPolicy: `agree=common; disagree NOVA if logit agrees & logitMargin>=${lt} & conf>=${c}%`,
              predicate: () => true,
              pickSource: (row) =>
                row.agreementHN
                  ? "common"
                  : row.novaLogisticAgree && logisticMarginOf(row) >= lt && confidencePctOf(row) >= c
                    ? "nova"
                    : "history",
            }),
          );
          push(
            strategyCandidates,
            evaluateRule(usableRows, totalCompared, {
              ruleId: `chooser_disagree_nova_ge_${nt}_logit_ge_${lt}_conf_ge_${c}_else_history`,
              ruleType: "strategy",
              ruleFamily: "chooser_margin_logit_conf_disagree",
              tags: ["chooser", "disagree", "margin", "logistic-margin", "confidence", "nova", "history"],
              rule:
                `if agree -> common; if disagree and novaMargin>=${nt} and logisticMargin>=${lt} and confidence>=${c}% -> NOVA; else HISTORY`,
              pickPolicy: `agree=common; disagree NOVA if novaMargin>=${nt} & logitMargin>=${lt} & conf>=${c}%`,
              predicate: () => true,
              pickSource: (row) =>
                row.agreementHN
                  ? "common"
                  : row.novaMargin >= nt && logisticMarginOf(row) >= lt && confidencePctOf(row) >= c
                    ? "nova"
                    : "history",
            }),
          );
          push(
            strategyCandidates,
            evaluateRule(usableRows, totalCompared, {
              ruleId: `chooser_disagree_novaLogitAgree_nova_ge_${nt}_logit_ge_${lt}_conf_ge_${c}_else_history`,
              ruleType: "strategy",
              ruleFamily: "chooser_nova_logit_conf_full_disagree",
              tags: ["chooser", "disagree", "margin", "logistic", "direction", "logistic-margin", "confidence", "nova", "history"],
              rule:
                `if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=${nt} and logisticMargin>=${lt} and confidence>=${c}% -> NOVA; else HISTORY`,
              pickPolicy:
                `agree=common; disagree NOVA if logit agrees & novaMargin>=${nt} & logitMargin>=${lt} & conf>=${c}%`,
              predicate: () => true,
              pickSource: (row) =>
                row.agreementHN
                  ? "common"
                  : row.novaLogisticAgree &&
                      row.novaMargin >= nt &&
                      logisticMarginOf(row) >= lt &&
                      confidencePctOf(row) >= c
                    ? "nova"
                    : "history",
            }),
          );
        }
      }
    }
  }

  for (const t of LOGISTIC_CONFLICT_THRESHOLDS) {
    push(
      strategyCandidates,
      evaluateRule(usableRows, totalCompared, {
        ruleId: `chooser_disagree_logit_conflict_ge_${t}_history_else_nova`,
        ruleType: "strategy",
        ruleFamily: "chooser_logistic_conflict_exploratory",
        tags: ["chooser", "exploratory", "disagree", "logistic", "conflict", "nova", "history"],
        rule:
          `if agreementHN=false and NOVA/Logistic disagree and logisticMargin>=${t} -> HISTORY; else NOVA/common`,
        pickPolicy: `disagree strong logit conflict>=${t} -> HISTORY else NOVA`,
        predicate: () => true,
        pickSource: (row) =>
          row.agreementHN
            ? "common"
            : !row.novaLogisticAgree && logisticExists(row) && logisticMarginOf(row) >= t
              ? "history"
              : "nova",
      }),
    );
  }

  const strategyFiltered = uniqByRuleId(strategyCandidates)
    .filter((row) => row.n >= minBucketSize)
    .sort(sortStrategyCandidates);
  const filterFiltered = uniqByRuleId(filterCandidates)
    .filter((row) => row.n >= minBucketSize)
    .sort(sortFilterCandidates);

  const shortlistStrategy = strategyFiltered
    .filter((row) => row.hitRate > row.novaHitRateOnSameGroup || row.hitRate > row.historyHitRateOnSameGroup)
    .slice(0, topK);
  const shortlistFilter = filterFiltered
    .filter((row) => row.hitRate > row.novaHitRateOnSameGroup || row.hitRate > row.historyHitRateOnSameGroup)
    .slice(0, topK);

  return {
    config: {
      joinedFile: options?.joinedFile,
      minBucketSize,
      topK,
      includeConfidence,
      includeSpread,
      novaMarginThresholds: [...NOVA_MARGIN_THRESHOLDS],
      logisticMarginThresholds: [...LOGISTIC_MARGIN_THRESHOLDS],
      logisticConflictThresholds: [...LOGISTIC_CONFLICT_THRESHOLDS],
      confidenceThresholds: [...CONFIDENCE_THRESHOLDS],
      spreadThresholds: [...SPREAD_THRESHOLDS],
    },
    dataset: {
      totalRawRows: totalCompared,
      usableRows: totalCompared,
      droppedRows: 0,
    },
    baseline,
    strategyCandidates: strategyFiltered,
    filterCandidates: filterFiltered,
    shortlist: {
      strategy: shortlistStrategy,
      filter: shortlistFilter,
    },
  };
}

export function formatThresholdReport(report: ThresholdAnalysisReport): string {
  const lines: string[] = [];
  lines.push("=== NOVA + HISTORY THRESHOLD ANALYSIS ===");
  if (report.config.joinedFile) lines.push(`Joined file: ${report.config.joinedFile}`);
  lines.push(
    `Rows: usable=${report.dataset.usableRows}, min_bucket=${report.config.minBucketSize}, top_k=${report.config.topK}`,
  );
  lines.push(
    `Options: include_confidence=${report.config.includeConfidence}, include_spread=${report.config.includeSpread}`,
  );
  lines.push("");
  lines.push("Baseline:");
  lines.push(`- NOVA: ${rateBlockText(report.baseline.nova)}`);
  lines.push(`- HISTORY: ${rateBlockText(report.baseline.history)}`);
  lines.push(
    `- AGREE subgroup (n=${report.baseline.agree.total}): common=${rateBlockText(report.baseline.agree.common)} ` +
      `| NOVA=${rateBlockText(report.baseline.agree.nova)} | HISTORY=${rateBlockText(report.baseline.agree.history)}`,
  );
  lines.push(
    `- DISAGREE subgroup (n=${report.baseline.disagree.total}): NOVA=${rateBlockText(report.baseline.disagree.nova)} ` +
      `| HISTORY=${rateBlockText(report.baseline.disagree.history)}`,
  );
  lines.push("");

  const renderCandidateSection = (title: string, rows: CandidateRuleResult[]) => {
    lines.push(title);
    if (rows.length === 0) {
      lines.push("- (no candidates after filters)");
      lines.push("");
      return;
    }
    for (const row of rows) {
      lines.push(
        `- ${row.ruleId} | n=${row.n} cov=${percent(row.coverage)} hit=${row.hit}/${row.total} ` +
          `(${percent(row.hitRate)}) | vsNOVA ${signedPct(row.liftVsNova)} | vsHISTORY ${signedPct(row.liftVsHistory)}${
            row.unstable ? " [unstable]" : ""
          }`,
      );
      lines.push(
        `  family=${row.ruleFamily} | tags=${row.tags.join(",") || "-"}${
          isFiniteNumber(row.balanceScore) ? ` | balance=${row.balanceScore.toFixed(3)}` : ""
        }`,
      );
      if (isFiniteNumber(row.disagreeRowsCovered)) {
        lines.push(
          `  disagree_rows: covered=${row.disagreeRowsCovered} usingNOVA=${row.disagreeRowsUsingNOVA ?? 0} usingHISTORY=${
            row.disagreeRowsUsingHISTORY ?? 0
          }`,
        );
      }
      lines.push(`  ${row.rule}`);
    }
    lines.push("");
  };

  renderCandidateSection("Top strategy candidates:", report.shortlist.strategy);
  renderCandidateSection("Top filter candidates:", report.shortlist.filter);
  const logisticShortStrategy = report.strategyCandidates
    .filter(
      (row) =>
        row.tags.includes("logistic") &&
        (row.hitRate > row.novaHitRateOnSameGroup || row.hitRate > row.historyHitRateOnSameGroup),
    )
    .slice(0, report.config.topK);
  const logisticShortFilter = report.filterCandidates
    .filter(
      (row) =>
        row.tags.includes("logistic") &&
        (row.hitRate > row.novaHitRateOnSameGroup || row.hitRate > row.historyHitRateOnSameGroup),
    )
    .slice(0, report.config.topK);
  renderCandidateSection("Top logistic-linked strategy candidates:", logisticShortStrategy);
  renderCandidateSection("Top logistic-linked filter candidates:", logisticShortFilter);
  return `${lines.join("\n")}\n`;
}

function signedPct(value: number): string {
  const pct = (value * 100).toFixed(1);
  return `${value >= 0 ? "+" : ""}${pct}pp`;
}

export function formatThresholdMarkdown(report: ThresholdAnalysisReport): string {
  const lines: string[] = [];
  lines.push("# NOVA + HISTORY Threshold Analysis");
  if (report.config.joinedFile) lines.push(`- Joined file: \`${report.config.joinedFile}\``);
  lines.push(`- Rows: ${report.dataset.usableRows}`);
  lines.push(`- Min bucket: ${report.config.minBucketSize}`);
  lines.push("");
  lines.push("## Baseline");
  lines.push(`- NOVA: ${rateBlockText(report.baseline.nova)}`);
  lines.push(`- HISTORY: ${rateBlockText(report.baseline.history)}`);
  lines.push(
    `- AGREE (n=${report.baseline.agree.total}) common: ${rateBlockText(report.baseline.agree.common)}`,
  );
  lines.push(
    `- DISAGREE (n=${report.baseline.disagree.total}) NOVA: ${rateBlockText(report.baseline.disagree.nova)} / HISTORY: ${rateBlockText(report.baseline.disagree.history)}`,
  );
  lines.push("");
  lines.push("## Top Strategy Candidates");
  lines.push("| rule_id | family | tags | n | coverage | hitRate | vs NOVA | vs HISTORY | rule |");
  lines.push("|---|---|---|---:|---:|---:|---:|---:|---|");
  for (const row of report.shortlist.strategy) {
    lines.push(
      `| ${row.ruleId} | ${row.ruleFamily} | ${(row.tags.join(",") || "-").replace(/\|/g, "\\|")} | ${row.n} | ${(row.coverage * 100).toFixed(1)}% | ${(row.hitRate * 100).toFixed(1)}% | ${signedPct(row.liftVsNova)} | ${signedPct(row.liftVsHistory)} | ${row.rule.replace(/\|/g, "\\|")} |`,
    );
  }
  lines.push("");
  lines.push("## Top Filter Candidates");
  lines.push("| rule_id | family | tags | n | coverage | hitRate | vs NOVA | vs HISTORY | balance | rule |");
  lines.push("|---|---|---|---:|---:|---:|---:|---:|---:|---|");
  for (const row of report.shortlist.filter) {
    lines.push(
      `| ${row.ruleId} | ${row.ruleFamily} | ${(row.tags.join(",") || "-").replace(/\|/g, "\\|")} | ${row.n} | ${(row.coverage * 100).toFixed(1)}% | ${(row.hitRate * 100).toFixed(1)}% | ${signedPct(row.liftVsNova)} | ${signedPct(row.liftVsHistory)} | ${
        isFiniteNumber(row.balanceScore) ? row.balanceScore.toFixed(3) : "-"
      } | ${row.rule.replace(/\|/g, "\\|")} |`,
    );
  }
  lines.push("");
  const logisticShortStrategy = report.strategyCandidates
    .filter(
      (row) =>
        row.tags.includes("logistic") &&
        (row.hitRate > row.novaHitRateOnSameGroup || row.hitRate > row.historyHitRateOnSameGroup),
    )
    .slice(0, report.config.topK);
  const logisticShortFilter = report.filterCandidates
    .filter(
      (row) =>
        row.tags.includes("logistic") &&
        (row.hitRate > row.novaHitRateOnSameGroup || row.hitRate > row.historyHitRateOnSameGroup),
    )
    .slice(0, report.config.topK);
  lines.push("## Top Logistic-linked Strategy Candidates");
  lines.push("| rule_id | n | coverage | hitRate | vs NOVA | rule |");
  lines.push("|---|---:|---:|---:|---:|---|");
  for (const row of logisticShortStrategy) {
    lines.push(
      `| ${row.ruleId} | ${row.n} | ${(row.coverage * 100).toFixed(1)}% | ${(row.hitRate * 100).toFixed(1)}% | ${signedPct(row.liftVsNova)} | ${row.rule.replace(/\|/g, "\\|")} |`,
    );
  }
  lines.push("");
  lines.push("## Top Logistic-linked Filter Candidates");
  lines.push("| rule_id | n | coverage | hitRate | vs NOVA | balance | rule |");
  lines.push("|---|---:|---:|---:|---:|---:|---|");
  for (const row of logisticShortFilter) {
    lines.push(
      `| ${row.ruleId} | ${row.n} | ${(row.coverage * 100).toFixed(1)}% | ${(row.hitRate * 100).toFixed(1)}% | ${signedPct(row.liftVsNova)} | ${
        isFiniteNumber(row.balanceScore) ? row.balanceScore.toFixed(3) : "-"
      } | ${row.rule.replace(/\|/g, "\\|")} |`,
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const joinedFile = (readArg(argv, "joined-file") || "").trim();
  if (!joinedFile) {
    throw new Error("--joined-file is required");
  }
  const minBucketSize = readIntArg(argv, "min-bucket-size") ?? DEFAULT_MIN_BUCKET_SIZE;
  const topK = readIntArg(argv, "top-k") ?? DEFAULT_TOP_K;
  const includeConfidence = readBoolFlag(argv, "include-confidence", DEFAULT_INCLUDE_CONFIDENCE);
  const includeSpread = readBoolFlag(argv, "include-spread", DEFAULT_INCLUDE_SPREAD);
  const reportJsonPath = readArg(argv, "report-json");
  const reportMdPath = readArg(argv, "report-md");
  if (minBucketSize <= 0) throw new Error("--min-bucket-size must be > 0");
  if (topK <= 0) throw new Error("--top-k must be > 0");

  const raw = JSON.parse(await readFile(joinedFile, "utf8")) as unknown[];
  const rows = toThresholdRows(raw);
  const report = analyzeNOVAHistoryThresholds(rows, {
    minBucketSize,
    topK,
    includeConfidence,
    includeSpread,
    joinedFile,
  });
  report.dataset.totalRawRows = Array.isArray(raw) ? raw.length : 0;
  report.dataset.usableRows = rows.length;
  report.dataset.droppedRows = Math.max(0, report.dataset.totalRawRows - report.dataset.usableRows);

  if (reportJsonPath) {
    await writeFile(reportJsonPath, JSON.stringify(report, null, 2), "utf8");
  }
  if (reportMdPath) {
    await writeFile(reportMdPath, formatThresholdMarkdown(report), "utf8");
  }
  process.stdout.write(formatThresholdReport(report));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const msg = error instanceof Error ? error.stack || error.message : String(error);
    process.stderr.write(`${msg}\n`);
    process.exit(1);
  });
}
