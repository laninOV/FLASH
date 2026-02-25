import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeNOVAHistoryThresholds,
  toThresholdRows,
  type ThresholdJoinedRow,
} from "../scripts/validation/novaHistoryThresholds.js";

function makeRawRow(overrides: Partial<ThresholdJoinedRow>): ThresholdJoinedRow {
  return {
    matchUrl: "https://x/match/1",
    label: "A vs B",
    actualWinnerName: "A",
    historyPick: "A",
    novaPick: "A",
    historyCorrect: true,
    novaCorrect: true,
    novaP1: 58,
    logRegP1: 57,
    markovP1: 56,
    bradleyP1: 59,
    pcaP1: 80,
    mainConfidence: 0.62,
    ...overrides,
  };
}

test("toThresholdRows derives novaMargin agreement and secondary metrics", () => {
  const rows = toThresholdRows([
    makeRawRow({
      historyPick: "Smith J.",
      novaPick: "Smith J",
      agreementHN: undefined,
      novaMargin: undefined,
      modelSpreadCore: undefined,
      pcaDeviation: undefined,
      novaP1: 63,
      logRegP1: 60,
      markovP1: 58,
      bradleyP1: 62,
      pcaP1: 90,
      mainConfidence: 0.67,
      confidencePct: undefined,
    }),
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.agreementHN, true);
  assert.equal(rows[0]!.novaMargin, 13);
  assert.equal(rows[0]!.confidencePct, 67);
  assert.equal(rows[0]!.logisticPick, "A");
  assert.equal(rows[0]!.logisticMargin, 10);
  assert.equal(rows[0]!.novaLogisticAgree, true);
  assert.equal(rows[0]!.modelSpreadCore, 32);
  assert.equal(rows[0]!.pcaDeviation, 30);
});

test("toThresholdRows computes logistic disagreement and neutral handling", () => {
  const rows = toThresholdRows([
    makeRawRow({
      novaP1: 62,
      logRegP1: 46,
    }),
    makeRawRow({
      matchUrl: "https://x/match/2",
      novaP1: 62,
      logRegP1: 50,
    }),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.logisticPick, "B");
  assert.equal(rows[0]!.logisticMargin, 4);
  assert.equal(rows[0]!.novaLogisticAgree, false);
  assert.equal(rows[1]!.logisticPick, "neutral");
  assert.equal(rows[1]!.novaLogisticAgree, false);
});

function syntheticThresholdRows() {
  const raw: ThresholdJoinedRow[] = [];
  for (let i = 0; i < 4; i += 1) {
    raw.push(
      makeRawRow({
        matchUrl: `https://x/agree/${i}`,
        label: `Agree ${i}`,
        historyPick: "A",
        novaPick: "A",
        historyCorrect: true,
        novaCorrect: true,
        novaP1: 57,
      }),
    );
  }
  for (let i = 0; i < 3; i += 1) {
    raw.push(
      makeRawRow({
        matchUrl: `https://x/dis-hi/${i}`,
        label: `DisagreeHigh ${i}`,
        historyPick: "A",
        novaPick: "B",
        historyCorrect: false,
        novaCorrect: true,
        novaP1: 66,
      }),
    );
  }
  for (let i = 0; i < 3; i += 1) {
    raw.push(
      makeRawRow({
        matchUrl: `https://x/dis-lo/${i}`,
        label: `DisagreeLow ${i}`,
        historyPick: "A",
        novaPick: "B",
        historyCorrect: true,
        novaCorrect: false,
        novaP1: 54,
      }),
    );
  }
  return toThresholdRows(raw);
}

test("chooser rule on disagreement threshold can beat both baselines", () => {
  const rows = syntheticThresholdRows();
  const report = analyzeNOVAHistoryThresholds(rows, {
    minBucketSize: 8,
    topK: 20,
    includeConfidence: false,
    includeSpread: false,
  });

  assert.equal(report.baseline.nova.hit, 7);
  assert.equal(report.baseline.history.hit, 7);
  const chooser = report.strategyCandidates.find((c) => c.ruleId === "chooser_disagree_nova_ge_10_else_history");
  assert.ok(chooser);
  assert.equal(chooser.hit, 10);
  assert.equal(chooser.total, 10);
  assert.equal(chooser.hitRate, 1);
  assert.ok(Math.abs(chooser.liftVsNova - 0.3) < 1e-9);
  assert.ok(Math.abs(chooser.liftVsHistory - 0.3) < 1e-9);
});

test("filter candidates compare against same subgroup baselines", () => {
  const rows = syntheticThresholdRows();
  const report = analyzeNOVAHistoryThresholds(rows, {
    minBucketSize: 1,
    topK: 20,
    includeConfidence: false,
    includeSpread: false,
  });

  const filter = report.filterCandidates.find((c) => c.ruleId === "send_disagree_novaMargin_lt_10_pick_history");
  assert.ok(filter);
  assert.equal(filter.n, 3);
  assert.equal(filter.hitRate, 1);
  assert.equal(filter.novaHitRateOnSameGroup, 0);
  assert.equal(filter.historyHitRateOnSameGroup, 1);
  assert.equal(filter.liftVsNova, 1);
  assert.equal(filter.liftVsHistory, 0);
});

test("min bucket size filters out small candidates from shortlist", () => {
  const rows = syntheticThresholdRows();
  const report = analyzeNOVAHistoryThresholds(rows, {
    minBucketSize: 11,
    topK: 20,
    includeConfidence: false,
    includeSpread: false,
  });

  assert.equal(report.shortlist.strategy.length, 0);
  assert.equal(report.shortlist.filter.length, 0);
});

test("logistic+confidence chooser rule can switch to history when confirmation is weak", () => {
  const rows = toThresholdRows([
    makeRawRow({
      matchUrl: "https://x/1",
      historyPick: "A",
      novaPick: "B",
      historyCorrect: true,
      novaCorrect: false,
      novaP1: 54,
      logRegP1: 53,
      mainConfidence: 0.49,
    }),
    makeRawRow({
      matchUrl: "https://x/2",
      historyPick: "A",
      novaPick: "B",
      historyCorrect: false,
      novaCorrect: true,
      novaP1: 58,
      logRegP1: 58,
      mainConfidence: 0.62,
    }),
    makeRawRow({
      matchUrl: "https://x/3",
      historyPick: "A",
      novaPick: "A",
      historyCorrect: true,
      novaCorrect: true,
      novaP1: 61,
      logRegP1: 62,
      mainConfidence: 0.7,
    }),
    makeRawRow({
      matchUrl: "https://x/4",
      historyPick: "A",
      novaPick: "A",
      historyCorrect: false,
      novaCorrect: false,
      novaP1: 60,
      logRegP1: 61,
      mainConfidence: 0.7,
    }),
    makeRawRow({
      matchUrl: "https://x/5",
      historyPick: "A",
      novaPick: "B",
      historyCorrect: false,
      novaCorrect: true,
      novaP1: 60,
      logRegP1: 49,
      mainConfidence: 0.7,
    }),
    makeRawRow({
      matchUrl: "https://x/6",
      historyPick: "A",
      novaPick: "B",
      historyCorrect: true,
      novaCorrect: false,
      novaP1: 56,
      logRegP1: 45,
      mainConfidence: 0.7,
    }),
    makeRawRow({
      matchUrl: "https://x/7",
      historyPick: "A",
      novaPick: "B",
      historyCorrect: false,
      novaCorrect: true,
      novaP1: 67,
      logRegP1: 64,
      mainConfidence: 0.75,
    }),
    makeRawRow({
      matchUrl: "https://x/8",
      historyPick: "A",
      novaPick: "B",
      historyCorrect: true,
      novaCorrect: false,
      novaP1: 63,
      logRegP1: 52,
      mainConfidence: 0.52,
    }),
  ]);

  const report = analyzeNOVAHistoryThresholds(rows, {
    minBucketSize: 1,
    topK: 200,
    includeConfidence: true,
    includeSpread: false,
  });

  const chooser = report.strategyCandidates.find(
    (c) =>
      c.ruleId === "chooser_disagree_novaLogitAgree_nova_ge_6_logit_ge_2_conf_ge_50_else_history",
  );
  assert.ok(chooser);
  assert.equal(chooser.ruleFamily, "chooser_nova_logit_conf_full_disagree");
  assert.ok(chooser.tags.includes("logistic"));
  assert.equal(chooser.disagreeRowsCovered, 6);
  assert.equal(chooser.disagreeRowsUsingNOVA, 3);
  assert.equal(chooser.disagreeRowsUsingHISTORY, 3);
});

test("logistic-linked filter exposes balanceScore and tags", () => {
  const rows = syntheticThresholdRows().map((row, idx) => ({
    ...row,
    logRegP1: idx % 2 === 0 ? 58 : 44,
    logisticPick: idx % 2 === 0 ? ("A" as const) : ("B" as const),
    logisticMargin: idx % 2 === 0 ? 8 : 6,
    novaLogisticAgree: idx % 2 === 0,
    confidencePct: 62,
  }));

  const report = analyzeNOVAHistoryThresholds(rows, {
    minBucketSize: 1,
    topK: 200,
    includeConfidence: true,
    includeSpread: false,
  });

  const filter = report.filterCandidates.find(
    (c) => c.ruleId === "send_disagree_novaLogisticAgree_logit_ge_6_conf_ge_50_pick_nova",
  );
  assert.ok(filter);
  assert.equal(filter.ruleType, "filter");
  assert.ok(filter.tags.includes("logistic"));
  assert.equal(filter.ruleFamily, "filter_disagree_logit_conf");
  assert.ok(typeof filter.balanceScore === "number");
});
