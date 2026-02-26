import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeCheckmarkCalibrationStudy,
  buildCheckmarkStudyRows,
  evaluateCheckmarkRule,
  isCurrentBaselineCheckmarked,
  type CheckmarkStudyRow,
} from "../scripts/validation/checkmarkCalibrationStudy.js";

function makePrediction(overrides: Record<string, unknown> = {}) {
  return {
    matchUrl: "https://www.flashscore.co.ke/match/tennis/a-b/c-d/?mid=ABC123",
    matchLabel: "A vs B",
    playerAName: "A",
    playerBName: "B",
    predictedWinner: "A",
    confidence: 0.56,
    modelSummary: {
      dirt: {
        modelProbabilities: {
          logRegP1: 54,
          markovP1: 50,
          bradleyP1: 50,
          pcaP1: 72,
        },
      },
      novaEdge: {
        p1: 42,
      },
    },
    ...overrides,
  };
}

function makeJoined(overrides: Record<string, unknown> = {}) {
  return {
    matchUrl: "https://www.flashscore.co.ke/match/tennis/a-b/c-d?mid=ABC123",
    label: "A vs B",
    actualWinnerName: "A",
    winnerName: "A",
    mainPick: "B",
    historyPick: "A",
    novaPick: "B",
    mainCorrect: false,
    confidencePct: 50,
    logRegP1: 54,
    markovP1: 50,
    bradleyP1: 50,
    pcaP1: 72,
    novaP1: 42,
    modelSpreadCore: 22,
    pcaDeviation: 18,
    ...overrides,
  };
}

test("buildCheckmarkStudyRows restores formatter-style agreement and BT coherence", () => {
  const result = buildCheckmarkStudyRows(
    [makeJoined({ mainPick: "B", historyPick: "A", novaPick: "B", bradleyP1: 58, novaP1: 42 })],
    [makePrediction({ predictedWinner: "B", modelSummary: { dirt: { modelProbabilities: { logRegP1: 54, markovP1: 50, bradleyP1: 58, pcaP1: 72 } }, novaEdge: { p1: 42 } } })],
  );

  assert.equal(result.rows.length, 1);
  const row = result.rows[0]!;
  assert.equal(row.agreementText, "1/5");
  assert.equal(row.methodsCount, 5);
  assert.equal(row.agreementCount, 1);
  assert.equal(row.historyNovaSame, false);
  assert.equal(row.bradleyMargin, 8);
  assert.equal(row.novaMargin, 8);
  assert.equal(row.novaBtAgree, false);
});

test("current baseline checkmark rule matches runtime semantics", () => {
  const good: CheckmarkStudyRow = {
    matchUrl: "u1",
    label: "A vs B",
    mainPick: "A",
    historyPick: "A",
    novaPick: "A",
    mainCorrect: true,
    confidencePct: 50.1,
    methodsCount: 5,
    agreementCount: 4,
    agreementRatio: 0.8,
    agreementText: "4/5",
    historyNovaSame: true,
    novaBtAgree: true,
  };
  assert.equal(isCurrentBaselineCheckmarked(good), true);
  assert.equal(isCurrentBaselineCheckmarked({ ...good, confidencePct: 50 }), false);
  assert.equal(isCurrentBaselineCheckmarked({ ...good, agreementCount: 3, agreementText: "3/5" }), false);
  assert.equal(isCurrentBaselineCheckmarked({ ...good, historyNovaSame: false }), false);
});

