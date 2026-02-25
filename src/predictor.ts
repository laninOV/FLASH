import { clamp, ratio } from "./common/math.js";
import { aggregateIndexPairs } from "./predict/dirtPairs.js";
import { computeFormStatsHybrid } from "./predict/formStatsHybrid.js";
import { computeMahalEdgeShadow } from "./predict/mahalEdge.js";
import { computeMarketResidualShadow } from "./predict/marketResidual.js";
import { computeMatchupCrossShadow } from "./predict/matchupCross.js";
import { computeNovaEdge } from "./predict/novaEdge.js";
import { extractDirtFeatureRow, type DirtFeatureRow } from "./predict/requiredMetrics.js";
import { pickByOddsOrSeed } from "./predict/tieBreak.js";
import type {
  EnsembleMeta,
  HistoryModuleResult,
  MatchContext,
  PclassSnapshot,
  PlayerRecentStats,
  PredictionResult,
} from "./types.js";

const METRICS_POLICY = "stable14";
const NEUTRAL_EPSILON = 1e-9;

export function predict(
  context: MatchContext,
  playerAStats: PlayerRecentStats,
  playerBStats: PlayerRecentStats,
  requestedPerPlayer: number,
): PredictionResult {
  const playerAFeatures = collectFeatureRows(playerAStats);
  const playerBFeatures = collectFeatureRows(playerBStats);
  const pairResult = aggregateIndexPairs(playerAFeatures, playerBFeatures, requestedPerPlayer);
  const finalP1 = pairResult.modelProbabilities.finalP1;
  const tieBreakSeed = buildTieBreakSeed(context);
  const novaEdge = computeNovaEdge(
    playerAFeatures,
    playerBFeatures,
    context.playerAName,
    context.playerBName,
    {
      homeOdd: context.marketOdds?.home,
      awayOdd: context.marketOdds?.away,
      seed: tieBreakSeed,
    },
  );
  const hybridShadow = computeFormStatsHybrid({
    playerAStats,
    playerBStats,
    playerAName: context.playerAName,
    playerBName: context.playerBName,
    requestedPerPlayer,
    homeOdd: context.marketOdds?.home,
    awayOdd: context.marketOdds?.away,
    seed: tieBreakSeed,
  });
  const mahalShadow = computeMahalEdgeShadow({
    playerAStats,
    playerBStats,
    playerAName: context.playerAName,
    playerBName: context.playerBName,
    requestedPerPlayer,
    homeOdd: context.marketOdds?.home,
    awayOdd: context.marketOdds?.away,
    seed: tieBreakSeed,
  });
  const matchupShadow = computeMatchupCrossShadow({
    playerAStats,
    playerBStats,
    playerAName: context.playerAName,
    playerBName: context.playerBName,
    requestedPerPlayer,
    homeOdd: context.marketOdds?.home,
    awayOdd: context.marketOdds?.away,
    seed: tieBreakSeed,
  });
  const marketResidualShadow = computeMarketResidualShadow({
    playerAStats,
    playerBStats,
    playerAName: context.playerAName,
    playerBName: context.playerBName,
    requestedPerPlayer,
    homeOdd: context.marketOdds?.home,
    awayOdd: context.marketOdds?.away,
    tournament: context.tournament,
    status: context.status,
    seed: tieBreakSeed,
  });

  const modules = [
    probabilityToModule("LOGREG", pairResult.modelProbabilities.logRegP1),
    probabilityToModule("MARKOV", pairResult.modelProbabilities.markovP1),
    probabilityToModule("BRADLEY", pairResult.modelProbabilities.bradleyP1),
    probabilityToModule("PCA", pairResult.modelProbabilities.pcaP1),
  ];
  const ensemble = buildEnsembleFromProbability(modules, finalP1);

  const warnings = [
    ...playerAStats.errors.map((error) => `${context.playerAName}: ${error}`),
    ...playerBStats.errors.map((error) => `${context.playerBName}: ${error}`),
    ...pairResult.warnings,
    ...novaEdge.warnings,
  ];
  if (pairResult.requestedPairs !== pairResult.validPairs) {
    warnings.push(`valid_pairs=${pairResult.validPairs}/${pairResult.requestedPairs}`);
  }

  const decision = resolveWinner({
    finalP1,
    playerAName: context.playerAName,
    playerBName: context.playerBName,
    homeOdd: context.marketOdds?.home,
    awayOdd: context.marketOdds?.away,
    seed: tieBreakSeed,
  });
  if (decision.warning) {
    warnings.push(decision.warning);
  }

  const coverageA = playerAFeatures.length;
  const coverageB = playerBFeatures.length;
  const dataStatus = buildDataStatus(
    requestedPerPlayer,
    coverageA,
    coverageB,
    pairResult,
    playerAStats,
    playerBStats,
  );
  const confidence = computeConfidenceScore({
    requestedPerPlayer,
    coverageA,
    coverageB,
    validPairs: pairResult.validPairs,
    activeModels: ensemble.active,
    finalProbability: finalP1,
    modelProbabilities: [
      pairResult.modelProbabilities.logRegP1,
      pairResult.modelProbabilities.markovP1,
      pairResult.modelProbabilities.bradleyP1,
      pairResult.modelProbabilities.pcaP1,
    ],
  });
  const pclass = resolveContextPclass(context.pclass);
  if (pclass.source === "missing") {
    warnings.push("pclass_missing_dv_data");
  }

  return {
    createdAt: new Date().toISOString(),
    matchUrl: context.matchUrl,
    matchLabel: context.matchLabel,
    tournament: context.tournament,
    matchStatus: context.status,
    scheduledStartText: context.scheduledStartText,
    playerAName: context.playerAName,
    playerBName: context.playerBName,
    marketOdds: context.marketOdds,
    predictedWinner: decision.winner,
    confidence,
    reason: "DirtTennis formulas (pair-by-index, strict 5 full Tech histories, stable14)",
    statsCoverage: {
      requestedPerPlayer,
      playerACollected: coverageA,
      playerBCollected: coverageB,
    },
    dataStatus,
    modelSummary: {
      modules,
      ensemble,
      rating5: {
        playerA: finalP1,
        playerB: 100 - finalP1,
      },
      reliability: {
        playerA: ratio(coverageA, requestedPerPlayer),
        playerB: ratio(coverageB, requestedPerPlayer),
      },
      dirt: {
        validPairs: pairResult.validPairs,
        requestedPairs: pairResult.requestedPairs,
        modelProbabilities: pairResult.modelProbabilities,
        weights: pairResult.weights,
        stability: pairResult.stability,
        pclass,
      },
      novaEdge: {
        p1: novaEdge.p1,
        p2: novaEdge.p2,
        winner: novaEdge.winner,
        source: novaEdge.source,
      },
      hybridShadow: {
        p1: hybridShadow.p1,
        p2: hybridShadow.p2,
        winner: hybridShadow.winner,
        source: hybridShadow.source,
        components: hybridShadow.components,
        warnings: hybridShadow.warnings,
      },
      mahalShadow: {
        p1: mahalShadow.p1,
        p2: mahalShadow.p2,
        winner: mahalShadow.winner,
        source: mahalShadow.source,
        components: mahalShadow.components,
        warnings: mahalShadow.warnings,
      },
      matchupShadow: {
        p1: matchupShadow.p1,
        p2: matchupShadow.p2,
        winner: matchupShadow.winner,
        source: matchupShadow.source,
        components: matchupShadow.components,
        warnings: matchupShadow.warnings,
      },
      marketResidualShadow: {
        p1: marketResidualShadow.p1,
        p2: marketResidualShadow.p2,
        winner: marketResidualShadow.winner,
        source: marketResidualShadow.source,
        components: marketResidualShadow.components,
        warnings: marketResidualShadow.warnings,
      },
    },
    warnings,
  };
}

