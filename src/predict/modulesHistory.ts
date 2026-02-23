// Legacy module retained for research/tests; not used by main runtime pipeline.
import type {
  CalibrationSummary,
  HistoryCalibration,
  HistoryModuleResult,
  HistoryModuleSide,
} from "../types.js";

export function module1HistoryTpw12(
  rating5Home: number | undefined,
  rating5Away: number | undefined,
): HistoryModuleResult {
  const flags: string[] = ["history_only"];
  const explain: string[] = [];

  if (typeof rating5Home !== "number" || typeof rating5Away !== "number") {
    return {
      name: "M1_dominance",
      side: "neutral",
      strength: 0,
      explain: ["rating5 missing"],
      flags: [...flags, "rating5_missing"],
    };
  }

  const diff = rating5Home - rating5Away;
  const absDiff = Math.abs(diff);

  let strength = 0;
  if (absDiff >= 35) {
    strength = 3;
  } else if (absDiff >= 20) {
    strength = 2;
  } else if (absDiff >= 10) {
    strength = 1;
  }

  const side: HistoryModuleSide =
    diff > 0 ? "home" : diff < 0 ? "away" : "neutral";

  explain.push(
    `rating5=${Math.round(rating5Home)}/${Math.round(rating5Away)} diff=${signed(Math.round(diff))}`,
  );

  return {
    name: "M1_dominance",
    side: strength > 0 ? side : "neutral",
    strength: capStrength(strength),
    explain,
    flags: strength > 0 ? flags : [...flags, "neutral_small_diff"],
  };
}

export function module2HistoryServe(
  calHome: HistoryCalibration,
  calAway: HistoryCalibration,
): HistoryModuleResult {
  const flags: string[] = ["history_only"];
  const explain: string[] = [];

  const [sswH, nSswH] = metricMeanN(calHome.ssw_12);
  const [sswA, nSswA] = metricMeanN(calAway.ssw_12);
  const [bpsH, nBpsH] = metricMeanN(calHome.bpsr_12);
  const [bpsA, nBpsA] = metricMeanN(calAway.bpsr_12);

  if (typeof sswH !== "number" || typeof sswA !== "number") {
    flags.push("ssw_missing");
  }
  if (typeof bpsH !== "number" || typeof bpsA !== "number") {
    flags.push("bpsr_missing");
  }

  const sswHAdj = shrinkRate(sswH, nSswH, 0.5, 4);
  const sswAAdj = shrinkRate(sswA, nSswA, 0.5, 4);
  const bpsHAdj = shrinkRate(bpsH, nBpsH, 0.5, 8);
  const bpsAAdj = shrinkRate(bpsA, nBpsA, 0.5, 8);

  const compH = weightedMean([
    [sswHAdj, 0.7],
    [bpsHAdj, 0.3],
  ]);
  const compA = weightedMean([
    [sswAAdj, 0.7],
    [bpsAAdj, 0.3],
  ]);

  if (typeof compH !== "number" || typeof compA !== "number") {
    return {
      name: "M2_second_serve",
      side: "neutral",
      strength: 0,
      explain: ["serve hist missing"],
      flags: [...flags, "missing_fields"],
    };
  }

  const diffPP = (compH - compA) * 100;
  const nMin = Math.min(nSswH, nSswA, nBpsH || 99, nBpsA || 99);
  const strength = strengthFromPP(diffPP, nMin, [3, 5, 8]);
  const side: HistoryModuleSide =
    diffPP > 0 ? "home" : diffPP < 0 ? "away" : "neutral";

  explain.push(
    `SSW12=${fmtOrNone(sswH)}/${fmtOrNone(sswA)} adj=${fmtOrNone(sswHAdj)}/${fmtOrNone(sswAAdj)} n=${Math.min(nSswH, nSswA)}`,
  );
  explain.push(
    `BPSR12=${fmtOrNone(bpsH)}/${fmtOrNone(bpsA)} adj=${fmtOrNone(bpsHAdj)}/${fmtOrNone(bpsAAdj)} n=${Math.min(nBpsH, nBpsA)}`,
  );
  explain.push(`CompositeServe=${signedFixed(diffPP, 1)}pp`);

  return {
    name: "M2_second_serve",
    side: strength > 0 ? side : "neutral",
    strength,
    explain,
    flags,
  };
}

