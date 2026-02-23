import { closeBrowserSession, createBrowserSession } from "../browser.js";
import { extractMatchPageRef } from "../extract/matchPage.js";
import { Logger } from "../logger.js";
import { REQUIRED_DIRT_METRIC_KEYS, extractDirtFeatureRow } from "../predict/requiredMetrics.js";
import { aggregateIndexPairs, buildIndexPairs } from "../predict/dirtPairs.js";
import { predict } from "../predictor.js";
import { REQUIRED_HISTORY_COUNT } from "../orchestrator/constants.js";
import { collectPlayerStats } from "../orchestrator/playerHistory.js";
import type { DirtFeatureRow } from "../predict/requiredMetrics.js";
import type { RunConfig } from "../types.js";

export interface MatchTraceInput {
  matchUrl: string;
  playerAName: string;
  playerBName: string;
}

export interface MatchTracePairMetric {
  key: string;
  home: number;
  away: number;
  delta: number;
}

export interface MatchTraceSummary {
  match: {
    url: string;
    status: string;
    tournament?: string;
    scheduledStartText?: string;
    marketOdds?: {
      home?: number;
      away?: number;
      bookmaker?: string;
      stage?: string;
    };
  };
  players: {
    home: {
      name: string;
      profileUrl?: string;
      acceptedUrls: string[];
      historyScanStats?: unknown;
    };
    away: {
      name: string;
      profileUrl?: string;
      acceptedUrls: string[];
      historyScanStats?: unknown;
    };
  };
  pairs: Array<{
    index: number;
    matchAUrl: string;
    matchBUrl: string;
    metrics: MatchTracePairMetric[];
  }>;
  models: {
    main: {
      probabilities: {
        logRegP1?: number;
        markovP1?: number;
        bradleyP1?: number;
        pcaP1?: number;
        finalP1: number;
      };
      weights: {
        logReg: number;
        markov: number;
        bradley: number;
        pca: number;
      };
      stability?: {
        logReg?: number;
        markov?: number;
        bradley?: number;
        pca?: number;
      };
      winner: string;
      confidence: number;
    };
    nova?: {
      p1?: number;
      p2?: number;
      winner?: string;
    };
  };
  warnings: string[];
  dataStatus?: string;
}

export async function runMatchTrace(
  config: RunConfig,
  input: MatchTraceInput,
): Promise<MatchTraceSummary> {
  const logger = new Logger({ debugEnabled: true });
  const session = await createBrowserSession(config);

  try {
    const matchId = extractMatchIdFromUrl(input.matchUrl) || "trace";
    const dayMatch = {
      id: matchId,
      url: input.matchUrl,
      playerAName: input.playerAName,
      playerBName: input.playerBName,
      status: "unknown" as const,
    };
    const matchRef = await extractMatchPageRef(session.page, dayMatch, config, logger);
    const [playerA, playerB] = matchRef.players;

    const playerAStats = await collectPlayerStats({
      page: session.page,
      player: playerA,
      targetMatchUrl: matchRef.url,
      config,
      logger,
      requiredHistoryCount: REQUIRED_HISTORY_COUNT,
    });
    const playerBStats = await collectPlayerStats({
      page: session.page,
      player: playerB,
      targetMatchUrl: matchRef.url,
      config,
      logger,
      requiredHistoryCount: REQUIRED_HISTORY_COUNT,
    });

    const homeRows = playerAStats.parsedMatches
      .map((match) => extractDirtFeatureRow(match))
      .filter((row): row is DirtFeatureRow => Boolean(row));
    const awayRows = playerBStats.parsedMatches
      .map((match) => extractDirtFeatureRow(match))
      .filter((row): row is DirtFeatureRow => Boolean(row));
    const pairAgg = aggregateIndexPairs(homeRows, awayRows, REQUIRED_HISTORY_COUNT);
    const pairRows = buildIndexPairs(homeRows, awayRows, REQUIRED_HISTORY_COUNT);

    const prediction = predict(
      {
        matchUrl: matchRef.url,
        matchLabel: `${playerA.name} vs ${playerB.name}`,
        tournament: matchRef.tournament,
        status: matchRef.status,
        scheduledStartText: matchRef.scheduledStartText,
        playerAName: playerA.name,
        playerBName: playerB.name,
        marketOdds: matchRef.marketOdds,
        pclass: matchRef.pclass,
      },
      playerAStats,
      playerBStats,
      REQUIRED_HISTORY_COUNT,
    );

    const pairs = pairRows.map((pair) => ({
      index: pair.index + 1,
      matchAUrl: pair.home.matchUrl,
      matchBUrl: pair.away.matchUrl,
      metrics: REQUIRED_DIRT_METRIC_KEYS.map((key) => {
        const home = pair.home[key];
        const away = pair.away[key];
        return {
          key,
          home,
          away,
          delta: home - away,
        };
      }),
    }));

    return {
      match: {
        url: matchRef.url,
        status: matchRef.status,
        tournament: matchRef.tournament,
        scheduledStartText: matchRef.scheduledStartText,
        marketOdds: matchRef.marketOdds,
      },
      players: {
        home: {
          name: playerA.name,
          profileUrl: playerA.profileUrl,
          acceptedUrls: playerAStats.parsedMatches.map((match) => match.matchUrl),
          historyScanStats: playerAStats.historyScanStats,
        },
        away: {
          name: playerB.name,
          profileUrl: playerB.profileUrl,
          acceptedUrls: playerBStats.parsedMatches.map((match) => match.matchUrl),
          historyScanStats: playerBStats.historyScanStats,
        },
      },
      pairs,
      models: {
        main: {
          probabilities: pairAgg.modelProbabilities,
          weights: pairAgg.weights,
          stability: pairAgg.stability,
          winner: prediction.predictedWinner,
          confidence: prediction.confidence,
        },
        nova: prediction.modelSummary?.novaEdge
          ? {
              p1: prediction.modelSummary.novaEdge.p1,
              p2: prediction.modelSummary.novaEdge.p2,
              winner: prediction.modelSummary.novaEdge.winner,
            }
          : undefined,
      },
      warnings: prediction.warnings,
      dataStatus: prediction.dataStatus,
    };
  } finally {
    await closeBrowserSession(session);
  }
}

