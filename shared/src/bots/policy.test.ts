import { describe, it, expect } from "vitest";
import { decide } from "./policy.js";
import { createSeat, createHand } from "../engine/state.js";
import { applyAction } from "../engine/reducer.js";
import { legalActions } from "../engine/legalActions.js";
import { redactFor } from "../engine/selectors.js";
import { shuffledDeck } from "../deck.js";
import { mulberry32 } from "../rng.js";
import { cardFromString as C } from "../cards.js";
import type { PublicView } from "../engine/selectors.js";

function viewWith(stack: number, currentBet: number): PublicView {
  return {
    seats: [
      {
        id: "me",
        isBot: true,
        stack,
        committedThisStreet: 0,
        committedTotal: 0,
        status: "active",
        holeCards: null,
      },
      {
        id: "x",
        isBot: true,
        stack: 1000,
        committedThisStreet: currentBet,
        committedTotal: currentBet,
        status: "active",
        holeCards: null,
      },
      null,
      null,
      null,
      null,
    ],
    buttonIndex: 0,
    street: "preflop",
    board: [],
    sb: 10,
    bb: 20,
    currentBet,
    lastRaiseSize: 20,
    toAct: 0,
    handNumber: 1,
    pots: [],
  };
}

describe("decide", () => {
  it("is deterministic for the same inputs and seed", () => {
    const v = viewWith(1000, 20);
    const mask = {
      seat: 0,
      canFold: true,
      canCheck: false,
      canCall: true,
      callAmount: 20,
      canRaise: true,
      minRaiseTo: 40,
      maxRaiseTo: 1000,
    };
    const a1 = decide(v, [C("Ah"), C("Ad")] as [number, number], mask, mulberry32(7));
    const a2 = decide(v, [C("Ah"), C("Ad")] as [number, number], mask, mulberry32(7));
    expect(a1).toEqual(a2);
  });

  it("always returns a legal action", () => {
    const v = viewWith(1000, 20);
    const mask = {
      seat: 0,
      canFold: true,
      canCheck: false,
      canCall: true,
      callAmount: 20,
      canRaise: true,
      minRaiseTo: 40,
      maxRaiseTo: 1000,
    };
    const a = decide(v, [C("7h"), C("2d")] as [number, number], mask, mulberry32(3));
    expect(["fold", "check", "call", "raise"]).toContain(a.type);
    if (a.type === "raise") {
      expect(a.amount!).toBeGreaterThanOrEqual(mask.minRaiseTo);
      expect(a.amount!).toBeLessThanOrEqual(mask.maxRaiseTo);
    }
  });

  it("shoves a premium hand when short-stacked", () => {
    const v = viewWith(100, 20); // 5bb
    const mask = {
      seat: 0,
      canFold: true,
      canCheck: false,
      canCall: true,
      callAmount: 20,
      canRaise: true,
      minRaiseTo: 40,
      maxRaiseTo: 100,
    };
    const a = decide(v, [C("Ah"), C("Ad")] as [number, number], mask, mulberry32(1));
    expect(a).toEqual({ seat: 0, type: "raise", amount: 100 });
  });

  it("folds trash facing a bet", () => {
    const v = viewWith(1000, 20);
    const mask = {
      seat: 0,
      canFold: true,
      canCheck: false,
      canCall: true,
      callAmount: 20,
      canRaise: true,
      minRaiseTo: 40,
      maxRaiseTo: 1000,
    };
    const a = decide(v, [C("7h"), C("2d")] as [number, number], mask, mulberry32(99));
    expect(a.type).toBe("fold");
  });
});

describe("bots play a full hand to completion", () => {
  it("6 bots reach a complete hand with chips conserved", () => {
    const seats = Array.from({ length: 6 }, (_, i) => createSeat("b" + i, true, 1000));
    let st = createHand({
      seats,
      buttonIndex: 0,
      sb: 10,
      bb: 20,
      deck: shuffledDeck(123),
      handNumber: 1,
      elapsedMs: 0,
      format: "turbo",
    });
    const before = 6000;
    const rng = mulberry32(123);
    let guard = 0;
    while (st.street !== "complete" && guard++ < 5000) {
      const i = st.toAct!;
      const seat = st.seats[i]!;
      const mask = legalActions(st, i);
      const view = redactFor(seat.id, st);
      st = applyAction(st, decide(view, seat.holeCards!, mask, rng)).state;
    }
    expect(st.street).toBe("complete");
    expect(st.seats.reduce((a, s) => a + (s ? s.stack : 0), 0)).toBe(before);
  });
});
