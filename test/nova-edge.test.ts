import test from "node:test";
import assert from "node:assert/strict";
import { computeNovaEdge } from "../src/predict/novaEdge.js";
import type { DirtFeatureRow } from "../src/predict/requiredMetrics.js";

function makeRow(matchUrl: string, pct: number, doubleFaults: number): DirtFeatureRow {
  return {
    matchUrl,
    first_serve: pct,
    first_serve_points_won: pct,
    second_serve_points_won: pct,
    break_points_saved: pct,
    double_faults: doubleFaults,
    first_serve_return_points_won: pct,
    second_serve_return_points_won: pct,
    break_points_converted: pct,
    total_service_points_won: pct,
    return_points_won: pct,
    total_points_won: pct,
    service_games_won: pct,
    return_games_won: pct,
    total_games_won: pct,
  };
}

function makeSeries(prefix: string, pct: number, doubleFaults: number): DirtFeatureRow[] {
  return [
    makeRow(`https://x/${prefix}/1`, pct, doubleFaults),
    makeRow(`https://x/${prefix}/2`, pct, doubleFaults),
    makeRow(`https://x/${prefix}/3`, pct, doubleFaults),
    makeRow(`https://x/${prefix}/4`, pct, doubleFaults),
    makeRow(`https://x/${prefix}/5`, pct, doubleFaults),
  ];
}

test("computeNovaEdge favors stronger player on deterministic series", () => {
  const a = makeSeries("a", 70, 1);
  const b = makeSeries("b", 45, 7);
  const result = computeNovaEdge(a, b, "Player A", "Player B", {
    seed: "seed-1",
  });

  assert.equal(result.source, "stable14_nova_v1");
  assert.ok(result.p1 > 50);
  assert.equal(result.winner, "Player A");
  assert.equal(result.p2, 100 - result.p1);
  assert.ok(result.p1 >= 1 && result.p1 <= 99);
  assert.equal(result.warnings.length, 0);
});

test("computeNovaEdge stays near 50/50 on symmetric inputs", () => {
  const a = makeSeries("a", 58, 3);
  const b = makeSeries("b", 58, 3);
  const result = computeNovaEdge(a, b, "Player A", "Player B", {
    seed: "seed-2",
  });

  assert.equal(result.p1, 50);
  assert.equal(result.p2, 50);
  assert.ok(result.winner === "Player A" || result.winner === "Player B");
  assert.equal(result.warnings.length, 0);
});

test("computeNovaEdge falls back safely on invalid input shape", () => {
  const a = makeSeries("a", 60, 2).slice(0, 4);
  const b = makeSeries("b", 55, 3);
  const result = computeNovaEdge(a, b, "Player A", "Player B", {
    seed: "seed-3",
  });

  assert.equal(result.p1, 50);
  assert.equal(result.p2, 50);
  assert.ok(result.winner === "Player A" || result.winner === "Player B");
  assert.ok(result.warnings.includes("nova_edge_unavailable"));
});

test("computeNovaEdge uses odds in tie fallback when available", () => {
  const a = makeSeries("a", 58, 3).slice(0, 4);
  const b = makeSeries("b", 55, 3).slice(0, 4);
  const result = computeNovaEdge(a, b, "Player A", "Player B", {
    homeOdd: 2.1,
    awayOdd: 1.8,
    seed: "seed-4",
  });

  assert.equal(result.winner, "Player B");
});

test("computeNovaEdge uses deterministic seed fallback when odds are missing", () => {
  const a = makeSeries("a", 58, 3).slice(0, 4);
  const b = makeSeries("b", 55, 3).slice(0, 4);
  const first = computeNovaEdge(a, b, "Player A", "Player B", {
    seed: "stable-seed",
  });
  const second = computeNovaEdge(a, b, "Player A", "Player B", {
    seed: "stable-seed",
  });

  assert.equal(first.winner, second.winner);
});
