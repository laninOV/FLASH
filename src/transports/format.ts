import type { PredictionResult } from "../types.js";

const SEPARATOR = "==================";

export type ShortPredictionLinkMode = "plain_text_url" | "telegram_html_link";

export interface FormatShortPredictionMessageOptions {
  linkMode?: ShortPredictionLinkMode;
}

export function formatShortPredictionMessage(
  prediction: PredictionResult,
  options: FormatShortPredictionMessageOptions = {},
): string {
  const linkMode = options.linkMode ?? "plain_text_url";
  const names = resolvePlayerNames(prediction);
  const probs = prediction.modelSummary?.dirt?.modelProbabilities;
  const novaEdge = prediction.modelSummary?.novaEdge;
  const playerState = prediction.modelSummary?.playerState;
  const stateDecision = prediction.modelSummary?.stateDecision;
  const stateWinner = stateDecision?.abstained ? undefined : stateDecision?.winner;
  const statePair = stateDecision?.abstained
    ? "- / -"
    : formatNovaEdgePair(stateDecision?.p1, stateDecision?.p2);
  const methodsSummary = computeMethodsAgreement(
    prediction.predictedWinner,
    names.playerA,
    names.playerB,
    [probs?.logRegP1, probs?.markovP1, probs?.bradleyP1, probs?.pcaP1, novaEdge?.p1],
  );
  const showConsensusCheckmarks = shouldShowConsensusCheckmarks(
    prediction.predictedWinner,
    novaEdge?.winner,
    prediction.confidence,
    methodsSummary,
  );

  const lines = [
    ...(showConsensusCheckmarks ? ["✅✅✅"] : []),
    "TENNIS SIGNAL",
    SEPARATOR,
    `${names.playerA} vs ${names.playerB}`,
    formatMatchLinkLine(prediction.matchUrl, linkMode),
    `Date: ${formatDateFromSource(prediction)}`,
    SEPARATOR,
    `Logistic: ${formatPercentPair(probs?.logRegP1)}`,
    `Markov: ${formatPercentPair(probs?.markovP1)}`,
    `Bradley-Terry: ${formatPercentPair(probs?.bradleyP1)}`,
    `PCA: ${formatPercentPair(probs?.pcaP1)}`,
    SEPARATOR,
    `Winner: ${prediction.predictedWinner}`,
    `Odds: ${formatWinnerOddComma(prediction, names.playerA, names.playerB)}`,
    `Methods: ${methodsSummary.methods}`,
    formatAgreementLine(methodsSummary),
    formatConfidenceLine(prediction.confidence),
    SEPARATOR,
    "SHORT SUMMARY",
    `HISTORY-5: ${formatMethodSummary(
      prediction.predictedWinner,
      formatPercentPair(probs?.finalP1),
    )}`,
    `NOVA: ${formatMethodSummary(novaEdge?.winner, formatNovaEdgePair(novaEdge?.p1, novaEdge?.p2))}`,
    `STATE: ${formatMethodSummary(stateWinner, statePair)}`,
    formatStateReasonLine(stateDecision),
    formatNovaFilterLabelLine(prediction),
    SEPARATOR,
    "PLAYER STATE (10/5/3)",
    ...formatPlayerStateLines(names.playerA, playerState?.playerA),
    ...formatPlayerStateLines(names.playerB, playerState?.playerB),
    SEPARATOR,
  ];

  return lines.join("\n");
}

function formatMatchLinkLine(
  matchUrl: string | undefined,
  linkMode: ShortPredictionLinkMode,
): string {
  const url = String(matchUrl || "").trim();
  if (!url) {
    return "Ссылка на игру: -";
  }
  if (linkMode === "telegram_html_link") {
    return `<a href="${escapeHtmlAttr(url)}">ссылка на игру</a>`;
  }
  return `Ссылка на игру: ${url}`;
}

function shouldShowConsensusCheckmarks(
  historyWinner: string | undefined,
  novaWinner: string | undefined,
  confidence: number,
  methodsSummary: MethodsAgreementSummary,
): boolean {
  const a = canonicalWinnerName(historyWinner);
  const b = canonicalWinnerName(novaWinner);
  const confidencePct = getConfidencePct(confidence);
  return Boolean(
    a &&
      b &&
      a === b &&
      methodsSummary.methods === 5 &&
      methodsSummary.agreeCount >= 4 &&
      confidencePct !== undefined &&
      confidencePct > 50,
  );
}

