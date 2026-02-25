import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeAgreementConfidenceStudy,
  buildSignalReliabilityRows,
  canonicalizeMatchUrl,
  computeMethodsAgreement,
  evaluateSkipRule,
  pearsonCorrelation,
  spearmanRho,
  type SignalReliabilityRow,
} from "../scripts/validation/agreementConfidenceStudy.js";

test("computeMethodsAgreement matches formatter logic including neutrals in methods", () => {
  const probs = [54, 50, 50, 72, 42];

  const forHome = computeMethodsAgreement("A", "A", "B", probs);
  assert.equal(forHome.methodsCount, 5);
  assert.equal(forHome.agreementCount, 2);
  assert.equal(forHome.agreementText, "2/5");
  assert.equal(forHome.agreementRatio, 0.4);

  const forAway = computeMethodsAgreement("B", "A", "B", probs);
  assert.equal(forAway.methodsCount, 5);
  assert.equal(forAway.agreementCount, 1);
  assert.equal(forAway.agreementText, "1/5");
  assert.equal(forAway.agreementRatio, 0.2);
});

test("buildSignalReliabilityRows joins joined+predictions by canonical matchUrl", () => {
  const joined = [
    {
      matchUrl: "https://www.flashscore.co.ke/match/tennis/a-b/c-d?mid=ABC123",
      label: "A vs B",
      actualWinnerName: "A",
      mainPick: "B",
      mainCorrect: false,
      novaPick: "A",
      novaCorrect: true,
      confidencePct: 50,
      logRegP1: 54,
      markovP1: 50,
      bradleyP1: 50,
      pcaP1: 72,
      novaP1: 42,
    },
  ];
  const predictions = [
    {
      matchUrl: "https://www.flashscore.co.ke/match/tennis/a-b/c-d/?mid=ABC123",
      playerAName: "A",
      playerBName: "B",
      predictedWinner: "B",
      confidence: 0.5,
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
    },
  ];

  const result = buildSignalReliabilityRows(joined, predictions);
  assert.equal(result.rows.length, 1);
  assert.equal(result.datasetSummary.joinedWithoutPrediction, 0);
  assert.equal(result.rows[0]!.matchUrl, canonicalizeMatchUrl(joined[0]!.matchUrl));
  assert.equal(result.rows[0]!.methodsCount, 5);
  assert.equal(result.rows[0]!.agreementText, "1/5");
  assert.equal(result.rows[0]!.agreementCount, 1);
  assert.equal(result.rows[0]!.lowConfidence50, true);
  assert.equal(result.rows[0]!.lowAgreement1, true);
});

function makeRow(
  overrides: Partial<SignalReliabilityRow>,
): SignalReliabilityRow {
  return {
    matchUrl: "https://x/match/1",
    label: "A vs B",
    actualWinnerName: "A",
    playerAName: "A",
    playerBName: "B",
    mainPick: "A",
    mainCorrect: true,
    mainWrong: false,
    novaPick: "A",
    novaCorrect: true,
    novaWrong: false,
    confidencePct: 60,
    methodsCount: 5,
    agreementCount: 4,
    agreementRatio: 0.8,
    agreementText: "4/5",
    logRegP1: 60,
    markovP1: 58,
    bradleyP1: 57,
    pcaP1: 70,
    novaP1: 62,
    logisticMargin: 10,
    novaMargin: 12,
    lowConfidence50: false,
    lowAgreement1: false,
    lowAgreement2: false,
    ...overrides,
  };
}

test("analyzeAgreementConfidenceStudy builds confidence bins and Agreement x Confidence matrix", () => {
  const rows = [
    makeRow({
      matchUrl: "1",
      mainCorrect: false,
      mainWrong: true,
      confidencePct: 50,
      agreementCount: 1,
      agreementRatio: 0.2,
      agreementText: "1/5",
      lowConfidence50: true,
      lowAgreement1: true,
      lowAgreement2: true,
    }),
    makeRow({
      matchUrl: "2",
      confidencePct: 57,
      agreementCount: 2,
      agreementRatio: 0.4,
      agreementText: "2/5",
      lowAgreement2: true,
    }),
    makeRow({
      matchUrl: "3",
      confidencePct: 63,
      agreementCount: 3,
      agreementRatio: 0.6,
      agreementText: "3/5",
    }),
    makeRow({
      matchUrl: "4",
      confidencePct: 72,
      agreementCount: 5,
      agreementRatio: 1,
      agreementText: "5/5",
    }),
  ];

  const report = analyzeAgreementConfidenceStudy(rows, rows, {
    minBucketSize: 1,
    topK: 10,
    skipSecondary: true,
  });

  const conf50 = report.valid.confidenceAccuracy.find((r) => r.label === "<=50");
  assert.ok(conf50);
  assert.equal(conf50.n, 1);

  const matrixRow = report.valid.agreementConfidenceMatrix.find((r) => r.agreementGroup === "<=1");
  assert.ok(matrixRow);
  const matrixCell = matrixRow!.cells.find((c) => c.confidenceGroup === "<=50");
  assert.ok(matrixCell);
  assert.equal(matrixCell!.n, 1);
  assert.equal(report.hypothesis.rule, "skip if agreementCount <= 1 && confidencePct <= 50");
});

test("evaluateSkipRule computes kept/skipped quality correctly", () => {
  const rows = [
    makeRow({ matchUrl: "1", mainCorrect: false, mainWrong: true, agreementCount: 1, confidencePct: 50, agreementRatio: 0.2, agreementText: "1/5", lowConfidence50: true, lowAgreement1: true, lowAgreement2: true }),
    makeRow({ matchUrl: "2", mainCorrect: false, mainWrong: true, agreementCount: 1, confidencePct: 49, agreementRatio: 0.2, agreementText: "1/5", lowConfidence50: true, lowAgreement1: true, lowAgreement2: true }),
    makeRow({ matchUrl: "3", mainCorrect: true, mainWrong: false, agreementCount: 4, confidencePct: 60, agreementRatio: 0.8, agreementText: "4/5" }),
    makeRow({ matchUrl: "4", mainCorrect: true, mainWrong: false, agreementCount: 5, confidencePct: 68, agreementRatio: 1, agreementText: "5/5" }),
  ];

  const metrics = evaluateSkipRule(rows, (row) => row.agreementCount <= 1 && row.confidencePct <= 50);
  assert.equal(metrics.total, 4);
  assert.equal(metrics.skipped, 2);
  assert.equal(metrics.kept, 2);
  assert.equal(metrics.skippedHitRate, 0);
  assert.equal(metrics.keptHitRate, 1);
  assert.equal(metrics.mainOverallHitRate, 0.5);
  assert.equal(metrics.deltaKeptVsMain, 0.5);
});

test("correlation helpers do not return NaN on flat inputs", () => {
  const p = pearsonCorrelation([1, 1, 1], [0, 1, 0]);
  const s = spearmanRho([2, 2, 2], [0, 1, 1]);
  assert.equal(Number.isNaN(p), false);
  assert.equal(Number.isNaN(s), false);
  assert.equal(p, 0);
  assert.equal(s, 0);
});

