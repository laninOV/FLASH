import test from "node:test";
import assert from "node:assert/strict";
import {
  hasRequiredHistoryCoverage,
  scanTechHistoryCandidates,
} from "../src/orchestrator.js";
import { REQUIRED_DIRT_METRIC_KEYS } from "../src/predict/requiredMetrics.js";
import type {
  HistoricalMatchTechStats,
  PlayerRecentStats,
  TechStatRow,
  RecentMatchRef,
} from "../src/types.js";

function makeCandidate(id: number): RecentMatchRef {
  return {
    url: `https://sports1.nowgoal26.com/tennis/match/${id}`,
    isSingles: true,
    isFinishedHint: true,
    dateText: "18-02-2026 01:00",
    scoreText: "2-1 (6-4,3-6,7-5)",
  };
}

function makeParsed(url: string): HistoricalMatchTechStats {
  const rows: TechStatRow[] = REQUIRED_DIRT_METRIC_KEYS.map((metricKey, index) => ({
    section: "Service",
    metricLabel: metricKey,
    metricKey,
    playerValue: { raw: `${50 + index}%`, percent: 50 + index },
    opponentValue: { raw: `${50 - index}%`, percent: 50 - index },
  }));
  return {
    matchUrl: url,
    playerName: "P",
    sourcePlayerSide: "left",
    rows,
    warnings: [],
  };
}

function makePlayer(name: string, parsedCount: number): PlayerRecentStats {
  const parsedMatches: HistoricalMatchTechStats[] = [];
  for (let index = 0; index < parsedCount; index += 1) {
    parsedMatches.push(makeParsed(`https://sports1.nowgoal26.com/tennis/match/${9000 + index}`));
  }
  return {
    playerName: name,
    parsedMatches,
    stateFeatures: [],
    missingStatsCount: 0,
    errors: [],
  };
}

test("scanTechHistoryCandidates keeps scanning until requested count is reached", async () => {
  const candidates: RecentMatchRef[] = [
    makeCandidate(1),
    makeCandidate(2),
    makeCandidate(3),
    makeCandidate(4),
    makeCandidate(5),
    makeCandidate(6),
    makeCandidate(7),
  ];

  const result = await scanTechHistoryCandidates({
    playerName: "Player A",
    candidates,
    needCount: 5,
    parseMatch: async (candidate, index) => {
      if (index < 2) {
        return null;
      }
      return makeParsed(candidate.url);
    },
  });

  assert.equal(result.parsedMatches.length, 5);
  assert.equal(result.scanned, 7);
  assert.equal(result.techMissing, 2);
  assert.equal(result.nonSinglesHistory, 0);
  assert.equal(result.metricsIncomplete, 0);
  assert.equal(result.parseErrors, 0);
  assert.equal(result.statsMissesForBudget, 2);
  assert.equal(result.earlyStopReason, undefined);
  assert.equal(result.earlyStopBudget, undefined);
});

test("scanTechHistoryCandidates returns partial coverage when valid Tech matches are below target", async () => {
  const candidates: RecentMatchRef[] = [
    makeCandidate(11),
    makeCandidate(12),
    makeCandidate(13),
    makeCandidate(14),
    makeCandidate(15),
    makeCandidate(16),
  ];

  const result = await scanTechHistoryCandidates({
    playerName: "Player B",
    candidates,
    needCount: 5,
    parseMatch: async (candidate, index) => {
      if (index === 5) {
        throw new Error("network glitch");
      }
      if (index < 4) {
        return makeParsed(candidate.url);
      }
      return null;
    },
  });

  assert.equal(result.parsedMatches.length, 4);
  assert.equal(result.scanned, 6);
  assert.equal(result.techMissing, 1);
  assert.equal(result.nonSinglesHistory, 0);
  assert.equal(result.metricsIncomplete, 0);
  assert.equal(result.parseErrors, 1);
  assert.equal(result.statsMissesForBudget, 1);
  assert.equal(result.earlyStopReason, undefined);
});

test("scanTechHistoryCandidates rejects parsed match with incomplete required metrics", async () => {
  const candidate = makeCandidate(21);
  const incomplete: HistoricalMatchTechStats = {
    matchUrl: candidate.url,
    playerName: "P",
    sourcePlayerSide: "left",
    rows: [
      {
        section: "Service",
        metricLabel: "first_serve",
        metricKey: "first_serve",
        playerValue: { raw: "65%", percent: 65 },
        opponentValue: { raw: "35%", percent: 35 },
      },
    ],
    warnings: [],
  };

  const result = await scanTechHistoryCandidates({
    playerName: "Player C",
    candidates: [candidate],
    needCount: 1,
    parseMatch: async () => incomplete,
  });

  assert.equal(result.parsedMatches.length, 0);
  assert.equal(result.metricsIncomplete, 1);
  assert.equal(result.techMissing, 0);
  assert.equal(result.nonSinglesHistory, 0);
  assert.equal(result.statsMissesForBudget, 1);
});

test("scanTechHistoryCandidates tracks non_singles_history and keeps scanning", async () => {
  const candidates: RecentMatchRef[] = [
    makeCandidate(31),
    makeCandidate(32),
    makeCandidate(33),
    makeCandidate(34),
    makeCandidate(35),
    makeCandidate(36),
    makeCandidate(37),
  ];

  const result = await scanTechHistoryCandidates({
    playerName: "Player D",
    candidates,
    needCount: 5,
    parseMatch: async (candidate, index) => {
      if (index < 2) {
        return {
          status: "skip",
          reason: "non_singles_history",
        };
      }
      return makeParsed(candidate.url);
    },
  });

  assert.equal(result.parsedMatches.length, 5);
  assert.equal(result.scanned, 7);
  assert.equal(result.nonSinglesHistory, 2);
  assert.equal(result.techMissing, 0);
  assert.equal(result.statsMissesForBudget, 0);
});

