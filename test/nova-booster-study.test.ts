import test from "node:test";
import assert from "node:assert/strict";

import type { ThresholdJoinedRow } from "../scripts/validation/novaHistoryThresholds.js";
import { toThresholdRows } from "../scripts/validation/novaHistoryThresholds.js";
import {
  analyzeNovaBoosterStudy,
  applyDeterministicBooster,
  computeRiskScoreD1,
  predictBinaryLogit,
  toBoosterRows,
  trainBinaryLogit,
} from "../scripts/validation/novaBoosterStudy.js";

function makeJoined(overrides: Partial<ThresholdJoinedRow & { winnerSide?: "A" | "B"; hybridPick?: string; mahalPick?: string; matchupPick?: string; mroaPick?: string }>): ThresholdJoinedRow & {
  winnerSide: "A" | "B";
  hybridPick: string;
  mahalPick: string;
  matchupPick: string;
  mroaPick: string;
} {
  return {
    matchUrl: "https://x/m1",
    label: "A Player vs B Player",
    actualWinnerName: "A Player",
    winnerSide: "A",
    historyPick: "A Player",
    novaPick: "A Player",
    hybridPick: "A Player",
    mahalPick: "A Player",
    matchupPick: "A Player",
    mroaPick: "A Player",
    historyCorrect: true,
    novaCorrect: true,
    agreementHN: true,
    novaP1: 62,
    novaMargin: 12,
    confidencePct: 68,
    logRegP1: 58,
    markovP1: 57,
    bradleyP1: 59,
    pcaP1: 70,
    modelSpreadCore: 13,
    pcaDeviation: 12,
    ...overrides,
  };
}

test("toBoosterRows derives side features and counts", () => {
  const thresholdRows = toThresholdRows([
    makeJoined({
      novaPick: "B Player",
      historyPick: "A Player",
      hybridPick: "B Player",
      mahalPick: "A Player",
      matchupPick: "B Player",
      mroaPick: "B Player",
      novaCorrect: false,
      historyCorrect: true,
      agreementHN: false,
      novaP1: 46,
      logRegP1: 54,
      markovP1: 48,
      bradleyP1: 47,
      pcaP1: 55,
      winnerSide: "A",
      actualWinnerName: "A Player",
    }),
  ]);

  const rows = toBoosterRows(thresholdRows);
  assert.equal(rows.length, 1);
  const row = rows[0]!;
  assert.equal(row.novaSide, "B");
  assert.equal(row.historySide, "A");
  assert.equal(row.logisticSide, "A");
  assert.equal(row.shadowAgainstNovaCount, 1); // only mahal agrees with A, others B
  assert.equal(row.shadowWithNovaCount, 3);
  assert.ok(Number.isFinite(row.riskScoreD1));
  assert.ok(row.coreAgainstNova >= 1);
  assert.ok(row.coreWithNova >= 1);
});

test("computeRiskScoreD1 stays bounded in [0,1]-ish range", () => {
  const risk = computeRiskScoreD1({
    novaMargin: 1,
    novaLogisticAgree: false,
    logisticMargin: 12,
    confidencePct: 45,
    modelSpreadCore: 60,
    pcaDeviation: 40,
    agreementHN: false,
    shadowAgainstNovaCount: 4,
  });
  assert.ok(risk >= 0);
  assert.ok(risk <= 1.2);
});

test("deterministic booster keeps NOVA on strong clean case and overrides on conflict case", () => {
  const thresholdRows = toThresholdRows([
    makeJoined({
      matchUrl: "https://x/clean",
      label: "A Player vs B Player",
      winnerSide: "A",
      actualWinnerName: "A Player",
      novaPick: "A Player",
      historyPick: "A Player",
      hybridPick: "A Player",
      mahalPick: "A Player",
      matchupPick: "A Player",
      mroaPick: "A Player",
      novaCorrect: true,
      historyCorrect: true,
      agreementHN: true,
      novaP1: 66,
      confidencePct: 74,
      logRegP1: 62,
      markovP1: 61,
      bradleyP1: 63,
      pcaP1: 68,
      modelSpreadCore: 7,
      pcaDeviation: 6,
    }),
    makeJoined({
      matchUrl: "https://x/conflict",
      label: "A Player vs B Player",
      winnerSide: "A",
      actualWinnerName: "A Player",
      novaPick: "B Player",
      historyPick: "A Player",
      hybridPick: "A Player",
      mahalPick: "A Player",
      matchupPick: "A Player",
      mroaPick: "A Player",
      novaCorrect: false,
      historyCorrect: true,
      agreementHN: false,
      novaP1: 47,
      confidencePct: 50,
      logRegP1: 58,
      markovP1: 54,
      bradleyP1: 57,
      pcaP1: 60,
      modelSpreadCore: 13,
      pcaDeviation: 9,
    }),
  ]);
  const rows = toBoosterRows(thresholdRows);
  const decisions = applyDeterministicBooster(rows, 0.35, 0.18);
  const clean = decisions.find((d) => d.matchUrl.endsWith("/clean"))!;
  const conflict = decisions.find((d) => d.matchUrl.endsWith("/conflict"))!;
  assert.equal(clean.overridden, false);
  assert.equal(clean.pick, clean.novaPick);
  assert.equal(conflict.gateOpen, true);
  assert.equal(conflict.overridden, true);
  assert.equal(conflict.pick, "A");
});

