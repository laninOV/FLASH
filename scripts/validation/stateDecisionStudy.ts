import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { buildSignalReliabilityRows, canonicalizeMatchUrl } from "./agreementConfidenceStudy.js";
import { computeStateDecision } from "../../src/predict/stateDecision.js";
import type { PlayerStatePlayerSummary } from "../../src/types.js";

interface StudyConfig {
  joinedFile?: string;
  predictionsFile?: string;
  miniBatchFile?: string;
  reportJson?: string;
  liftTargetPp: number;
}

interface SideMetrics {
  hit: number;
  total: number;
  coverage: number;
  hitRate: number;
  precisionOnCalled: number;
}

interface StudyReport {
  config: StudyConfig;
  rowsTotal: number;
  rowsUsable: number;
  v2: SideMetrics;
  v3: SideMetrics;
  liftPp: number;
  precisionLiftPp: number;
  passesLiftTarget: boolean;
}

interface MiniBatchRow {
  playerAName?: string;
  playerBName?: string;
  actualWinner?: string | null;
  excludeFromStateEval?: boolean;
  state?: {
    playerA?: PlayerStatePlayerSummary;
    playerB?: PlayerStatePlayerSummary;
  };
  playerA?: PlayerStatePlayerSummary;
  playerB?: PlayerStatePlayerSummary;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readArg(argv: string[], name: string): string | undefined {
  const key = `--${name}`;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== key) {
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      return undefined;
    }
    return value;
  }
  return undefined;
}

