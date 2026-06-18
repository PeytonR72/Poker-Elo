import { describe, it, expect } from "vitest";
import { pairwiseElo, type EloPlayer } from "./pairwise.js";

function players(ratings: number[]): EloPlayer[] {
  return ratings.map((r, i) => ({ id: "p" + i, rating: r }));
}

describe("pairwiseElo", () => {
  it("6 equal players: winner +60, loser -60, symmetric, K=24, no /(N-1)", () => {
    const ps = players([400, 400, 400, 400, 400, 400]);
    const place: Record<string, number> = { p0: 1, p1: 2, p2: 3, p3: 4, p4: 5, p5: 6 };
    const d = pairwiseElo(ps, place, 24);
    expect(d.p0).toBe(60); // beats 5 equals: 24*(5 - 2.5)
    expect(d.p5).toBe(-60);
    expect(Object.values(d).reduce((a, b) => a + b, 0)).toBe(0); // zero-sum among equals
  });

  it("beating a higher-rated player gains more than beating a lower-rated one", () => {
    const ps: EloPlayer[] = [
      { id: "me", rating: 400 },
      { id: "strong", rating: 800 },
      { id: "weak", rating: 100 },
    ];
    // beatStrong: me finishes 1st, beating strong (2nd) and weak (3rd)
    const beatStrong = pairwiseElo(ps, { me: 1, strong: 2, weak: 3 }, 24).me!;
    // beatWeakOnly: strong finishes 1st (beats me), me finishes 2nd (beats weak only)
    const beatWeakOnly = pairwiseElo(ps, { strong: 1, me: 2, weak: 3 }, 24).me!;
    expect(beatStrong).toBeGreaterThan(beatWeakOnly);
  });

  it("a chip tie (same finishing place) scores S=0.5 for that pair", () => {
    const ps = players([400, 400]);
    const d = pairwiseElo(ps, { p0: 1, p1: 1 }, 24); // tie
    expect(d.p0).toBe(0);
    expect(d.p1).toBe(0);
  });

  it("supports a per-player K (provisional players move faster)", () => {
    const ps = players([400, 400]);
    const k = (id: string) => (id === "p0" ? 48 : 24);
    const d = pairwiseElo(ps, { p0: 1, p1: 2 }, k);
    expect(d.p0).toBe(24); // 48 * (1 - 0.5)
    expect(d.p1).toBe(-12); // 24 * (0 - 0.5)
  });
});
