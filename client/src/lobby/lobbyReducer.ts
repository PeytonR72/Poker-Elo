import type { ServerMsg } from "@poker/shared";

export interface LobbyUiState {
  status: "idle" | "queued" | "matched";
  waiting: number;
  position: number;
  etaSec: number;
  match: { roomId: string; format: string } | null;
  error: string | null;
}

/**
 * Synthetic (non-server) action dispatched by `useLobbySocket` when the socket
 * (re)connects. `partysocket` auto-reconnects and re-sends `hello`; a successful
 * re-auth produces NO server reply, so without this the last error banner
 * (`auth_failed` / a connection error) would linger forever and read as broken.
 * On (re)connect we optimistically clear the error — if auth genuinely still
 * fails, the server sends a fresh `error` message which re-populates it.
 */
export type LobbyLocalAction = { t: "connected" };
export type LobbyAction = ServerMsg | LobbyLocalAction;

export const initialLobbyState: LobbyUiState = {
  status: "idle",
  waiting: 0,
  position: 0,
  etaSec: 0,
  match: null,
  error: null,
};

/** Clear a stale error without allocating a new object when there is none. */
function clearError(state: LobbyUiState): LobbyUiState {
  return state.error === null ? state : { ...state, error: null };
}

export function lobbyReducer(state: LobbyUiState, action: LobbyAction): LobbyUiState {
  switch (action.t) {
    case "connected":
      // Socket (re)connected — drop any stale banner from the previous session.
      return clearError(state);
    case "queueStatus":
      return {
        ...state,
        status: "queued",
        waiting: action.waiting,
        position: action.position,
        etaSec: action.etaSec,
        error: null,
      };
    case "matchFound":
      return {
        ...state,
        status: "matched",
        match: { roomId: action.roomId, format: action.format },
        error: null,
      };
    case "error":
      return { ...state, error: action.message };
    default:
      // Any other successful server message proves the connection/auth is
      // healthy → clear a lingering error (identity-preserving when none).
      return clearError(state);
  }
}
