import type {
  PlayerStatePlayerSummary,
  PlayerStateWindowSeries,
  StateDecisionReasonTag,
  StateDecisionSummary,
} from "../types.js";

interface ComputeStateDecisionInput {
  playerAName: string;
  playerBName: string;
  playerA: PlayerStatePlayerSummary;
  playerB: PlayerStatePlayerSummary;
}

interface StateMetricSideScore {
  stability?: number;
  formTech?: number;
  formPlus?: number;
  strength?: number;
}

interface StateMetricAnchorScore {
  stability?: number;
  formTech?: number;
  formPlus?: number;
  strength?: number;
}

interface StateSideComputation {
  score?: number;
  reliability: number;
  metricScores: StateMetricSideScore;
  metricAnchors: StateMetricAnchorScore;
}

const RELIABILITY_WINDOW_WEIGHTS = {
  w10: 0.25,
  w5: 0.35,
  w3: 0.4,
} as const;

const METRIC_WEIGHTS = {
  stability: 0.18,
  formTech: 0.27,
  formPlus: 0.3,
  strength: 0.25,
} as const;

const METRIC_KEYS = ["stability", "formTech", "formPlus", "strength"] as const;
type MetricKey = (typeof METRIC_KEYS)[number];

const WINDOW_ANCHOR_WEIGHTS = {
  w10: 0.5,
  w5: 0.35,
  w3: 0.15,
} as const;

const WINDOW_RECENT_WEIGHTS = {
  w10: 0.2,
  w5: 0.35,
  w3: 0.45,
} as const;

const AGGRESSIVE_POLICY = {
  lowCoverageThreshold: 0.48,
  lowEdgeThreshold: 1.8,
  hardLowEdgeThreshold: 0.9,
  mixedConflictThreshold: 0.72,
  minWinnerVotes: 1,
} as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function resolveAvailabilityWeight(hasWindow: boolean, degraded: boolean): number {
  if (!hasWindow) {
    return 0;
  }
  if (degraded) {
    return 0.75;
  }
  return 1;
}

function weightedWindowMean(
  series: PlayerStateWindowSeries,
  availability: { w10: number; w5: number; w3: number },
  weights: { w10: number; w5: number; w3: number },
): number | undefined {
  const entries = [
    { value: series.w10, weight: weights.w10 * availability.w10 },
    { value: series.w5, weight: weights.w5 * availability.w5 },
    { value: series.w3, weight: weights.w3 * availability.w3 },
  ];
  let sum = 0;
  let sumW = 0;
  for (const entry of entries) {
    if (!isFiniteNumber(entry.value) || entry.weight <= 0) {
      continue;
    }
    sum += entry.value * entry.weight;
    sumW += entry.weight;
  }
  return sumW > 0 ? sum / sumW : undefined;
}

function computeMetricWindowComposite(
  series: PlayerStateWindowSeries,
  availability: { w10: number; w5: number; w3: number },
): { score?: number; anchor?: number } {
  const anchor = weightedWindowMean(series, availability, WINDOW_ANCHOR_WEIGHTS);
  const recent = weightedWindowMean(series, availability, WINDOW_RECENT_WEIGHTS);
  if (!isFiniteNumber(anchor) || !isFiniteNumber(recent)) {
    return {};
  }

  const trendFromW10 =
    isFiniteNumber(series.w3) && isFiniteNumber(series.w10)
      ? clamp((series.w3 - series.w10) / 28, -1, 1) * 2
      : 0;
  const trendFromW5 =
    isFiniteNumber(series.w3) && isFiniteNumber(series.w5)
      ? clamp((series.w3 - series.w5) / 18, -1, 1) * 2
      : 0;
  const trend = trendFromW10 + trendFromW5;
  const score = clamp(0.75 * anchor + 0.25 * recent + trend, 0, 100);

  return {
    score,
    anchor,
  };
}

function computeStateSide(side: PlayerStatePlayerSummary): StateSideComputation {
  const availability = {
    w10: resolveAvailabilityWeight(side.hasW10, side.degradedW10),
    w5: resolveAvailabilityWeight(side.hasW5, side.degradedW5),
    w3: resolveAvailabilityWeight(side.hasW3, side.degradedW3),
  };
  const availabilitySum =
    RELIABILITY_WINDOW_WEIGHTS.w10 * availability.w10 +
    RELIABILITY_WINDOW_WEIGHTS.w5 * availability.w5 +
    RELIABILITY_WINDOW_WEIGHTS.w3 * availability.w3;
  const windowReliability =
    availabilitySum /
    (RELIABILITY_WINDOW_WEIGHTS.w10 + RELIABILITY_WINDOW_WEIGHTS.w5 + RELIABILITY_WINDOW_WEIGHTS.w3);
  const nTechReliability = clamp(side.nTech / 10, 0, 1);
  const reliability = clamp(0.5 * windowReliability + 0.5 * nTechReliability, 0, 1);

  const stabilityWindow = computeMetricWindowComposite(side.stability, availability);
  const formTechWindow = computeMetricWindowComposite(side.formTech, availability);
  const formPlusWindow = computeMetricWindowComposite(side.formPlus, availability);
  const strengthWindow = computeMetricWindowComposite(side.strength, availability);

  const metricScores: StateMetricSideScore = {
    stability: stabilityWindow.score,
    formTech: formTechWindow.score,
    formPlus: formPlusWindow.score,
    strength: strengthWindow.score,
  };

  const metricAnchors: StateMetricAnchorScore = {
    stability: stabilityWindow.anchor,
    formTech: formTechWindow.anchor,
    formPlus: formPlusWindow.anchor,
    strength: strengthWindow.anchor,
  };

  let weightedSum = 0;
  let weightedCount = 0;
  for (const metric of METRIC_KEYS) {
    const value = metricScores[metric];
    if (!isFiniteNumber(value)) {
      continue;
    }
    const weight = METRIC_WEIGHTS[metric];
    weightedSum += value * weight;
    weightedCount += weight;
  }

  return {
    score: weightedCount > 0 ? weightedSum / weightedCount : undefined,
    reliability,
    metricScores,
    metricAnchors,
  };
}

