function isValidOdd(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function pickByOddsOrSeed(
  playerA: string,
  playerB: string,
  homeOdd: number | undefined,
  awayOdd: number | undefined,
  seed: string,
): { winner: string; reason: "odds" | "seed" } {
  if (isValidOdd(homeOdd) && isValidOdd(awayOdd) && homeOdd !== awayOdd) {
    return {
      winner: homeOdd < awayOdd ? playerA : playerB,
      reason: "odds",
    };
  }

  const key = seed || `${playerA}|${playerB}`;
  const pickA = stableHash(key) % 2 === 0;
  return {
    winner: pickA ? playerA : playerB,
    reason: "seed",
  };
}
