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
    hybridShadow: {
      p1: 58.2,
      p2: 41.8,
      winner: "Mirra Andreeva",
      source: "form_stats_hybrid_v2",
      components: {
        statsP1: 61.1,
        formP1: 53.4,
        hybridRawP1: 58.2,
        statsWeight: 0.65,
        formWeight: 0.35,
        statsReliability: 1,
        formReliability: 1,
        hybridReliability: 1,
      },
      warnings: [],
    },
    mahalShadow: {
      p1: 56.1,
      p2: 43.9,
      winner: "Mirra Andreeva",
      source: "stable14_mahal_edge_v2",
      components: {
        rawP1: 61.2,
        scoreS: 0.42,
        distanceD: 0.9,
        reliability: 0.64,
        statsCoverage: 1,
        varianceStability: 0.58,
        signConsensus: 0.73,
        distanceConfidence: 0.6,
      },
      warnings: [],
    },
    matchupShadow: {
      p1: 54.6,
      p2: 45.4,
      winner: "Mirra Andreeva",
      source: "stable14_matchup_cross_v1",
      components: {
        rawP1: 58.1,
        scoreS: 0.23,
        reliability: 0.62,
        statsCoverage: 1,
        componentAgreement: 0.74,
        stabilityConfidence: 0.66,
        edgeMagnitude: 0.42,
        serveMatch: 0.11,
        returnMatch: 0.08,
        pressureMatch: 0.03,
        controlMatch: 0.04,
      },
      warnings: [],
    },
  },
  warnings: ["x"],
};

test("formatShortPredictionMessage renders no-YTD short message with NOVA and HISTORY-5", () => {
  const text = formatShortPredictionMessage(basePrediction);
  const lines = text.split("\n");

  assert.equal(lines.length, 23);
  assert.equal(lines[0], "✅✅✅");
  assert.equal(lines[1], "TENNIS SIGNAL");
  assert.equal(lines[3], "Mirra Andreeva vs Amanda Anisimova");
  assert.match(lines[4] || "", /^Ссылка на игру: https:\/\/www\.flashscore\.com\.ua\/match\//);
  assert.doesNotMatch(lines[4] || "", /<a href=/);
  assert.equal(lines[5], "Date: 19.02.2026 21:55");
  assert.equal(lines[11], "==================");
  assert.equal(lines[17], "==================");
  assert.equal(lines[18], "SHORT SUMMARY");
  assert.match(lines[19] || "", /^HISTORY-5: Mirra Andreeva \| 65% \/ 35%$/);
  assert.match(lines[20] || "", /^NOVA: Mirra Andreeva \| 62% \/ 38%$/);
  assert.equal(lines[21], "NOVA FILTER: 🟢 HIGH");
  assert.equal(lines[22], "==================");

  assert.doesNotMatch(text, /YTD SIGNAL/);
  assert.doesNotMatch(text, /\bYTD:/);
  assert.doesNotMatch(text, /PCLASS:/);
  assert.doesNotMatch(text, /NOVA EDGE:/);
  assert.doesNotMatch(text, /NOVA PICK:/);
  assert.doesNotMatch(text, /HYBRID \(shadow\):/);
  assert.doesNotMatch(text, /MAHAL \(shadow\):/);
  assert.doesNotMatch(text, /MATCHUP \(shadow\):/);
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
      hybridShadow: undefined,
      mahalShadow: undefined,
      matchupShadow: undefined,
    },
  };

  const text = formatShortPredictionMessage(prediction);
  assert.match(text, /Logistic: - \/ -/);
  assert.match(text, /Markov: - \/ -/);
  assert.match(text, /Bradley-Terry: - \/ -/);
  assert.match(text, /PCA: - \/ -/);
  assert.match(text, /SHORT SUMMARY/);
  assert.match(text, /NOVA: - \| - \/ -/);
  assert.match(text, /NOVA FILTER: 🟡 NORMAL/);
  assert.match(text, /Methods: 0/);
  assert.match(text, /Agreement: -\/-/);
  assert.doesNotMatch(text, /PCLASS:/);
  assert.doesNotMatch(text, /✅✅✅/);
  assert.doesNotMatch(text, /NOVA EDGE:/);
  assert.doesNotMatch(text, /NOVA PICK:/);
  assert.doesNotMatch(text, /HYBRID \(shadow\):/);
  assert.doesNotMatch(text, /MAHAL \(shadow\):/);
  assert.doesNotMatch(text, /MATCHUP \(shadow\):/);
});

test("formatShortPredictionMessage renders Telegram HTML link when requested", () => {
  const text = formatShortPredictionMessage(basePrediction, { linkMode: "telegram_html_link" });
  const lines = text.split("\n");

  assert.match(
    lines[4] || "",
    /^<a href="https:\/\/www\.flashscore\.com\.ua\/match\/example\/#\/match-summary\?mid=abcd1234">ссылка на игру<\/a>$/,
  );
  assert.doesNotMatch(lines[4] || "", /^Ссылка на игру:/);
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

test("formatShortPredictionMessage renders NOVA FILTER SKIP for low confidence", () => {
  const prediction: PredictionResult = {
    ...basePrediction,
    confidence: 0.49,
  };

  const text = formatShortPredictionMessage(prediction);
  assert.match(text, /NOVA FILTER: 🔴 SKIP/);
});

test("formatShortPredictionMessage renders NOVA FILTER SKIP for weak NOVA without Logistic agreement", () => {
  const prediction: PredictionResult = {
    ...basePrediction,
    modelSummary: {
      ...basePrediction.modelSummary!,
      dirt: {
        ...basePrediction.modelSummary!.dirt!,
        modelProbabilities: {
          ...basePrediction.modelSummary!.dirt!.modelProbabilities!,
          logRegP1: 46,
        },
      },
      novaEdge: {
        ...basePrediction.modelSummary!.novaEdge!,
        p1: 52,
        p2: 48,
      },
    },
  };

  const text = formatShortPredictionMessage(prediction);
  assert.match(text, /NOVA FILTER: 🔴 SKIP/);
});

test("formatShortPredictionMessage renders NOVA FILTER NORMAL for disagreement with strong NOVA", () => {
  const prediction: PredictionResult = {
    ...basePrediction,
    modelSummary: {
      ...basePrediction.modelSummary!,
      dirt: {
        ...basePrediction.modelSummary!.dirt!,
        modelProbabilities: {
          ...basePrediction.modelSummary!.dirt!.modelProbabilities!,
          logRegP1: 46,
        },
      },
    },
  };

  const text = formatShortPredictionMessage(prediction);
  assert.match(text, /NOVA FILTER: 🟡 NORMAL/);
});

test("formatShortPredictionMessage renders NOVA FILTER NORMAL when Logistic is missing", () => {
  const prediction: PredictionResult = {
    ...basePrediction,
    modelSummary: {
      ...basePrediction.modelSummary!,
      dirt: {
        ...basePrediction.modelSummary!.dirt!,
        modelProbabilities: {
          ...basePrediction.modelSummary!.dirt!.modelProbabilities!,
          logRegP1: undefined,
        },
      },
    },
  };

  const text = formatShortPredictionMessage(prediction);
  assert.match(text, /NOVA FILTER: 🟡 NORMAL/);
});
