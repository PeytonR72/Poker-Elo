import { describe, it, expect } from "vitest";
import { settleShowdown, awardSingleWinner } from "./showdown.js";
import { createSeat } from "./state.js";
import { cardFromString as C } from "../cards.js";
import type { Seat, TableState } from "./types.js";

function mkSeat(
  id: string,
  hole: string | null,
  committedTotal: number,
  status: Seat["status"],
): Seat {
  return {
    ...createSeat(id, false, 0),
    holeCards: hole ? (hole.split(" ").map(C) as [number, number]) : null,
    committedTotal,
    status,
  };
}

function mkState(seats: (Seat | null)[], board: string): TableState {
  return {
    seats,
    buttonIndex: 0,
    street: "river",
    board: board ? board.split(" ").map(C) : [],
    deck: [],
    deckPointer: 0,
    sb: 10,
    bb: 20,
    currentBet: 0,
    lastRaiseSize: 20,
    toAct: null,
    lastAggressor: null,
    handNumber: 1,
    pots: [],
    elapsedMs: 0,
    format: "cash",
  };
}

describe("settleShowdown", () => {
  it("awards the whole pot to the best hand", () => {
    const st = mkState(
      [
        mkSeat("a", "Ah Ad", 100, "active"),
        mkSeat("b", "Kh Kd", 100, "active"),
        null,
        null,
        null,
        null,
      ],
      "2c 7d 9s Jh 3c",
    );
    const { state: result, events } = settleShowdown(st);
    expect(result.seats[0]!.stack).toBe(200); // aces win
    expect(result.seats[1]!.stack).toBe(0);
    expect(result.street).toBe("complete");
    // original must not be mutated
    expect(st.seats[0]!.stack).toBe(0);
    expect(st.street).toBe("river");
    expect(events.some((e) => e.type === "handComplete")).toBe(true);
  });

  it("splits a tied pot and gives the odd chip to the first seat left of the button", () => {
    // Royal flush on the board -> a and b tie; c folded 11 dead -> pot 51, split 26/25
    const st = mkState(
      [
        mkSeat("a", "2d 3h", 20, "active"),
        mkSeat("b", "4h 5s", 20, "active"),
        mkSeat("c", null, 11, "folded"),
        null,
        null,
        null,
      ],
      "Ac Kc Qc Jc Tc",
    );
    const { state: result } = settleShowdown(st); // button is seat 0, first left is seat 1
    expect(result.seats[1]!.stack).toBe(26); // odd chip
    expect(result.seats[0]!.stack).toBe(25);
  });

  it("respects side-pot eligibility (short all-in cannot win the side pot)", () => {
    // a all-in 40 with the nuts; b and c contest a 60*2 side pot, b wins it
    const st = mkState(
      [
        mkSeat("a", "Ah Ad", 40, "allin"), // best hand but only eligible for main
        mkSeat("b", "Kh Kd", 100, "active"),
        mkSeat("c", "Qh Qd", 100, "active"),
        null,
        null,
        null,
      ],
      "Ac 2d 7s Jh 3c", // a makes trip aces; b kings; c queens
    );
    const { state: result } = settleShowdown(st);
    // main pot 120 -> a (trips). side pot 120 -> b (kings beat queens).
    expect(result.seats[0]!.stack).toBe(120);
    expect(result.seats[1]!.stack).toBe(120);
    expect(result.seats[2]!.stack).toBe(0);
  });
});

describe("awardSingleWinner", () => {
  it("gives the entire pot to the only remaining seat", () => {
    const st = mkState(
      [
        mkSeat("a", "2c 3c", 30, "active"),
        mkSeat("b", "Kh Kd", 20, "folded"),
        null,
        null,
        null,
        null,
      ],
      "",
    );
    const originalStack = st.seats[0]!.stack;
    const { state: result, events } = awardSingleWinner(st);
    expect(result.seats[0]!.stack).toBe(50);
    expect(result.street).toBe("complete");
    // original must not be mutated
    expect(st.seats[0]!.stack).toBe(originalStack);
    expect(st.street).toBe("river");
    expect(events.some((e) => e.type === "handComplete")).toBe(true);
  });
});
