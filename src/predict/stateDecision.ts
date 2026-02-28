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

interface StateSideComputation {
  score?: number;
  reliability: number;
  metricScores: StateMetricSideScore;
}

const WINDOW_WEIGHTS = {
  w10: 0.25,
  w5: 0.35,
  w3: 0.4,
} as const;

const METRIC_WEIGHTS = {
  stability: 0.3,
  formTech: 0.25,
  formPlus: 0.3,
  strength: 0.15,
} as const;

const METRIC_KEYS = ["stability", "formTech", "formPlus", "strength"] as const;
type MetricKey = (typeof METRIC_KEYS)[number];

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

function computeMetricWindowComposite(
  series: PlayerStateWindowSeries,
  availability: { w10: number; w5: number; w3: number },
): number | undefined {
  const entries = [
    { value: series.w10, weight: WINDOW_WEIGHTS.w10 * availability.w10 },
    { value: series.w5, weight: WINDOW_WEIGHTS.w5 * availability.w5 },
    { value: series.w3, weight: WINDOW_WEIGHTS.w3 * availability.w3 },
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
  if (sumW <= 0) {
    return undefined;
  }
  const base = sum / sumW;
  let trendBonus = 0;
  if (isFiniteNumber(series.w10) && isFiniteNumber(series.w3)) {
    trendBonus = clamp((series.w3 - series.w10) / 24, -1, 1) * 3.5;
  } else if (isFiniteNumber(series.w5) && isFiniteNumber(series.w3)) {
    trendBonus = clamp((series.w3 - series.w5) / 18, -1, 1) * 2.5;
  }
  return clamp(base + trendBonus, 0, 100);
}

function computeStateSide(side: PlayerStatePlayerSummary): StateSideComputation {
  const availability = {
    w10: resolveAvailabilityWeight(side.hasW10, side.degradedW10),
    w5: resolveAvailabilityWeight(side.hasW5, side.degradedW5),
    w3: resolveAvailabilityWeight(side.hasW3, side.degradedW3),
  };
  const availabilitySum =
    WINDOW_WEIGHTS.w10 * availability.w10 +
    WINDOW_WEIGHTS.w5 * availability.w5 +
    WINDOW_WEIGHTS.w3 * availability.w3;
  const windowReliability = availabilitySum / (WINDOW_WEIGHTS.w10 + WINDOW_WEIGHTS.w5 + WINDOW_WEIGHTS.w3);
  const nTechReliability = clamp(side.nTech / 10, 0, 1);
  const reliability = clamp(0.5 * windowReliability + 0.5 * nTechReliability, 0, 1);

  const metricScores: StateMetricSideScore = {
    stability: computeMetricWindowComposite(side.stability, availability),
    formTech: computeMetricWindowComposite(side.formTech, availability),
    formPlus: computeMetricWindowComposite(side.formPlus, availability),
    strength: computeMetricWindowComposite(side.strength, availability),
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
  if (!isFiniteNumber(sideA.score) || !isFiniteNumber(sideB.score) || minReliability < 0.45) {
    return {
      source: "player_state_decision_v2",
      reliability: round3(minReliability),
      scoreA: isFiniteNumber(sideA.score) ? round3(sideA.score) : undefined,
      scoreB: isFiniteNumber(sideB.score) ? round3(sideB.score) : undefined,
      reasonTags: ["LOW_COVERAGE"],
      votes,
    };
  }

  const rawDiff = sideA.score - sideB.score;
  const consensus = Math.max(votes.playerA, votes.playerB) / 4;
  const effDiff = rawDiff * (0.75 + 0.25 * consensus);
  const rawP1 = clamp(50 + 23 * Math.tanh(effDiff / 13), 0, 100);
  const p1 = clamp(50 + (rawP1 - 50) * (0.38 + 0.62 * minReliability), 0, 100);
  const p2 = clamp(100 - p1, 0, 100);

  const winnerSide = p1 > 50 ? "A" : p1 < 50 ? "B" : undefined;
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
      if (delta >= 6) {
        pushUnique(reasonTags, "MOMENTUM_UP");
      } else if (delta <= -6) {
        pushUnique(reasonTags, "MOMENTUM_DOWN");
      }
    }
  }

  const winnerVotes = winnerSide === "A" ? votes.playerA : winnerSide === "B" ? votes.playerB : 0;
  if (winnerVotes >= 3) {
    pushUnique(reasonTags, "CONSENSUS");
  } else if (winnerVotes === 2 || (!winnerSide && Math.max(votes.playerA, votes.playerB) === 2)) {
    pushUnique(reasonTags, "MIXED");
  }
  if (!reasonTags.length) {
    pushUnique(reasonTags, "MIXED");
  }

  return {
    source: "player_state_decision_v2",
    winner,
    p1: round3(p1),
    p2: round3(p2),
    reliability: round3(minReliability),
    scoreA: round3(sideA.score),
    scoreB: round3(sideB.score),
    reasonTags: reasonTags.slice(0, 3),
    votes,
  };
}
