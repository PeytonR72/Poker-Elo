import type { Action, GameEvent, Seat, TableState } from "./types.js";
import { cloneState } from "./state.js";
import { legalActions } from "./legalActions.js";
import { nextToAct, inHandCount, activeCount, firstActivePostflop } from "./betting.js";
import { settleShowdown, awardSingleWinner } from "./showdown.js";

export function applyAction(
  state: TableState,
  action: Action,
): { state: TableState; events: GameEvent[] } {
  if (state.street === "complete") throw new Error("hand is complete");
  if (state.toAct !== action.seat) throw new Error(`not seat ${action.seat}'s turn`);

  const s = cloneState(state);
  const events: GameEvent[] = [];

  const seat = s.seats[action.seat]!;
  const mask = legalActions(s, action.seat);
  const prevBet = s.currentBet;
  let allIn = false;

  switch (action.type) {
    case "fold":
      seat.status = "folded";
      seat.hasActed = true;
      break;

    case "check":
      if (!mask.canCheck) throw new Error("illegal check");
      seat.hasActed = true;
      break;

    case "call": {
      if (!mask.canCall) throw new Error("illegal call");
      const callAmt = Math.min(s.currentBet - seat.committedThisStreet, seat.stack);
      commit(seat, callAmt);
      seat.hasActed = true;
      if (seat.stack === 0) {
        seat.status = "allin";
        allIn = true;
      }
      break;
    }

    case "raise": {
      if (!mask.canRaise) throw new Error("illegal raise");
      // action.amount is raise-TO (total chips committed this street by this seat)
      let raiseTo = action.amount ?? mask.minRaiseTo;
      // Clamp to legal range
      if (raiseTo < mask.minRaiseTo) raiseTo = mask.minRaiseTo;
      if (raiseTo > mask.maxRaiseTo) raiseTo = mask.maxRaiseTo;

      const increment = raiseTo - prevBet; // how much the bet increased
      const isFullRaise = increment >= s.lastRaiseSize;

      commit(seat, raiseTo - seat.committedThisStreet);
      seat.hasActed = true;
      if (seat.stack === 0) {
        seat.status = "allin";
        allIn = true;
      }

      if (isFullRaise) {
        // Full raise: update lastRaiseSize and reopen betting for all other active seats
        s.lastRaiseSize = increment;
        for (let j = 0; j < s.seats.length; j++) {
          const o = s.seats[j];
          if (o && o.status === "active" && j !== action.seat) {
            o.hasActed = false;
          }
        }
      }
      // For an incomplete raise (all-in for less than min-raise): do NOT reopen betting.
      // hasActed stays as-is for other seats.

      s.currentBet = Math.max(s.currentBet, raiseTo);
      s.lastAggressor = action.seat;
      break;
    }
  }

  events.push({
    type: "action",
    seat: action.seat,
    action: action.type,
    amount: seat.committedThisStreet,
    allIn,
  });

  // If only one player remains in the hand (all others folded), award them the pot
  if (inHandCount(s) === 1) {
    const result = awardSingleWinner(s);
    events.push(...result.events);
    return { state: result.state, events };
  }

  // Check if someone still needs to act
  const next = nextToAct(s, action.seat);
  if (next !== null) {
    s.toAct = next;
    return { state: s, events };
  }

  // No more action this street — advance
  return advanceStreet(s, events);
}

function commit(seat: Seat, amount: number): void {
  seat.stack -= amount;
  seat.committedThisStreet += amount;
  seat.committedTotal += amount;
}

function advanceStreet(
  s: TableState,
  events: GameEvent[],
): { state: TableState; events: GameEvent[] } {
  // Reset per-street state
  for (const seat of s.seats) {
    if (seat) {
      seat.committedThisStreet = 0;
      seat.hasActed = false;
    }
  }
  s.currentBet = 0;
  s.lastRaiseSize = s.bb;
  s.lastAggressor = null;

  // If we just finished the river, run showdown
  if (s.street === "river") {
    const result = settleShowdown(s);
    events.push(...result.events);
    return { state: result.state, events };
  }

  // Deal the next street's community cards
  if (s.street === "preflop") {
    const cards = s.deck.slice(s.deckPointer, s.deckPointer + 3);
    s.deckPointer += 3;
    s.board.push(...cards);
    s.street = "flop";
    events.push({ type: "street", street: "flop", cards });
  } else if (s.street === "flop") {
    const cards = s.deck.slice(s.deckPointer, s.deckPointer + 1);
    s.deckPointer += 1;
    s.board.push(...cards);
    s.street = "turn";
    events.push({ type: "street", street: "turn", cards });
  } else if (s.street === "turn") {
    const cards = s.deck.slice(s.deckPointer, s.deckPointer + 1);
    s.deckPointer += 1;
    s.board.push(...cards);
    s.street = "river";
    events.push({ type: "street", street: "river", cards });
  }

  // If all remaining players are all-in (no active players left to bet),
  // run out remaining streets immediately
  if (activeCount(s) === 0) {
    return advanceStreet(s, events);
  }

  // Set the first player to act postflop
  const first = firstActivePostflop(s);
  if (first === null) {
    // No active players (edge case) — run out the board
    return advanceStreet(s, events);
  }
  s.toAct = first;
  return { state: s, events };
}