export function module3HistoryReturn(
  calHome: HistoryCalibration,
  calAway: HistoryCalibration,
): HistoryModuleResult {
  const flags: string[] = ["history_only"];
  const explain: string[] = [];

  const [rprH, nRprH] = metricMeanN(calHome.rpr_12);
  const [rprA, nRprA] = metricMeanN(calAway.rpr_12);
  const [bpcH, nBpcH] = metricMeanN(calHome.bpconv_12);
  const [bpcA, nBpcA] = metricMeanN(calAway.bpconv_12);

  const rprHAdj = shrinkRate(rprH, nRprH, 0.5, 4);
  const rprAAdj = shrinkRate(rprA, nRprA, 0.5, 4);
  const bpcHAdj = shrinkRate(bpcH, nBpcH, 0.5, 8);
  const bpcAAdj = shrinkRate(bpcA, nBpcA, 0.5, 8);

  const compH = weightedMean([
    [rprHAdj, 0.7],
    [bpcHAdj, 0.3],
  ]);
  const compA = weightedMean([
    [rprAAdj, 0.7],
    [bpcAAdj, 0.3],
  ]);

  if (typeof compH !== "number" || typeof compA !== "number") {
    return {
      name: "M3_return_pressure",
      side: "neutral",
      strength: 0,
      explain: ["return hist missing"],
      flags: [...flags, "missing_fields"],
    };
  }

  const diffPP = (compH - compA) * 100;
  const nMin = Math.min(nRprH, nRprA, nBpcH || 99, nBpcA || 99);
  const strength = strengthFromPP(diffPP, nMin, [3, 5, 8]);
  const side: HistoryModuleSide =
    diffPP > 0 ? "home" : diffPP < 0 ? "away" : "neutral";

  explain.push(
    `RPR12=${fmtOrNone(rprH)}/${fmtOrNone(rprA)} adj=${fmtOrNone(rprHAdj)}/${fmtOrNone(rprAAdj)} n=${Math.min(nRprH, nRprA)}`,
  );
  explain.push(
    `BPconv12=${fmtOrNone(bpcH)}/${fmtOrNone(bpcA)} adj=${fmtOrNone(bpcHAdj)}/${fmtOrNone(bpcAAdj)} n=${Math.min(nBpcH, nBpcA)}`,
  );
  explain.push(`CompositeReturn=${signedFixed(diffPP, 1)}pp`);

  return {
    name: "M3_return_pressure",
    side: strength > 0 ? side : "neutral",
    strength,
    explain,
    flags,
  };
}