function formatAgreementLine(methodsSummary: MethodsAgreementSummary): string {
  const lowAgreement = methodsSummary.methods === 5 && methodsSummary.agreeCount <= 3;
  return `Agreement: ${methodsSummary.agreementText}${lowAgreement ? " 🔴" : ""}`;
}

function formatConfidenceLine(confidence: number): string {
  const text = formatConfidence(confidence);
  const confidencePct = getConfidencePct(confidence);
  const lowConfidence = confidencePct !== undefined && confidencePct <= 50;
  return `Confidence: ${text}${lowConfidence ? " 🔴" : ""}`;
}

function resolveSideFromP1(p1?: number): "A" | "B" | "neutral" | undefined {
  if (!isFiniteNumber(p1)) {
    return undefined;
  }
  if (p1 > 50) {
    return "A";
  }
  if (p1 < 50) {
    return "B";
  }
  return "neutral";
}

function computeNovaFilterLabel(prediction: PredictionResult): "HIGH" | "NORMAL" | "SKIP" {
  const novaP1 = prediction.modelSummary?.novaEdge?.p1;
  if (!isFiniteNumber(novaP1)) {
    return "NORMAL";
  }

  const logRegP1 = prediction.modelSummary?.dirt?.modelProbabilities?.logRegP1;
  const confidenceRaw = prediction.confidence;
  const confidencePct = Number.isFinite(confidenceRaw) ? confidenceRaw * 100 : 50;
  const novaMargin = Math.abs(novaP1 - 50);
  const novaSide = resolveSideFromP1(novaP1);
  const logisticSide = resolveSideFromP1(logRegP1);
  const novaLogisticAgree = Boolean(
    novaSide &&
      logisticSide &&
      novaSide !== "neutral" &&
      logisticSide !== "neutral" &&
      novaSide === logisticSide,
  );

  if (novaLogisticAgree && novaMargin >= 4 && confidencePct >= 50) {
    return "HIGH";
  }
  if (confidencePct < 50 || (!novaLogisticAgree && novaMargin < 4)) {
    return "SKIP";
  }
  return "NORMAL";
}

function formatNovaFilterLabelLine(prediction: PredictionResult): string {
  const label = computeNovaFilterLabel(prediction);
  if (label === "HIGH") {
    return "NOVA FILTER: 🟢 HIGH";
  }
  if (label === "SKIP") {
    return "NOVA FILTER: 🔴 SKIP";
  }
  return "NOVA FILTER: 🟡 NORMAL";
}

type PlayerStateDisplay = NonNullable<
  NonNullable<PredictionResult["modelSummary"]>["playerState"]
>["playerA"];

type PlayerStateMetricSeries = PlayerStateDisplay["stability"];
type StateDecisionDisplay = NonNullable<
  NonNullable<PredictionResult["modelSummary"]>["stateDecision"]
>;

function formatPlayerStateLines(playerName: string, state: PlayerStateDisplay | undefined): string[] {
  return [
    `${playerName}:`,
    `Stability: ${formatStateSeries(state?.stability)}`,
    `Form-TECH: ${formatStateSeries(state?.formTech)}`,
    `Form-PLUS: ${formatStateSeries(state?.formPlus)}`,
    `Strength: ${formatStateSeries(state?.strength)}`,
    `Coverage: ${formatStateCoverage(state)}`,
  ];
}

function formatStateSeries(series: PlayerStateMetricSeries | undefined): string {
  const w10 = formatStateValue(series?.w10);
  const w5 = formatStateValue(series?.w5);
  const w3 = formatStateValue(series?.w3);
  const arrow = formatTrendArrow(series?.w10, series?.w3);
  return `${w10} / ${w5} / ${w3}${arrow ? ` ${arrow}` : ""}`;
}

function formatStateValue(value: number | undefined): string {
  if (!isFiniteNumber(value)) {
    return "-";
  }
  return String(Math.round(clamp(value, 0, 100)));
}

function formatTrendArrow(w10: number | undefined, w3: number | undefined): string {
  if (!isFiniteNumber(w10) || !isFiniteNumber(w3)) {
    return "";
  }
  const delta = w3 - w10;
  if (delta >= 2) {
    return "↗";
  }
  if (delta <= -2) {
    return "↘";
  }
  return "→";
}

