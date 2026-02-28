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
    playerState: {
      source: "trend_strength_windows_v1",
      historyTechTarget: 10,
      playerA: {
        nTech: 8,
        hasW10: true,
        hasW5: true,
        hasW3: true,
        degradedW10: true,
        degradedW5: false,
        degradedW3: false,
        stability: { w10: 61.3, w5: 64.4, w3: 68.2 },
        formTech: { w10: 47.8, w5: 52.1, w3: 57.7 },
        formPlus: { w10: 49.5, w5: 53.7, w3: 59.1 },
        strength: { w10: 66.2, w5: 63.4, w3: 60.1 },
      },
      playerB: {
        nTech: 6,
        hasW10: true,
        hasW5: true,
        hasW3: true,
        degradedW10: true,
        degradedW5: false,
        degradedW3: false,
        stability: { w10: 55.4, w5: 54.2, w3: 54.9 },
        formTech: { w10: 53.2, w5: 51.4, w3: 49.8 },
        formPlus: { w10: 54.5, w5: 52.1, w3: 50.4 },
        strength: { w10: 58.9, w5: 60.2, w3: 61.1 },
      },
    },
    stateDecision: {
      source: "player_state_decision_v2",
      winner: "Mirra Andreeva",
      p1: 64.2,
      p2: 35.8,
      reliability: 0.72,
      scoreA: 57.4,
      scoreB: 50.2,
      reasonTags: ["FORM_PLUS", "CONSENSUS"],
      votes: {
        playerA: 3,
        playerB: 1,
      },
    },
  },
  warnings: ["x"],
};

test("formatShortPredictionMessage renders no-YTD short message with NOVA and HISTORY-5", () => {
  const text = formatShortPredictionMessage(basePrediction);
  const lines = text.split("\n");

  assert.equal(lines.length, 39);
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
  assert.equal(lines[21], "STATE: Mirra Andreeva | 64% / 36%");
  assert.equal(lines[22], "STATE REASON: FORM+ + CONSENSUS");
  assert.equal(lines[23], "NOVA FILTER: 🟢 HIGH");
  assert.equal(lines[24], "==================");
  assert.equal(lines[25], "PLAYER STATE (10/5/3)");
  assert.equal(lines[26], "Mirra Andreeva:");
  assert.match(lines[27] || "", /^Stability: \d+ \/ \d+ \/ \d+ [↗↘→]$/);
  assert.match(lines[28] || "", /^Form-TECH: \d+ \/ \d+ \/ \d+ [↗↘→]$/);
  assert.match(lines[29] || "", /^Form-PLUS: \d+ \/ \d+ \/ \d+ [↗↘→]$/);
  assert.match(lines[30] || "", /^Strength: \d+ \/ \d+ \/ \d+ [↗↘→]$/);
  assert.match(lines[31] || "", /^Coverage: tech 8\/10 \| W10~ W5✓ W3✓$/);
  assert.equal(lines[32], "Amanda Anisimova:");
  assert.match(lines[33] || "", /^Stability: \d+ \/ \d+ \/ \d+ [↗↘→]$/);
  assert.match(lines[34] || "", /^Form-TECH: \d+ \/ \d+ \/ \d+ [↗↘→]$/);
  assert.match(lines[35] || "", /^Form-PLUS: \d+ \/ \d+ \/ \d+ [↗↘→]$/);
  assert.match(lines[36] || "", /^Strength: \d+ \/ \d+ \/ \d+ [↗↘→]$/);
  assert.match(lines[37] || "", /^Coverage: tech 6\/10 \| W10~ W5✓ W3✓$/);
  assert.equal(lines[38], "==================");

  assert.doesNotMatch(text, /YTD SIGNAL/);
  assert.doesNotMatch(text, /\bYTD:/);
  assert.doesNotMatch(text, /PCLASS:/);
  assert.doesNotMatch(text, /NOVA EDGE:/);
  assert.doesNotMatch(text, /NOVA PICK:/);
  assert.doesNotMatch(text, /HYBRID \(shadow\):/);
  assert.doesNotMatch(text, /MAHAL \(shadow\):/);
  assert.doesNotMatch(text, /MATCHUP \(shadow\):/);
});

