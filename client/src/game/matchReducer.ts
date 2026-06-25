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
};

export function matchReducer(state: MatchUiState, msg: ServerMsg): MatchUiState {
  switch (msg.t) {
    case "seated":
      return { ...state, ownSeat: msg.seatIndex };
    case "dealPrivate":
      return { ...state, ownHole: msg.holeCards };
    case "snapshot": {
      const view = msg.view as PublicView;
      // Clear our turn once the server's view shows it is no longer our seat to act.
      const stillOurTurn = state.ownSeat !== null && view.toAct === state.ownSeat;
      return { ...state, view, turn: stillOurTurn ? state.turn : null };
    }
    case "matchInfo":
      return {
        ...state,
        matchInfo: {
          format: msg.format,
          matchStartMs: msg.matchStartMs,
          matchDurationMs: msg.matchDurationMs,
        },
      };
    case "yourTurn":
      return { ...state, turn: { mask: msg.mask, deadlineTs: msg.deadlineTs } };
    case "timebankUsed":
      return state.ownSeat === msg.seatIdx ? { ...state, timebankMs: msg.remainingMs } : state;
    case "event":
      return { ...state, lastEvent: msg.event };
    case "matchOver":
      return {
        ...state,
        turn: null,
        result: { finishPlaceById: msg.finishPlaceById, eloDeltas: msg.eloDeltas },
      };
    case "error":
      return { ...state, error: msg.message };
    default:
      return state;
  }
}
