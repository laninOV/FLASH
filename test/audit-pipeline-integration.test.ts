import test from "node:test";
import assert from "node:assert/strict";
import { aggregateIndexPairs } from "../src/predict/dirtPairs.js";
import { extractDirtFeatureRow, REQUIRED_DIRT_METRIC_KEYS } from "../src/predict/requiredMetrics.js";
import { predict } from "../src/predictor.js";
import type { HistoricalMatchTechStats, PlayerRecentStats, TechStatRow } from "../src/types.js";

function makeRows(base: number): TechStatRow[] {
  return REQUIRED_DIRT_METRIC_KEYS.map((key, i) => ({
    section: "Service",
    metricLabel: key,
    metricKey: key,
    playerValue: {
      raw: `${clamp(base + (i % 7), 1, 95)}%`,
      percent: clamp(base + (i % 7), 1, 95),
    },
    opponentValue: {
      raw: `${clamp(100 - base - (i % 7), 1, 95)}%`,
      percent: clamp(100 - base - (i % 7), 1, 95),
    },
  }));
}

function makeMatch(url: string, base: number): HistoricalMatchTechStats {
  return {
    matchUrl: url,
    matchTitle: "Synthetic",
    playerName: "P",
    sourcePlayerSide: "left",
    rows: makeRows(base),
    warnings: [],
  };
}

function makePlayer(name: string, bases: number[]): PlayerRecentStats {
  return {
    playerName: name,
    parsedMatches: bases.map((base, i) => makeMatch(`https://m/${name}/${i}`, base)),
    stateFeatures: [],
    missingStatsCount: 0,
    errors: [],
    historyScanStats: {
      candidatePool: 10,
      scanned: 5,
      accepted: 5,
      filtered: {
        sameAsTargetMatch: 0,
        nonSingles: 0,
        nonSinglesHistory: 0,
        notFinished: 0,
        future: 0,
        invalid: 0,
        techMissing: 0,
        metricsIncomplete: 0,
        parseError: 0,
      },
    },
  };
}

test("integration: rows -> features -> aggregate -> predict stay consistent", () => {
  const playerA = makePlayer("A", [68, 66, 65, 67, 64]);
  const playerB = makePlayer("B", [52, 51, 50, 49, 53]);

  const featureA = playerA.parsedMatches
    .map((match) => extractDirtFeatureRow(match))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  const featureB = playerB.parsedMatches
    .map((match) => extractDirtFeatureRow(match))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  const aggregate = aggregateIndexPairs(featureA, featureB, 5);

  const prediction = predict(
    {
      matchUrl: "https://sports1.nowgoal26.com/tennis/match/555",
      matchLabel: "A vs B",
      playerAName: "A",
      playerBName: "B",
      status: "upcoming",
    },
    playerA,
    playerB,
    5,
  );

  assert.equal(prediction.statsCoverage.playerACollected, 5);
  assert.equal(prediction.statsCoverage.playerBCollected, 5);
  assert.equal(prediction.modelSummary?.dirt?.validPairs, 5);
  assert.ok(prediction.dataStatus?.includes("metrics_policy=stable14"));
  assert.ok(Math.abs((prediction.modelSummary?.dirt?.modelProbabilities.finalP1 || 0) - aggregate.modelProbabilities.finalP1) < 1e-9);
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
