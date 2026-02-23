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
});

test("hasRequiredHistoryCoverage enforces strict needCount for both players", () => {
  const a5 = makePlayer("A", 5);
  const b5 = makePlayer("B", 5);
  const b4 = makePlayer("B", 4);

  assert.equal(hasRequiredHistoryCoverage(a5, b5, 5), true);
  assert.equal(hasRequiredHistoryCoverage(a5, b4, 5), false);
});
