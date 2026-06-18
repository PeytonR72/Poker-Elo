export interface EloPlayer {
  id: string;
  rating: number;
  gamesPlayed?: number;
}

/**
 * Opponent-relative pairwise Elo. For each of the C(N,2) pairs, score S by finishing
 * place (1 better / 0 worse / 0.5 tie), expected E by the logistic, accumulate K*(S-E).
 * K is NOT divided by (N-1) — ranked is meant to feel meaningful. Returns rounded deltas.
 */
export function pairwiseElo(
  players: EloPlayer[],
  finishPlaceById: Record<string, number>,
  K: number | ((id: string) => number),
): Record<string, number> {
  const kOf = (id: string) => (typeof K === "function" ? K(id) : K);
  const raw: Record<string, number> = {};
  for (const p of players) raw[p.id] = 0;

  for (let a = 0; a < players.length; a++) {
    for (let b = a + 1; b < players.length; b++) {
      const pa = players[a]!;
      const pb = players[b]!;
      const placeA = finishPlaceById[pa.id]!;
      const placeB = finishPlaceById[pb.id]!;
      const sA = placeA < placeB ? 1 : placeA > placeB ? 0 : 0.5;
      const eA = 1 / (1 + Math.pow(10, (pb.rating - pa.rating) / 400));
      raw[pa.id] = raw[pa.id]! + kOf(pa.id) * (sA - eA);
      raw[pb.id] = raw[pb.id]! + kOf(pb.id) * (1 - sA - (1 - eA));
    }
  }

  const out: Record<string, number> = {};
  for (const id of Object.keys(raw)) out[id] = Math.round(raw[id]!);
  return out;
}
