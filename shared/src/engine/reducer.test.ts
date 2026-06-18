import { describe, it, expect } from "vitest";
import { createSeat, createHand } from "./state.js";
import { applyAction } from "./reducer.js";
import { legalActions } from "./legalActions.js";
import { fullDeck } from "../cards.js";

function sixMax(stacks = [1000, 1000, 1000, 1000, 1000, 1000]) {
  const seats = stacks.map((s, i) => createSeat("p" + i, false, s));
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

describe("reducer betting flow", () => {
  it("everyone folds to the big blind; BB wins the blinds", () => {
    let st = sixMax();
    for (const seat of [3, 4, 5, 0, 1]) st = applyAction(st, { seat, type: "fold" }).state;
    expect(st.street).toBe("complete");
    expect(st.seats[2]!.stack).toBe(1010); // 1000 - 20 + 30
  });

  it("limp/check around reaches the flop", () => {
    let st = sixMax();
    for (const seat of [3, 4, 5, 0]) st = applyAction(st, { seat, type: "call" }).state;
    st = applyAction(st, { seat: 1, type: "call" }).state;
    st = applyAction(st, { seat: 2, type: "check" }).state;
    expect(st.street).toBe("flop");
    expect(st.board).toHaveLength(3);
    expect(st.toAct).toBe(1); // SB acts first postflop
  });

  it("enforces min-raise sizing", () => {
    let st = sixMax();
    st = applyAction(st, { seat: 3, type: "raise", amount: 40 }).state;
    expect(st.currentBet).toBe(40);
    expect(legalActions(st, 4).minRaiseTo).toBe(60);
  });

  it("a full raise reopens betting to a player who already called", () => {
    let st = sixMax();
    st = applyAction(st, { seat: 3, type: "call" }).state;
    st = applyAction(st, { seat: 4, type: "raise", amount: 60 }).state;
    for (const seat of [5, 0, 1, 2]) st = applyAction(st, { seat, type: "fold" }).state;
    expect(st.toAct).toBe(3);
    expect(legalActions(st, 3).canRaise).toBe(true);
  });

  it("an incomplete all-in raise does NOT reopen for a player who already acted", () => {
    let st = sixMax([1000, 1000, 1000, 1000, 150, 1000]);
    st = applyAction(st, { seat: 3, type: "raise", amount: 100 }).state; // full, lastRaiseSize=80
    st = applyAction(st, { seat: 4, type: "raise", amount: 150 }).state; // all-in 150, +50 < 80
    expect(st.seats[4]!.status).toBe("allin");
    expect(st.currentBet).toBe(150);
    expect(legalActions(st, 5).canRaise).toBe(true); // seat 5 hasn't acted -> may raise
    for (const seat of [5, 0, 1, 2]) st = applyAction(st, { seat, type: "fold" }).state;
    expect(st.toAct).toBe(3);
    expect(legalActions(st, 3).canRaise).toBe(false); // capped: call or fold only
    expect(legalActions(st, 3).canCall).toBe(true);
  });

  it("all-in heads-up runs the board out to showdown", () => {
    const seats = [
      createSeat("a", false, 1000),
      createSeat("b", false, 1000),
      null,
      null,
      null,
      null,
    ];
    let st = createHand({
      seats,
      buttonIndex: 0,
      sb: 10,
      bb: 20,
      deck: fullDeck(),
      handNumber: 1,
      elapsedMs: 0,
      format: "turbo",
    });
    // button(0)=SB acts first; shove, other calls
    st = applyAction(st, { seat: 0, type: "raise", amount: 1000 }).state;
    st = applyAction(st, { seat: 1, type: "call" }).state;
    expect(st.street).toBe("complete");
    expect(st.board).toHaveLength(5);
    expect(st.seats[0]!.stack + st.seats[1]!.stack).toBe(2000); // chips conserved
  });
});
