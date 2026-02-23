import test from "node:test";
import assert from "node:assert/strict";
import { resolvePclassSnapshot } from "../src/extract/matchPage.js";

test("resolvePclassSnapshot prefers #fbheader home/guest dv-data values", () => {
  const pclass = resolvePclassSnapshot({
    homeDvData: "11864",
    awayDvData: "7941",
    fallbackDvData: ["1", "2"],
  });

  assert.equal(pclass.source, "match_dv_data");
  assert.equal(pclass.ev, 11864);
  assert.equal(pclass.dep, 7941);
});

test("resolvePclassSnapshot falls back to first two valid .f_btn[dv-data] values", () => {
  const pclass = resolvePclassSnapshot({
    homeDvData: "abc",
    awayDvData: "",
    fallbackDvData: ["", "11864", "x", "7941", "9000"],
  });

  assert.equal(pclass.source, "match_dv_data");
  assert.equal(pclass.ev, 11864);
  assert.equal(pclass.dep, 7941);
});

test("resolvePclassSnapshot returns missing for invalid values", () => {
  const pclass = resolvePclassSnapshot({
    homeDvData: "-12",
    awayDvData: "0",
    fallbackDvData: ["", "abc", "-1", "0"],
  });

  assert.equal(pclass.source, "missing");
  assert.equal(pclass.ev, undefined);
  assert.equal(pclass.dep, undefined);
});
