import test from "node:test";
import assert from "node:assert/strict";
import type { HistoryCalibration, HistoryModuleResult } from "../src/types.js";
import {
  module2HistoryServe,
  module3HistoryReturn,
  module4HistoryClutch,
} from "../src/predict/modulesHistory.js";
import { ensemble } from "../src/predict/ensemble.js";

const homeCal: HistoryCalibration = {
  ssw_12: { n: 10, mean: 0.58, sd: 0.04 },
  rpr_12: { n: 10, mean: 0.44, sd: 0.03 },
  bpsr_12: { n: 8, mean: 0.7, sd: 0.08 },
  bpconv_12: { n: 8, mean: 0.52, sd: 0.09 },
};

const awayCal: HistoryCalibration = {
  ssw_12: { n: 10, mean: 0.47, sd: 0.04 },
  rpr_12: { n: 10, mean: 0.34, sd: 0.03 },
  bpsr_12: { n: 8, mean: 0.55, sd: 0.08 },
  bpconv_12: { n: 8, mean: 0.31, sd: 0.09 },
};

test("module2/3/4 history produce directional signals", () => {
  const m2 = module2HistoryServe(homeCal, awayCal);
  const m3 = module3HistoryReturn(homeCal, awayCal);
  const m4 = module4HistoryClutch(homeCal, awayCal);

  assert.equal(m2.side, "home");
  assert.ok(m2.strength >= 1);

  assert.equal(m3.side, "home");
  assert.ok(m3.strength >= 1);

  assert.equal(m4.side, "home");
  assert.ok(m4.strength >= 1);
});

test("module4 history returns neutral on missing fields", () => {
  const blank: HistoryCalibration = {
    ssw_12: { n: 0 },
    rpr_12: { n: 0 },
    bpsr_12: { n: 0 },
    bpconv_12: { n: 0 },
  };

  const m4 = module4HistoryClutch(blank, blank);
  assert.equal(m4.side, "neutral");
  assert.equal(m4.strength, 0);
  assert.match(m4.flags.join(","), /missing_fields/);
});

test("ensemble computes final side and votes", () => {
  const modules: HistoryModuleResult[] = [
    { name: "M1_dominance", side: "home", strength: 2, explain: [], flags: [] },
    { name: "M2_second_serve", side: "home", strength: 2, explain: [], flags: [] },
    { name: "M3_return_pressure", side: "away", strength: 1, explain: [], flags: [] },
    { name: "M4_clutch", side: "home", strength: 1, explain: [], flags: [] },
  ];

  const result = ensemble(modules);
  assert.equal(result.finalSide, "home");
  assert.equal(result.votesHome, 3);
  assert.equal(result.votesAway, 1);
  assert.equal(result.active, 4);
  assert.ok(result.score >= 3);
});
