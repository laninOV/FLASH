import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  combineOpponentStrengthProxy,
  computePerPlayerIndices,
  computeOpponentStatsQuality01,
  computePlayerWindowAggregates,
  computeWindowPlan,
  evaluateSkipRuleMetrics,
  inferTournamentTierScore,
  loadDeepHistoryCache,
  parseScoreMomentumFeatures,
  saveDeepHistoryCache,
  type DeepHistoryPerMatchFeature,
  type TrendStrengthRow,
} from "../scripts/validation/novaTrendStrengthFilterStudy.js";

function mkRecord(index: number, overrides: Partial<DeepHistoryPerMatchFeature> = {}): DeepHistoryPerMatchFeature {
  return {
    matchUrl: `https://www.flashscore.co.ke/match/${index}`,
    candidateIndex: index,
    tournament: "ATP 250 Doha Men Singles",
    dateText: "26.02.2026 03:00",
    resultText: "W",
    scoreText: "2-0",
    serveCore: 0.55 + index * 0.01,
    returnCore: 0.48 + index * 0.005,
    controlCore: 0.52 + index * 0.006,
    disciplineCore: 0.60 - index * 0.01,
    tpwCore: 0.51 + index * 0.004,
    oppStatsQ01: 0.40 + (index % 3) * 0.1,
    tierScore: 0.7,
    qualifying: false,
    oppStrengthComposite: 0.55 + (index % 4) * 0.05,
    ...overrides,
  };
}

function mkTrendRow(i: number, overrides: Partial<TrendStrengthRow> = {}): TrendStrengthRow {
  return {
    split: "valid",
    matchUrl: `https://www.flashscore.co.ke/match/${i}`,
    label: `A${i} vs B${i}`,
    playerAName: `A${i}`,
    playerBName: `B${i}`,
    actualWinnerName: `A${i}`,
    mainPick: `A${i}`,
    mainCorrect: true,
    confidencePct: 56,
    methodsCount: 5,
    agreementCount: 4,
    agreementRatio: 0.8,
    agreementText: "4/5",
    historyPick: `A${i}`,
    historyNovaSame: true,
    novaP1: 58,
    novaMargin: 8,
    novaPick: `A${i}`,
    logRegP1: 57,
    markovP1: 56,
    bradleyP1: 61,
    bradleyMargin: 11,
    pcaP1: 63,
    logisticMargin: 7,
    novaLogisticAgree: true,
    modelSpreadCore: 18,
    pcaDeviation: 6,
    mainPickSide: "A",
    nTechA: 8,
    nTechB: 8,
    techTrendCoverageScore: 0.72,
    techTrendCoverageMin: 0.6,
    trendWindowFallbackFlag: true,
    oppProxyCoverageA: 0.9,
    oppProxyCoverageB: 0.85,
    oppProxyCoverage: 0.875,
    controlEdge_W10: 0.05,
    controlEdge_W5: 0.03,
    controlEdge_W3: 0.01,
    returnEdge_W10: 0.02,
    returnEdge_W5: 0.01,
    returnEdge_W3: -0.02,
    tpwEdge_W10: 0.04,
    tpwEdge_W5: 0.03,
    tpwEdge_W3: 0.00,
    oppStrengthEdge_W5: -0.08,
    tierEdge_W5: -0.1,
    volatilityEdge_W5: 0.12,
    controlTrend_3v5: -0.02,
    controlTrend_5v10: -0.02,
    returnTrend_3v5: -0.03,
    tpwTrend_3v5: -0.03,
    trendAcceleration: 0,
    trendCoherence: 1,
    ...overrides,
  };
}

test("inferTournamentTierScore maps common tiers and parses qualifying flag", () => {
  const slam = inferTournamentTierScore("Australian Open - Men Singles");
  assert.equal(slam.tierScore, 1);
  assert.equal(slam.flags.qualifying, false);
  assert.equal(slam.flags.unknown, false);

  const atp500 = inferTournamentTierScore("ATP 500 Dubai - Men Singles");
  assert.equal(atp500.tierScore, 0.8);

  const challenger = inferTournamentTierScore("ATP Challenger Pune");
  assert.equal(challenger.tierScore, 0.55);

  const itf = inferTournamentTierScore("ITF Men M15 Antalya");
  assert.equal(itf.tierScore, 0.35);

  const qual = inferTournamentTierScore("ATP 250 Doha - Qualification");
  assert.equal(qual.tierScore, 0.7);
  assert.equal(qual.flags.qualifying, true);

  const unknown = inferTournamentTierScore("Random Club Open");
  assert.equal(unknown.tierScore, 0.5);
  assert.equal(unknown.flags.unknown, true);
});