test("formatShortPredictionMessage uses modelSummary.stateDecision values in SHORT SUMMARY", () => {
  const prediction: PredictionResult = {
    ...basePrediction,
    matchLabel: "Stearns P. vs Birrell K.",
    playerAName: "Stearns P.",
    playerBName: "Birrell K.",
    modelSummary: {
      ...basePrediction.modelSummary!,
      stateDecision: {
        source: "player_state_decision_v2",
        winner: "Birrell K.",
        p1: 29,
        p2: 71,
        reliability: 1,
        scoreA: 45,
        scoreB: 58,
        reasonTags: ["FORM_PLUS", "MOMENTUM_UP"],
        votes: {
          playerA: 1,
          playerB: 3,
        },
      },
    },
  };

  const text = formatShortPredictionMessage(prediction);
  assert.match(text, /STATE: Birrell K\. \| 29% \/ 71%/);
  assert.match(text, /STATE REASON: FORM\+ \+ MOMENTUM↑/);
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
      playerState: undefined,
      stateDecision: undefined,
    },
  };

  const text = formatShortPredictionMessage(prediction);
  assert.match(text, /Logistic: - \/ -/);
  assert.match(text, /Markov: - \/ -/);
  assert.match(text, /Bradley-Terry: - \/ -/);
  assert.match(text, /PCA: - \/ -/);
  assert.match(text, /SHORT SUMMARY/);
  assert.match(text, /NOVA: - \| - \/ -/);
  assert.match(text, /STATE: - \| - \/ -/);
  assert.match(text, /STATE REASON: -/);
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
  assert.match(text, /PLAYER STATE \(10\/5\/3\)/);
  assert.match(text, /Stability: - \/ - \/ -/);
  assert.match(text, /Form-TECH: - \/ - \/ -/);
  assert.match(text, /Form-PLUS: - \/ - \/ -/);
  assert.match(text, /Strength: - \/ - \/ -/);
  assert.match(text, /Coverage: tech 0\/10 \| W10x W5x W3x/);
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

test("formatShortPredictionMessage adds checkmarks for 4/5 agreement with confidence above 50", () => {
  const prediction: PredictionResult = {
    ...basePrediction,
    confidence: 0.501,
    modelSummary: {
      ...basePrediction.modelSummary!,
      dirt: {
        ...basePrediction.modelSummary!.dirt!,
        modelProbabilities: {
          ...basePrediction.modelSummary!.dirt!.modelProbabilities!,
          markovP1: 46,
        },
      },
    },
  };

  const text = formatShortPredictionMessage(prediction);
  const lines = text.split("\n");
  assert.equal(lines[0], "✅✅✅");
  assert.match(text, /Agreement: 4\/5$/m);
  assert.doesNotMatch(text, /Agreement: 4\/5 🔴/);
  assert.match(text, /Confidence: 50,1%$/m);
});

test("formatShortPredictionMessage does not add checkmarks when confidence is exactly 50.0%", () => {
  const prediction: PredictionResult = {
    ...basePrediction,
    confidence: 0.5,
  };

  const text = formatShortPredictionMessage(prediction);
  assert.doesNotMatch(text, /✅✅✅/);
  assert.match(text, /Confidence: 50,0% 🔴/);
});

test("formatShortPredictionMessage does not add checkmarks when agreement is 3/5", () => {
  const prediction: PredictionResult = {
    ...basePrediction,
    confidence: 0.7,
    modelSummary: {
      ...basePrediction.modelSummary!,
      dirt: {
        ...basePrediction.modelSummary!.dirt!,
        modelProbabilities: {
          ...basePrediction.modelSummary!.dirt!.modelProbabilities!,
          markovP1: 46,
          bradleyP1: 44,
        },
      },
    },
  };

  const text = formatShortPredictionMessage(prediction);
  assert.doesNotMatch(text, /✅✅✅/);
  assert.match(text, /Agreement: 3\/5 🔴/);
});

test("formatShortPredictionMessage renders NOVA FILTER SKIP for low confidence", () => {
  const prediction: PredictionResult = {
    ...basePrediction,
    confidence: 0.49,
  };

  const text = formatShortPredictionMessage(prediction);
  assert.match(text, /NOVA FILTER: 🔴 SKIP/);
});

test("formatShortPredictionMessage adds red markers to both Agreement and Confidence on weak random-like signal", () => {
  const prediction: PredictionResult = {
    ...basePrediction,
    confidence: 0.5,
    modelSummary: {
      ...basePrediction.modelSummary!,
      dirt: {
        ...basePrediction.modelSummary!.dirt!,
        modelProbabilities: {
          ...basePrediction.modelSummary!.dirt!.modelProbabilities!,
          logRegP1: 46,
          markovP1: 50,
          bradleyP1: 50,
          pcaP1: 77,
        },
      },
      novaEdge: {
        ...basePrediction.modelSummary!.novaEdge!,
        p1: 42,
        p2: 58,
        winner: "Amanda Anisimova",
      },
    },
    predictedWinner: "Mirra Andreeva",
  };

  const text = formatShortPredictionMessage(prediction);
  assert.match(text, /Agreement: 1\/5 🔴/);
  assert.match(text, /Confidence: 50,0% 🔴/);
  assert.doesNotMatch(text, /✅✅✅/);
});

test("formatShortPredictionMessage keeps Agreement non-red for 5/5 and Confidence non-red above 50", () => {
  const text = formatShortPredictionMessage(basePrediction);
  assert.match(text, /Agreement: 5\/5$/m);
  assert.doesNotMatch(text, /Agreement: 5\/5 🔴/);
  assert.match(text, /Confidence: 65,4%$/m);
  assert.doesNotMatch(text, /Confidence: 65,4% 🔴/);
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
