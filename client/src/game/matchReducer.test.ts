import { describe, it, expect } from "vitest";
import { matchReducer, initialMatchState } from "./matchReducer.js";
import type { MatchUiState } from "./matchReducer.js";
import type { ServerMsg, PublicView, ActionMask, GameEvent } from "@poker/shared";

function view(over: Partial<PublicView> = {}): PublicView {
  return {
    seats: [], buttonIndex: 0, street: "preflop", board: [], sb: 10, bb: 20,
    currentBet: 20, lastRaiseSize: 20, toAct: 0, handNumber: 0, pots: [], ...over,
  };
}
const mask: ActionMask = {
  seat: 0, canFold: true, canCheck: false, canCall: true, callAmount: 20,
  canRaise: true, minRaiseTo: 40, maxRaiseTo: 200,
};
function run(msgs: ServerMsg[], start: MatchUiState = initialMatchState): MatchUiState {
  return msgs.reduce(matchReducer, start);
}

describe("matchReducer", () => {
  it("records own seat on seated", () => {
    const s = run([{ t: "seated", seatIndex: 3, playerId: "me" }]);
    expect(s.ownSeat).toBe(3);
  });

  it("stores own hole cards on dealPrivate", () => {
    const s = run([{ t: "dealPrivate", holeCards: [0, 13] }]);
    expect(s.ownHole).toEqual([0, 13]);
  });

  it("replaces the view on snapshot", () => {
    const s = run([{ t: "snapshot", view: view({ handNumber: 7 }) }]);
    expect(s.view?.handNumber).toBe(7);
  });

  it("stores matchInfo", () => {
    const s = run([{ t: "matchInfo", format: "turbo", matchStartMs: 5, matchDurationMs: 600000 }]);
    expect(s.matchInfo).toEqual({ format: "turbo", matchStartMs: 5, matchDurationMs: 600000 });
  });

  it("sets the turn on yourTurn and clears it on a snapshot where it is no longer our turn", () => {
    const s1 = run([
      { t: "seated", seatIndex: 0, playerId: "me" },
      { t: "yourTurn", mask, deadlineTs: 123 },
    ]);
    expect(s1.turn?.deadlineTs).toBe(123);
    const s2 = matchReducer(s1, { t: "snapshot", view: view({ toAct: 2 }) });
    expect(s2.turn).toBeNull();
  });

  it("keeps the turn when a snapshot still has us to act", () => {
    const s1 = run([
      { t: "seated", seatIndex: 0, playerId: "me" },
      { t: "yourTurn", mask, deadlineTs: 123 },
    ]);
    const s2 = matchReducer(s1, { t: "snapshot", view: view({ toAct: 0 }) });
    expect(s2.turn?.deadlineTs).toBe(123);
  });

  it("updates timebank only for our own seat", () => {
    const s1 = run([{ t: "seated", seatIndex: 1, playerId: "me" }]);
    const s2 = matchReducer(s1, { t: "timebankUsed", seatIdx: 4, remainingMs: 9000 });
    expect(s2.timebankMs).toBeNull();
    const s3 = matchReducer(s1, { t: "timebankUsed", seatIdx: 1, remainingMs: 9000 });
    expect(s3.timebankMs).toBe(9000);
  });

  it("captures final standings and deltas on matchOver and clears the turn", () => {
    const s1 = run([
      { t: "seated", seatIndex: 0, playerId: "me" },
      { t: "yourTurn", mask, deadlineTs: 1 },
    ]);
    const s2 = matchReducer(s1, {
      t: "matchOver",
      finishPlaceById: { me: 1, "bot-0": 2 },
      eloDeltas: { me: 12, "bot-0": -12 },
    });
    expect(s2.result?.finishPlaceById["me"]).toBe(1);
    expect(s2.result?.eloDeltas["me"]).toBe(12);
    expect(s2.turn).toBeNull();
  });

  it("captures an error message", () => {
    const s = run([{ t: "error", message: "not_your_turn" }]);
    expect(s.error).toBe("not_your_turn");
  });

  it("clears a stale error when a non-error message arrives", () => {
    const s1 = run([{ t: "error", message: "not_your_turn" }]);
    expect(s1.error).toBe("not_your_turn");
    const s2 = matchReducer(s1, { t: "snapshot", view: view() });
    expect(s2.error).toBeNull();
  });

  describe("winner / showdown accumulation", () => {
    const ev = (event: GameEvent): ServerMsg => ({ t: "event", event });

    it("accumulates award seats as pendingWinners without touching baked winners", () => {
      const s = run([ev({ type: "award", seat: 2, amount: 100, potIndex: 0 })]);
      expect(s.pendingWinners).toEqual([2]);
      expect(s.winners).toEqual([]);
      expect(s.handCompleteSeq).toBe(0);
    });

    it("dedupes a seat awarded multiple pots in the same hand", () => {
      const s = run([
        ev({ type: "award", seat: 2, amount: 100, potIndex: 0 }),
        ev({ type: "award", seat: 2, amount: 40, potIndex: 1 }),
        ev({ type: "award", seat: 4, amount: 60, potIndex: 2 }),
      ]);
      expect(s.pendingWinners).toEqual([2, 4]);
    });

    it("marks pendingShowdown on a showdown event", () => {
      const s = run([ev({ type: "showdown", reveals: [{ seat: 1, value: 12345 }] })]);
      expect(s.pendingShowdown).toBe(true);
      expect(s.showdownThisHand).toBe(false);
    });

    it("bakes pending → winners/showdownThisHand on handComplete, resets accumulators, bumps seq", () => {
      const s = run([
        ev({ type: "showdown", reveals: [{ seat: 1, value: 1 }, { seat: 3, value: 2 }] }),
        ev({ type: "award", seat: 3, amount: 200, potIndex: 0 }),
        ev({ type: "handComplete" }),
      ]);
      expect(s.winners).toEqual([3]);
      expect(s.showdownThisHand).toBe(true);
      expect(s.pendingWinners).toEqual([]);
      expect(s.pendingShowdown).toBe(false);
      expect(s.handCompleteSeq).toBe(1);
    });

    it("a fold-out hand bakes winners with showdownThisHand=false", () => {
      const s = run([
        ev({ type: "award", seat: 0, amount: 30, potIndex: 0 }),
        ev({ type: "handComplete" }),
      ]);
      expect(s.winners).toEqual([0]);
      expect(s.showdownThisHand).toBe(false);
      expect(s.handCompleteSeq).toBe(1);
    });

    it("next hand accumulates fresh: prior showdown/winners do not leak forward", () => {
      const afterHand1 = run([
        ev({ type: "showdown", reveals: [{ seat: 5, value: 9 }] }),
        ev({ type: "award", seat: 5, amount: 500, potIndex: 0 }),
        ev({ type: "handComplete" }),
      ]);
      const afterHand2 = run(
        [ev({ type: "award", seat: 1, amount: 40, potIndex: 0 }), ev({ type: "handComplete" })],
        afterHand1,
      );
      expect(afterHand2.winners).toEqual([1]);
      expect(afterHand2.showdownThisHand).toBe(false); // hand 2 had no showdown
      expect(afterHand2.handCompleteSeq).toBe(2);
      expect(afterHand2.pendingWinners).toEqual([]);
      expect(afterHand2.pendingShowdown).toBe(false);
    });

    it("handComplete also clears per-seat action pills", () => {
      const s = run([
        ev({ type: "action", seat: 2, action: "raise", amount: 60, allIn: false }),
        ev({ type: "award", seat: 2, amount: 90, potIndex: 0 }),
        ev({ type: "handComplete" }),
      ]);
      expect(s.actionBySeat).toEqual({});
    });
  });
});
