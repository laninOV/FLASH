import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { buildSignalReliabilityRows, canonicalizeMatchUrl } from "./agreementConfidenceStudy.js";
import { computeStateDecision } from "../../src/predict/stateDecision.js";

interface StudyConfig {
  joinedFile: string;
  predictionsFile: string;
  reportJson?: string;
  liftTargetPp: number;
}

interface SideMetrics {
  hit: number;
  total: number;
  coverage: number;
  hitRate: number;
}

interface StudyReport {
  config: StudyConfig;
  rowsTotal: number;
  rowsUsable: number;
  baseline: SideMetrics;
  v2: SideMetrics;
  liftPp: number;
  passesLiftTarget: boolean;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readArg(argv: string[], name: string): string | undefined {
  const key = `--${name}`;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== key) {
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      return undefined;
    }
    return value;
  }
  return undefined;
}

function normalizeLoose(value: string | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/giu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function toSide(
  winnerName: string | undefined,
  playerAName: string,
  playerBName: string,
): "A" | "B" | undefined {
  const winner = normalizeLoose(winnerName);
  if (!winner) {
    return undefined;
  }
  const a = normalizeLoose(playerAName);
  const b = normalizeLoose(playerBName);
  if (winner === a) {
    return "A";
  }
  if (winner === b) {
    return "B";
  }
  return undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveAvailabilityWeight(hasWindow: boolean | undefined, degraded: boolean | undefined): number {
  if (hasWindow !== true) {
    return 0;
  }
  if (degraded === true) {
    return 0.75;
  }
  return 1;
}

function computeBaselineMetricScore(
  series: { w10?: number; w5?: number; w3?: number } | undefined,
  availability: { w10: number; w5: number; w3: number },
): number | undefined {
  if (!series) {
    return undefined;
  }
  const entries = [
    { value: series.w10, weight: 0.25 * availability.w10 },
    { value: series.w5, weight: 0.35 * availability.w5 },
    { value: series.w3, weight: 0.4 * availability.w3 },
  ];
  let sum = 0;
  let sumW = 0;
  for (const entry of entries) {
    if (!isFiniteNumber(entry.value) || entry.weight <= 0) {
      continue;
    }
    sum += entry.value * entry.weight;
    sumW += entry.weight;
  }
  if (sumW <= 0) {
    return undefined;
  }
  const base = sum / sumW;
  let trendBonus = 0;
  if (isFiniteNumber(series.w10) && isFiniteNumber(series.w3)) {
    trendBonus = clamp((series.w3 - series.w10) / 25, -1, 1) * 4;
  } else if (isFiniteNumber(series.w5) && isFiniteNumber(series.w3)) {
    trendBonus = clamp((series.w3 - series.w5) / 20, -1, 1) * 3;
  }
  return clamp(base + trendBonus, 0, 100);
}

function computeBaselineSideScore(side: any): { score?: number; reliability: number } {
  const availability = {
    w10: resolveAvailabilityWeight(side?.hasW10, side?.degradedW10),
    w5: resolveAvailabilityWeight(side?.hasW5, side?.degradedW5),
    w3: resolveAvailabilityWeight(side?.hasW3, side?.degradedW3),
  };
  const windowReliability = 0.25 * availability.w10 + 0.35 * availability.w5 + 0.4 * availability.w3;
  const nTechReliability = clamp((Number(side?.nTech) || 0) / 10, 0, 1);
  const reliability = clamp(0.5 * windowReliability + 0.5 * nTechReliability, 0, 1);

  const stability = computeBaselineMetricScore(side?.stability, availability);
  const formTech = computeBaselineMetricScore(side?.formTech, availability);
  const formPlus = computeBaselineMetricScore(side?.formPlus, availability);
  const strength = computeBaselineMetricScore(side?.strength, availability);
  const weighted = [
    { value: stability, weight: 0.3 },
    { value: formTech, weight: 0.25 },
    { value: formPlus, weight: 0.3 },
    { value: strength, weight: 0.15 },
  ];
  let sum = 0;
  let sumW = 0;
  for (const item of weighted) {
    if (!isFiniteNumber(item.value)) {
      continue;
    }
    sum += item.value * item.weight;
    sumW += item.weight;
  }
  if (sumW <= 0) {
    return { reliability };
  }
  return { score: sum / sumW, reliability };
}

function computeBaselineWinner(
  playerState: any,
  playerAName: string,
  playerBName: string,
): string | undefined {
  const sideA = computeBaselineSideScore(playerState?.playerA);
  const sideB = computeBaselineSideScore(playerState?.playerB);
  if (!isFiniteNumber(sideA.score) || !isFiniteNumber(sideB.score)) {
    return undefined;
  }
  const diff = sideA.score - sideB.score;
  const rawP1 = clamp(50 + 24 * Math.tanh(diff / 14), 0, 100);
  const reliability = clamp(Math.min(sideA.reliability, sideB.reliability), 0, 1);
  const p1 = clamp(50 + (rawP1 - 50) * (0.35 + 0.65 * reliability), 0, 100);
  if (p1 > 50) {
    return playerAName;
  }
  if (p1 < 50) {
    return playerBName;
  }
  return undefined;
}

function computeV2Winner(
  prediction: any,
  playerAName: string,
  playerBName: string,
): string | undefined {
  const stateDecisionWinner = prediction?.modelSummary?.stateDecision?.winner;
  if (typeof stateDecisionWinner === "string" && stateDecisionWinner.trim()) {
    return stateDecisionWinner;
  }
  const state = prediction?.modelSummary?.playerState;
  if (!state?.playerA || !state?.playerB) {
    return undefined;
  }
  return computeStateDecision({
    playerAName,
    playerBName,
    playerA: state.playerA,
    playerB: state.playerB,
  }).winner;
}

function ratio(hit: number, total: number): number {
  return total > 0 ? hit / total : 0;
}

function toMetrics(hit: number, total: number, rowsUsable: number): SideMetrics {
  return {
    hit,
    total,
    coverage: ratio(total, rowsUsable),
    hitRate: ratio(hit, total),
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const joinedFile = readArg(argv, "joined-file");
  const predictionsFile = readArg(argv, "predictions-file");
  if (!joinedFile || !predictionsFile) {
    throw new Error("Usage: --joined-file <path> --predictions-file <path> [--report-json <path>]");
  }
  const reportJson = readArg(argv, "report-json");
  const config: StudyConfig = {
    joinedFile,
    predictionsFile,
    reportJson,
    liftTargetPp: 2,
  };

  const joinedRaw = JSON.parse(await readFile(joinedFile, "utf-8"));
  const predictionsRaw = JSON.parse(await readFile(predictionsFile, "utf-8"));
  const built = buildSignalReliabilityRows(joinedRaw, predictionsRaw);

  const predictionByUrl = new Map<string, any>();
  if (Array.isArray(predictionsRaw)) {
    for (const row of predictionsRaw) {
      const canonical = canonicalizeMatchUrl(
        typeof (row as any)?.matchUrl === "string" ? (row as any).matchUrl : undefined,
      );
      if (!canonical || predictionByUrl.has(canonical)) {
        continue;
      }
      predictionByUrl.set(canonical, row);
    }
  }

  let baselineHit = 0;
  let baselineTotal = 0;
  let v2Hit = 0;
  let v2Total = 0;
  let usable = 0;

  for (const row of built.rows) {
    const actualSide = toSide(row.actualWinnerName, row.playerAName, row.playerBName);
    if (!actualSide) {
      continue;
    }
    usable += 1;
    const prediction = predictionByUrl.get(row.matchUrl);
    const baselineWinner = computeBaselineWinner(prediction?.modelSummary?.playerState, row.playerAName, row.playerBName);
    const baselineSide = toSide(baselineWinner, row.playerAName, row.playerBName);
    if (baselineSide) {
      baselineTotal += 1;
      if (baselineSide === actualSide) {
        baselineHit += 1;
      }
    }

    const v2Winner = computeV2Winner(prediction, row.playerAName, row.playerBName);
    const v2Side = toSide(v2Winner, row.playerAName, row.playerBName);
    if (v2Side) {
      v2Total += 1;
      if (v2Side === actualSide) {
        v2Hit += 1;
      }
    }
  }

  const baseline = toMetrics(baselineHit, baselineTotal, usable);
  const v2 = toMetrics(v2Hit, v2Total, usable);
  const liftPp = (v2.hitRate - baseline.hitRate) * 100;
  const report: StudyReport = {
    config,
    rowsTotal: built.rows.length,
    rowsUsable: usable,
    baseline,
    v2,
    liftPp: Math.round(liftPp * 1000) / 1000,
    passesLiftTarget: liftPp >= config.liftTargetPp,
  };

  const json = JSON.stringify(report, null, 2);
  if (reportJson) {
    await writeFile(reportJson, json, "utf-8");
  }
  process.stdout.write(`${json}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
