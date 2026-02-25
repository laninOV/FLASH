import test from "node:test";
import assert from "node:assert/strict";
import { predict } from "../src/predictor.js";
import type {
  HistoricalMatchTechStats,
  PlayerRecentStats,
  TechStatRow,
} from "../src/types.js";

type Stable14 = {
  first_serve: number;
  first_serve_points_won: number;
  second_serve_points_won: number;
  break_points_saved: number;
  double_faults: number;
  first_serve_return_points_won: number;
  second_serve_return_points_won: number;
  break_points_converted: number;
  total_service_points_won: number;
  return_points_won: number;
  total_points_won: number;
  service_games_won: number;
  return_games_won: number;
  total_games_won: number;
};

const ORDERED_KEYS = [
  "first_serve",
  "first_serve_points_won",
  "second_serve_points_won",
  "break_points_saved",
  "double_faults",
  "first_serve_return_points_won",
  "second_serve_return_points_won",
  "break_points_converted",
  "total_service_points_won",
  "return_points_won",
  "total_points_won",
  "service_games_won",
  "return_games_won",
  "total_games_won",
] as const;

function toRows(values: Stable14): TechStatRow[] {
  return ORDERED_KEYS.map((key) => ({
    section: "Service",
    metricLabel: key,
    metricKey: key,
    playerValue: { raw: `${values[key]}%`, percent: values[key] },
    opponentValue: { raw: "-", percent: undefined },
  }));
}

function makeMatch(url: string, values: Stable14): HistoricalMatchTechStats {
  return {
    matchUrl: url,
    playerName: "P",
    sourcePlayerSide: "left",
    rows: toRows(values),
    warnings: [],
  };
}

function makePlayer(name: string, urls: string[], metrics: Stable14[]): PlayerRecentStats {
  return {
    playerName: name,
    parsedMatches: urls.map((url, index) => makeMatch(url, metrics[index]!)),
    missingStatsCount: 0,
    errors: [],
  };
}

