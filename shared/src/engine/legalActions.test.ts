import { describe, it, expect } from "vitest";
import { createSeat, createHand } from "./state.js";
import { legalActions } from "./legalActions.js";
import { fullDeck } from "../cards.js";

function freshSixMax() {
  const seats = Array.from({ length: 6 }, (_, i) => createSeat("p" + i, false, 1000));
  return createHand({ seats, buttonIndex: 0, sb: 10, bb: 20, deck: fullDeck(), handNumber: 1, elapsedMs: 0, format: "turbo" });
}

describe("legalActions", () => {
  it("UTG faces the big blind: can fold/call/raise, cannot check", () => {
    const st = freshSixMax();
    const m = legalActions(st, st.toAct!); // seat 3
    expect(m.canCheck).toBe(false);
    expect(m.canCall).toBe(true);
    expect(m.callAmount).toBe(20);
    expect(m.canFold).toBe(true);
    expect(m.canRaise).toBe(true);
    expect(m.minRaiseTo).toBe(40); // currentBet 20 + lastRaiseSize 20
    expect(m.maxRaiseTo).toBe(1000);
  });

  it("min-raise-to equals all-in when the stack is too short for a full raise", () => {
    const seats = [
      createSeat("a", false, 1000),
      createSeat("b", false, 1000),
      createSeat("c", false, 35), // can only raise to 35 max, below full min of 40
      null,
      null,
      null,
    ];
    const st = createHand({
      seats,
      buttonIndex: 0,
      sb: 10,
      bb: 20,
      deck: fullDeck(),
      handNumber: 1,
      elapsedMs: 0,
      format: "turbo",
    });
    const m = legalActions(st, 2); // seat c is UTG (after BB? heads/3-handed) -> compute generally
    // seat c has stack 35, faces bet 20
    expect(m.maxRaiseTo).toBe(35);
    expect(m.minRaiseTo).toBe(35); // clamped to all-in
  });
});
