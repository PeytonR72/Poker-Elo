import type { Card } from "../cards.js";
import type { Pot, SeatStatus, Street, TableState } from "./types.js";

export interface PublicSeat {
  id: string;
  isBot: boolean;
  stack: number;
  committedThisStreet: number;
  committedTotal: number;
  status: SeatStatus;
  holeCards: [Card, Card] | null; // only own cards, or contesting hands at showdown
  group?: number;
}

export interface PublicView {
  seats: (PublicSeat | null)[];
  buttonIndex: number;
  street: Street;
  board: Card[];
  sb: number;
  bb: number;
  currentBet: number;
  lastRaiseSize: number;
  toAct: number | null;
  handNumber: number;
  pots: Pot[];
  // Deliberately omits: deck, deckPointer, rng seed, foreign hole cards.
}

/** Public, redacted view for one player (or a spectator when playerId is null). */
export function redactFor(playerId: string | null, state: TableState): PublicView {
  const showAll = state.street === "complete";
  return {
    buttonIndex: state.buttonIndex,
    street: state.street,
    board: [...state.board],
    sb: state.sb,
    bb: state.bb,
    currentBet: state.currentBet,
    lastRaiseSize: state.lastRaiseSize,
    toAct: state.toAct,
    handNumber: state.handNumber,
    pots: state.pots.map((p) => ({ amount: p.amount, eligible: [...p.eligible] })),
    seats: state.seats.map((s) => {
      if (!s) return null;
      const own = playerId != null && s.id === playerId;
      const reveal = own || (showAll && (s.status === "active" || s.status === "allin"));
      return {
        id: s.id,
        isBot: s.isBot,
        stack: s.stack,
        committedThisStreet: s.committedThisStreet,
        committedTotal: s.committedTotal,
        status: s.status,
        holeCards: reveal && s.holeCards ? [s.holeCards[0], s.holeCards[1]] : null,
        group: s.group,
      };
    }),
  };
}