test("opponent strength proxy combines opp stats and tier deterministically and stays in [0,1]", () => {
  const oppQ = computeOpponentStatsQuality01({
    total_points_won: 54,
    return_points_won: 47,
    total_games_won: 55,
    service_games_won: 80,
    return_games_won: 30,
  });
  assert.ok(typeof oppQ === "number");
  assert.ok((oppQ as number) >= 0 && (oppQ as number) <= 1);

  const composite = combineOpponentStrengthProxy(oppQ, 0.7);
  assert.ok(typeof composite === "number");
  assert.ok((composite as number) >= 0 && (composite as number) <= 1);

  assert.equal(computeOpponentStatsQuality01({
    total_points_won: 54,
    return_points_won: 47,
    total_games_won: 55,
    service_games_won: 80,
  } as any), undefined);
  assert.equal(combineOpponentStrengthProxy(undefined, 0.7), undefined);
});

test("computeWindowPlan applies flexible fallback thresholds for 10/5/3 windows", () => {
  const p8 = computeWindowPlan(8);
  assert.equal(p8.w10.enabled, true);
  assert.equal(p8.w10.used, 8);
  assert.equal(p8.w10.degraded, true);
  assert.equal(p8.w10.reliability, 0.8);
  assert.equal(p8.w5.enabled, true);
  assert.equal(p8.w5.used, 5);
  assert.equal(p8.w3.enabled, true);
  assert.equal(p8.w3.used, 3);

  const p3 = computeWindowPlan(3);
  assert.equal(p3.w10.enabled, false);
  assert.equal(p3.w5.enabled, false);
  assert.equal(p3.w3.enabled, true);
  assert.equal(p3.w3.used, 3);
  assert.equal(p3.w3.reliability, 1);
});

test("computePlayerWindowAggregates handles fallback windows and keeps finite trend coverage metrics", () => {
  const agg8 = computePlayerWindowAggregates(Array.from({ length: 8 }, (_, i) => mkRecord(i)));
  assert.equal(agg8.nAvailable, 8);
  assert.ok(agg8.windows.w10);
  assert.ok(agg8.windows.w5);
  assert.ok(agg8.windows.w3);
  assert.equal(agg8.plan.w10.degraded, true);
  assert.equal(agg8.trendWindowFallbackFlag, true);
  assert.ok(Number.isFinite(agg8.techTrendCoverageScore));
  assert.ok(agg8.techTrendCoverageScore > 0 && agg8.techTrendCoverageScore < 1);
  assert.ok(Number.isFinite(agg8.oppProxyCoverage));

  const agg3 = computePlayerWindowAggregates([mkRecord(1), mkRecord(2), mkRecord(3)]);
  assert.equal(agg3.windows.w10, undefined);
  assert.equal(agg3.windows.w5, undefined);
  assert.ok(agg3.windows.w3);
  assert.equal(agg3.plan.w3.used, 3);
  assert.equal(agg3.techTrendCoverageMin, 0);
});

test("evaluateSkipRuleMetrics computes kept/skipped quality correctly", () => {
  const rows: TrendStrengthRow[] = [
    mkTrendRow(1, { mainCorrect: true, agreementCount: 1, agreementText: "1/5", confidencePct: 50 }),
    mkTrendRow(2, { mainCorrect: false, agreementCount: 1, agreementText: "1/5", confidencePct: 50 }),
    mkTrendRow(3, { mainCorrect: true, agreementCount: 5, agreementText: "5/5", confidencePct: 60 }),
    mkTrendRow(4, { mainCorrect: false, agreementCount: 5, agreementText: "5/5", confidencePct: 60 }),
  ];

  const m = evaluateSkipRuleMetrics(rows, (r) => r.agreementCount <= 1 && r.confidencePct <= 50);
  assert.equal(m.total, 4);
  assert.equal(m.skipped, 2);
  assert.equal(m.kept, 2);
  assert.equal(m.skipRate, 0.5);
  assert.equal(m.skippedHitRate, 0.5);
  assert.equal(m.keptHitRate, 0.5);
  assert.equal(m.deltaKeptVsMain, 0);
});

