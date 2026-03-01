import test from "node:test";
import assert from "node:assert/strict";
import { predict } from "../src/predictor.js";
import { REQUIRED_DIRT_METRIC_KEYS } from "../src/predict/requiredMetrics.js";
import type {
  HistoricalMatchTechStats,
  PlayerStateFeature,
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
  const normalized = name.trim().toLowerCase();
  const bias =
    normalized === "player a" || normalized === "a"
      ? 0.04
      : normalized === "player b" || normalized === "b"
        ? -0.04
        : 0;
  return {
    playerName: name,
    profileUrl,
    parsedMatches: matches,
    stateFeatures: makeStateFeatures(matches, bias),
    missingStatsCount: 0,
    errors: [],
  };
}

function makeStateFeatures(
  matches: HistoricalMatchTechStats[],
  bias: number,
): PlayerStateFeature[] {
  return matches.map((match, index) => ({
    matchUrl: match.matchUrl,
    candidateIndex: index,
    tournament: "ATP Example",
    resultText: index < Math.ceil(matches.length / 2) ? "W" : "L",
    scoreText: index < Math.ceil(matches.length / 2) ? "2-0" : "1-2",
    serveCore: clamp(0.55 + bias - index * 0.012, 0, 1),
    returnCore: clamp(0.52 + bias - index * 0.01, 0, 1),
    controlCore: clamp(0.54 + bias - index * 0.011, 0, 1),
    disciplineCore: clamp(0.57 + bias - index * 0.009, 0, 1),
    tpwCore: clamp(0.53 + bias - index * 0.01, 0, 1),
    oppStatsQ01: clamp(0.56 - index * 0.01, 0, 1),
    oppStrengthComposite: clamp(0.58 - index * 0.012, 0, 1),
    tierScore: 0.7,
    qualifying: false,
  }));
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
  assert.ok(prediction.modelSummary?.hybridShadow);
  assert.ok(prediction.modelSummary?.mahalShadow);
  assert.ok(prediction.modelSummary?.matchupShadow);
  assert.ok(prediction.modelSummary?.marketResidualShadow);
  assert.ok(typeof prediction.modelSummary?.novaEdge?.p1 === "number");
  assert.ok(typeof prediction.modelSummary?.novaEdge?.p2 === "number");
  assert.equal(prediction.modelSummary?.hybridShadow?.source, "form_stats_hybrid_v2");
  assert.equal(prediction.modelSummary?.mahalShadow?.source, "stable14_mahal_edge_v2");
  assert.equal(prediction.modelSummary?.matchupShadow?.source, "stable14_matchup_cross_v1");
  assert.equal(prediction.modelSummary?.marketResidualShadow?.source, "market_residual_oppadj_v1");
  assert.equal(prediction.modelSummary?.playerState?.source, "trend_strength_windows_v1");
  assert.equal(prediction.modelSummary?.playerState?.historyTechTarget, 10);
  assert.equal(prediction.modelSummary?.playerState?.playerA.nTech, 5);
  assert.equal(prediction.modelSummary?.playerState?.playerB.nTech, 5);
  assert.equal(prediction.modelSummary?.playerState?.playerA.hasW10, false);
  assert.equal(prediction.modelSummary?.playerState?.playerA.hasW5, true);
  assert.equal(prediction.modelSummary?.playerState?.playerA.hasW3, true);
  assert.ok(prediction.modelSummary?.playerState?.playerA.quality);
  assert.ok(prediction.modelSummary?.playerState?.playerB.quality);
  assert.ok(
    typeof prediction.modelSummary?.playerState?.playerA.quality?.windowReliability.w5 === "number",
  );
  assert.ok(
    typeof prediction.modelSummary?.playerState?.playerA.quality?.composite === "number",
  );
  assert.equal(prediction.modelSummary?.stateDecision?.source, "player_state_decision_v3");
  assert.ok(
    prediction.modelSummary?.stateDecision?.winner === "Player A" ||
      prediction.modelSummary?.stateDecision?.winner === "Player B" ||
      prediction.modelSummary?.stateDecision?.winner === undefined,
  );
  assert.ok(typeof prediction.modelSummary?.stateDecision?.reliability === "number");
  assert.ok(Array.isArray(prediction.modelSummary?.stateDecision?.reasonTags));
  assert.ok(
    prediction.modelSummary?.novaEdge?.winner === "Player A" ||
      prediction.modelSummary?.novaEdge?.winner === "Player B",
  );
  assert.ok(
    prediction.modelSummary?.mahalShadow?.winner === "Player A" ||
      prediction.modelSummary?.mahalShadow?.winner === "Player B",
  );
  assert.ok(
    prediction.modelSummary?.matchupShadow?.winner === "Player A" ||
      prediction.modelSummary?.matchupShadow?.winner === "Player B",
  );
  assert.ok(
    prediction.modelSummary?.marketResidualShadow?.winner === "Player A" ||
      prediction.modelSummary?.marketResidualShadow?.winner === "Player B",
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

test("predict applies pair-contrast to PLAYER STATE and yields readable gaps on full 10/10 coverage", () => {
  const sharedA = Array.from({ length: 10 }, (_, index) => makeMatch(`https://x/pc/a${index}`, 57));
  const sharedB = Array.from({ length: 10 }, (_, index) => makeMatch(`https://x/pc/b${index}`, 57));
  const playerA = makePlayer("Alpha", sharedA);
  const playerB = makePlayer("Beta", sharedB);

  playerA.stateFeatures = playerA.stateFeatures.map((f, index) => ({
    ...f,
    controlCore: clamp(f.controlCore + 0.004 + index * 0.0003, 0, 1),
    returnCore: clamp(f.returnCore + 0.0035 + index * 0.0002, 0, 1),
    tpwCore: clamp(f.tpwCore + 0.003 + index * 0.0002, 0, 1),
  }));
  playerB.stateFeatures = playerB.stateFeatures.map((f, index) => ({
    ...f,
    controlCore: clamp(f.controlCore - 0.0035 - index * 0.0002, 0, 1),
    returnCore: clamp(f.returnCore - 0.003 - index * 0.0002, 0, 1),
    tpwCore: clamp(f.tpwCore - 0.0025 - index * 0.0002, 0, 1),
  }));

  const prediction = predict(
    {
      matchUrl: "https://sports1.nowgoal26.com/tennis/match/333",
      matchLabel: "Alpha vs Beta",
      playerAName: "Alpha",
      playerBName: "Beta",
      status: "upcoming",
    },
    playerA,
    playerB,
    5,
  );

  const state = prediction.modelSummary?.playerState;
  const stateDecision = prediction.modelSummary?.stateDecision;
  assert.ok(state);
  assert.ok(stateDecision);
  assert.equal(state?.playerA.nTech, 10);
  assert.equal(state?.playerB.nTech, 10);
  assert.ok(typeof state?.playerA.quality?.composite === "number");
  assert.ok(typeof state?.playerB.quality?.composite === "number");
  assert.ok(typeof stateDecision?.reliability === "number");
  assert.ok(Array.isArray(stateDecision?.reasonTags));

  const gaps = [
    Math.abs((state?.playerA.stability.w10 ?? 0) - (state?.playerB.stability.w10 ?? 0)),
    Math.abs((state?.playerA.formTech.w10 ?? 0) - (state?.playerB.formTech.w10 ?? 0)),
    Math.abs((state?.playerA.formPlus.w10 ?? 0) - (state?.playerB.formPlus.w10 ?? 0)),
    Math.abs((state?.playerA.strength.w10 ?? 0) - (state?.playerB.strength.w10 ?? 0)),
    Math.abs((state?.playerA.stability.w5 ?? 0) - (state?.playerB.stability.w5 ?? 0)),
    Math.abs((state?.playerA.formTech.w5 ?? 0) - (state?.playerB.formTech.w5 ?? 0)),
    Math.abs((state?.playerA.formPlus.w5 ?? 0) - (state?.playerB.formPlus.w5 ?? 0)),
    Math.abs((state?.playerA.strength.w5 ?? 0) - (state?.playerB.strength.w5 ?? 0)),
  ];
  assert.ok(Math.max(...gaps) >= 4);
});

test("state recalculation does not affect winner/confidence", () => {
  const sharedA = Array.from({ length: 10 }, (_, index) => makeMatch(`https://x/inv/a${index}`, 62));
  const sharedB = Array.from({ length: 10 }, (_, index) => makeMatch(`https://x/inv/b${index}`, 54));
  const baseA = makePlayer("Invariant A", sharedA);
  const baseB = makePlayer("Invariant B", sharedB);

  const context = {
    matchUrl: "https://sports1.nowgoal26.com/tennis/match/444",
    matchLabel: "Invariant A vs Invariant B",
    playerAName: "Invariant A",
    playerBName: "Invariant B",
    status: "upcoming" as const,
  };

  const baseline = predict(context, baseA, baseB, 5);

  const extremeA = {
    ...baseA,
    stateFeatures: baseA.stateFeatures.map((f) => ({
      ...f,
      serveCore: 0.98,
      returnCore: 0.97,
      controlCore: 0.98,
      disciplineCore: 0.95,
      tpwCore: 0.97,
    })),
  };
  const extremeB = {
    ...baseB,
    stateFeatures: baseB.stateFeatures.map((f) => ({
      ...f,
      serveCore: 0.12,
      returnCore: 0.14,
      controlCore: 0.11,
      disciplineCore: 0.2,
      tpwCore: 0.13,
    })),
  };

  const withExtremeState = predict(context, extremeA, extremeB, 5);

  assert.equal(withExtremeState.predictedWinner, baseline.predictedWinner);
  assert.equal(withExtremeState.confidence, baseline.confidence);
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