function formatStateCoverage(state: PlayerStateDisplay | undefined): string {
  const nTech = Number.isFinite(state?.nTech) ? Math.max(0, Math.trunc(state?.nTech || 0)) : 0;
  const markerW10 = formatWindowMarker("W10", state?.hasW10, state?.degradedW10);
  const markerW5 = formatWindowMarker("W5", state?.hasW5, state?.degradedW5);
  const markerW3 = formatWindowMarker("W3", state?.hasW3, state?.degradedW3);
  return `tech ${nTech}/10 | ${markerW10} ${markerW5} ${markerW3}`;
}

function formatWindowMarker(
  label: string,
  hasWindow: boolean | undefined,
  degraded: boolean | undefined,
): string {
  if (hasWindow !== true) {
    return `${label}x`;
  }
  if (degraded === true) {
    return `${label}~`;
  }
  return `${label}✓`;
}

function formatStateReasonLine(stateDecision: StateDecisionDisplay | undefined): string {
  const tags = stateDecision?.reasonTags || [];
  if (!tags.length) {
    return "STATE REASON: -";
  }
  return `STATE REASON: ${tags.slice(0, 2).map(formatStateReasonTag).join(" + ")}`;
}

function formatStateReasonTag(tag: StateDecisionDisplay["reasonTags"][number]): string {
  if (tag === "FORM_PLUS") {
    return "FORM+";
  }
  if (tag === "FORM_TECH") {
    return "FORM-TECH";
  }
  if (tag === "STABILITY") {
    return "STABILITY";
  }
  if (tag === "STRENGTH") {
    return "STRENGTH";
  }
  if (tag === "MOMENTUM_UP") {
    return "MOMENTUM↑";
  }
  if (tag === "MOMENTUM_DOWN") {
    return "MOMENTUM↓";
  }
  if (tag === "CONSENSUS") {
    return "CONSENSUS";
  }
  if (tag === "MIXED") {
    return "MIXED";
  }
  if (tag === "LOW_EDGE") {
    return "LOW_EDGE";
  }
  return "LOW_COVERAGE";
}

function resolvePlayerNames(prediction: PredictionResult): { playerA: string; playerB: string } {
  const a = normalizeName(prediction.playerAName);
  const b = normalizeName(prediction.playerBName);
  if (a && b) {
    return { playerA: a, playerB: b };
  }

  const fallback = parseNamesFromMatchLabel(prediction.matchLabel);
  return {
    playerA: a || fallback.playerA || "Player A",
    playerB: b || fallback.playerB || "Player B",
  };
}

function parseNamesFromMatchLabel(label: string | undefined): { playerA?: string; playerB?: string } {
  const text = String(label || "").trim();
  if (!text) {
    return {};
  }
  const parts = text.split(/\s+vs\s+/i);
  if (parts.length !== 2) {
    return {};
  }
  const playerA = normalizeName(parts[0]);
  const playerB = normalizeName(parts[1]);
  return {
    playerA: playerA || undefined,
    playerB: playerB || undefined,
  };
}

function formatDateFromSource(prediction: PredictionResult): string {
  if (prediction.matchStatus === "live") {
    return "LIVE";
  }
  const parsed = parseScheduledStart(prediction.scheduledStartText);
  if (!parsed) {
    return "-";
  }
  return (
    `${pad2(parsed.getUTCDate())}.${pad2(parsed.getUTCMonth() + 1)}.${parsed.getUTCFullYear()} ` +
    `${pad2(parsed.getUTCHours())}:${pad2(parsed.getUTCMinutes())}`
  );
}

function parseScheduledStart(value: string | undefined): Date | undefined {
  const text = String(value || "").trim();
  if (!text) {
    return undefined;
  }

  const ddmmyyyy = text.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/);
  if (ddmmyyyy) {
    const day = Number(ddmmyyyy[1]);
    const month = Number(ddmmyyyy[2]);
    const year = Number(ddmmyyyy[3]);
    const hour = Number(ddmmyyyy[4]);
    const minute = Number(ddmmyyyy[5]);
    return new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  }

  const yyyymmdd = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (yyyymmdd) {
    const year = Number(yyyymmdd[1]);
    const month = Number(yyyymmdd[2]);
    const day = Number(yyyymmdd[3]);
    const hour = Number(yyyymmdd[4]);
    const minute = Number(yyyymmdd[5]);
    return new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  }

  const dots = text.match(/^(\d{2})[./](\d{2})[./](\d{4})\s+(\d{2}):(\d{2})$/);
  if (dots) {
    const day = Number(dots[1]);
    const month = Number(dots[2]);
    const year = Number(dots[3]);
    const hour = Number(dots[4]);
    const minute = Number(dots[5]);
    return new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }
  return undefined;
}

