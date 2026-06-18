import type * as Party from "partykit/server";
import {
  encode,
  decode,
  TABLE_SIZE,
  shuffledDeck,
  createHand,
  createSeat,
  redactFor,
  STARTING_STACK,
  DEFAULT_FORMAT,
  MATCH_FORMATS,
  blindLevelAt,
} from "@poker/shared";
import type { TableState, PublicView } from "@poker/shared";
import { verifyJwt, parseDevToken } from "./auth.js";

type ConnState = {
  playerId: string; // Supabase user sub (from JWT)
  seatIndex: number | null; // null until seated
  authed: boolean;
};

/** XOR-fold 128 bits of CSPRNG entropy into a 32-bit seed for mulberry32. */
function csprngSeed(): number {
  const buf = new Uint32Array(4);
  crypto.getRandomValues(buf);
  return (buf[0]! ^ buf[1]! ^ buf[2]! ^ buf[3]!) >>> 0;
}

export default class MatchRoom implements Party.Server {
  static options = { hibernate: false } satisfies Party.ServerOptions;

  // In-memory state — ephemeral per room instance
  private players = new Map<string, ConnState>(); // conn.id → ConnState

  private tableState: TableState | null = null;
  private matchStartMs: number = 0; // Date.now() when match started
  private bustOrder: string[] = []; // playerId in bust order (first busted = last place)
  private handNumber: number = 0;

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

    const isDev = !this.party.env["SUPABASE_JWT_SECRET"] ||
      this.party.env["SUPABASE_JWT_SECRET"] === "";

    // Dev-only: allow a "startMatch" trigger without filling the table
    if (msg.t === "startMatch" && isDev) {
      const connState = this.players.get(sender.id);
      if (!connState?.authed) {
        sender.send(encode({ t: "error", message: "not_authed" }));
        return;
      }
      this.startMatch();
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

    // Start match when all TABLE_SIZE seats are filled
    const authedCount = [...this.players.values()].filter((p) => p.authed).length;
    if (authedCount === TABLE_SIZE) {
      this.startMatch();
    }
  }

  /** Start the match: build seats, deal first hand, broadcast snapshots. */
  private startMatch(): void {
    if (this.tableState !== null) return;
    const format = MATCH_FORMATS[DEFAULT_FORMAT]!;
    const elapsedMs = 0; // first hand
    const { sb, bb } = blindLevelAt(elapsedMs, format);

    const seats = Array.from({ length: TABLE_SIZE }, (_, i) => {
      const player = [...this.players.values()].find((p) => p.seatIndex === i);
      const id = player?.playerId ?? `bot-${i}`;
      const isBot = !player;
      return createSeat(id, isBot, STARTING_STACK);
    });

    const seed = csprngSeed();
    const deck = shuffledDeck(seed);
    const buttonIndex = 0; // first hand: seat 0 is button

    this.matchStartMs = Date.now();
    this.tableState = createHand({
      seats,
      buttonIndex,
      sb,
      bb,
      deck,
      handNumber: this.handNumber,
      elapsedMs,
      format: DEFAULT_FORMAT,
    });
    this.handNumber++;

    this.broadcastSnapshots();
    this.sendDealPrivate();
  }

  /** Send a redacted snapshot to each authed connected player. */
  private broadcastSnapshots(): void {
    if (!this.tableState) return;
    for (const [connId, connState] of this.players) {
      if (!connState.authed) continue;
      const view: PublicView = redactFor(connState.playerId, this.tableState);
      const found = [...this.party.getConnections()].find((c) => c.id === connId);
      found?.send(encode({ t: "snapshot", view }));
    }
  }

  /** Send private hole cards to each human player. */
  private sendDealPrivate(): void {
    if (!this.tableState) return;
    for (const [connId, connState] of this.players) {
      if (!connState.authed || connState.seatIndex === null) continue;
      const seat = this.tableState.seats[connState.seatIndex];
      if (!seat?.holeCards) continue;
      const conn = [...this.party.getConnections()].find((c) => c.id === connId);
      conn?.send(encode({ t: "dealPrivate", holeCards: seat.holeCards }));
    }
  }

  /** Exposed for tests — number of currently tracked connections. */
  get playerCount(): number {
    return this.players.size;
  }

  /** Exposed for tests — snapshot of a connection's state. */
  getPlayer(connId: string): ConnState | undefined {
    return this.players.get(connId);
  }

  /** Exposed for tests — the current table state. */
  get currentTableState(): TableState | null {
    return this.tableState;
  }
}

export { csprngSeed };