export function formatMatchTrace(summary: MatchTraceSummary): string {
  const lines: string[] = [];
  lines.push("=== MATCH TRACE ===");
  lines.push(`Match: ${summary.match.url}`);
  lines.push(`Status: ${summary.match.status}`);
  lines.push(`Tournament: ${summary.match.tournament || "-"}`);
  lines.push(`Scheduled: ${summary.match.scheduledStartText || "-"}`);
  lines.push(
    `Odds: ${formatOptional(summary.match.marketOdds?.home)} / ${formatOptional(
      summary.match.marketOdds?.away,
    )}`,
  );
  lines.push("");
  lines.push(
    `Home history accepted (${summary.players.home.acceptedUrls.length}/5): ${summary.players.home.acceptedUrls.join(", ") || "-"}`,
  );
  lines.push(
    `Away history accepted (${summary.players.away.acceptedUrls.length}/5): ${summary.players.away.acceptedUrls.join(", ") || "-"}`,
  );
  lines.push(`Home scan: ${JSON.stringify(summary.players.home.historyScanStats || {})}`);
  lines.push(`Away scan: ${JSON.stringify(summary.players.away.historyScanStats || {})}`);
  lines.push("");
  lines.push("Pairs (stable14):");
  for (const pair of summary.pairs) {
    lines.push(`- Pair #${pair.index}:`);
    lines.push(`  A: ${pair.matchAUrl}`);
    lines.push(`  B: ${pair.matchBUrl}`);
    for (const metric of pair.metrics) {
      lines.push(
        `  ${metric.key}: A=${metric.home.toFixed(2)} B=${metric.away.toFixed(2)} ` +
          `delta=${metric.delta >= 0 ? "+" : ""}${metric.delta.toFixed(2)}`,
      );
    }
  }
  lines.push("");
  lines.push("Main model:");
  lines.push(`  Probabilities: ${JSON.stringify(summary.models.main.probabilities)}`);
  lines.push(`  Weights: ${JSON.stringify(summary.models.main.weights)}`);
  lines.push(`  Stability: ${JSON.stringify(summary.models.main.stability || {})}`);
  lines.push(
    `  Winner/Confidence: ${summary.models.main.winner} / ${(summary.models.main.confidence * 100).toFixed(2)}%`,
  );
  lines.push("");
  lines.push(`NOVA model: ${JSON.stringify(summary.models.nova || {})}`);
  lines.push("");
  lines.push(`Data status: ${summary.dataStatus || "-"}`);
  lines.push(`Warnings: ${summary.warnings.length > 0 ? summary.warnings.join(" | ") : "-"}`);
  return lines.join("\n");
}

function extractMatchIdFromUrl(url: string): string | undefined {
  return String(url || "").match(/\/match\/(\d+)/i)?.[1];
}

function formatOptional(value: number | undefined): string {
  if (!Number.isFinite(value)) {
    return "-";
  }
  return (value as number).toFixed(2);
}