test("scanTechHistoryCandidates early-stops on stats miss budget (tech_missing)", async () => {
  const candidates: RecentMatchRef[] = [
    makeCandidate(41),
    makeCandidate(42),
    makeCandidate(43),
    makeCandidate(44),
    makeCandidate(45),
  ];

  const result = await scanTechHistoryCandidates({
    playerName: "Player E",
    candidates,
    needCount: 5,
    statsMissBudget: 3,
    parseMatch: async () => null,
  });

  assert.equal(result.parsedMatches.length, 0);
  assert.equal(result.scanned, 3);
  assert.equal(result.techMissing, 3);
  assert.equal(result.metricsIncomplete, 0);
  assert.equal(result.statsMissesForBudget, 3);
  assert.equal(result.earlyStopReason, "stats_miss_budget_reached");
  assert.equal(result.earlyStopBudget, 3);
});

test("scanTechHistoryCandidates counts metrics_incomplete toward stats miss budget", async () => {
  const candidates: RecentMatchRef[] = [makeCandidate(51), makeCandidate(52), makeCandidate(53)];
  const incomplete: HistoricalMatchTechStats = {
    matchUrl: candidates[0].url,
    playerName: "P",
    sourcePlayerSide: "left",
    rows: [
      {
        section: "Service",
        metricLabel: "first_serve",
        metricKey: "first_serve",
        playerValue: { raw: "65%", percent: 65 },
        opponentValue: { raw: "35%", percent: 35 },
      },
    ],
    warnings: [],
  };

  const result = await scanTechHistoryCandidates({
    playerName: "Player F",
    candidates,
    needCount: 5,
    statsMissBudget: 2,
    parseMatch: async () => incomplete,
  });

  assert.equal(result.scanned, 2);
  assert.equal(result.metricsIncomplete, 2);
  assert.equal(result.techMissing, 0);
  assert.equal(result.statsMissesForBudget, 2);
  assert.equal(result.earlyStopReason, "stats_miss_budget_reached");
  assert.equal(result.earlyStopBudget, 2);
});

test("scanTechHistoryCandidates does not count parse_error or non_singles_history toward budget", async () => {
  const candidates: RecentMatchRef[] = [
    makeCandidate(61),
    makeCandidate(62),
    makeCandidate(63),
    makeCandidate(64),
    makeCandidate(65),
    makeCandidate(66),
  ];

  const result = await scanTechHistoryCandidates({
    playerName: "Player G",
    candidates,
    needCount: 2,
    statsMissBudget: 1,
    parseMatch: async (candidate, index) => {
      if (index === 0) {
        return { status: "skip", reason: "non_singles_history" };
      }
      if (index === 1) {
        throw new Error("network");
      }
      if (index === 2) {
        return makeParsed(candidate.url);
      }
      if (index === 3) {
        return makeParsed(candidate.url);
      }
      return null;
    },
  });

  assert.equal(result.parsedMatches.length, 2);
  assert.equal(result.nonSinglesHistory, 1);
  assert.equal(result.parseErrors, 1);
  assert.equal(result.statsMissesForBudget, 0);
  assert.equal(result.earlyStopReason, undefined);
});

test("scanTechHistoryCandidates budget=0 keeps current deep-scan behavior", async () => {
  const candidates: RecentMatchRef[] = [
    makeCandidate(71),
    makeCandidate(72),
    makeCandidate(73),
    makeCandidate(74),
    makeCandidate(75),
    makeCandidate(76),
    makeCandidate(77),
  ];

  const result = await scanTechHistoryCandidates({
    playerName: "Player H",
    candidates,
    needCount: 5,
    statsMissBudget: 0,
    parseMatch: async (candidate, index) => {
      if (index < 2) {
        return null;
      }
      return makeParsed(candidate.url);
    },
  });

  assert.equal(result.parsedMatches.length, 5);
  assert.equal(result.scanned, 7);
  assert.equal(result.techMissing, 2);
  assert.equal(result.statsMissesForBudget, 2);
  assert.equal(result.earlyStopReason, undefined);
});

test("scanTechHistoryCandidates applies budget only until budgetNeedCount is reached", async () => {
  const candidates: RecentMatchRef[] = Array.from({ length: 12 }, (_, index) =>
    makeCandidate(801 + index),
  );
  const acceptedIndexes = new Set([1, 3, 4, 5, 6, 10, 11]);

  const result = await scanTechHistoryCandidates({
    playerName: "Player I",
    candidates,
    needCount: 10,
    budgetNeedCount: 5,
    statsMissBudget: 3,
    parseMatch: async (candidate, index) => {
      if (acceptedIndexes.has(index)) {
        return makeParsed(candidate.url);
      }
      return null;
    },
  });

  assert.equal(result.earlyStopReason, undefined);
  assert.equal(result.scanned, 12);
  assert.equal(result.parsedMatches.length, 7);
  assert.equal(result.statsMissesForBudget, 5);
});

test("hasRequiredHistoryCoverage enforces strict needCount for both players", () => {
  const a5 = makePlayer("A", 5);
  const b5 = makePlayer("B", 5);
  const b4 = makePlayer("B", 4);

  assert.equal(hasRequiredHistoryCoverage(a5, b5, 5), true);
  assert.equal(hasRequiredHistoryCoverage(a5, b4, 5), false);
});
