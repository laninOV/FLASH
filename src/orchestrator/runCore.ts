import { closeBrowserSession, createBrowserSession } from "../browser.js";
import { extractDayMatches } from "../extract/dayMatches.js";
import { extractMatchPageRef } from "../extract/matchPage.js";
import { isSinglesMatch } from "../extract/playerProfile.js";
import { Logger } from "../logger.js";
import { predict } from "../predictor.js";
import type { PclassSnapshot, RunConfig, RunSummary } from "../types.js";
import { METRICS_POLICY, REQUIRED_HISTORY_COUNT } from "./constants.js";
import { hasRequiredHistoryCoverage } from "./historyScan.js";
import { collectPlayerStats } from "./playerHistory.js";
import { createTransports } from "./transports.js";
import {
  filterByStatus,
  formatHistoryScanStats,
  isAbortError,
  limitMatches,
  orderMatchesForProcessing,
  stringifyError,
  throwIfAborted,
  toSeconds,
} from "./utils.js";

export interface RunOptions {
  signal?: AbortSignal;
}

export async function run(config: RunConfig, options: RunOptions = {}): Promise<RunSummary> {
  const signal = options.signal;
  throwIfAborted(signal);
  const logger = new Logger({ debugEnabled: true });
  logger.info(
    `History policy: requested_recent_count=${config.recentCount}, ` +
      `recent_count_forced=${REQUIRED_HISTORY_COUNT}, metrics_policy=${METRICS_POLICY}, ` +
      `history_stats_miss_budget=${config.historyStatsMissBudget}, match_scope=singles_only`,
  );
  const startedAt = new Date().toISOString();
  const summary: RunSummary = {
    startedAt,
    finishedAt: startedAt,
    processedMatches: 0,
    predictedMatches: 0,
    skippedMatches: 0,
    parserErrors: 0,
    telegramFailures: 0,
  };

  const session = await createBrowserSession(config);
  const transports = createTransports(config);

  try {
    throwIfAborted(signal);
    const allMatches = await extractDayMatches(session.page, config, logger);
    const filteredMatches = filterByStatus(allMatches, config.status);
    const orderedMatches = orderMatchesForProcessing(filteredMatches, config.status);
    const scopedMatches = limitMatches(orderedMatches, config.limit);
    logger.info(`Processing ${scopedMatches.length} matches after filters.`);

    for (let index = 0; index < scopedMatches.length; index += 1) {
      throwIfAborted(signal);
      const dayMatch = scopedMatches[index];
      const matchStartedMs = Date.now();
      summary.processedMatches += 1;
      logger.info(
        `[${index + 1}/${scopedMatches.length}] ${dayMatch.playerAName} vs ${dayMatch.playerBName}`,
      );

      try {
        const collectionStartedMs = Date.now();
        const matchRef = await extractMatchPageRef(session.page, dayMatch, config, logger);
        logger.debug(`Match pclass source: ${formatPclassForLog(matchRef.pclass)}`);
        const [playerA, playerB] = matchRef.players;
        if (matchRef.isDoublesHint === true) {
          summary.skippedMatches += 1;
          logger.warn(
            `Skipping ${playerA.name} vs ${playerB.name}: ` +
              `non_singles_target (doubles_hint_match_page).`,
          );
          continue;
        }
        if (!isSinglesMatch(playerA.name, playerB.name)) {
          summary.skippedMatches += 1;
          logger.warn(
            `Skipping ${playerA.name} vs ${playerB.name}: non_singles_target (name_filter).`,
          );
          continue;
        }
        const playerAStats = await collectPlayerStats({
          page: session.page,
          player: playerA,
          targetMatchUrl: matchRef.url,
          config,
          logger,
          signal,
          requiredHistoryCount: REQUIRED_HISTORY_COUNT,
        });
        if (
          playerAStats.parsedMatches.length < REQUIRED_HISTORY_COUNT &&
          playerAStats.historyScanStats?.earlyStopReason === "stats_miss_budget_reached"
        ) {
          summary.skippedMatches += 1;
          const collectionSec = toSeconds(Date.now() - collectionStartedMs);
          logger.warn(
            `Skipping ${playerA.name} vs ${playerB.name}: strict_5_not_reached_fast ` +
              `(player=A, reason=stats_miss_budget_reached, need=${REQUIRED_HISTORY_COUNT}, ` +
              `A=${playerAStats.parsedMatches.length}, collection=${collectionSec.toFixed(2)}s).`,
          );
          logger.warn(`History scan stats A: ${formatHistoryScanStats(playerAStats)}`);
          continue;
        }
        const playerBStats = await collectPlayerStats({
          page: session.page,
          player: playerB,
          targetMatchUrl: matchRef.url,
          config,
          logger,
          signal,
          requiredHistoryCount: REQUIRED_HISTORY_COUNT,
        });
        throwIfAborted(signal);
        const collectionSec = toSeconds(Date.now() - collectionStartedMs);

        if (!hasRequiredHistoryCoverage(playerAStats, playerBStats, REQUIRED_HISTORY_COUNT)) {
          summary.skippedMatches += 1;
          logger.warn(
            `Skipping ${playerA.name} vs ${playerB.name}: strict_5_not_reached ` +
              `(need=${REQUIRED_HISTORY_COUNT}, A=${playerAStats.parsedMatches.length}, ` +
              `B=${playerBStats.parsedMatches.length}, collection=${collectionSec.toFixed(2)}s).`,
          );
          logger.warn(
            `History scan stats A: ${formatHistoryScanStats(playerAStats)} | ` +
              `B: ${formatHistoryScanStats(playerBStats)}`,
          );
          continue;
        }

        const predictionStartedMs = Date.now();
        const basePrediction = predict(
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
        const predictionSec = toSeconds(Date.now() - predictionStartedMs);
        const totalSec = toSeconds(Date.now() - matchStartedMs);
        const prediction = {
          ...basePrediction,
          timingsSec: {
            collection: collectionSec,
            prediction: predictionSec,
            total: totalSec,
          },
        };
        logger.info(
          `Timing ${prediction.matchLabel}: collection=${collectionSec.toFixed(2)}s ` +
            `prediction=${predictionSec.toFixed(2)}s total=${totalSec.toFixed(2)}s`,
        );

        for (const transport of transports) {
          throwIfAborted(signal);
          try {
            await transport.sendPrediction(prediction);
          } catch (error) {
            if (transport.name === "telegram") {
              summary.telegramFailures += 1;
            }
            logger.warn(
              `Transport ${transport.name} failed for ${prediction.matchLabel}: ${stringifyError(
                error,
              )}`,
            );
          }
        }

        summary.predictedMatches += 1;
        // Explicitly release references between matches.
        playerAStats.parsedMatches.length = 0;
        playerBStats.parsedMatches.length = 0;
      } catch (error) {
        if (isAbortError(error)) {
          logger.warn("Run aborted by control signal.");
          throw error;
        }
        summary.parserErrors += 1;
        logger.error(
          `Failed to process ${dayMatch.playerAName} vs ${dayMatch.playerBName}: ${stringifyError(
            error,
          )}`,
        );
      }
    }
  } finally {
    summary.finishedAt = new Date().toISOString();
    await closeBrowserSession(session);
  }

  logger.info(
    `Run summary: processed=${summary.processedMatches}, predicted=${summary.predictedMatches}, ` +
      `skipped=${summary.skippedMatches}, parserErrors=${summary.parserErrors}, ` +
      `telegramFailures=${summary.telegramFailures}`,
  );

  return summary;
}

function formatPclassForLog(pclass?: PclassSnapshot): string {
  if (!pclass || pclass.source !== "match_dv_data") {
    return "missing";
  }
  return `${pclass.ev}/${pclass.dep}`;
}
