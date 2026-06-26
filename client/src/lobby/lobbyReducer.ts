import type { ServerMsg } from "@poker/shared";

export interface LobbyUiState {
  status: "idle" | "queued" | "matched";
  waiting: number;
  position: number;
  etaSec: number;
  match: { roomId: string; format: string } | null;
  error: string | null;
}

export const initialLobbyState: LobbyUiState = {
  status: "idle",
  waiting: 0,
  position: 0,
  etaSec: 0,
  match: null,
  error: null,
};

export function lobbyReducer(state: LobbyUiState, msg: ServerMsg): LobbyUiState {
  switch (msg.t) {
    case "queueStatus":
      return {
        ...state,
        status: "queued",
        waiting: msg.waiting,
        position: msg.position,
        etaSec: msg.etaSec,
        error: null,
      };
    case "matchFound":
      return { ...state, status: "matched", match: { roomId: msg.roomId, format: msg.format }, error: null };
    case "error":
      return { ...state, error: msg.message };
    default:
      return state;
  }
}