function collectFeatureRows(stats: PlayerRecentStats): DirtFeatureRow[] {
  const out: DirtFeatureRow[] = [];
  for (const match of stats.parsedMatches) {
    const row = extractDirtFeatureRow(match);
    if (!row) {
      continue;
    }
    out.push(row);
  }
  return out;
}

function resolveWinner(input: {
  finalP1: number;
  playerAName: string;
  playerBName: string;
  homeOdd?: number;
  awayOdd?: number;
  seed: string;
}): { winner: string; warning?: string } {
  if (input.finalP1 > 50 + NEUTRAL_EPSILON) {
    return { winner: input.playerAName };
  }
  if (input.finalP1 < 50 - NEUTRAL_EPSILON) {
    return { winner: input.playerBName };
  }
  const tieBreak = pickByOddsOrSeed(
    input.playerAName,
    input.playerBName,
    input.homeOdd,
    input.awayOdd,
    input.seed,
  );
  return {
    winner: tieBreak.winner,
    warning:
      tieBreak.reason === "odds"
        ? "neutral_model_odds_tiebreak"
        : "neutral_model_seed_tiebreak",
  };
}

function probabilityToModule(name: string, p1: number | undefined): HistoryModuleResult {
  if (!Number.isFinite(p1)) {
    return {
      name,
      side: "neutral",
      strength: 0,
      explain: [],
      flags: ["unavailable"],
    };
  }
  const home = p1 as number;
  const away = 100 - home;
  const delta = home - away;
  return {
    name,
    side: delta > 0 ? "home" : delta < 0 ? "away" : "neutral",
    strength: Math.abs(delta) / 10,
    explain: [`P1=${home.toFixed(1)} P2=${away.toFixed(1)}`],
    flags: [],
  };
}

function buildEnsembleFromProbability(
  modules: HistoryModuleResult[],
  finalP1: number,
): EnsembleMeta {
  let votesHome = 0;
  let votesAway = 0;
  let strongHome = 0;
  let strongAway = 0;
  let active = 0;

  for (const module of modules) {
    if (module.side === "neutral") {
      continue;
    }
    active += 1;
    if (module.side === "home") {
      votesHome += 1;
      if (module.strength >= 2) {
        strongHome += 1;
      }
    } else {
      votesAway += 1;
      if (module.strength >= 2) {
        strongAway += 1;
      }
    }
  }

  return {
    finalSide: finalP1 > 50 ? "home" : finalP1 < 50 ? "away" : "neutral",
    score: ((finalP1 - 50) / 50) * 12,
    votesHome,
    votesAway,
    strongHome,
    strongAway,
    active,
  };
}

