import { normalizeWhitespace } from "../normalize.js";
import type { HistoricalMatchTechStats, MetricValue } from "../types.js";
import { metricQuality, metricValueToNumber } from "./metricNormalization.js";

export const REQUIRED_DIRT_METRIC_KEYS = [
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

export type RequiredDirtMetricKey = (typeof REQUIRED_DIRT_METRIC_KEYS)[number];

export interface DirtFeatureRow {
  matchUrl: string;
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
}

interface MetricExtractionDiagnostics {
  row: Partial<DirtFeatureRow>;
  missingKeys: RequiredDirtMetricKey[];
}

const COUNT_METRICS = new Set<RequiredDirtMetricKey>(["double_faults"]);

const KEY_ALIASES: Record<string, RequiredDirtMetricKey | undefined> = {
  first_serve: "first_serve",
  "1st_serve": "first_serve",
  "1st_serve_percentage": "first_serve",
  first_serve_percentage: "first_serve",
  first_serve_points_won: "first_serve_points_won",
  "1st_serve_points_won": "first_serve_points_won",
  second_serve_points_won: "second_serve_points_won",
  "2nd_serve_points_won": "second_serve_points_won",
  break_points_saved: "break_points_saved",
  double_fault: "double_faults",
  double_faults: "double_faults",
  first_serve_return_points_won: "first_serve_return_points_won",
  "1st_serve_return_points_won": "first_serve_return_points_won",
  "1st_return_points_won": "first_serve_return_points_won",
  second_serve_return_points_won: "second_serve_return_points_won",
  "2nd_serve_return_points_won": "second_serve_return_points_won",
  "2nd_return_points_won": "second_serve_return_points_won",
  break_points_converted: "break_points_converted",
  break_points_conversion: "break_points_converted",
  break_points_conversions: "break_points_converted",
  service_games_won: "service_games_won",
  service_points_won: "total_service_points_won",
  total_service_points_won: "total_service_points_won",
  return_games_won: "return_games_won",
  return_points_won: "return_points_won",
  total_return_points_won: "return_points_won",
  total_points_won: "total_points_won",
  total_games_won: "total_games_won",
};

export function extractDirtFeatureRow(match: HistoricalMatchTechStats): DirtFeatureRow | null {
  const diagnostics = extractDirtFeatureRowDiagnostics(match);
  if (diagnostics.missingKeys.length > 0) {
    return null;
  }

  const row = diagnostics.row as DirtFeatureRow;
  row.matchUrl = match.matchUrl;
  return row;
}

export function extractDirtFeatureRowDiagnostics(
  match: HistoricalMatchTechStats,
): MetricExtractionDiagnostics {
  const out: Partial<DirtFeatureRow> = {
    matchUrl: match.matchUrl,
  };
  const qualityByKey = new Map<RequiredDirtMetricKey, number>();

  for (const row of match.rows) {
    const key = canonicalDirtMetricKey(row.metricKey, row.metricLabel);
    if (!key) {
      continue;
    }

    const numeric = metricToNumber(row.playerValue, key);
    if (typeof numeric !== "number" || !Number.isFinite(numeric)) {
      continue;
    }
    const quality = metricQuality(row.playerValue);
    const prevQuality = qualityByKey.get(key) ?? -1;
    if (quality <= prevQuality) {
      continue;
    }

    (out as Record<string, number>)[key] = numeric;
    qualityByKey.set(key, quality);
  }

  const missingKeys = REQUIRED_DIRT_METRIC_KEYS.filter((key) => {
    const value = (out as Record<string, number | undefined>)[key];
    return typeof value !== "number" || !Number.isFinite(value);
  });

  return {
    row: out,
    missingKeys,
  };
}

export function canonicalDirtMetricKey(
  metricKey: string,
  metricLabel?: string,
): RequiredDirtMetricKey | undefined {
  const direct = toAliasKey(metricKey);
  if (direct) {
    return direct;
  }
  return toAliasKey(metricLabel || "");
}

function toAliasKey(raw: string): RequiredDirtMetricKey | undefined {
  const key = normalizeWhitespace(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!key) {
    return undefined;
  }
  return KEY_ALIASES[key];
}

function metricToNumber(value: MetricValue, key: RequiredDirtMetricKey): number | undefined {
  return metricValueToNumber(value, {
    isCountMetric: COUNT_METRICS.has(key),
    smoothRatio: true,
  });
}
