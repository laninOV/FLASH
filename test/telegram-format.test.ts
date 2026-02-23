import test from "node:test";
import assert from "node:assert/strict";
import { formatShortPredictionMessage } from "../src/transports/format.js";
import type { PredictionResult } from "../src/types.js";

const basePrediction: PredictionResult = {
  createdAt: "2026-02-18T12:00:00.000Z",
  matchUrl: "https://www.flashscore.com.ua/match/example/#/match-summary?mid=abcd1234",
  matchLabel: "Mirra Andreeva vs Amanda Anisimova",
  tournament: "WTA Doha",
  matchStatus: "upcoming",
  scheduledStartText: "19-02-2026 21:55",
  playerAName: "Mirra Andreeva",
  playerBName: "Amanda Anisimova",
  marketOdds: {
    home: 2.2,
    away: 1.67,
    bookmaker: "Bet365",
    stage: "Initial",
  },
  predictedWinner: "Mirra Andreeva",
  confidence: 0.654,
  reason: "stub",
  statsCoverage: {
    requestedPerPlayer: 5,
    playerACollected: 5,
    playerBCollected: 5,
  },
  timingsSec: {
    collection: 24.378,
    prediction: 0.084,
    total: 24.551,
  },
  dataStatus: "debug",
  modelSummary: {
    modules: [],
    ensemble: {
      finalSide: "home",
      score: 3,
      votesHome: 3,
      votesAway: 1,
      strongHome: 1,
      strongAway: 0,
      active: 4,
    },
    rating5: {},
    reliability: {
      playerA: 1,
      playerB: 1,
    },
    dirt: {
      validPairs: 5,
      requestedPairs: 5,
      modelProbabilities: {
        logRegP1: 57.4,
        markovP1: 53.2,
        bradleyP1: 68.4,
        pcaP1: 99.1,
        finalP1: 65.4,
      },
      weights: {
        logReg: 0.35,
        markov: 0.3,
        bradley: 0.2,
        pca: 0.15,
      },
      pclass: {
        ev: 11864,
        dep: 7941,
      },
    },
    novaEdge: {
      p1: 62.4,
      p2: 37.6,
      winner: "Mirra Andreeva",
      source: "stable14_nova_v1",
    },
  },
  warnings: ["x"],
};

test("formatShortPredictionMessage renders no-YTD short message with NOVA and HISTORY-5", () => {
  const text = formatShortPredictionMessage(basePrediction);
  const lines = text.split("\n");

  assert.equal(lines.length, 25);
  assert.equal(lines[0], "✅✅✅");
  assert.equal(lines[1], "TENNIS SIGNAL");
  assert.equal(lines[3], "Mirra Andreeva vs Amanda Anisimova");
  assert.match(lines[4] || "", /^Link: https:\/\/www\.flashscore\.com\.ua\/match\//);
  assert.equal(lines[5], "Date: 19.02.2026 21:55");
  assert.equal(lines[11], "==================");
  assert.equal(lines[17], "==================");
  assert.equal(lines[18], "NOVA EDGE: 62% / 38%");
  assert.equal(lines[20], "==================");
  assert.equal(lines[21], "SHORT SUMMARY");
  assert.match(lines[22] || "", /^HISTORY-5: Mirra Andreeva \| 65% \/ 35%$/);
  assert.match(lines[23] || "", /^NOVA: Mirra Andreeva \| 62% \/ 38%$/);
  assert.equal(lines[24], "==================");

  assert.doesNotMatch(text, /YTD SIGNAL/);
  assert.doesNotMatch(text, /\bYTD:/);
  assert.doesNotMatch(text, /PCLASS:/);
});

test("formatShortPredictionMessage keeps placeholders and still hides PCLASS", () => {
  const prediction: PredictionResult = {
    ...basePrediction,
    modelSummary: {
      ...basePrediction.modelSummary!,
      dirt: {
        ...basePrediction.modelSummary!.dirt!,
        modelProbabilities: {
          finalP1: 52.2,
        },
      },
      novaEdge: undefined,
    },
  };

  const text = formatShortPredictionMessage(prediction);
  assert.match(text, /Logistic: - \/ -/);
  assert.match(text, /Markov: - \/ -/);
  assert.match(text, /Bradley-Terry: - \/ -/);
  assert.match(text, /PCA: - \/ -/);
  assert.match(text, /NOVA EDGE: - \/ -/);
  assert.match(text, /NOVA PICK: -/);
  assert.match(text, /Methods: 0/);
  assert.match(text, /Agreement: -\/-/);
  assert.doesNotMatch(text, /PCLASS:/);
  assert.doesNotMatch(text, /✅✅✅/);
});

test("formatShortPredictionMessage uses LIVE date for live matches", () => {
  const prediction: PredictionResult = {
    ...basePrediction,
    matchStatus: "live",
  };
  const text = formatShortPredictionMessage(prediction);
  assert.match(text, /Date: LIVE/);
});

test("formatShortPredictionMessage uses '-' for missing winner odds", () => {
  const prediction: PredictionResult = {
    ...basePrediction,
    predictedWinner: "Unknown Winner",
  };
  const text = formatShortPredictionMessage(prediction);
  assert.match(text, /Odds: -/);
});

test("formatShortPredictionMessage does not add checkmarks when HISTORY-5 and NOVA winners differ", () => {
  const prediction: PredictionResult = {
    ...basePrediction,
    modelSummary: {
      ...basePrediction.modelSummary!,
      novaEdge: {
        ...basePrediction.modelSummary!.novaEdge!,
        winner: "Amanda Anisimova",
      },
    },
  };

  const text = formatShortPredictionMessage(prediction);
  const lines = text.split("\n");
  assert.equal(lines[0], "TENNIS SIGNAL");
  assert.doesNotMatch(text, /✅✅✅/);
});