function metricToTag(metric: MetricKey): StateDecisionReasonTag {
  if (metric === "formPlus") {
    return "FORM_PLUS";
  }
  if (metric === "formTech") {
    return "FORM_TECH";
  }
  if (metric === "stability") {
    return "STABILITY";
  }
  return "STRENGTH";
}

function pushUnique(tags: StateDecisionReasonTag[], tag: StateDecisionReasonTag): void {
  if (!tags.includes(tag)) {
    tags.push(tag);
  }
}

export function computeStateDecision(input: ComputeStateDecisionInput): StateDecisionSummary {
  const sideA = computeStateSide(input.playerA);
  const sideB = computeStateSide(input.playerB);

  const votes = {
    playerA: 0,
    playerB: 0,
  };
  const edges: Array<{ metric: MetricKey; edge: number; absEdge: number }> = [];
  for (const metric of METRIC_KEYS) {
    const a = sideA.metricScores[metric];
    const b = sideB.metricScores[metric];
    if (!isFiniteNumber(a) || !isFiniteNumber(b)) {
      continue;
    }
    const edge = a - b;
    if (Math.abs(edge) >= 2) {
      if (edge > 0) {
        votes.playerA += 1;
      } else {
        votes.playerB += 1;
      }
    }
    edges.push({ metric, edge, absEdge: Math.abs(edge) });
  }

  const minReliability = clamp(Math.min(sideA.reliability, sideB.reliability), 0, 1);
  const anchorBundleA =
    isFiniteNumber(sideA.metricAnchors.strength) && isFiniteNumber(sideA.metricAnchors.stability)
      ? 0.55 * sideA.metricAnchors.strength + 0.45 * sideA.metricAnchors.stability
      : undefined;
  const anchorBundleB =
    isFiniteNumber(sideB.metricAnchors.strength) && isFiniteNumber(sideB.metricAnchors.stability)
      ? 0.55 * sideB.metricAnchors.strength + 0.45 * sideB.metricAnchors.stability
      : undefined;
  const formBundleA =
    isFiniteNumber(sideA.metricScores.formPlus) && isFiniteNumber(sideA.metricScores.formTech)
      ? 0.55 * sideA.metricScores.formPlus + 0.45 * sideA.metricScores.formTech
      : undefined;
  const formBundleB =
    isFiniteNumber(sideB.metricScores.formPlus) && isFiniteNumber(sideB.metricScores.formTech)
      ? 0.55 * sideB.metricScores.formPlus + 0.45 * sideB.metricScores.formTech
      : undefined;

  const rawDiff =
    isFiniteNumber(sideA.score) && isFiniteNumber(sideB.score) ? sideA.score - sideB.score : undefined;
  const anchorDiff =
    isFiniteNumber(anchorBundleA) && isFiniteNumber(anchorBundleB) ? anchorBundleA - anchorBundleB : undefined;
  const formDiff = isFiniteNumber(formBundleA) && isFiniteNumber(formBundleB) ? formBundleA - formBundleB : undefined;

  const sign = (value: number | undefined): -1 | 0 | 1 => {
    if (!isFiniteNumber(value)) {
      return 0;
    }
    if (value > 0) {
      return 1;
    }
    if (value < 0) {
      return -1;
    }
    return 0;
  };

  const signConflict =
    sign(anchorDiff) !== 0 && sign(formDiff) !== 0 && sign(anchorDiff) !== sign(formDiff) ? 1 : 0;
  const magnitudeConflict =
    signConflict === 1 && isFiniteNumber(anchorDiff) && isFiniteNumber(formDiff)
      ? clamp(Math.min(Math.abs(anchorDiff), Math.abs(formDiff)) / 18, 0, 1)
      : 0;
  const conflictIndex = signConflict * magnitudeConflict;

  const effectiveDiff = isFiniteNumber(rawDiff) ? rawDiff * (1 - 0.35 * conflictIndex) : undefined;
  const rawP1 =
    isFiniteNumber(effectiveDiff) ? clamp(50 + 22 * Math.tanh(effectiveDiff / 12), 0, 100) : undefined;
  const p1 =
    isFiniteNumber(rawP1) ? clamp(50 + (rawP1 - 50) * (0.4 + 0.6 * minReliability), 0, 100) : undefined;
  const p2 = isFiniteNumber(p1) ? clamp(100 - p1, 0, 100) : undefined;

  const winnerSide = isFiniteNumber(p1) ? (p1 > 50 ? "A" : p1 < 50 ? "B" : undefined) : undefined;
  const winnerVotes = winnerSide === "A" ? votes.playerA : winnerSide === "B" ? votes.playerB : 0;

  const reasonByPriority: StateDecisionReasonTag[] = [];
  const lowCoverage =
    !isFiniteNumber(sideA.score) ||
    !isFiniteNumber(sideB.score) ||
    minReliability < AGGRESSIVE_POLICY.lowCoverageThreshold;
  const lowEdge =
    !isFiniteNumber(effectiveDiff) || Math.abs(effectiveDiff) < AGGRESSIVE_POLICY.lowEdgeThreshold;
  const mixed =
    conflictIndex >= AGGRESSIVE_POLICY.mixedConflictThreshold ||
    winnerVotes < AGGRESSIVE_POLICY.minWinnerVotes;
  const hardLowEdge =
    isFiniteNumber(effectiveDiff) && Math.abs(effectiveDiff) < AGGRESSIVE_POLICY.hardLowEdgeThreshold;
  if (lowCoverage) {
    reasonByPriority.push("LOW_COVERAGE");
  }
  if (lowEdge) {
    reasonByPriority.push("LOW_EDGE");
  }
  if (mixed) {
    reasonByPriority.push("MIXED");
  }
  const shouldAbstain = lowCoverage || (lowEdge && (mixed || hardLowEdge));

  if (shouldAbstain) {
    return {
      source: "player_state_decision_v3",
      reliability: round3(minReliability),
      rawDiff: isFiniteNumber(rawDiff) ? round3(rawDiff) : undefined,
      scoreA: isFiniteNumber(sideA.score) ? round3(sideA.score) : undefined,
      scoreB: isFiniteNumber(sideB.score) ? round3(sideB.score) : undefined,
      conflictIndex: round3(conflictIndex),
      anchorDiff: isFiniteNumber(anchorDiff) ? round3(anchorDiff) : undefined,
      formDiff: isFiniteNumber(formDiff) ? round3(formDiff) : undefined,
      effectiveDiff: isFiniteNumber(effectiveDiff) ? round3(effectiveDiff) : undefined,
      abstained: true,
      reasonTags: reasonByPriority.slice(0, 2),
      votes,
    };
  }

  const winner = winnerSide === "A" ? input.playerAName : winnerSide === "B" ? input.playerBName : undefined;

  const reasonTags: StateDecisionReasonTag[] = [];
  if (winnerSide) {
    const winnerEdges = edges
      .filter((entry) => (winnerSide === "A" ? entry.edge > 0 : entry.edge < 0))
      .sort((a, b) => b.absEdge - a.absEdge);
    for (const entry of winnerEdges.slice(0, 2)) {
      pushUnique(reasonTags, metricToTag(entry.metric));
    }

    const winnerFormPlus = winnerSide === "A" ? input.playerA.formPlus : input.playerB.formPlus;
    if (isFiniteNumber(winnerFormPlus.w3) && isFiniteNumber(winnerFormPlus.w10)) {
      const delta = winnerFormPlus.w3 - winnerFormPlus.w10;
      if (delta >= 8) {
        pushUnique(reasonTags, "MOMENTUM_UP");
      } else if (delta <= -8) {
        pushUnique(reasonTags, "MOMENTUM_DOWN");
      }
    }
  }

  if (winnerVotes >= 3) {
    pushUnique(reasonTags, "CONSENSUS");
  } else if (winnerVotes === 2) {
    pushUnique(reasonTags, "MIXED");
  }
  if (!reasonTags.length) {
    pushUnique(reasonTags, "MIXED");
  }

  return {
    source: "player_state_decision_v3",
    winner,
    p1: round3(p1 as number),
    p2: round3(p2 as number),
    reliability: round3(minReliability),
    rawDiff: isFiniteNumber(rawDiff) ? round3(rawDiff) : undefined,
    scoreA: round3(sideA.score as number),
    scoreB: round3(sideB.score as number),
    conflictIndex: round3(conflictIndex),
    anchorDiff: isFiniteNumber(anchorDiff) ? round3(anchorDiff) : undefined,
    formDiff: isFiniteNumber(formDiff) ? round3(formDiff) : undefined,
    effectiveDiff: isFiniteNumber(effectiveDiff) ? round3(effectiveDiff) : undefined,
    abstained: false,
    reasonTags: reasonTags.slice(0, 3),
    votes,
  };
}
