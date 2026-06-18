import { evaluate7 } from "../handEval/index.js";
import type { GameEvent, TableState } from "./types.js";
import { buildPots } from "./pots.js";
import { cloneState } from "./state.js";

/** Award the whole pot to the last remaining seat (everyone else folded). */
export function awardSingleWinner(state: TableState): { state: TableState; events: GameEvent[] } {
  const s = cloneState(state);
  const events: GameEvent[] = [];
  const total = buildPots(s.seats).reduce((a, p) => a + p.amount, 0);
  let winner = -1;
  for (let i = 0; i < s.seats.length; i++) {
    const seat = s.seats[i];
    if (seat && (seat.status === "active" || seat.status === "allin")) winner = i;
  }
  if (winner >= 0 && total > 0) {
    s.seats[winner]!.stack += total;
    events.push({ type: "award", seat: winner, amount: total, potIndex: 0 });
  }
  s.pots = [];
  s.street = "complete";
  s.toAct = null;
  events.push({ type: "handComplete" });
  return { state: s, events };
}

/** Build pots, evaluate contesting hands, distribute each pot (ties + odd chip). */
export function settleShowdown(state: TableState): { state: TableState; events: GameEvent[] } {
  const s = cloneState(state);
  const events: GameEvent[] = [];
  const pots = buildPots(s.seats);
  const score = new Map<number, number>();
  const reveals: { seat: number; value: number }[] = [];
  for (let i = 0; i < s.seats.length; i++) {
    const seat = s.seats[i];
    if (seat && (seat.status === "active" || seat.status === "allin")) {
      if (seat.holeCards == null) {
        throw new Error(`Seat ${seat.id} is in hand but has no hole cards`);
      }
      const v = evaluate7([seat.holeCards[0], seat.holeCards[1], ...s.board]);
      score.set(i, v);
      reveals.push({ seat: i, value: v });
    }
  }
  events.push({ type: "showdown", reveals });

  pots.forEach((pot, idx) => {
    let best = -1;
    for (const i of pot.eligible) {
      const v = score.get(i);
      if (v != null && v > best) best = v;
    }
    const winners = pot.eligible.filter((i) => score.get(i) === best);
    distributePot(s, pot.amount, winners, idx, events);
  });

  s.pots = [];
  s.street = "complete";
  s.toAct = null;
  events.push({ type: "handComplete" });
  return { state: s, events };
}

function distributePot(
  state: TableState,
  amount: number,
  winners: number[],
  potIndex: number,
  events: GameEvent[],
): void {
  if (winners.length === 0 || amount === 0) return;
  const ordered = orderFromButton(state, winners);
  const share = Math.floor(amount / winners.length);
  let remainder = amount - share * winners.length;
  for (const i of ordered) {
    let give = share;
    if (remainder > 0) {
      give += 1;
      remainder -= 1;
    }
    state.seats[i]!.stack += give;
    events.push({ type: "award", seat: i, amount: give, potIndex });
  }
}

/** Winners ordered from the first seat left of the button (odd-chip rule). */
function orderFromButton(state: TableState, winners: number[]): number[] {
  const n = state.seats.length;
  const set = new Set(winners);
  const out: number[] = [];
  for (let k = 1; k <= n; k++) {
    const i = (state.buttonIndex + k) % n;
    if (set.has(i)) out.push(i);
  }
  return out;
}
