import type { MetricValue } from "./types.js";

const percentWithRatio = /^(\d+(?:\.\d+)?)%\s*\((\d+)\s*\/\s*(\d+)\)$/;
const ratioOnly = /^(\d+)\s*\/\s*(\d+)$/;
const percentOnly = /^(\d+(?:\.\d+)?)%$/;
const plainNumber = /^-?\d+(?:\.\d+)?$/;

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeName(name: string): string {
  return normalizeWhitespace(name)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function metricLabelToKey(label: string): string {
  return normalizeWhitespace(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseMetricValue(rawInput: string): MetricValue {
  const raw = normalizeWhitespace(rawInput || "");

  if (!raw || raw === "-" || raw === "--" || raw.toLowerCase() === "n/a") {
    return { raw };
  }

  const pwr = raw.match(percentWithRatio);
  if (pwr) {
    return {
      raw,
      percent: Number(pwr[1]),
      made: Number(pwr[2]),
      total: Number(pwr[3]),
    };
  }

  const ro = raw.match(ratioOnly);
  if (ro) {
    return { raw, made: Number(ro[1]), total: Number(ro[2]) };
  }

  const po = raw.match(percentOnly);
  if (po) {
    return { raw, percent: Number(po[1]) };
  }

  if (plainNumber.test(raw)) {
    return { raw, percent: Number(raw) };
  }

  return { raw };
}

export function isLikelyMetricValue(text: string): boolean {
  const candidate = normalizeWhitespace(text);
  if (!candidate) {
    return false;
  }
  if (candidate === "-" || candidate === "--") {
    return true;
  }
  if (percentWithRatio.test(candidate)) {
    return true;
  }
  if (ratioOnly.test(candidate) || percentOnly.test(candidate)) {
    return true;
  }
  return plainNumber.test(candidate);
}