test("predict keeps deterministic result for 195806-like fixture", () => {
  const home = makePlayer(
    "T.H. Fritz",
    [
      "https://sports1.nowgoal26.com/tennis/match/195558",
      "https://sports1.nowgoal26.com/tennis/match/195376",
      "https://sports1.nowgoal26.com/tennis/match/195330",
      "https://sports1.nowgoal26.com/tennis/match/195260",
      "https://sports1.nowgoal26.com/tennis/match/194818",
    ],
    [
      { first_serve: 67, first_serve_points_won: 88, second_serve_points_won: 42, break_points_saved: 40, double_faults: 1, first_serve_return_points_won: 33, second_serve_return_points_won: 35, break_points_converted: 29, total_service_points_won: 73, return_points_won: 34, total_points_won: 51, service_games_won: 80, return_games_won: 13, total_games_won: 47 },
      { first_serve: 74, first_serve_points_won: 80, second_serve_points_won: 40, break_points_saved: 100, double_faults: 3, first_serve_return_points_won: 17, second_serve_return_points_won: 44, break_points_converted: 50, total_service_points_won: 70, return_points_won: 26, total_points_won: 49, service_games_won: 100, return_games_won: 6, total_games_won: 53 },
      { first_serve: 76, first_serve_points_won: 83, second_serve_points_won: 62, break_points_saved: 100, double_faults: 3, first_serve_return_points_won: 35, second_serve_return_points_won: 38, break_points_converted: 100, total_service_points_won: 78, return_points_won: 36, total_points_won: 58, service_games_won: 100, return_games_won: 22, total_games_won: 63 },
      { first_serve: 71, first_serve_points_won: 81, second_serve_points_won: 48, break_points_saved: 60, double_faults: 1, first_serve_return_points_won: 30, second_serve_return_points_won: 46, break_points_converted: 20, total_service_points_won: 72, return_points_won: 35, total_points_won: 52, service_games_won: 88, return_games_won: 12, total_games_won: 50 },
      { first_serve: 68, first_serve_points_won: 84, second_serve_points_won: 69, break_points_saved: 100, double_faults: 2, first_serve_return_points_won: 36, second_serve_return_points_won: 44, break_points_converted: 44, total_service_points_won: 79, return_points_won: 39, total_points_won: 59, service_games_won: 100, return_games_won: 27, total_games_won: 63 },
    ],
  );

  const away = makePlayer(
    "T. Paul",
    [
      "https://sports1.nowgoal26.com/tennis/match/195743",
      "https://sports1.nowgoal26.com/tennis/match/195439",
      "https://sports1.nowgoal26.com/tennis/match/195366",
      "https://sports1.nowgoal26.com/tennis/match/195250",
      "https://sports1.nowgoal26.com/tennis/match/194802",
    ],
    [
      { first_serve: 74, first_serve_points_won: 59, second_serve_points_won: 65, break_points_saved: 75, double_faults: 0, first_serve_return_points_won: 19, second_serve_return_points_won: 41, break_points_converted: 100, total_service_points_won: 61, return_points_won: 28, total_points_won: 45, service_games_won: 80, return_games_won: 9, total_games_won: 43 },
      { first_serve: 65, first_serve_points_won: 61, second_serve_points_won: 51, break_points_saved: 81, double_faults: 6, first_serve_return_points_won: 20, second_serve_return_points_won: 54, break_points_converted: 60, total_service_points_won: 58, return_points_won: 30, total_points_won: 46, service_games_won: 71, return_games_won: 20, total_games_won: 45 },
      { first_serve: 65, first_serve_points_won: 78, second_serve_points_won: 41, break_points_saved: 50, double_faults: 1, first_serve_return_points_won: 23, second_serve_return_points_won: 44, break_points_converted: 33, total_service_points_won: 66, return_points_won: 29, total_points_won: 47, service_games_won: 81, return_games_won: 13, total_games_won: 47 },
      { first_serve: 60, first_serve_points_won: 85, second_serve_points_won: 61, break_points_saved: 50, double_faults: 1, first_serve_return_points_won: 24, second_serve_return_points_won: 44, break_points_converted: 25, total_service_points_won: 76, return_points_won: 32, total_points_won: 53, service_games_won: 94, return_games_won: 6, total_games_won: 50 },
      { first_serve: 70, first_serve_points_won: 79, second_serve_points_won: 68, break_points_saved: 50, double_faults: 0, first_serve_return_points_won: 19, second_serve_return_points_won: 54, break_points_converted: 30, total_service_points_won: 76, return_points_won: 35, total_points_won: 54, service_games_won: 94, return_games_won: 18, total_games_won: 56 },
    ],
  );

  const context = {
    matchUrl: "https://sports1.nowgoal26.com/tennis/match/195806",
    matchLabel: "T.H. Fritz vs T. Paul",
    playerAName: "T.H. Fritz",
    playerBName: "T. Paul",
    status: "upcoming" as const,
    marketOdds: {
      home: 1.57,
      away: 2.38,
    },
    pclass: {
      ev: 7699,
      dep: 7725,
      source: "match_dv_data" as const,
    },
  };

  const first = predict(context, home, away, 5);
  const second = predict(context, home, away, 5);

  assert.equal(first.predictedWinner, second.predictedWinner);
  assert.equal(
    first.modelSummary?.dirt?.modelProbabilities.finalP1,
    second.modelSummary?.dirt?.modelProbabilities.finalP1,
  );
  assert.ok(first.modelSummary?.dirt?.validPairs === 5);
  assert.ok(first.modelSummary?.novaEdge);
  assert.ok(first.modelSummary?.hybridShadow);
  assert.ok(first.modelSummary?.mahalShadow);
  assert.ok(first.modelSummary?.matchupShadow);
  assert.ok(first.modelSummary?.marketResidualShadow);
});
