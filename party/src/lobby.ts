import { Server, getServerByName } from "partyserver";
import type { Connection } from "partyserver";
import {
  encode,
  decode,
  makeRoomCode,
  QUEUE_MATCH_INTERVAL_MS,
  MATCH_CODE_LENGTH,
  MATCH_FORMATS,
} from "@poker/shared";
import { verifyJwt, parseDevToken } from "./auth.js";
import { formMatches, botFillEtaSec } from "./matchmaker.js";
import type { Waiter } from "./matchmaker.js";
import { registerStart, registerEnd, listLive } from "./liveMatches.js";
import type { StoredLiveMatch } from "./liveMatches.js";
import type { Env } from "./env.js";

type ConnState = { playerId: string; authed: boolean };

export default class Lobby extends Server<Env> {
  static override options = { hibernate: false };

  private conns = new Map<string, ConnState>(); // conn.id → state
  private waiters = new Map<string, Waiter & { connId: string }>(); // playerId → waiter
  private ticker: ReturnType<typeof setInterval> | null = null;
  private liveMatches = new Map<string, StoredLiveMatch>(); // roomId → entry, reported by MatchRoom

  override onConnect(conn: Connection): void {
    this.conns.set(conn.id, { playerId: "", authed: false });
  }

  /** Internal channel: a MatchRoom reporting its match's start/end (see matchRoom.ts's postToLobby). */
  override async onRequest(req: Request): Promise<Response> {
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400 });
    }
    const b = body as {
      op?: unknown;
      roomId?: unknown;
      format?: unknown;
      startedAt?: unknown;
      players?: unknown;
    };
    if (typeof b.roomId !== "string") return new Response(JSON.stringify({ error: "bad_roomId" }), { status: 400 });

    if (b.op === "start") {
      const format = typeof b.format === "string" ? b.format : null;
      const fmt = format ? MATCH_FORMATS[format] : undefined;
      const players = Array.isArray(b.players)
        ? b.players.filter(
            (p): p is { playerId: string; rating: number } =>
              typeof p === "object" && p !== null &&
              typeof (p as { playerId?: unknown }).playerId === "string" &&
              typeof (p as { rating?: unknown }).rating === "number",
          )
        : [];
      if (fmt && format && typeof b.startedAt === "number") {
        registerStart(this.liveMatches, { roomId: b.roomId, format, startedAt: b.startedAt, players }, fmt.matchDurationMs, Date.now());
      }
    } else if (b.op === "end") {
      registerEnd(this.liveMatches, b.roomId);
    }
    return new Response("OK");
  }

  override onClose(conn: Connection): void {
    const state = this.conns.get(conn.id);
    if (state?.playerId) this.waiters.delete(state.playerId);
    this.conns.delete(conn.id);
    if (this.waiters.size === 0) this.stopTicker();
  }

  override async onMessage(sender: Connection, raw: string | ArrayBuffer): Promise<void> {
    let msg: { t: string; jwt?: string; rating?: number; format?: string };
    try {
      msg = decode(raw as string);
    } catch {
      sender.send(encode({ t: "error", message: "invalid_message" }));
      sender.close();
      return;
    }

    const state = this.conns.get(sender.id);
    if (!state) return;

    if (msg.t === "hello") {
      if (state.authed) return;
      const playerId = await this.authenticate(msg.jwt);
      if (!playerId) {
        sender.send(encode({ t: "error", message: "auth_failed" }));
        sender.close();
        return;
      }
      state.playerId = playerId;
      state.authed = true;
      return;
    }

    if (!state.authed) {
      sender.send(encode({ t: "error", message: "not_authed" }));
      return;
    }

    if (msg.t === "enqueue") {
      const rating = typeof msg.rating === "number" ? msg.rating : null;
      const format = typeof msg.format === "string" && msg.format in MATCH_FORMATS ? msg.format : null;
      if (rating === null || format === null) {
        sender.send(encode({ t: "error", message: "bad_enqueue" }));
        return;
      }
      this.waiters.set(state.playerId, {
        playerId: state.playerId,
        rating,
        format,
        enqueuedAt: Date.now(),
        connId: sender.id,
      });
      this.startTicker();
      this.broadcastQueueStatus();
      return;
    }

    if (msg.t === "leave") {
      this.waiters.delete(state.playerId);
      this.broadcastQueueStatus();
      if (this.waiters.size === 0) this.stopTicker();
      return;
    }

    if (msg.t === "liveMatches") {
      sender.send(encode({ t: "liveMatches", matches: listLive(this.liveMatches, Date.now()) }));
      return;
    }
  }

  private async authenticate(jwt: string | undefined): Promise<string | null> {
    if (typeof jwt !== "string") return null;
    const secret = this.env.SUPABASE_JWT_SECRET;
    const devTokensEnabled = this.env.DEV_TOKENS === "true";
    try {
      // Always try parseDevToken first if token starts with "dev:"
      if (jwt.startsWith("dev:")) {
        if (devTokensEnabled) {
          const dev = parseDevToken(jwt);
          return dev ? dev.sub : null;
        }
        // dev: tokens not allowed in production
        return null;
      }
      // Otherwise verify as JWT — via shared secret (legacy HS256 projects) or
      // JWKS (newer ES256 projects); verifyJwt dispatches on the token's own alg.
      const auth = await verifyJwt(jwt, { secret, supabaseUrl: this.env.SUPABASE_URL });
      return auth.sub;
    } catch {
      return null;
    }
  }

  private startTicker(): void {
    if (this.ticker !== null) return;
    this.ticker = setInterval(() => void this.runMatchTick(), QUEUE_MATCH_INTERVAL_MS);
  }

  private stopTicker(): void {
    if (this.ticker !== null) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  /** One matchmaking pass — exposed for tests. */
  async runMatchTick(): Promise<void> {
    if (this.waiters.size === 0) return;
    const now = Date.now();
    const onlineCount = this.waiters.size;
    const { matches } = formMatches([...this.waiters.values()], now, onlineCount);
    const provisioned = new Set<string>();

    for (const match of matches) {
      const roomId = makeRoomCode(MATCH_CODE_LENGTH, Math.random);
      let res: Response;
      try {
        // getServerByName's return type structurally requires every RPC-typed member of
        // Server<MatchRoom> (onRequest's Response, getConnection's WebSocket Stub, etc.) to
        // match @cloudflare/workers-types' ambient-global vs. explicitly-imported forms
        // exactly — a package-internal type-design split that collides across the whole
        // Server surface, not one property. MatchRoom does satisfy Server<Env> at runtime
        // (Task 1 proved a real wrangler deploy works); this is a type-level-only mismatch.
        // We only ever call `.fetch()` on the returned stub, so narrow to that alone rather
        // than fighting the full generic surface.
        const stub = (await getServerByName(this.env.MAIN as never, roomId)) as unknown as {
          fetch: typeof fetch;
        };
        const humanRatings: Record<string, number> = {};
        for (const id of match.humanIds) {
          const w = this.waiters.get(id);
          if (w) humanRatings[id] = w.rating;
        }
        res = await stub.fetch("https://internal/provision", {
          method: "POST",
          body: JSON.stringify({ format: match.format, humanIds: match.humanIds, humanRatings }),
        });
      } catch {
        continue; // provisioning failed — leave players queued for the next tick
      }
      if (!res.ok) continue; // non-ok response (e.g. 400) — leave players queued
      for (const playerId of match.humanIds) {
        provisioned.add(playerId);
        const waiter = this.waiters.get(playerId);
        if (waiter) this.sendTo(waiter.connId, { t: "matchFound", roomId, format: match.format });
      }
    }

    for (const id of provisioned) this.waiters.delete(id);
    if (this.waiters.size === 0) this.stopTicker();
    else this.broadcastQueueStatus();
  }

  private broadcastQueueStatus(): void {
    const now = Date.now();
    // position within each format bucket, oldest-first
    const byFormat = new Map<string, Array<Waiter & { connId: string }>>();
    for (const w of this.waiters.values()) {
      const list = byFormat.get(w.format) ?? [];
      list.push(w);
      byFormat.set(w.format, list);
    }
    for (const list of byFormat.values()) {
      list.sort((a, b) => a.enqueuedAt - b.enqueuedAt);
      list.forEach((w, i) => {
        this.sendTo(w.connId, {
          t: "queueStatus",
          waiting: list.length,
          position: i + 1,
          etaSec: botFillEtaSec(w, now),
        });
      });
    }
  }

  private sendTo(connId: string, msg: Parameters<typeof encode>[0]): void {
    for (const c of this.getConnections()) {
      if (c.id === connId) {
        c.send(encode(msg));
        return;
      }
    }
  }

  /** Exposed for tests. */
  get waiterCount(): number {
    return this.waiters.size;
  }
}
