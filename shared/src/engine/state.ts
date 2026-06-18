import type { Card } from "../cards.js";
import type { Seat, TableState } from "./types.js";
import { firstNeedsToAct } from "./betting.js";

export function createSeat(id: string, isBot: boolean, stack: number): Seat {
  return {
    id,
    isBot,
    stack,
    committedThisStreet: 0,
    committedTotal: 0,
    holeCards: null,
    status: stack > 0 ? "active" : "busted",
    hasActed: false,
  };
}

function nextActive(seats: (Seat | null)[], from: number): number {
  const n = seats.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    const s = seats[i];
    if (s && s.status === "active") return i;
  }
  return -1;
}

function findActiveAtOrAfter(seats: (Seat | null)[], idx: number): number {
  const s = seats[idx];
  if (s && s.status === "active") return idx;
  return nextActive(seats, idx);
}

function postBlind(state: TableState, idx: number, amount: number): void {
  const s = state.seats[idx]!;
  const put = Math.min(s.stack, amount);
  s.stack -= put;
  s.committedThisStreet += put;
  s.committedTotal += put;
  if (s.stack === 0) s.status = "allin";
}

export function createHand(params: {
  seats: (Seat | null)[];
  buttonIndex: number;
  sb: number;
  bb: number;
  deck: Card[];
  handNumber: number;
  elapsedMs: number;
  format: string;
}): TableState {
  const { buttonIndex, sb, bb, deck, handNumber, elapsedMs, format } = params;
  const seats = params.seats.map((s) =>
    s
      ? ({
          ...s,
          committedThisStreet: 0,
          committedTotal: 0,
          holeCards: null,
          status: s.stack > 0 ? "active" : "busted",
          hasActed: false,
        } as Seat)
      : null,
  );

  const players: number[] = [];
  for (let i = 0; i < seats.length; i++) if (seats[i]?.status === "active") players.push(i);
  if (players.length < 2) throw new Error("need >= 2 players to start a hand");

  const heads = players.length === 2;
  const sbIdx = heads ? findActiveAtOrAfter(seats, buttonIndex) : nextActive(seats, buttonIndex);
  const bbIdx = nextActive(seats, sbIdx);

  // Deal two cards each (one at a time, two rounds), starting left of button.
  const start = nextActive(seats, buttonIndex);
  const order: number[] = [];
  let cur = start;
  for (let c = 0; c < players.length; c++) {
    order.push(cur);
    cur = nextActive(seats, cur);
  }
  let ptr = 0;
  for (const i of order) seats[i]!.holeCards = [deck[ptr++]!, 0 as Card];
  for (const i of order) seats[i]!.holeCards![1] = deck[ptr++]!;

  const state: TableState = {
    seats,
    buttonIndex,
    street: "preflop",
    board: [],
    deck,
    deckPointer: ptr,
    sb,
    bb,
    currentBet: bb,
    lastRaiseSize: bb,
    toAct: null,
    lastAggressor: bbIdx,
    handNumber,
    pots: [],
    elapsedMs,
    format,
  };

  postBlind(state, sbIdx, sb);
  postBlind(state, bbIdx, bb);
  // Blinds are forced; the players have not voluntarily acted yet.
  for (const i of players) seats[i]!.hasActed = false;

  const firstActor = heads ? sbIdx : nextActive(seats, bbIdx);
  state.toAct = firstNeedsToAct(state, firstActor);
  return state;
}

/** Deep clone for the pure reducer (deck array is shared read-only; pointer is copied). */
export function cloneState(s: TableState): TableState {
  return {
    ...s,
    seats: s.seats.map((x) =>
      x ? { ...x, holeCards: x.holeCards ? [x.holeCards[0], x.holeCards[1]] : null } : null,
    ),
    board: [...s.board],
    pots: s.pots.map((p) => ({ amount: p.amount, eligible: [...p.eligible] })),
  };
}
