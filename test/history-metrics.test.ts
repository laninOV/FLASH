import test from "node:test";
import assert from "node:assert/strict";
import { parseMetricValue } from "../src/normalize.js";
import { matrixFromHtmlFragment, parseTechStatsMatrix } from "../src/extract/techStats.js";
import {
  canonicalHistoryMetricKey,
  rateFromMetricValue,
  toHistoryMetricRow,
} from "../src/predict/historyMetrics.js";

test("rateFromMetricValue parses percent/ratio/empty", () => {
  assert.equal(rateFromMetricValue(parseMetricValue("65%")), 0.65);
  assert.equal(rateFromMetricValue(parseMetricValue("64%(7/11)")), 0.64);
  assert.equal(rateFromMetricValue(parseMetricValue("7/11")), 7 / 11);
  assert.equal(rateFromMetricValue(parseMetricValue("-")), undefined);
});

test("canonicalHistoryMetricKey maps 1st/2nd aliases", () => {
  assert.equal(canonicalHistoryMetricKey("2nd_serve_points_won"), "second_serve_points_won");
  assert.equal(
    canonicalHistoryMetricKey("2nd_serve_return_points_won"),
    "second_serve_return_points_won",
  );
  assert.equal(
    canonicalHistoryMetricKey("1st_serve_return_points_won"),
    "first_serve_return_points_won",
  );
  assert.equal(canonicalHistoryMetricKey("break_points_converted"), "break_points_converted");
});

test("toHistoryMetricRow builds tpw/ssw/rpr/bpsr/bpconv from Tech Statistics rows", () => {
  const fragment = `
  <table>
    <tr><th>Iva Jovic</th><th></th><th>Jessica Pegula</th></tr>
    <tr><td colspan="3">Service</td></tr>
    <tr><td>67%(4/6)</td><td>2nd Serve Points Won</td><td>100%(1/1)</td></tr>
    <tr><td>100%(1/1)</td><td>Break Points Saved</td><td>100%(1/1)</td></tr>
    <tr><td colspan="3">Return</td></tr>
    <tr><td>38%(3/8)</td><td>1st Serve Return Points Won</td><td>36%(4/11)</td></tr>
    <tr><td>0%(0/1)</td><td>2nd Serve Return Points Won</td><td>33%(2/6)</td></tr>
    <tr><td>57%(8/14)</td><td>Break Points Converted</td><td>56%(5/9)</td></tr>
    <tr><td colspan="3">Points</td></tr>
    <tr><td>54%(13/24)</td><td>Total Points Won</td><td>46%(11/24)</td></tr>
  </table>
  `;

  const matrix = matrixFromHtmlFragment(fragment);
  const parsed = parseTechStatsMatrix(matrix, "Iva Jovic");
  const row = toHistoryMetricRow({
    matchUrl: "https://example.com/match/1",
    playerName: "Iva Jovic",
    sourcePlayerSide: parsed.side,
    rows: parsed.rows,
    warnings: parsed.warnings,
  });

  assert.equal(row.tpw12, 0.54);
  assert.equal(row.ssw12, 0.67);
  assert.equal(row.bpsr12, 1);
  assert.equal(row.bpconv12, 0.57);
  assert.ok(typeof row.rpr12 === "number");
  assert.ok((row.rpr12 || 0) > 0.33);
});