test("deterministic booster does not override when side score points to NOVA", () => {
  const thresholdRows = toThresholdRows([
    makeJoined({
      matchUrl: "https://x/no-override",
      winnerSide: "B",
      actualWinnerName: "B Player",
      novaPick: "B Player",
      historyPick: "A Player",
      hybridPick: "B Player",
      mahalPick: "B Player",
      matchupPick: "B Player",
      mroaPick: "B Player",
      novaCorrect: true,
      historyCorrect: false,
      agreementHN: false,
      novaP1: 49,
      confidencePct: 50,
      logRegP1: 48,
      markovP1: 47,
      bradleyP1: 46,
      pcaP1: 45,
      modelSpreadCore: 20,
      pcaDeviation: 14,
    }),
  ]);
  const rows = toBoosterRows(thresholdRows);
  const [decision] = applyDeterministicBooster(rows, 0.2, 0.01);
  assert.ok(decision);
  assert.equal(decision.gateOpen, true);
  assert.equal(decision.overridden, false);
  assert.equal(decision.pick, decision.novaPick);
});

test("trainBinaryLogit converges on toy separable data and is deterministic", () => {
  const samples = [
    { features: { x: -2, y: -1 }, target: 0 as const },
    { features: { x: -1, y: -0.5 }, target: 0 as const },
    { features: { x: 1, y: 0.5 }, target: 1 as const },
    { features: { x: 2, y: 1 }, target: 1 as const },
  ];
  const m1 = trainBinaryLogit(samples, { epochs: 400, learningRate: 0.1, l2Lambda: 0.01 });
  const m2 = trainBinaryLogit(samples, { epochs: 400, learningRate: 0.1, l2Lambda: 0.01 });
  assert.deepEqual(m1.weights, m2.weights);
  const pLow = predictBinaryLogit(m1, { x: -1.5, y: -1 });
  const pHigh = predictBinaryLogit(m1, { x: 1.5, y: 1 });
  assert.ok(pLow < 0.5);
  assert.ok(pHigh > 0.5);
});

test("analyzeNovaBoosterStudy returns deterministic and fitted candidate grids", () => {
  const raw: Array<ThresholdJoinedRow & { winnerSide: "A" | "B"; hybridPick: string; mahalPick: string; matchupPick: string; mroaPick: string }> = [];
  for (let i = 0; i < 12; i += 1) {
    const winnerSide = i % 2 === 0 ? "A" : "B";
    const winnerName = winnerSide === "A" ? "A Player" : "B Player";
    const novaSide = i < 8 ? winnerSide : (winnerSide === "A" ? "B" : "A");
    const novaPick = novaSide === "A" ? "A Player" : "B Player";
    const historyPick = i % 3 === 0 ? (winnerSide === "A" ? "B Player" : "A Player") : (winnerSide === "A" ? "A Player" : "B Player");
    raw.push(
      makeJoined({
        matchUrl: `https://x/${i}`,
        label: "A Player vs B Player",
        winnerSide,
        actualWinnerName: winnerName,
        novaPick,
        historyPick,
        hybridPick: historyPick,
        mahalPick: historyPick,
        matchupPick: historyPick,
        mroaPick: historyPick,
        historyCorrect: historyPick === winnerName,
        novaCorrect: novaPick === winnerName,
        agreementHN: normalizePick(historyPick) === normalizePick(novaPick),
        novaP1: novaSide === "A" ? 58 : 42,
        confidencePct: i < 6 ? 52 : 68,
        logRegP1: historyPick === "A Player" ? 56 : 44,
        markovP1: historyPick === "A Player" ? 54 : 46,
        bradleyP1: historyPick === "A Player" ? 57 : 43,
        pcaP1: historyPick === "A Player" ? 62 : 38,
        modelSpreadCore: 18,
        pcaDeviation: 6,
      }),
    );
  }
  const rows = toBoosterRows(toThresholdRows(raw));
  const report = analyzeNovaBoosterStudy(rows, rows, { topK: 5, minOverrides: 1 });
  assert.equal(report.dataset.trainRows, rows.length);
  assert.ok(report.deterministic);
  assert.ok(report.fitted);
  assert.ok(report.deterministic!.candidates.length > 0);
  assert.ok(report.fitted!.candidates.length > 0);
});

function normalizePick(value: string | undefined): string {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}