test("evaluateCheckmarkRule computes precision and coverage", () => {
  const rows: CheckmarkStudyRow[] = [
    {
      matchUrl: "1",
      label: "A vs B",
      mainPick: "A",
      mainCorrect: true,
      confidencePct: 56,
      methodsCount: 5,
      agreementCount: 5,
      agreementRatio: 1,
      agreementText: "5/5",
      historyPick: "A",
      novaPick: "A",
      historyNovaSame: true,
      novaBtAgree: true,
    },
    {
      matchUrl: "2",
      label: "C vs D",
      mainPick: "C",
      mainCorrect: false,
      confidencePct: 57,
      methodsCount: 5,
      agreementCount: 4,
      agreementRatio: 0.8,
      agreementText: "4/5",
      historyPick: "C",
      novaPick: "C",
      historyNovaSame: true,
      novaBtAgree: false,
    },
  ];

  const metrics = evaluateCheckmarkRule(rows, (row) => row.historyNovaSame && row.novaBtAgree);
  assert.equal(metrics.total, 2);
  assert.equal(metrics.nCheckmarked, 1);
  assert.equal(metrics.hit, 1);
  assert.equal(metrics.hitRate, 1);
  assert.equal(metrics.coverage, 0.5);
});

function mkRow(i: number, overrides: Partial<CheckmarkStudyRow> = {}): CheckmarkStudyRow {
  return {
    matchUrl: `https://x/m/${i}`,
    label: `M${i}`,
    mainPick: "A",
    mainCorrect: true,
    confidencePct: 58,
    methodsCount: 5,
    agreementCount: 5,
    agreementRatio: 1,
    agreementText: "5/5",
    historyPick: "A",
    novaPick: "A",
    historyNovaSame: true,
    logRegP1: 58,
    markovP1: 57,
    bradleyP1: 61,
    pcaP1: 64,
    novaP1: 59,
    novaMargin: 9,
    bradleyMargin: 11,
    modelSpreadCore: 12,
    pcaDeviation: 5,
    novaPickSide: "home",
    btPick: "home",
    novaBtAgree: true,
    ...overrides,
  };
}

test("analysis can find candidate that improves baseline precision via BT/spread gate", () => {
  const train: CheckmarkStudyRow[] = [];
  const valid: CheckmarkStudyRow[] = [];

  for (let i = 0; i < 12; i += 1) {
    train.push(mkRow(i));
    valid.push(mkRow(i));
  }
  // false-positive baseline rows with BT disagreement / high spread
  for (let i = 12; i < 20; i += 1) {
    train.push(mkRow(i, {
      mainCorrect: false,
      bradleyP1: 42,
      bradleyMargin: 8,
      btPick: "away",
      novaBtAgree: false,
      modelSpreadCore: 40,
      pcaDeviation: 30,
      agreementCount: 4,
      agreementRatio: 0.8,
      agreementText: "4/5",
      confidencePct: 56,
    }));
    valid.push(mkRow(i, {
      mainCorrect: false,
      bradleyP1: 42,
      bradleyMargin: 8,
      btPick: "away",
      novaBtAgree: false,
      modelSpreadCore: 40,
      pcaDeviation: 30,
      agreementCount: 4,
      agreementRatio: 0.8,
      agreementText: "4/5",
      confidencePct: 56,
    }));
  }

  const report = analyzeCheckmarkCalibrationStudy(train, valid, {
    topK: 50,
    minCheckmarked: 8,
  });

  assert.equal(report.valid.currentCheckmarkBaseline.nCheckmarked, 20);
  assert.equal(report.valid.currentCheckmarkBaseline.hitRate, 0.6);
  assert.ok(report.candidates.length > 0);
  const btCandidate = report.candidates.find((c) => c.ruleId === "bt_confirm_only");
  assert.ok(btCandidate);
  assert.equal(btCandidate!.valid.nCheckmarked, 12);
  assert.equal(btCandidate!.valid.hitRate, 1);
  assert.ok(btCandidate!.deltaVsBaselineCheckmarkPrecision > 0);
  assert.ok(report.recommendations.best);
});

test("analysis handles empty shortlist without NaN", () => {
  const train = [mkRow(1), mkRow(2, { mainCorrect: false })];
  const valid = [mkRow(3), mkRow(4, { mainCorrect: false })];
  const report = analyzeCheckmarkCalibrationStudy(train, valid, {
    topK: 10,
    minCheckmarked: 50,
    skipBt: true,
    skipSpread: true,
  });

  assert.equal(report.recommendations.best, undefined);
  assert.ok(Number.isNaN(report.valid.currentCheckmarkBaseline.hitRate) === false);
});