function normalizeLoose(value: string | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/giu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function toSide(
  winnerName: string | undefined,
  playerAName: string,
  playerBName: string,
): "A" | "B" | undefined {
  const winner = normalizeLoose(winnerName);
  if (!winner) {
    return undefined;
  }
  const a = normalizeLoose(playerAName);
  const b = normalizeLoose(playerBName);
  if (winner === a) {
    return "A";
  }
  if (winner === b) {
    return "B";
  }
  return undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveAvailabilityWeight(hasWindow: boolean | undefined, degraded: boolean | undefined): number {
  if (hasWindow !== true) {
    return 0;
  }
  if (degraded === true) {
    return 0.75;
  }
  return 1;
}

function computeV2MetricWindowComposite(
  series: { w10?: number; w5?: number; w3?: number } | undefined,
  availability: { w10: number; w5: number; w3: number },
): number | undefined {
  if (!series) {
    return undefined;
  }
  const entries = [
    { value: series.w10, weight: 0.25 * availability.w10 },
    { value: series.w5, weight: 0.35 * availability.w5 },
    { value: series.w3, weight: 0.4 * availability.w3 },
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

function computeV2SideScore(side: PlayerStatePlayerSummary | undefined): { score?: number; reliability: number; edges: number[] } {
  const availability = {
    w10: resolveAvailabilityWeight(side?.hasW10, side?.degradedW10),
    w5: resolveAvailabilityWeight(side?.hasW5, side?.degradedW5),
    w3: resolveAvailabilityWeight(side?.hasW3, side?.degradedW3),
  };
  const windowReliability = 0.25 * availability.w10 + 0.35 * availability.w5 + 0.4 * availability.w3;
  const nTechReliability = clamp((Number(side?.nTech) || 0) / 10, 0, 1);
  const reliability = clamp(0.5 * windowReliability + 0.5 * nTechReliability, 0, 1);

  const stability = computeV2MetricWindowComposite(side?.stability, availability);
  const formTech = computeV2MetricWindowComposite(side?.formTech, availability);
  const formPlus = computeV2MetricWindowComposite(side?.formPlus, availability);
  const strength = computeV2MetricWindowComposite(side?.strength, availability);
  const values = [stability, formTech, formPlus, strength];
  const weights = [0.3, 0.25, 0.3, 0.15];

  let sum = 0;
  let sumW = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (!isFiniteNumber(value)) {
      continue;
    }
    sum += value * weights[i];
    sumW += weights[i];
  }

  return {
    score: sumW > 0 ? sum / sumW : undefined,
    reliability,
    edges: values.map((value) => (isFiniteNumber(value) ? value : Number.NaN)),
  };
}

function computeV2Winner(
  playerState: { playerA?: PlayerStatePlayerSummary; playerB?: PlayerStatePlayerSummary } | undefined,
  playerAName: string,
  playerBName: string,
): string | undefined {
  const sideA = computeV2SideScore(playerState?.playerA);
  const sideB = computeV2SideScore(playerState?.playerB);
  const minReliability = clamp(Math.min(sideA.reliability, sideB.reliability), 0, 1);

  if (!isFiniteNumber(sideA.score) || !isFiniteNumber(sideB.score) || minReliability < 0.45) {
    return undefined;
  }

  let votesA = 0;
  let votesB = 0;
  for (let i = 0; i < sideA.edges.length; i += 1) {
    const a = sideA.edges[i];
    const b = sideB.edges[i];
    if (!isFiniteNumber(a) || !isFiniteNumber(b)) {
      continue;
    }
    const edge = a - b;
    if (Math.abs(edge) < 2) {
      continue;
    }
    if (edge > 0) {
      votesA += 1;
    } else {
      votesB += 1;
    }
  }

  const rawDiff = sideA.score - sideB.score;
  const consensus = Math.max(votesA, votesB) / 4;
  const effectiveDiff = rawDiff * (0.75 + 0.25 * consensus);
  const rawP1 = clamp(50 + 23 * Math.tanh(effectiveDiff / 13), 0, 100);
  const p1 = clamp(50 + (rawP1 - 50) * (0.38 + 0.62 * minReliability), 0, 100);
  if (p1 > 50) {
    return playerAName;
  }
  if (p1 < 50) {
    return playerBName;
  }
  return undefined;
}

function computeV3Winner(
  playerState: { playerA?: PlayerStatePlayerSummary; playerB?: PlayerStatePlayerSummary } | undefined,
  playerAName: string,
  playerBName: string,
): string | undefined {
  if (!playerState?.playerA || !playerState?.playerB) {
    return undefined;
  }
  return computeStateDecision({
    playerAName,
    playerBName,
    playerA: playerState.playerA,
    playerB: playerState.playerB,
  }).winner;
}

function ratio(value: number, total: number): number {
  return total > 0 ? value / total : 0;
}

function toMetrics(hit: number, total: number, rowsUsable: number): SideMetrics {
  return {
    hit,
    total,
    coverage: ratio(total, rowsUsable),
    hitRate: ratio(hit, rowsUsable),
    precisionOnCalled: ratio(hit, total),
  };
}

function evaluatePair(
  actualSide: "A" | "B",
  v2Winner: string | undefined,
  v3Winner: string | undefined,
  playerAName: string,
  playerBName: string,
): { v2Hit: boolean; v2Called: boolean; v3Hit: boolean; v3Called: boolean } {
  const v2Side = toSide(v2Winner, playerAName, playerBName);
  const v3Side = toSide(v3Winner, playerAName, playerBName);
  return {
    v2Called: Boolean(v2Side),
    v2Hit: Boolean(v2Side && v2Side === actualSide),
    v3Called: Boolean(v3Side),
    v3Hit: Boolean(v3Side && v3Side === actualSide),
  };
}

async function runJoinedPredictionsStudy(config: StudyConfig): Promise<StudyReport> {
  const joinedRaw = JSON.parse(await readFile(config.joinedFile as string, "utf-8"));
  const predictionsRaw = JSON.parse(await readFile(config.predictionsFile as string, "utf-8"));
  const built = buildSignalReliabilityRows(joinedRaw, predictionsRaw);

  const predictionByUrl = new Map<string, any>();
  if (Array.isArray(predictionsRaw)) {
    for (const row of predictionsRaw) {
      const canonical = canonicalizeMatchUrl(
        typeof (row as any)?.matchUrl === "string" ? (row as any).matchUrl : undefined,
      );
      if (!canonical || predictionByUrl.has(canonical)) {
        continue;
      }
      predictionByUrl.set(canonical, row);
    }
  }

  let v2Hit = 0;
  let v2Total = 0;
  let v3Hit = 0;
  let v3Total = 0;
  let usable = 0;

  for (const row of built.rows) {
    const actualSide = toSide(row.actualWinnerName, row.playerAName, row.playerBName);
    if (!actualSide) {
      continue;
    }
    usable += 1;
    const prediction = predictionByUrl.get(row.matchUrl);
    const playerState = prediction?.modelSummary?.playerState;
    const v2Winner = computeV2Winner(playerState, row.playerAName, row.playerBName);
    const directV3 = prediction?.modelSummary?.stateDecision;
    const v3Winner =
      directV3?.abstained === true
        ? undefined
        : typeof directV3?.winner === "string"
          ? directV3.winner
          : computeV3Winner(playerState, row.playerAName, row.playerBName);

    const evalResult = evaluatePair(actualSide, v2Winner, v3Winner, row.playerAName, row.playerBName);
    if (evalResult.v2Called) {
      v2Total += 1;
      if (evalResult.v2Hit) {
        v2Hit += 1;
      }
    }
    if (evalResult.v3Called) {
      v3Total += 1;
      if (evalResult.v3Hit) {
        v3Hit += 1;
      }
    }
  }

  const v2 = toMetrics(v2Hit, v2Total, usable);
  const v3 = toMetrics(v3Hit, v3Total, usable);
  const liftPp = (v3.hitRate - v2.hitRate) * 100;
  const precisionLiftPp = (v3.precisionOnCalled - v2.precisionOnCalled) * 100;

  return {
    config,
    rowsTotal: built.rows.length,
    rowsUsable: usable,
    v2,
    v3,
    liftPp: Math.round(liftPp * 1000) / 1000,
    precisionLiftPp: Math.round(precisionLiftPp * 1000) / 1000,
    passesLiftTarget: liftPp >= config.liftTargetPp,
  };
}

async function runMiniBatchStudy(config: StudyConfig): Promise<StudyReport> {
  const rows = JSON.parse(await readFile(config.miniBatchFile as string, "utf-8")) as MiniBatchRow[];
  let v2Hit = 0;
  let v2Total = 0;
  let v3Hit = 0;
  let v3Total = 0;
  let usable = 0;

  for (const row of rows) {
    if (row.excludeFromStateEval) {
      continue;
    }
    const actualWinner = typeof row.actualWinner === "string" ? row.actualWinner : undefined;
    const playerAName = String(row.playerAName || "").trim();
    const playerBName = String(row.playerBName || "").trim();
    if (!actualWinner || !playerAName || !playerBName) {
      continue;
    }
    const actualSide = toSide(actualWinner, playerAName, playerBName);
    if (!actualSide) {
      continue;
    }

    const playerState = {
      playerA: row.state?.playerA ?? row.playerA,
      playerB: row.state?.playerB ?? row.playerB,
    };
    if (!playerState.playerA || !playerState.playerB) {
      continue;
    }

    usable += 1;
    const v2Winner = computeV2Winner(playerState, playerAName, playerBName);
    const v3Winner = computeV3Winner(playerState, playerAName, playerBName);
    const evalResult = evaluatePair(actualSide, v2Winner, v3Winner, playerAName, playerBName);

    if (evalResult.v2Called) {
      v2Total += 1;
      if (evalResult.v2Hit) {
        v2Hit += 1;
      }
    }
    if (evalResult.v3Called) {
      v3Total += 1;
      if (evalResult.v3Hit) {
        v3Hit += 1;
      }
    }
  }

  const v2 = toMetrics(v2Hit, v2Total, usable);
  const v3 = toMetrics(v3Hit, v3Total, usable);
  const liftPp = (v3.hitRate - v2.hitRate) * 100;
  const precisionLiftPp = (v3.precisionOnCalled - v2.precisionOnCalled) * 100;

  return {
    config,
    rowsTotal: rows.length,
    rowsUsable: usable,
    v2,
    v3,
    liftPp: Math.round(liftPp * 1000) / 1000,
    precisionLiftPp: Math.round(precisionLiftPp * 1000) / 1000,
    passesLiftTarget: liftPp >= config.liftTargetPp,
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const joinedFile = readArg(argv, "joined-file");
  const predictionsFile = readArg(argv, "predictions-file");
  const miniBatchFile = readArg(argv, "mini-batch-file");
  const reportJson = readArg(argv, "report-json");
  const config: StudyConfig = {
    joinedFile,
    predictionsFile,
    miniBatchFile,
    reportJson,
    liftTargetPp: 2,
  };

  if (!miniBatchFile && (!joinedFile || !predictionsFile)) {
    throw new Error(
      "Usage: --mini-batch-file <path> OR --joined-file <path> --predictions-file <path> [--report-json <path>]",
    );
  }

  const report = miniBatchFile
    ? await runMiniBatchStudy(config)
    : await runJoinedPredictionsStudy(config);

  const json = JSON.stringify(report, null, 2);
  if (reportJson) {
    await writeFile(reportJson, json, "utf-8");
  }
  process.stdout.write(`${json}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
