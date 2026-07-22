import { describe, it, expect } from "vitest";
import { registerStart, registerEnd, listLive, LIVE_MATCH_STALE_MARGIN_MS } from "./liveMatches.js";
import type { StoredLiveMatch } from "./liveMatches.js";

const PLAYERS = [
  { playerId: "u1", rating: 500 },
  { playerId: "u2", rating: 480 },
];

describe("live-match registry", () => {
  it("registers a match and lists it back", () => {
    const entries = new Map<string, StoredLiveMatch>();
    const now = 1_000_000;
    registerStart(entries, { roomId: "ROOM1", format: "turbo", startedAt: now, players: PLAYERS }, 600_000, now);
    expect(listLive(entries, now)).toEqual([
      { roomId: "ROOM1", format: "turbo", startedAt: now, players: PLAYERS },
    ]);
  });

  it("removes a match on registerEnd", () => {
    const entries = new Map<string, StoredLiveMatch>();
    const now = 1_000_000;
    registerStart(entries, { roomId: "ROOM1", format: "turbo", startedAt: now, players: PLAYERS }, 600_000, now);
    registerEnd(entries, "ROOM1");
    expect(listLive(entries, now)).toEqual([]);
  });

  it("registerEnd on an unknown roomId is a harmless no-op", () => {
    const entries = new Map<string, StoredLiveMatch>();
    expect(() => registerEnd(entries, "NOPE")).not.toThrow();
    expect(listLive(entries, 0)).toEqual([]);
  });

  it("lists multiple concurrent live matches", () => {
    const entries = new Map<string, StoredLiveMatch>();
    const now = 0;
    registerStart(entries, { roomId: "A", format: "rapid", startedAt: now, players: PLAYERS }, 300_000, now);
    registerStart(entries, { roomId: "B", format: "long", startedAt: now, players: PLAYERS }, 1_200_000, now);
    const live = listLive(entries, now).map((m) => m.roomId).sort();
    expect(live).toEqual(["A", "B"]);
  });

  it("sweeps out a stale entry whose room never reported its end", () => {
    const entries = new Map<string, StoredLiveMatch>();
    const now = 0;
    const matchDurationMs = 600_000;
    registerStart(entries, { roomId: "ROOM1", format: "turbo", startedAt: now, players: PLAYERS }, matchDurationMs, now);

    // Still within duration + stale margin -> still live.
    const justBeforeExpiry = matchDurationMs + LIVE_MATCH_STALE_MARGIN_MS - 1;
    expect(listLive(entries, justBeforeExpiry)).toHaveLength(1);

    // Past duration + stale margin -> expired and swept.
    const afterExpiry = matchDurationMs + LIVE_MATCH_STALE_MARGIN_MS + 1;
    expect(listLive(entries, afterExpiry)).toEqual([]);
    expect(entries.has("ROOM1")).toBe(false); // swept from the map, not just filtered from output
  });

  it("registerStart on an existing roomId refreshes rather than duplicates", () => {
    const entries = new Map<string, StoredLiveMatch>();
    registerStart(entries, { roomId: "ROOM1", format: "turbo", startedAt: 0, players: PLAYERS }, 600_000, 0);
    registerStart(entries, { roomId: "ROOM1", format: "turbo", startedAt: 100, players: PLAYERS }, 600_000, 100);
    const live = listLive(entries, 100);
    expect(live).toHaveLength(1);
    expect(live[0]!.startedAt).toBe(100);
  });
});
