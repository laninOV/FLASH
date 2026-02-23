// Legacy module retained for research/tests; not used by main runtime pipeline.
import type {
  CalibrationSummary,
  HistoryCalibration,
  HistoryMetricRow,
} from "../types.js";

export function buildHistoryCalibration(rows: HistoryMetricRow[]): HistoryCalibration {
  return {
    ssw_12: summarize(rows.map((row) => row.ssw12)),
    rpr_12: summarize(rows.map((row) => row.rpr12)),
    bpsr_12: summarize(rows.map((row) => row.bpsr12)),
    bpconv_12: summarize(rows.map((row) => row.bpconv12)),
  };
}

export function summarize(values: Array<number | undefined>): CalibrationSummary {
  const filtered = values.filter((value): value is number => typeof value === "number");
  const n = filtered.length;
  if (n === 0) {
    return { n: 0 };
  }

  const mean = filtered.reduce((sum, value) => sum + value, 0) / n;
  if (n === 1) {
    return { n, mean };
  }

  const variance =
    filtered.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
  return {
    n,
    mean,
    sd: Math.sqrt(variance),
  };
}
