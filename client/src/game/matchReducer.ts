import type { ServerMsg, PublicView, ActionMask, GameEvent } from "@poker/shared";

export interface MatchUiState {
  ownSeat: number | null;
  ownHole: [number, number] | null;
  view: PublicView | null;
  matchInfo: { format: string; matchStartMs: number; matchDurationMs: number } | null;
  turn: { mask: ActionMask; deadlineTs: number } | null;
  timebankMs: number | null;
  result: { finishPlaceById: Record<string, number>; eloDeltas: Record<string, number> } | null;
  error: string | null;
  lastEvent: GameEvent | null;
  actionBySeat: Record<number, { action: string; amount: number } | undefined>;
  winners: number[];
  showdownThisHand: boolean;
  handCompleteSeq: number;
}

export const initialMatchState: MatchUiState = {
  ownSeat: null,
  ownHole: null,
  view: null,
  matchInfo: null,
  turn: null,
  timebankMs: null,
  result: null,
  error: null,
  lastEvent: null,
  actionBySeat: {},
  winners: [],
  showdownThisHand: false,
  handCompleteSeq: 0,
};

export function matchReducer(state: MatchUiState, msg: ServerMsg): MatchUiState {
  switch (msg.t) {
    case "seated":
      return { ...state, ownSeat: msg.seatIndex, error: null };
    case "dealPrivate":
      return { ...state, ownHole: msg.holeCards, error: null };
    case "snapshot": {
      const view = msg.view as PublicView;
      // Clear our turn once the server's view shows it is no longer our seat to act.
      const stillOurTurn = state.ownSeat !== null && view.toAct === state.ownSeat;
      return { ...state, view, turn: stillOurTurn ? state.turn : null, error: null };
    }
    case "matchInfo":
      return {
        ...state,
        matchInfo: {
          format: msg.format,
          matchStartMs: msg.matchStartMs,
          matchDurationMs: msg.matchDurationMs,
        },
        error: null,
      };
    case "yourTurn":
      return { ...state, turn: { mask: msg.mask, deadlineTs: msg.deadlineTs }, error: null };
    case "timebankUsed":
      return state.ownSeat === msg.seatIdx ? { ...state, timebankMs: msg.remainingMs, error: null } : state;
    case "event": {
      const event = msg.event;
      if (event.type === "action") {
        return {
          ...state,
          lastEvent: event,
          actionBySeat: { ...state.actionBySeat, [event.seat]: { action: event.action, amount: event.amount } },
          error: null,
        };
      }
      if (event.type === "street") {
        return { ...state, lastEvent: event, actionBySeat: {}, error: null };
      }
      if (event.type === "blind") {
        // First blind(s) posted mean a fresh hand — clear the previous hand's winner glow.
        return { ...state, lastEvent: event, winners: [], showdownThisHand: false, error: null };
      }
      if (event.type === "showdown") {
        return { ...state, lastEvent: event, showdownThisHand: true, error: null };
      }
      if (event.type === "award") {
        return {
          ...state,
          lastEvent: event,
          winners: state.winners.includes(event.seat) ? state.winners : [...state.winners, event.seat],
          error: null,
        };
      }
      if (event.type === "handComplete") {
        return {
          ...state,
          lastEvent: event,
          actionBySeat: {},
          handCompleteSeq: state.handCompleteSeq + 1,
          error: null,
        };
      }
      return { ...state, lastEvent: event, error: null };
    }
    case "matchOver":
      return {
        ...state,
        turn: null,
        result: { finishPlaceById: msg.finishPlaceById, eloDeltas: msg.eloDeltas },
        error: null,
      };
    case "error":
      return { ...state, error: msg.message };
    default:
      return state;
  }
}
