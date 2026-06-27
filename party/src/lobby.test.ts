import { describe, it, expect } from "vitest";
import Lobby from "./lobby.js";
import { encode } from "@poker/shared";
import type * as Party from "partykit/server";

interface FakeConn {
  id: string;
  sent: string[];
  send(m: string): void;
  close(): void;
}
function makeConn(id: string): FakeConn {
  return { id, sent: [], send(m) { this.sent.push(m); }, close() {} };
}

function makeLobby(provisioned: Array<{ roomId: string; body: unknown }>): {
  lobby: Lobby;
  conns: Map<string, FakeConn>;
} {
  const conns = new Map<string, FakeConn>();
  const party = {
    id: "lobby",
    env: { DEV_TOKENS: "true" }, // dev mode (no SUPABASE_JWT_SECRET, but DEV_TOKENS enabled)
    getConnections: () => conns.values(),
    broadcast: () => {},
    context: {
      parties: {
        main: {
          get: (roomId: string) => ({
            fetch: async (init: { body: string }) => {
              provisioned.push({ roomId, body: JSON.parse(init.body) });
              return new Response("OK");
            },
          }),
        },
      },
    },
  } as unknown as Party.Party;
  const lobby = new Lobby(party);
  return { lobby, conns };
}

async function connect(lobby: Lobby, conns: Map<string, FakeConn>, id: string): Promise<FakeConn> {
  const conn = makeConn(id);
  conns.set(id, conn);
  lobby.onConnect(conn as unknown as Party.Connection);
  await lobby.onMessage(encode({ t: "hello", jwt: `dev:${id}` }), conn as unknown as Party.Connection);
  return conn;
}

describe("Lobby party", () => {
  it("authenticates a dev hello and enqueues a player", async () => {
    const { lobby, conns } = makeLobby([]);
    const conn = await connect(lobby, conns, "user-1");
    await lobby.onMessage(encode({ t: "enqueue", rating: 400, format: "turbo" }), conn as unknown as Party.Connection);
    expect(lobby.waiterCount).toBe(1);
  });

  it("removes a player from the queue on leave", async () => {
    const { lobby, conns } = makeLobby([]);
    const conn = await connect(lobby, conns, "user-1");
    await lobby.onMessage(encode({ t: "enqueue", rating: 400, format: "turbo" }), conn as unknown as Party.Connection);
    await lobby.onMessage(encode({ t: "leave" }), conn as unknown as Party.Connection);
    expect(lobby.waiterCount).toBe(0);
  });

  it("keeps players queued when match provisioning fails (fetch throws)", async () => {
    const conns = new Map<string, FakeConn>();
    const party = {
      id: "lobby",
      env: { DEV_TOKENS: "true" },
      getConnections: () => conns.values(),
      broadcast: () => {},
      context: {
        parties: {
          main: {
            get: (_roomId: string) => ({
              fetch: async (_init: { body: string }) => {
                throw new Error("provisioning failed");
              },
            }),
          },
        },
      },
    } as unknown as Party.Party;
    const lobby = new Lobby(party);

    const conn = await connect(lobby, conns, "user-1");
    await lobby.onMessage(encode({ t: "enqueue", rating: 400, format: "turbo" }), conn as unknown as Party.Connection);

    await lobby.runMatchTick();

    // Player must still be in the queue — NOT dropped on provisioning failure
    expect(lobby.waiterCount).toBe(1);
    // No matchFound message should have been sent
    const found = conn.sent.map((s) => JSON.parse(s)).find((m: { t: string }) => m.t === "matchFound");
    expect(found).toBeUndefined();
  });

  it("keeps players queued when match provisioning returns non-ok response (fix 1)", async () => {
    const conns = new Map<string, FakeConn>();
    const party = {
      id: "lobby",
      env: { DEV_TOKENS: "true" },
      getConnections: () => conns.values(),
      broadcast: () => {},
      context: {
        parties: {
          main: {
            get: (_roomId: string) => ({
              fetch: async (_init: { body: string }) => {
                // Resolves (does NOT throw) with a non-ok response
                return new Response(JSON.stringify({ error: "bad_roster" }), { status: 400 });
              },
            }),
          },
        },
      },
    } as unknown as Party.Party;
    const lobby = new Lobby(party);

    const conn = await connect(lobby, conns, "user-1");
    await lobby.onMessage(encode({ t: "enqueue", rating: 400, format: "turbo" }), conn as unknown as Party.Connection);

    await lobby.runMatchTick();

    // Player must still be in the queue — NOT dropped on non-ok provisioning response
    expect(lobby.waiterCount).toBe(1);
    // No matchFound message should have been sent
    const found = conn.sent.map((s) => JSON.parse(s)).find((m: { t: string }) => m.t === "matchFound");
    expect(found).toBeUndefined();
  });

  it("rejects unknown format string with bad_enqueue error (fix 3)", async () => {
    const { lobby, conns } = makeLobby([]);
    const conn = await connect(lobby, conns, "user-1");
    await lobby.onMessage(
      encode({ t: "enqueue", rating: 400, format: "not-a-format" }),
      conn as unknown as Party.Connection,
    );

    expect(lobby.waiterCount).toBe(0);
    const err = conn.sent.map((s) => JSON.parse(s)).find((m: { t: string }) => m.t === "error");
    expect(err?.message).toBe("bad_enqueue");
  });

  it("provisions a MatchRoom and sends matchFound on a bot-filled tick", async () => {
    const provisioned: Array<{ roomId: string; body: unknown }> = [];
    const { lobby, conns } = makeLobby(provisioned);
    const conn = await connect(lobby, conns, "user-1");
    await lobby.onMessage(encode({ t: "enqueue", rating: 400, format: "turbo" }), conn as unknown as Party.Connection);

    // Fewer than RANKED_MIN_ONLINE online → bot-fill eligible immediately.
    await lobby.runMatchTick();

    expect(provisioned).toHaveLength(1);
    const body = provisioned[0]!.body as { format: string; humanIds: string[] };
    expect(body.format).toBe("turbo");
    expect(body.humanIds).toEqual(["user-1"]);

    const found = conn.sent.map((s) => JSON.parse(s)).find((m) => m.t === "matchFound");
    expect(found).toBeDefined();
    expect(found.roomId).toBe(provisioned[0]!.roomId);
    expect(lobby.waiterCount).toBe(0);
  });
});
