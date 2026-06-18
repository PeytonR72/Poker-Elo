import type { Card } from "../cards.js";

export type Street = "preflop" | "flop" | "turn" | "river" | "complete";
export type SeatStatus = "active" | "folded" | "allin" | "busted";

export interface Seat {
  id: string;
  isBot: boolean;
  stack: number;
  committedThisStreet: number;
  committedTotal: number;
  holeCards: [Card, Card] | null;
  status: SeatStatus;
  /** Acted since the last full bet/raise on the current street. */
  hasActed: boolean;
  /** Team grouping, unused in v1 (kept for future wingman/2v2 format). */
  group?: number;
}

export interface Pot {
  amount: number;
  eligible: number[]; // seat indices eligible to win this pot
}

export type ActionType = "fold" | "check" | "call" | "raise";

export interface Action {
  seat: number;
  type: ActionType;
  /** Raise-TO: total chips committed by this seat this street. Required for "raise". */
  amount?: number;
}

export type GameEvent =
  | { type: "blind"; seat: number; amount: number; blind: "sb" | "bb" }
  | { type: "action"; seat: number; action: ActionType; amount: number; allIn: boolean }
  | { type: "street"; street: Street; cards: Card[] }
  | { type: "showdown"; reveals: { seat: number; value: number }[] }
  | { type: "award"; seat: number; amount: number; potIndex: number }
  | { type: "handComplete" };

export interface TableState {
  seats: (Seat | null)[];
  buttonIndex: number;
  street: Street;
  board: Card[];
  /** Server-only. Never sent to clients via redactFor. */
  deck: Card[];
  deckPointer: number;
  sb: number;
  bb: number;
  currentBet: number;
  lastRaiseSize: number;
  toAct: number | null;
  lastAggressor: number | null;
  handNumber: number;
  pots: Pot[];
  elapsedMs: number;
  format: string;
}
