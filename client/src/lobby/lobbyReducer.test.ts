import { describe, it, expect } from "vitest";
import { lobbyReducer, initialLobbyState } from "./lobbyReducer.js";

describe("lobbyReducer", () => {
  it("moves to queued and records status on queueStatus", () => {
    const s = lobbyReducer(initialLobbyState, { t: "queueStatus", waiting: 4, position: 2, etaSec: 8 });
    expect(s.status).toBe("queued");
    expect(s).toMatchObject({ waiting: 4, position: 2, etaSec: 8 });
  });

  it("moves to matched and stores the room on matchFound", () => {
    const s = lobbyReducer(initialLobbyState, { t: "matchFound", roomId: "ABC123", format: "turbo" });
    expect(s.status).toBe("matched");
    expect(s.match).toEqual({ roomId: "ABC123", format: "turbo" });
  });

  it("captures an error", () => {
    const s = lobbyReducer(initialLobbyState, { t: "error", message: "auth_failed" });
    expect(s.error).toBe("auth_failed");
  });

  it("ignores unrelated game messages", () => {
    const s = lobbyReducer(initialLobbyState, { t: "snapshot", view: {} });
    expect(s).toEqual(initialLobbyState);
  });

  it("clears a stale error when a non-error message arrives", () => {
    const s1 = lobbyReducer(initialLobbyState, { t: "error", message: "auth_failed" });
    expect(s1.error).toBe("auth_failed");
    const s2 = lobbyReducer(s1, { t: "queueStatus", waiting: 2, position: 1, etaSec: 5 });
    expect(s2.error).toBeNull();
  });

  it("clears a stale error on the synthetic connected action (reconnect)", () => {
    const s1 = lobbyReducer(initialLobbyState, { t: "error", message: "auth_failed" });
    expect(s1.error).toBe("auth_failed");
    const s2 = lobbyReducer(s1, { t: "connected" });
    expect(s2.error).toBeNull();
    // other queue fields are untouched by a reconnect
    expect(s2.status).toBe(s1.status);
  });

  it("preserves object identity on connected when there is no error", () => {
    const s = lobbyReducer(initialLobbyState, { t: "connected" });
    expect(s).toBe(initialLobbyState);
  });

  it("clears a stale error on any unrelated successful server message", () => {
    const s1 = lobbyReducer(initialLobbyState, { t: "error", message: "auth_failed" });
    // a game-side snapshot (never expected in lobby, but proves the default path)
    const s2 = lobbyReducer(s1, { t: "snapshot", view: {} });
    expect(s2.error).toBeNull();
  });
});