export function module4HistoryClutch(
  calHome: HistoryCalibration,
  calAway: HistoryCalibration,
): HistoryModuleResult {
  const flags: string[] = ["history_only"];
  const explain: string[] = [];

  const [bpsH, nBpsH] = metricMeanN(calHome.bpsr_12);
  const [bpsA, nBpsA] = metricMeanN(calAway.bpsr_12);
  const [bpcH, nBpcH] = metricMeanN(calHome.bpconv_12);
  const [bpcA, nBpcA] = metricMeanN(calAway.bpconv_12);

  const bpsHAdj = shrinkRate(bpsH, nBpsH, 0.5, 8);
  const bpsAAdj = shrinkRate(bpsA, nBpsA, 0.5, 8);
  const bpcHAdj = shrinkRate(bpcH, nBpcH, 0.5, 8);
  const bpcAAdj = shrinkRate(bpcA, nBpcA, 0.5, 8);

  const compH = weightedMean([
    [bpsHAdj, 0.55],
    [bpcHAdj, 0.45],
  ]);
  const compA = weightedMean([
    [bpsAAdj, 0.55],
    [bpcAAdj, 0.45],
  ]);

  if (typeof compH !== "number" || typeof compA !== "number") {
    return {
      name: "M4_clutch",
      side: "neutral",
      strength: 0,
      explain: ["clutch hist missing"],
      flags: [...flags, "missing_fields"],
    };
  }

  const diffPP = (compH - compA) * 100;
  const nMin = Math.min(nBpsH, nBpsA, nBpcH || 99, nBpcA || 99);
  const strength = strengthFromPP(diffPP, nMin, [4, 7, 12]);
  const side: HistoryModuleSide =
    diffPP > 0 ? "home" : diffPP < 0 ? "away" : "neutral";

  explain.push(
    `BPSR12=${fmtOrNone(bpsH)}/${fmtOrNone(bpsA)} adj=${fmtOrNone(bpsHAdj)}/${fmtOrNone(bpsAAdj)} n=${Math.min(nBpsH, nBpsA)}`,
  );
  explain.push(
    `BPconv12=${fmtOrNone(bpcH)}/${fmtOrNone(bpcA)} adj=${fmtOrNone(bpcHAdj)}/${fmtOrNone(bpcAAdj)} n=${Math.min(nBpcH, nBpcA)}`,
  );
  explain.push(`CompositeClutch=${signedFixed(diffPP, 1)}pp`);

  return {
    name: "M4_clutch",
    side: strength > 0 ? side : "neutral",
    strength,
    explain,
    flags,
  };
}

function metricMeanN(summary: CalibrationSummary): [number | undefined, number] {
  if (!summary || typeof summary.n !== "number") {
    return [undefined, 0];
  }
  if (typeof summary.mean !== "number") {
    return [undefined, summary.n];
  }
  return [summary.mean, summary.n];
}

function shrinkRate(
  value: number | undefined,
  n: number,
  prior = 0.5,
  k = 6,
): number | undefined {
  if (typeof value !== "number") {
    return undefined;
  }
  if (n <= 0) {
    return prior;
  }
  const weight = n / (n + Math.max(0.1, k));
  return weight * value + (1 - weight) * prior;
}

function weightedMean(
  parts: Array<[number | undefined, number]>,
): number | undefined {
  let sum = 0;
  let totalWeight = 0;
  for (const [value, weight] of parts) {
    if (typeof value !== "number") {
      continue;
    }
    sum += value * weight;
    totalWeight += weight;
  }
  if (totalWeight <= 0) {
    return undefined;
  }
  return sum / totalWeight;
}

function strengthFromPP(
  diffPP: number,
  nMin: number,
  bands: [number, number, number],
): number {
  const [weak, medium, strong] = bands;
  const absDiff = Math.abs(diffPP);

  let strength = 0;
  if (absDiff >= strong) {
    strength = 3;
  } else if (absDiff >= medium) {
    strength = 2;
  } else if (absDiff >= weak) {
    strength = 1;
  }

  if (nMin < 3) {
    strength = Math.min(strength, 1);
  } else if (nMin < 5) {
    strength = Math.min(strength, 2);
  }

  return capStrength(strength);
}

function capStrength(strength: number): number {
  if (strength < 0) {
    return 0;
  }
  if (strength > 3) {
    return 3;
  }
  return Math.trunc(strength);
}

function fmt(value: number): string {
  return value.toFixed(3);
}

function fmtOrNone(value: number | undefined): string {
  if (typeof value !== "number") {
    return "None";
  }
  return value.toFixed(3);
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function signedFixed(value: number, fractionDigits: number): string {
  return value >= 0 ? `+${value.toFixed(fractionDigits)}` : value.toFixed(fractionDigits);
}