export function computeConfidenceScore(input: {
  requestedPerPlayer: number;
  coverageA: number;
  coverageB: number;
  validPairs: number;
  activeModels: number;
  finalProbability: number;
  modelProbabilities: Array<number | undefined>;
}): number {
  const coverageRatio = ratio(input.coverageA + input.coverageB, input.requestedPerPlayer * 2);
  const pairRatio = ratio(input.validPairs, input.requestedPerPlayer);
  const modelRatio = ratio(input.activeModels, 4);
  const rawEdge = Math.abs(input.finalProbability - 50);
  const edge = rawEdge <= NEUTRAL_EPSILON ? 0 : rawEdge / 50;
  const quality = 0.45 * modelRatio + 0.35 * pairRatio + 0.2 * coverageRatio;
  const base = 0.5 + edge * (0.45 + 0.35 * quality);
  const dispersion = modelDispersion(input.modelProbabilities);
  const penalty = clamp(dispersion / 40, 0, 0.12);

  return clamp(base - penalty, 0.5, 0.92);
}

function modelDispersion(values: Array<number | undefined>): number {
  const clean = values.filter((value): value is number => Number.isFinite(value));
  if (clean.length < 2) {
    return 0;
  }
  const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
  let sumSq = 0;
  for (const value of clean) {
    const diff = value - mean;
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / clean.length);
}

function buildDataStatus(
  requestedPerPlayer: number,
  coverageA: number,
  coverageB: number,
  pairResult: {
    requestedPairs: number;
    validPairs: number;
    modelProbabilities: {
      logRegP1?: number;
      markovP1?: number;
      bradleyP1?: number;
      pcaP1?: number;
      finalP1: number;
    };
    weights: {
      logReg: number;
      markov: number;
      bradley: number;
      pca: number;
    };
  },
  playerAStats: PlayerRecentStats,
  playerBStats: PlayerRecentStats,
): string {
  const aScan = playerAStats.historyScanStats;
  const bScan = playerBStats.historyScanStats;
  const aFiltered = aScan?.filtered;
  const bFiltered = bScan?.filtered;

  return (
    `metrics_policy=${METRICS_POLICY}, ` +
    `coverage A ${coverageA}/${requestedPerPlayer}, B ${coverageB}/${requestedPerPlayer}, ` +
    `valid_pairs=${pairResult.validPairs}/${pairResult.requestedPairs}, ` +
    `scan_count: A ${num(aScan?.scanned)}/${num(aScan?.candidatePool)} accepted=${num(aScan?.accepted)}, ` +
    `B ${num(bScan?.scanned)}/${num(bScan?.candidatePool)} accepted=${num(bScan?.accepted)}, ` +
    `rejected_incomplete_metrics: A=${num(aFiltered?.metricsIncomplete)} B=${num(
      bFiltered?.metricsIncomplete,
    )}, ` +
    `non_singles_history: A=${num(aFiltered?.nonSinglesHistory)} B=${num(
      bFiltered?.nonSinglesHistory,
    )}, ` +
    `tech_missing: A=${playerAStats.missingStatsCount} B=${playerBStats.missingStatsCount}, ` +
    `weights: logreg=${(pairResult.weights.logReg * 100).toFixed(0)}% markov=${(
      pairResult.weights.markov * 100
    ).toFixed(0)}% bradley=${(pairResult.weights.bradley * 100).toFixed(0)}% pca=${(
      pairResult.weights.pca * 100
    ).toFixed(0)}%, ` +
    `model_probs: logreg=${valueOrDash(pairResult.modelProbabilities.logRegP1)} markov=${valueOrDash(
      pairResult.modelProbabilities.markovP1,
    )} bradley=${valueOrDash(pairResult.modelProbabilities.bradleyP1)} pca=${valueOrDash(
      pairResult.modelProbabilities.pcaP1,
    )} final=${pairResult.modelProbabilities.finalP1.toFixed(1)}`
  );
}

function valueOrDash(value: number | undefined): string {
  if (!Number.isFinite(value)) {
    return "-";
  }
  return (value as number).toFixed(1);
}

function num(value: number | undefined): number {
  return typeof value === "number" ? value : 0;
}

function resolveContextPclass(value: PclassSnapshot | undefined): PclassSnapshot {
  if (
    value?.source === "match_dv_data" &&
    isPositiveInt(value.ev) &&
    isPositiveInt(value.dep)
  ) {
    return {
      ev: value.ev,
      dep: value.dep,
      source: "match_dv_data",
    };
  }
  return {
    source: "missing",
  };
}

function isPositiveInt(value: number | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function buildTieBreakSeed(context: MatchContext): string {
  return `${context.matchUrl}|${context.playerAName}|${context.playerBName}`;
}
