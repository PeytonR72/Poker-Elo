import type * as Party from "partykit/server";

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

  onMessage(_raw: string | ArrayBuffer, _sender: Party.Connection): void {
    // implemented in Task 3+
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
