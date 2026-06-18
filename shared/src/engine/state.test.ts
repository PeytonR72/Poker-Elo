import { describe, it, expect } from "vitest";
import { createSeat, createHand } from "./state.js";
import { fullDeck } from "../cards.js";

function seats(stacks: (number | null)[]) {
  return stacks.map((s, i) => (s == null ? null : createSeat("p" + i, false, s)));
}

describe("createHand", () => {
  it("deals two hole cards to every active seat and sets preflop", () => {
    const st = createHand({
      seats: seats([1000, 1000, 1000, 1000, 1000, 1000]),
      buttonIndex: 0,
      sb: 10,
      bb: 20,
      deck: fullDeck(),
      handNumber: 1,
      elapsedMs: 0,
      format: "turbo",
    });
    expect(st.street).toBe("preflop");
    for (const s of st.seats) {
      expect(s!.holeCards).not.toBeNull();
      expect(s!.holeCards!).toHaveLength(2);
    }
  });

  it("posts SB and BB and sets currentBet to the big blind", () => {
    const st = createHand({
      seats: seats([1000, 1000, 1000, 1000, 1000, 1000]),
      buttonIndex: 0,
      sb: 10,
      bb: 20,
      deck: fullDeck(),
      handNumber: 1,
      elapsedMs: 0,
      format: "turbo",
    });
    expect(st.seats[1]!.committedThisStreet).toBe(10); // SB left of button
    expect(st.seats[2]!.committedThisStreet).toBe(20); // BB
    expect(st.currentBet).toBe(20);
    expect(st.lastRaiseSize).toBe(20);
    // UTG (seat 3) acts first 6-handed
    expect(st.toAct).toBe(3);
  });

  it("heads-up: button is SB and acts first preflop", () => {
    const st = createHand({
      seats: seats([1000, 1000, null, null, null, null]),
      buttonIndex: 0,
      sb: 10,
      bb: 20,
      deck: fullDeck(),
      handNumber: 1,
      elapsedMs: 0,
      format: "turbo",
    });
    expect(st.seats[0]!.committedThisStreet).toBe(10); // button posts SB
    expect(st.seats[1]!.committedThisStreet).toBe(20); // BB
    expect(st.toAct).toBe(0); // button acts first heads-up
  });

  it("skips busted seats for blinds and dealing", () => {
    const st = createHand({
      seats: seats([1000, 0, 1000, 1000, null, null]),
      buttonIndex: 0,
      sb: 10,
      bb: 20,
      deck: fullDeck(),
      handNumber: 1,
      elapsedMs: 0,
      format: "turbo",
    });
    // seat 1 is busted -> SB is seat 2, BB seat 3
    expect(st.seats[1]!.status).toBe("busted");
    expect(st.seats[1]!.holeCards).toBeNull();
    expect(st.seats[2]!.committedThisStreet).toBe(10);
    expect(st.seats[3]!.committedThisStreet).toBe(20);
  });

  it("throws when fewer than two players can start", () => {
    expect(() =>
      createHand({
        seats: seats([1000, 0, null, null, null, null]),
        buttonIndex: 0,
        sb: 10,
        bb: 20,
        deck: fullDeck(),
        handNumber: 1,
        elapsedMs: 0,
        format: "turbo",
      }),
    ).toThrow();
  });
});
