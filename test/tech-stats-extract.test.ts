import test from "node:test";
import assert from "node:assert/strict";
import { matrixFromHtmlFragment, parseTechStatsMatrix } from "../src/extract/techStats.js";

const fragment = `
<table>
  <tr>
    <th>Iva Jovic</th>
    <th></th>
    <th>Jessica Pegula</th>
  </tr>
  <tr><td colspan="3">Service</td></tr>
  <tr><td>65%</td><td>1st Serve</td><td>89%</td></tr>
  <tr><td>64%(7/11)</td><td>1st Serve Points Won</td><td>63%(5/8)</td></tr>
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

test("parseTechStatsMatrix parses full tech stats rows with sections", () => {
  const matrix = matrixFromHtmlFragment(fragment);
  const parsed = parseTechStatsMatrix(matrix, "Iva Jovic");

  assert.ok(parsed.rows.length >= 5);
  assert.equal(parsed.rows[0].section, "Service");
  assert.equal(parsed.rows[0].metricKey, "first_serve");

  const totalPoints = parsed.rows.find((row) => row.metricKey === "total_points_won");
  assert.ok(totalPoints);
  assert.equal(totalPoints?.playerValue.percent, 54);
  assert.equal(totalPoints?.opponentValue.percent, 46);

  const breakConverted = parsed.rows.find((row) => row.metricKey === "break_points_converted");
  assert.ok(breakConverted);
  assert.equal(breakConverted?.playerValue.made, 8);
  assert.equal(breakConverted?.playerValue.total, 14);
});
