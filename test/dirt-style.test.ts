import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregatePlayerHistory,
  bradleyProbability,
  calibrateModelWeights,
  computeComparisonScore,
  logisticRegressionProbability,
  markovProbability,
  pcaProbability,
  runDirtStyleModels,
} from "../src/predict/dirtStyle.js";
import type { HistoricalMatchTechStats, PlayerRecentStats, TechStatRow } from "../src/types.js";

function row(metricKey: string, value: number): TechStatRow {
  const raw = `${value}%`;
  return {
    section: "Service",
    metricLabel: metricKey,
    metricKey,
    playerValue: { raw, percent: value },
    opponentValue: { raw: `${100 - value}%`, percent: 100 - value },
  };
}

function match(url: string, values: {
  firstServeWon: number;
  firstReturnWon: number;
  secondServeWon: number;
  breakSaved: number;
  breakConverted: number;
  totalPointsWon: number;
}): HistoricalMatchTechStats {
  return {
    matchUrl: url,
    playerName: "P",
    sourcePlayerSide: "left",
    rows: [
      row("first_serve_points_won", values.firstServeWon),
      row("first_serve_return_points_won", values.firstReturnWon),
      row("second_serve_points_won", values.secondServeWon),
      row("break_points_saved", values.breakSaved),
      row("break_points_converted", values.breakConverted),
      row("total_points_won", values.totalPointsWon),
      row("total_service_points_won", values.totalPointsWon),
      row("return_points_won", 100 - values.totalPointsWon),
      row("total_games_won", values.totalPointsWon),
      row("first_serve", 65),
    ],
    warnings: [],
  };
}

function player(
  name: string,
  profileUrl: string,
  matches: HistoricalMatchTechStats[],
): PlayerRecentStats {
  return {
    playerName: name,
    profileUrl,
    parsedMatches: matches,
    missingStatsCount: 0,
    errors: [],
  };
}

test("logisticRegressionProbability and comparison-based models are directional", () => {
  const home = {
    first_serve_points_won: 72,
    first_serve_return_points_won: 38,
    second_serve_points_won: 58,
    break_points_saved: 70,
    break_points_converted: 45,
    total_points_won: 54,
    total_service_points_won: 63,
    return_points_won: 39,
    total_games_won: 61,
    first_serve: 64,
    aces: 8,
    double_faults: 2,
  };
  const away = {
    first_serve_points_won: 66,
    first_serve_return_points_won: 33,
    second_serve_points_won: 49,
    break_points_saved: 60,
    break_points_converted: 37,
    total_points_won: 47,
    total_service_points_won: 57,
    return_points_won: 34,
    total_games_won: 48,
    first_serve: 58,
    aces: 4,
    double_faults: 5,
  };

  const comparison = computeComparisonScore(home, away);
  const logReg = logisticRegressionProbability(home, away);
  const markov = markovProbability(home, away, comparison);
  const bradley = bradleyProbability(comparison);

  assert.ok((logReg || 0) > 50);
  assert.ok((markov || 0) > 50);
  assert.ok((bradley || 0) > 50);
});

test("pcaProbability returns finite value on synthetic history", () => {
  const home = aggregatePlayerHistory(
    player("H", "https://sports1.nowgoal26.com/tennis/tournament/player/111", [
      match("https://m/1", {
        firstServeWon: 70,
        firstReturnWon: 37,
        secondServeWon: 56,
        breakSaved: 72,
        breakConverted: 44,
        totalPointsWon: 53,
      }),
      match("https://m/2", {
        firstServeWon: 69,
        firstReturnWon: 38,
        secondServeWon: 55,
        breakSaved: 71,
        breakConverted: 46,
        totalPointsWon: 54,
      }),
      match("https://m/3", {
        firstServeWon: 68,
        firstReturnWon: 36,
        secondServeWon: 54,
        breakSaved: 70,
        breakConverted: 43,
        totalPointsWon: 52,
      }),
    ]),
  );
  const away = aggregatePlayerHistory(
    player("A", "https://sports1.nowgoal26.com/tennis/tournament/player/222", [
      match("https://m/4", {
        firstServeWon: 63,
        firstReturnWon: 30,
        secondServeWon: 48,
        breakSaved: 60,
        breakConverted: 36,
        totalPointsWon: 47,
      }),
      match("https://m/5", {
        firstServeWon: 64,
        firstReturnWon: 31,
        secondServeWon: 49,
        breakSaved: 62,
        breakConverted: 34,
        totalPointsWon: 48,
      }),
      match("https://m/6", {
        firstServeWon: 62,
        firstReturnWon: 32,
        secondServeWon: 47,
        breakSaved: 61,
        breakConverted: 35,
        totalPointsWon: 46,
      }),
    ]),
  );

  const pca = pcaProbability(home, away);
  assert.ok(typeof pca === "number");
  assert.ok((pca || 0) > 50);
});

test("runDirtStyleModels combines LogReg/Markov/Bradley/PCA and keeps player ids", () => {
  const home = player("Home", "https://sports1.nowgoal26.com/tennis/tournament/player/9030", [
    match("https://hm/1", {
      firstServeWon: 70,
      firstReturnWon: 37,
      secondServeWon: 57,
      breakSaved: 73,
      breakConverted: 47,
      totalPointsWon: 55,
    }),
    match("https://hm/2", {
      firstServeWon: 69,
      firstReturnWon: 36,
      secondServeWon: 56,
      breakSaved: 71,
      breakConverted: 46,
      totalPointsWon: 54,
    }),
  ]);
  const away = player("Away", "https://sports1.nowgoal26.com/tennis/tournament/player/8336", [
    match("https://aw/1", {
      firstServeWon: 64,
      firstReturnWon: 31,
      secondServeWon: 49,
      breakSaved: 62,
      breakConverted: 35,
      totalPointsWon: 48,
    }),
    match("https://aw/2", {
      firstServeWon: 63,
      firstReturnWon: 30,
      secondServeWon: 48,
      breakSaved: 61,
      breakConverted: 34,
      totalPointsWon: 47,
    }),
  ]);

  const result = runDirtStyleModels(home, away);
  assert.ok(result.activeModels >= 3);
  assert.ok(result.finalP1 > 50);
  assert.equal(result.pclassEv, 9030);
  assert.equal(result.pclassDep, 8336);
  const sum = result.weights.logReg + result.weights.markov + result.weights.bradley + result.weights.pca;
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(result.weights.logReg > result.weights.bradley);
  assert.ok(result.weights.markov > result.weights.bradley);
});

test("calibrateModelWeights zeroes unavailable models and re-normalizes", () => {
  const weights = calibrateModelWeights(
    { logReg: 0.32, markov: 0.28, bradley: 0.2, pca: 0.2 },
    { logReg: 1, markov: 0.8, bradley: 0.6, pca: 0.5 },
    { logReg: 55, markov: 57, bradley: undefined, pca: undefined },
  );

  assert.equal(weights.bradley, 0);
  assert.equal(weights.pca, 0);
  assert.ok(weights.logReg > weights.markov);
  assert.ok(Math.abs(weights.logReg + weights.markov - 1) < 1e-9);
});