function formatPercentPair(p1: number | undefined): string {
  if (!isFiniteNumber(p1)) {
    return "- / -";
  }
  const a = Math.round(clamp(p1, 0, 100));
  const b = 100 - a;
  return `${a}% / ${b}%`;
}

function formatWinnerOddComma(
  prediction: PredictionResult,
  playerAName: string,
  playerBName: string,
): string {
  const odds = prediction.marketOdds;
  if (!odds) {
    return "-";
  }

  const winner = normalizeName(prediction.predictedWinner).toLowerCase();
  const a = playerAName.toLowerCase();
  const b = playerBName.toLowerCase();

  if (winner && winner === a && isFiniteNumber(odds.home)) {
    return formatCommaDecimal(odds.home, 1);
  }
  if (winner && winner === b && isFiniteNumber(odds.away)) {
    return formatCommaDecimal(odds.away, 1);
  }
  return "-";
}

function formatConfidence(confidence: number): string {
  if (!Number.isFinite(confidence)) {
    return "-";
  }
  return `${formatCommaDecimal(confidence * 100, 1)}%`;
}

function getConfidencePct(confidence: number): number | undefined {
  if (!Number.isFinite(confidence)) {
    return undefined;
  }
  return confidence * 100;
}

function formatNovaEdgePair(p1: number | undefined, p2: number | undefined): string {
  if (!isFiniteNumber(p1) || !isFiniteNumber(p2)) {
    return "- / -";
  }
  const left = Math.round(clamp(p1, 0, 100));
  const right = Math.round(clamp(p2, 0, 100));
  return `${left}% / ${right}%`;
}

function formatMethodSummary(winner: string | undefined, pair: string): string {
  const normalizedWinner = normalizeName(winner);
  const winnerText = normalizedWinner || "-";
  const pairText = pair && pair !== "- / -" ? pair : "- / -";
  return `${winnerText} | ${pairText}`;
}

interface MethodsAgreementSummary {
  methods: number;
  agreeCount: number;
  agreementText: string;
}

function computeMethodsAgreement(
  predictedWinner: string,
  playerA: string,
  playerB: string,
  probabilities: Array<number | undefined>,
): MethodsAgreementSummary {
  const winnerSide = winnerToSide(predictedWinner, playerA, playerB);
  let methods = 0;
  let agree = 0;

  for (const value of probabilities) {
    if (!isFiniteNumber(value)) {
      continue;
    }
    methods += 1;
    const side = probabilityToSide(value);
    if (winnerSide && side !== "neutral" && side === winnerSide) {
      agree += 1;
    }
  }

  if (methods === 0) {
    return { methods: 0, agreeCount: 0, agreementText: "-/-" };
  }
  return { methods, agreeCount: agree, agreementText: `${agree}/${methods}` };
}

function winnerToSide(
  predictedWinner: string | undefined,
  playerA: string,
  playerB: string,
): "home" | "away" | undefined {
  const winner = normalizeName(predictedWinner).toLowerCase();
  if (!winner) {
    return undefined;
  }
  if (winner === playerA.toLowerCase()) {
    return "home";
  }
  if (winner === playerB.toLowerCase()) {
    return "away";
  }
  return undefined;
}

function probabilityToSide(p1: number): "home" | "away" | "neutral" {
  if (p1 > 50) {
    return "home";
  }
  if (p1 < 50) {
    return "away";
  }
  return "neutral";
}

function formatCommaDecimal(value: number, digits: number): string {
  if (!Number.isFinite(value)) {
    return "-";
  }
  return value.toFixed(digits).replace(".", ",");
}

function normalizeName(value: string | undefined): string {
  return String(value || "").trim();
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function canonicalWinnerName(value: string | undefined): string {
  return normalizeName(value).replace(/\s+/g, " ").toLowerCase();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}
