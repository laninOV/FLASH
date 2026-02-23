// Legacy module retained for research/tests; not used by main runtime pipeline.
import type {
  HistoricalMatchTechStats,
  HistoryMetricRow,
  MetricValue,
  TechStatRow,
} from "../types.js";

const KEY_ALIASES: Record<string, string> = {
  total_points_won: "total_points_won",
  second_serve_points_won: "second_serve_points_won",
  "2nd_serve_points_won": "second_serve_points_won",
  first_serve_return_points_won: "first_serve_return_points_won",
  "1st_serve_return_points_won": "first_serve_return_points_won",
  second_serve_return_points_won: "second_serve_return_points_won",
  "2nd_serve_return_points_won": "second_serve_return_points_won",
  break_points_saved: "break_points_saved",
  break_points_converted: "break_points_converted",
};

export function canonicalHistoryMetricKey(metricKey: string): string {
  const normalized = String(metricKey || "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return "";
  }
  return KEY_ALIASES[normalized] || normalized;
}

export function rateFromMetricValue(value: MetricValue | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value.percent === "number" && Number.isFinite(value.percent)) {
    if (value.percent > 1) {
      return clamp01(value.percent / 100);
    }
    return clamp01(value.percent);
  }

  if (
    typeof value.made === "number" &&
    Number.isFinite(value.made) &&
    typeof value.total === "number" &&
    Number.isFinite(value.total) &&
    value.total > 0
  ) {
    return clamp01(value.made / value.total);
  }

  return undefined;
}

export function toHistoryMetricRow(parsed: HistoricalMatchTechStats): HistoryMetricRow {
  const picked = new Map<string, MetricValue>();

  for (const row of parsed.rows) {
    const key = canonicalHistoryMetricKey(row.metricKey);
    if (!isHistoryRelevantRow(key, row)) {
      continue;
    }

    const existing = picked.get(key);
    const candidate = row.playerValue;
    if (!existing || shouldReplaceMetricValue(existing, candidate)) {
      picked.set(key, candidate);
    }
  }

  const firstReturn = picked.get("first_serve_return_points_won");
  const secondReturn = picked.get("second_serve_return_points_won");

  return {
    matchUrl: parsed.matchUrl,
    tpw12: rateFromMetricValue(picked.get("total_points_won")),
    ssw12: rateFromMetricValue(picked.get("second_serve_points_won")),
    rpr12: computeRpr12(firstReturn, secondReturn),
    bpsr12: rateFromMetricValue(picked.get("break_points_saved")),
    bpconv12: rateFromMetricValue(picked.get("break_points_converted")),
    warnings: [...parsed.warnings],
  };
}

function computeRpr12(
  firstReturn: MetricValue | undefined,
  secondReturn: MetricValue | undefined,
): number | undefined {
  const firstRate = rateFromMetricValue(firstReturn);
  const secondRate = rateFromMetricValue(secondReturn);

  if (typeof firstRate === "number" && typeof secondRate === "number") {
    const firstTotal = firstReturn?.total;
    const secondTotal = secondReturn?.total;
    if (
      typeof firstTotal === "number" &&
      firstTotal > 0 &&
      typeof secondTotal === "number" &&
      secondTotal > 0
    ) {
      const weighted = (firstRate * firstTotal + secondRate * secondTotal) / (firstTotal + secondTotal);
      return clamp01(weighted);
    }

    // Same fallback as third_set for incomplete denominators.
    return clamp01(0.4 * firstRate + 0.6 * secondRate);
  }

  if (typeof firstRate === "number") {
    return firstRate;
  }
  if (typeof secondRate === "number") {
    return secondRate;
  }

  return undefined;
}

function isHistoryRelevantRow(key: string, row: TechStatRow): boolean {
  if (KEY_ALIASES[key]) {
    return true;
  }
  // Preserve robust detection for cases when key was not canonicalized by parser.
  const label = row.metricLabel.toLowerCase();
  if (label.includes("break") && label.includes("converted")) {
    return true;
  }
  return false;
}

function shouldReplaceMetricValue(current: MetricValue, candidate: MetricValue): boolean {
  const curRate = rateFromMetricValue(current);
  const nextRate = rateFromMetricValue(candidate);
  if (typeof curRate !== "number" && typeof nextRate === "number") {
    return true;
  }
  if (typeof curRate === "number" && typeof nextRate !== "number") {
    return false;
  }

  const curTotal = typeof current.total === "number" ? current.total : -1;
  const nextTotal = typeof candidate.total === "number" ? candidate.total : -1;
  return nextTotal > curTotal;
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}
