import test from "node:test";
import assert from "node:assert/strict";
import { predict } from "../src/predictor.js";
import { REQUIRED_DIRT_METRIC_KEYS } from "../src/predict/requiredMetrics.js";
import type {
  HistoricalMatchTechStats,
  PlayerRecentStats,
  TechStatRow,
} from "../src/types.js";

function makeMatch(url: string, base: number): HistoricalMatchTechStats {
  const rows: TechStatRow[] = REQUIRED_DIRT_METRIC_KEYS.map((metricKey, index) => {
    const value = clamp(base + (index % 6), 5, 95);
    return {
      section: "Service",
      metricLabel: metricKey,
      metricKey,
      playerValue: { raw: `${value}%`, percent: value },
      opponentValue: { raw: `${100 - value}%`, percent: 100 - value },
    };
  });

  return {
    matchUrl: url,
    playerName: "P",
    sourcePlayerSide: "left",
    rows,
    warnings: [],
  };
}

function makePlayer(
  name: string,
  matches: HistoricalMatchTechStats[],
  profileUrl?: string,
): PlayerRecentStats {
  return {
    playerName: name,
    profileUrl,
    parsedMatches: matches,
    missingStatsCount: 0,
    errors: [],
  };
}

test("predict uses DirtTennis formulas and returns stable winner/confidence", () => {
  const playerA = makePlayer("Player A", [
    makeMatch("https://x/a1", 66),
    makeMatch("https://x/a2", 64),
    makeMatch("https://x/a3", 65),
    makeMatch("https://x/a4", 67),
    makeMatch("https://x/a5", 63),
  ], "https://sports1.nowgoal26.com/tennis/tournament/player/11864");

  const playerB = makePlayer("Player B", [
    makeMatch("https://x/b1", 49),
    makeMatch("https://x/b2", 50),
    makeMatch("https://x/b3", 48),
    makeMatch("https://x/b4", 47),
    makeMatch("https://x/b5", 51),
  ], "https://sports1.nowgoal26.com/tennis/tournament/player/7941");

  const prediction = predict(
    {
      matchUrl: "https://sports1.nowgoal26.com/tennis/match/123",
      matchLabel: "Player A vs Player B",
      playerAName: "Player A",
      playerBName: "Player B",
      status: "upcoming",
      tournament: "ATP Example",
      pclass: {
        ev: 11864,
        dep: 7941,
        source: "match_dv_data",
      },
    },
    playerA,
    playerB,
    5,
  );

  assert.equal(prediction.predictedWinner, "Player A");
  assert.ok(prediction.confidence > 0.5);
  assert.ok(prediction.modelSummary);
  assert.equal(prediction.modelSummary?.modules.length, 4);
  assert.equal(prediction.modelSummary?.dirt?.validPairs, 5);
  assert.equal(prediction.modelSummary?.dirt?.pclass?.ev, 11864);
  assert.equal(prediction.modelSummary?.dirt?.pclass?.dep, 7941);
  assert.equal(prediction.modelSummary?.dirt?.pclass?.source, "match_dv_data");
  assert.ok(prediction.modelSummary?.novaEdge);
  assert.ok(typeof prediction.modelSummary?.novaEdge?.p1 === "number");
  assert.ok(typeof prediction.modelSummary?.novaEdge?.p2 === "number");
  assert.ok(
    prediction.modelSummary?.novaEdge?.winner === "Player A" ||
      prediction.modelSummary?.novaEdge?.winner === "Player B",
  );
  assert.equal(
    ((prediction.modelSummary as unknown as Record<string, unknown>)?.thirdSetLegacy),
    undefined,
  );
  assert.match(prediction.reason, /pair-by-index/i);
});

test("predict marks missing pclass when match dv-data is not available", () => {
  const playerA = makePlayer("Player A", [makeMatch("https://x/a1", 66)]);
  const playerB = makePlayer("Player B", [makeMatch("https://x/b1", 49)]);

  const prediction = predict(
    {
      matchUrl: "https://sports1.nowgoal26.com/tennis/match/124",
      matchLabel: "Player A vs Player B",
      playerAName: "Player A",
      playerBName: "Player B",
      status: "upcoming",
      tournament: "ATP Example",
      pclass: {
        source: "missing",
      },
    },
    playerA,
    playerB,
    1,
  );

  assert.equal(prediction.modelSummary?.dirt?.pclass?.source, "missing");
  assert.equal(prediction.modelSummary?.dirt?.pclass?.ev, undefined);
  assert.equal(prediction.modelSummary?.dirt?.pclass?.dep, undefined);
  assert.ok(prediction.warnings.includes("pclass_missing_dv_data"));
});

test("predict uses odds tiebreak and confidence=0.50 for neutral final probability", () => {
  const sharedA = Array.from({ length: 5 }, (_, index) => makeMatch(`https://x/shared/a${index}`, 60));
  const sharedB = Array.from({ length: 5 }, (_, index) => makeMatch(`https://x/shared/b${index}`, 60));
  const playerA = makePlayer("Player A", sharedA);
  const playerB = makePlayer("Player B", sharedB);

  const prediction = predict(
    {
      matchUrl: "https://sports1.nowgoal26.com/tennis/match/200",
      matchLabel: "Player A vs Player B",
      playerAName: "Player A",
      playerBName: "Player B",
      status: "upcoming",
      marketOdds: {
        home: 2.3,
        away: 1.7,
      },
    },
    playerA,
    playerB,
    5,
  );

  assert.ok(
    Math.abs((prediction.modelSummary?.dirt?.modelProbabilities.finalP1 || 0) - 50) < 1e-9,
  );
  assert.equal(prediction.confidence, 0.5);
  assert.equal(prediction.predictedWinner, "Player B");
  assert.ok(prediction.warnings.includes("neutral_model_odds_tiebreak"));
});

test("predict uses deterministic seed tiebreak when odds are missing", () => {
  const sharedA = Array.from({ length: 5 }, (_, index) => makeMatch(`https://x/shared2/a${index}`, 58));
  const sharedB = Array.from({ length: 5 }, (_, index) => makeMatch(`https://x/shared2/b${index}`, 58));
  const playerA = makePlayer("Player A", sharedA);
  const playerB = makePlayer("Player B", sharedB);

  const makePrediction = () =>
    predict(
      {
        matchUrl: "https://sports1.nowgoal26.com/tennis/match/201",
        matchLabel: "Player A vs Player B",
        playerAName: "Player A",
        playerBName: "Player B",
        status: "upcoming",
      },
      playerA,
      playerB,
      5,
    );

  const first = makePrediction();
  const second = makePrediction();

  assert.ok(
    Math.abs((first.modelSummary?.dirt?.modelProbabilities.finalP1 || 0) - 50) < 1e-9,
  );
  assert.equal(first.predictedWinner, second.predictedWinner);
  assert.ok(first.warnings.includes("neutral_model_seed_tiebreak"));
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
