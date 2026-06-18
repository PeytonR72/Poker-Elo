import type * as Party from "partykit/server";
import { encode, decode, TABLE_SIZE } from "@poker/shared";
import { verifyJwt, parseDevToken } from "./auth.js";

type ConnState = {
  playerId: string; // Supabase user sub (from JWT)
  seatIndex: number | null; // null until seated
  authed: boolean;
};

export default class MatchRoom implements Party.Server {
  static options = { hibernate: false } satisfies Party.ServerOptions;

  // In-memory state — ephemeral per room instance
  private players = new Map<string, ConnState>(); // conn.id → ConnState

  constructor(readonly party: Party.Party) {}

  onConnect(conn: Party.Connection): void {
    this.players.set(conn.id, { playerId: "", seatIndex: null, authed: false });
  }

  onClose(conn: Party.Connection): void {
    this.players.delete(conn.id);
  }

  onError(conn: Party.Connection, _error: Error): void {
    conn.close();
    this.players.delete(conn.id);
  }

  async onMessage(raw: string | ArrayBuffer, sender: Party.Connection): Promise<void> {
    // Decode — throws if not valid JSON with a t field
    let msg: { t: string; jwt?: string };
    try {
      msg = decode<{ t: string; jwt?: string }>(raw as string);
    } catch {
      sender.send(encode({ t: "error", message: "invalid_message" }));
      sender.close();
      return;
    }

    // Only "hello" is accepted as the first message
    if (msg.t !== "hello") {
      sender.send(encode({ t: "error", message: "expected_hello" }));
      sender.close();
      return;
    }

    const state = this.players.get(sender.id);
    if (!state) return; // shouldn't happen — onConnect always runs first

    // Ignore duplicate hellos (already authed)
    if (state.authed) return;

    const jwt = msg.jwt;
    if (typeof jwt !== "string") {
      sender.send(encode({ t: "error", message: "auth_failed" }));
      sender.close();
      return;
    }

    // Auth
    const jwtSecret = this.party.env["SUPABASE_JWT_SECRET"] as string | undefined;
    let playerId: string;
    try {
      if (!jwtSecret || jwtSecret === "") {
        // Dev mode: accept "dev:<id>" tokens
        const dev = parseDevToken(jwt);
        if (!dev) throw new Error("No JWT secret configured and token is not a dev token");
        playerId = dev.sub;
      } else {
        const auth = await verifyJwt(jwt, jwtSecret);
        playerId = auth.sub;
      }
    } catch {
      sender.send(encode({ t: "error", message: "auth_failed" }));
      sender.close();
      return;
    }

    // Seat assignment
    const usedSeats = new Set(
      [...this.players.values()]
        .map((p) => p.seatIndex)
        .filter((s): s is number => s !== null)
    );
    let seatIndex = 0;
    while (usedSeats.has(seatIndex)) seatIndex++;
    if (seatIndex >= TABLE_SIZE) {
      sender.send(encode({ t: "error", message: "table_full" }));
      sender.close();
      return;
    }

    state.playerId = playerId;
    state.seatIndex = seatIndex;
    state.authed = true;

    sender.send(encode({ t: "seated", seatIndex, playerId }));
  }

  /** Exposed for tests — number of currently tracked connections. */
  get playerCount(): number {
    return this.players.size;
  }

  /** Exposed for tests — snapshot of a connection's state. */
  getPlayer(connId: string): ConnState | undefined {
    return this.players.get(connId);
  }
}
