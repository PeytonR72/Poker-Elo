import { describe, it, expect } from "vitest";
import { createSeat, createHand } from "./state.js";
import { redactFor } from "./selectors.js";
import { fullDeck } from "../cards.js";

function sixMax() {
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

describe("redactFor", () => {
  it("never exposes the deck or seed", () => {
    const view = redactFor("p0", sixMax()) as unknown as Record<string, unknown>;
    expect(view.deck).toBeUndefined();
    expect("deck" in view).toBe(false);
  });

  it("shows the requesting player's own hole cards only", () => {
    const st = sixMax();
    const view = redactFor("p0", st);
    expect(view.seats[0]!.holeCards).not.toBeNull();
    for (let i = 1; i < 6; i++) expect(view.seats[i]!.holeCards).toBeNull();
  });

  it("a spectator (null id) sees no hole cards mid-hand", () => {
    const view = redactFor(null, sixMax());
    for (const s of view.seats) if (s) expect(s.holeCards).toBeNull();
  });

  it("reveals contesting hands once the hand is complete", () => {
    const st = sixMax();
    st.street = "complete";
    st.seats[1]!.status = "folded";
    const view = redactFor(null, st);
    expect(view.seats[0]!.holeCards).not.toBeNull(); // still active -> revealed
    expect(view.seats[1]!.holeCards).toBeNull(); // folded -> hidden
  });
});
