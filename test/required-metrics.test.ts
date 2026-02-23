import test from "node:test";
import assert from "node:assert/strict";
import {
  extractDirtFeatureRow,
  extractDirtFeatureRowDiagnostics,
  REQUIRED_DIRT_METRIC_KEYS,
} from "../src/predict/requiredMetrics.js";
import type { HistoricalMatchTechStats, TechStatRow } from "../src/types.js";

function makeMatch(missingKey?: string): HistoricalMatchTechStats {
  const rows: TechStatRow[] = [];
  for (const [index, metricKey] of REQUIRED_DIRT_METRIC_KEYS.entries()) {
    if (metricKey === missingKey) {
      continue;
    }
    rows.push({
      section: "Service",
      metricLabel: metricKey,
      metricKey,
      playerValue: { raw: `${60 + (index % 7)}%`, percent: 60 + (index % 7) },
      opponentValue: { raw: `${40 - (index % 7)}%`, percent: 40 - (index % 7) },
    });
  }

  return {
    matchUrl: "https://sports1.nowgoal26.com/tennis/match/100",
    playerName: "Player",
    sourcePlayerSide: "left",
    rows,
    warnings: [],
  };
}

test("extractDirtFeatureRow returns row when all 14 required metrics are present", () => {
  const match = makeMatch();
  const row = extractDirtFeatureRow(match);
  assert.ok(row);
  assert.equal(row?.matchUrl, match.matchUrl);
  assert.ok(typeof row?.total_points_won === "number");
  assert.ok(typeof row?.break_points_converted === "number");
});

test("extractDirtFeatureRow returns null when any required metric is missing", () => {
  const match = makeMatch("break_points_converted");
  const row = extractDirtFeatureRow(match);
  const diagnostics = extractDirtFeatureRowDiagnostics(match);

  assert.equal(row, null);
  assert.ok(diagnostics.missingKeys.includes("break_points_converted"));
});

test("extractDirtFeatureRow supports 1st/2nd aliases for stable14 keys", () => {
  const rows: TechStatRow[] = [
    {
      section: "Service",
      metricLabel: "1st Serve",
      metricKey: "1st_serve",
      playerValue: { raw: "66%", percent: 66 },
      opponentValue: { raw: "34%", percent: 34 },
    },
    {
      section: "Service",
      metricLabel: "1st Serve Points Won",
      metricKey: "1st_serve_points_won",
      playerValue: { raw: "70%", percent: 70 },
      opponentValue: { raw: "30%", percent: 30 },
    },
    {
      section: "Service",
      metricLabel: "2nd Serve Points Won",
      metricKey: "2nd_serve_points_won",
      playerValue: { raw: "58%", percent: 58 },
      opponentValue: { raw: "42%", percent: 42 },
    },
    {
      section: "Service",
      metricLabel: "Break Points Saved",
      metricKey: "break_points_saved",
      playerValue: { raw: "75%", percent: 75 },
      opponentValue: { raw: "25%", percent: 25 },
    },
    {
      section: "Service",
      metricLabel: "Double Faults",
      metricKey: "double_faults",
      playerValue: { raw: "3", percent: 3 },
      opponentValue: { raw: "5", percent: 5 },
    },
    {
      section: "Return",
      metricLabel: "1st Serve Return Points Won",
      metricKey: "1st_serve_return_points_won",
      playerValue: { raw: "35%", percent: 35 },
      opponentValue: { raw: "65%", percent: 65 },
    },
    {
      section: "Return",
      metricLabel: "2nd Serve Return Points Won",
      metricKey: "2nd_serve_return_points_won",
      playerValue: { raw: "50%", percent: 50 },
      opponentValue: { raw: "50%", percent: 50 },
    },
    {
      section: "Return",
      metricLabel: "Break Points Converted",
      metricKey: "break_points_converted",
      playerValue: { raw: "40%", percent: 40 },
      opponentValue: { raw: "60%", percent: 60 },
    },
    {
      section: "Points",
      metricLabel: "Total Service Points Won",
      metricKey: "total_service_points_won",
      playerValue: { raw: "62%", percent: 62 },
      opponentValue: { raw: "38%", percent: 38 },
    },
    {
      section: "Points",
      metricLabel: "Return Points Won",
      metricKey: "return_points_won",
      playerValue: { raw: "38%", percent: 38 },
      opponentValue: { raw: "62%", percent: 62 },
    },
    {
      section: "Points",
      metricLabel: "Total Points Won",
      metricKey: "total_points_won",
      playerValue: { raw: "54%", percent: 54 },
      opponentValue: { raw: "46%", percent: 46 },
    },
    {
      section: "Games",
      metricLabel: "Service Games Won",
      metricKey: "service_games_won",
      playerValue: { raw: "80%", percent: 80 },
      opponentValue: { raw: "20%", percent: 20 },
    },
    {
      section: "Games",
      metricLabel: "Return Games Won",
      metricKey: "return_games_won",
      playerValue: { raw: "35%", percent: 35 },
      opponentValue: { raw: "65%", percent: 65 },
    },
    {
      section: "Games",
      metricLabel: "Total Games Won",
      metricKey: "total_games_won",
      playerValue: { raw: "57%", percent: 57 },
      opponentValue: { raw: "43%", percent: 43 },
    },
  ];

  const match: HistoricalMatchTechStats = {
    matchUrl: "https://sports1.nowgoal26.com/tennis/match/101",
    playerName: "Player",
    sourcePlayerSide: "left",
    rows,
    warnings: [],
  };

  const out = extractDirtFeatureRow(match);
  assert.ok(out);
  assert.equal(out?.first_serve_points_won, 70);
  assert.equal(out?.second_serve_return_points_won, 50);
});
