import test from "node:test";
import assert from "node:assert/strict";
import { formatOutcomeAudit, type OutcomeAuditResult } from "../src/audit/outcomeAudit.js";

test("formatOutcomeAudit renders shadow hit-rate rows incl MATCHUP and MROA", () => {
  const result: OutcomeAuditResult = {
    requestedMatchUrls: ["https://www.flashscore.com.ua/match/tennis/x/?mid=abc"],
    matches: [],
    unmatchedPredictionMatchUrls: [],
    hitRate: {
      main: { hit: 2, total: 3, rate: 66.6667 },
      nova: { hit: 1, total: 3, rate: 33.3333 },
      hybridShadow: { hit: 3, total: 3, rate: 100 },
      mahalShadow: { hit: 2, total: 3, rate: 66.6667 },
      matchupShadow: { hit: 1, total: 3, rate: 33.3333 },
      marketResidualShadow: { hit: 2, total: 3, rate: 66.6667 },
    },
    componentHitRate: {
      main: {
        logistic: { hit: 0, total: 0 },
        markov: { hit: 0, total: 0 },
        bradley: { hit: 0, total: 0 },
        pca: { hit: 0, total: 0 },
      },
    },
    roi: {
      main: { bets: 0, profit: 0 },
    },
  };

  const text = formatOutcomeAudit(result);

  assert.match(text, /- HISTORY-5: 2\/3 \(66\.7%\)/);
  assert.match(text, /- NOVA: 1\/3 \(33\.3%\)/);
  assert.match(text, /- HYBRID \(shadow\): 3\/3 \(100\.0%\)/);
  assert.match(text, /- MAHAL \(shadow\): 2\/3 \(66\.7%\)/);
  assert.match(text, /- MATCHUP \(shadow\): 1\/3 \(33\.3%\)/);
  assert.match(text, /- MROA \(shadow\): 2\/3 \(66\.7%\)/);
});
