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
  /** Snapshot of the seats awarded a pot in the most recently *completed* hand. */
  winners: number[];
  /** Whether that most recently completed hand went to showdown. */
  showdownThisHand: boolean;
  handCompleteSeq: number;
  /** In-progress accumulators for the hand currently being played; baked into
   *  `winners`/`showdownThisHand` and reset the instant `handComplete` arrives. */
  pendingWinners: number[];
  pendingShowdown: boolean;
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
  pendingWinners: [],
  pendingShowdown: false,
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
      if (event.type === "showdown") {
        return { ...state, lastEvent: event, pendingShowdown: true, error: null };
      }
      if (event.type === "award") {
        return {
          ...state,
          lastEvent: event,
          pendingWinners: state.pendingWinners.includes(event.seat)
            ? state.pendingWinners
            : [...state.pendingWinners, event.seat],
          error: null,
        };
      }
      if (event.type === "handComplete") {
        // Bake this hand's accumulated winners/showdown into the stable fields Table.tsx
        // reads for the glow effect, then reset the accumulators for the next hand.
        return {
          ...state,
          lastEvent: event,
          actionBySeat: {},
          winners: state.pendingWinners,
          showdownThisHand: state.pendingShowdown,
          pendingWinners: [],
          pendingShowdown: false,
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