test("deep history cache load/save handles missing files and schema mismatch", async () => {
  const dir = await mkdtemp(join(tmpdir(), "flash-trend-cache-"));
  try {
    const cacheFile = join(dir, "cache.json");

    const empty = await loadDeepHistoryCache(cacheFile);
    assert.equal(empty.schemaVersion, 1);
    assert.deepEqual(empty.entries, {});

    empty.entries["u::A"] = {
      schemaVersion: 1,
      key: "u::A",
      targetMatchUrl: "u",
      side: "A",
      playerName: "Player A",
      collectedAt: new Date().toISOString(),
      historyTechTarget: 10,
      historyTechScanLimit: 80,
      historyStatsMissBudget: 0,
      recentCandidatesFound: 12,
      recentCandidatesUsable: 10,
      parsedTechMatches: 8,
      collectionDiagnostics: {
        profileFound: true,
        recentCandidatePool: 12,
        scanScanned: 14,
        scanAccepted: 8,
        techMissing: 2,
        metricsIncomplete: 1,
        parseErrors: 0,
        nonSinglesHistory: 1,
        errors: 0,
      },
      records: [mkRecord(1)],
    };
    await saveDeepHistoryCache(cacheFile, empty);
    const roundtrip = await loadDeepHistoryCache(cacheFile);
    assert.ok(roundtrip.entries["u::A"]);
    assert.equal(roundtrip.entries["u::A"]!.parsedTechMatches, 8);

    await writeFile(cacheFile, JSON.stringify({ schemaVersion: 999, entries: { bad: true } }), "utf8");
    const reset = await loadDeepHistoryCache(cacheFile);
    assert.equal(reset.schemaVersion, 1);
    assert.deepEqual(reset.entries, {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("parseScoreMomentumFeatures parses common score patterns and stays finite", () => {
  const a = parseScoreMomentumFeatures({ resultText: "W", scoreText: "2-0" });
  assert.equal(a.scoreParsed, true);
  assert.equal(a.matchWonSign, 1);
  assert.equal(a.setMarginNorm, 1);
  assert.ok(typeof a.scoreMomentum === "number");
  assert.ok((a.scoreMomentum as number) > 0);

  const b = parseScoreMomentumFeatures({ resultText: "L", scoreText: "1-2" });
  assert.equal(b.scoreParsed, true);
  assert.equal(b.matchWonSign, -1);
  assert.equal(b.setMarginNorm, -0.5);
  assert.ok((b.scoreMomentum as number) < 0);

  const c = parseScoreMomentumFeatures({ resultText: "", scoreText: "" });
  assert.equal(c.scoreParsed, false);
  assert.equal(c.scoreMomentum, undefined);
});

test("computePerPlayerIndices returns finite 0..100 indices with fallback windows", () => {
  const agg = computePlayerWindowAggregates(Array.from({ length: 8 }, (_, i) => mkRecord(i)));
  const idx = computePerPlayerIndices(agg);

  for (const v of [idx.strength, idx.stability, idx.formTech, idx.formPlus]) {
    assert.ok(typeof v === "number");
    assert.ok((v as number) >= 0 && (v as number) <= 100);
  }
  for (const v of [idx.relStrength, idx.relStability, idx.relFormTech, idx.relFormPlus, idx.scoreCoverage]) {
    assert.ok(typeof v === "number");
    assert.ok((v as number) >= 0 && (v as number) <= 1);
  }
});

test("tech+score form index diverges from tech-only on score-shifted toy case", () => {
  const records = Array.from({ length: 8 }, (_, i) => mkRecord(i, {
    resultText: i < 3 ? "L" : "W",
    scoreText: i < 3 ? "0-2" : "2-0",
    // keep cores relatively stable so score layer can move the result
    serveCore: 0.56,
    returnCore: 0.49,
    controlCore: 0.53,
    tpwCore: 0.52,
  }));
  const agg = computePlayerWindowAggregates(records);
  const idx = computePerPlayerIndices(agg);
  assert.ok(typeof idx.formTech === "number");
  assert.ok(typeof idx.formPlus === "number");
  assert.notEqual(idx.formTech, idx.formPlus);
});
