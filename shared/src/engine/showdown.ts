import { evaluate7 } from "../handEval/index.js";
import type { GameEvent, TableState } from "./types.js";
import { buildPots } from "./pots.js";

/** Award the whole pot to the last remaining seat (everyone else folded). */
export function awardSingleWinner(state: TableState, events: GameEvent[]): void {
  const total = buildPots(state.seats).reduce((a, p) => a + p.amount, 0);
  let winner = -1;
  for (let i = 0; i < state.seats.length; i++) {
    const s = state.seats[i];
    if (s && (s.status === "active" || s.status === "allin")) winner = i;
  }
  if (winner >= 0 && total > 0) {
    state.seats[winner]!.stack += total;
    events.push({ type: "award", seat: winner, amount: total, potIndex: 0 });
  }
  state.pots = [];
  state.street = "complete";
  state.toAct = null;
  events.push({ type: "handComplete" });
}

/** Build pots, evaluate contesting hands, distribute each pot (ties + odd chip). */
export function settleShowdown(state: TableState, events: GameEvent[]): void {
  const pots = buildPots(state.seats);
  const score = new Map<number, number>();
  const reveals: { seat: number; value: number }[] = [];
  for (let i = 0; i < state.seats.length; i++) {
    const s = state.seats[i];
    if (s && (s.status === "active" || s.status === "allin")) {
      const v = evaluate7([s.holeCards![0], s.holeCards![1], ...state.board]);
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
    distributePot(state, pot.amount, winners, idx, events);
  });

  state.pots = pots;
  state.street = "complete";
  state.toAct = null;
  events.push({ type: "handComplete" });
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
