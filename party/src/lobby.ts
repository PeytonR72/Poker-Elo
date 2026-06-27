import type * as Party from "partykit/server";
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

type ConnState = { playerId: string; authed: boolean };

export default class Lobby implements Party.Server {
  static options = { hibernate: false } satisfies Party.ServerOptions;

  private conns = new Map<string, ConnState>(); // conn.id → state
  private waiters = new Map<string, Waiter & { connId: string }>(); // playerId → waiter
  private ticker: ReturnType<typeof setInterval> | null = null;

  constructor(readonly party: Party.Party) {}

  onConnect(conn: Party.Connection): void {
    this.conns.set(conn.id, { playerId: "", authed: false });
  }

  onClose(conn: Party.Connection): void {
    const state = this.conns.get(conn.id);
    if (state?.playerId) this.waiters.delete(state.playerId);
    this.conns.delete(conn.id);
    if (this.waiters.size === 0) this.stopTicker();
  }

  async onMessage(raw: string | ArrayBuffer, sender: Party.Connection): Promise<void> {
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
  }

  private async authenticate(jwt: string | undefined): Promise<string | null> {
    if (typeof jwt !== "string") return null;
    const secret = this.party.env["SUPABASE_JWT_SECRET"] as string | undefined;
    const devTokensEnabled = this.party.env["DEV_TOKENS"] === "true";
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
      // Otherwise verify as JWT
      if (!secret) return null;
      const auth = await verifyJwt(jwt, secret);
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
        res = await this.party.context.parties["main"]!.get(roomId).fetch({
          method: "POST",
          body: JSON.stringify({ format: match.format, humanIds: match.humanIds }),
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
    for (const c of this.party.getConnections()) {
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
