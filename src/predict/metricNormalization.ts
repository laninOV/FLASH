import type { MetricValue } from "../types.js";

export interface MetricNormalizationOptions {
  isCountMetric?: boolean;
  smoothRatio?: boolean;
}

export function metricValueToNumber(
  value: MetricValue,
  options: MetricNormalizationOptions = {},
): number | undefined {
  const isCountMetric = options.isCountMetric === true;
  const smoothRatio = options.smoothRatio !== false;

  if (
    typeof value.made === "number" &&
    Number.isFinite(value.made) &&
    typeof value.total === "number" &&
    Number.isFinite(value.total) &&
    value.total > 0
  ) {
    if (isCountMetric) {
      return value.made;
    }

    if (smoothRatio) {
      return ((value.made + 1) / (value.total + 2)) * 100;
    }
    return (value.made / value.total) * 100;
  }

  if (typeof value.percent === "number" && Number.isFinite(value.percent)) {
    if (isCountMetric) {
      return value.percent;
    }
    return value.percent <= 1 ? value.percent * 100 : value.percent;
  }

  return undefined;
}

export function metricQuality(value: MetricValue): number {
  if (typeof value.total === "number" && Number.isFinite(value.total) && value.total > 0) {
    return 1000 + value.total;
  }
  if (typeof value.percent === "number" && Number.isFinite(value.percent)) {
    return 100;
  }
  return 0;
}
