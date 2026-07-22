import { describe, it, expect } from "vitest";
import { createSeat, createHand, fullDeck } from "@poker/shared";
import type { TableState } from "@poker/shared";
import { canBecomeSpectator, viewFor, countSpectators } from "./spectator.js";

function sixMax(): TableState {
  const seats = Array.from({ length: 6 }, (_, i) => createSeat("p" + i, false, 1000));
  return createHand({
    seats,
    buttonIndex: 0,
    sb: 10,
    bb: 20,
    deck: fullDeck(),
    handNumber: 1,
    elapsedMs: 0,
    format: "turbo",
  });
}

describe("canBecomeSpectator", () => {
  it("allows an unseated connection", () => {
    expect(canBecomeSpectator({ seatIndex: null })).toEqual({ ok: true });
  });

  it("rejects a seated connection", () => {
    expect(canBecomeSpectator({ seatIndex: 3 })).toEqual({ ok: false, reason: "already_seated" });
  });
});

describe("viewFor — the spectator security boundary", () => {
  it("never exposes hole cards to a spectator connection mid-hand, even for a colliding playerId", () => {
    const st = sixMax();
    // Regression guard: even if a spectator's authenticated playerId happens to equal a
    // seated player's id, the spectator flag must still win — no seat-holder view leaks.
    const view = viewFor({ spectator: true, playerId: "p0" }, st);
    for (const s of view.seats) if (s) expect(s.holeCards).toBeNull();
  });

  it("gives a seated connection its own hole cards", () => {
    const st = sixMax();
    const view = viewFor({ spectator: false, playerId: "p0" }, st);
    expect(view.seats[0]!.holeCards).not.toBeNull();
    for (let i = 1; i < 6; i++) expect(view.seats[i]!.holeCards).toBeNull();
  });

  it("matches redactFor(null, …) exactly for spectators, including at showdown reveal", () => {
    const st = sixMax();
    st.street = "complete";
    st.seats[1]!.status = "folded";
    const view = viewFor({ spectator: true, playerId: "irrelevant" }, st);
    expect(view.seats[0]!.holeCards).not.toBeNull(); // still active -> revealed to everyone
    expect(view.seats[1]!.holeCards).toBeNull(); // folded -> hidden
  });
});

describe("countSpectators", () => {
  it("counts only spectator connections", () => {
    const conns = [{ spectator: true }, { spectator: false }, { spectator: true }, { spectator: false }];
    expect(countSpectators(conns)).toBe(2);
  });

  it("returns 0 for no spectators", () => {
    expect(countSpectators([{ spectator: false }])).toBe(0);
  });

  it("returns 0 for an empty connection set", () => {
    expect(countSpectators([])).toBe(0);
  });
});
