import { Server } from "partyserver";
import type { Connection } from "partyserver";
import {
  encode,
  decode,
  TABLE_SIZE,
  shuffledDeck,
  createHand,
  createSeat,
  cloneState,
  redactFor,
  STARTING_STACK,
  DEFAULT_FORMAT,
  MATCH_FORMATS,
  blindLevelAt,
  legalActions,
  applyAction,
  TIMEBANK_INITIAL_MS,
  TIMEBANK_REPLENISH_MS,
  DISCONNECT_GRACE_MS,
  pairwiseElo,
  ELO_DEFAULT_RATING,
  ELO_K_FACTOR,
  BOT_DECISION_DELAY_MIN_MS,
  BOT_DECISION_DELAY_MAX_MS,
  mulberry32,
  deriveSeed,
} from "@poker/shared";
import type { TableState, PublicView, Action, ActionMask, Seat, EloPlayer } from "@poker/shared";
import { verifyJwt, parseDevToken } from "./auth.js";
import { TurnTimer } from "./timers.js";
import { decideBotAction, botThinkDelayMs } from "./botRunner.js";
import type { Env } from "./env.js";

/** UX pause between hands — not a poker-numeric rule, so defined locally. */
const INTER_HAND_PAUSE_MS = 3_000;

/** Advance button index past any busted seats, returning the next valid seat index. */
function nextNonBustedSeat(seats: (Seat | null)[], currentButton: number): number {
  const n = seats.length;
  for (let k = 1; k <= n; k++) {
    const i = (currentButton + k) % n;
    const s = seats[i];
    if (s && s.status !== "busted") return i;
  }
  return currentButton; // fallback (shouldn't happen if >= 2 players)
}

type ConnState = {
  playerId: string; // Supabase user sub (from JWT)
  seatIndex: number | null; // null until seated
  authed: boolean;
  timebankMs: number; // milliseconds remaining in timebank
};

/** Validate an action against the legal-actions mask. */
function isLegal(action: Action, mask: ActionMask): boolean {
  switch (action.type) {
    case "fold":
      return mask.canFold;
    case "check":
      return mask.canCheck;
    case "call":
      return mask.canCall && action.amount === mask.callAmount;
    case "raise":
      return (
        mask.canRaise &&
        (action.amount ?? 0) >= mask.minRaiseTo &&
        (action.amount ?? 0) <= mask.maxRaiseTo
      );
    default:
      return false;
  }
}

/** XOR-fold 128 bits of CSPRNG entropy into a 32-bit seed for mulberry32. */
function csprngSeed(): number {
  const buf = new Uint32Array(4);
  crypto.getRandomValues(buf);
  return (buf[0]! ^ buf[1]! ^ buf[2]! ^ buf[3]!) >>> 0;
}

export default class MatchRoom extends Server<Env> {
  static override options = { hibernate: false };

  // In-memory state — ephemeral per room instance
  private players = new Map<string, ConnState>(); // conn.id → ConnState
  private disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>(); // playerId → handle
  private savedTimebankMs = new Map<string, number>(); // playerId → timebankMs (preserved across disconnect)

  private tableState: TableState | null = null;
  private matchStartMs: number = 0; // Date.now() when match started
  private bustOrder: string[] = []; // playerId in bust order (first busted = last place)
  private handNumber: number = 0;

  private turnTimer = new TurnTimer();
  private timebankUsedThisTurn = false;
  private seatRngs: Array<(() => number) | null> = [];
  private botRngSeed = 0;

  private provisioned = false;
  private provisionedFormat: string | null = null;
  private expectedHumanIds: Set<string> = new Set();
  private connectGraceTimer: ReturnType<typeof setTimeout> | null = null;

  // No constructor — Server<Env> supplies this.ctx / this.env / this.name.

  override async onRequest(req: Request): Promise<Response> {
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    if (this.provisioned || this.tableState !== null) return new Response("OK"); // idempotent
    let body: { format?: unknown; humanIds?: unknown };
    try {
      body = (await req.json()) as { format?: unknown; humanIds?: unknown };
    } catch {
      return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400 });
    }
    const format = typeof body.format === "string" ? body.format : null;
    const humanIds = Array.isArray(body.humanIds)
      ? body.humanIds.filter((x): x is string => typeof x === "string")
      : null;
    if (!format || !humanIds || humanIds.length === 0) {
      return new Response(JSON.stringify({ error: "bad_roster" }), { status: 400 });
    }
    this.provisioned = true;
    this.provisionedFormat = format;
    this.expectedHumanIds = new Set(humanIds);
    // Start once every expected human connects, or bot-fill after the connect grace.
    // Only start if at least one expected human is actually seated; otherwise leave idle.
    this.connectGraceTimer = setTimeout(() => {
      this.connectGraceTimer = null;
      const anyHumanSeated = [...this.players.values()].some(
        (p) => p.authed && this.expectedHumanIds.has(p.playerId),
      );
      if (anyHumanSeated) this.startMatch();
    }, DISCONNECT_GRACE_MS);
    return new Response("OK");
  }

  override onConnect(conn: Connection): void {
    this.players.set(conn.id, { playerId: "", seatIndex: null, authed: false, timebankMs: 0 });
  }

  override onClose(conn: Connection): void {
    const connState = this.players.get(conn.id);
    if (connState?.authed && connState.playerId) {
      const { playerId, seatIndex } = connState;
      this.savedTimebankMs.set(playerId, connState.timebankMs);
      const timer = setTimeout(() => {
        this.disconnectTimers.delete(playerId);
        this.savedTimebankMs.delete(playerId);
        this.onDisconnectExpired(playerId, seatIndex);
      }, DISCONNECT_GRACE_MS);
      this.disconnectTimers.set(playerId, timer);
    }
    this.players.delete(conn.id);
  }

  override onError(conn: Connection, _error: Error): void {
    conn.close();
    // onClose will fire after close(), starting the grace timer for authed players.
    // If PartyKit does NOT fire onClose after onError, we need to handle it here too.
    // To be safe, we replicate the grace logic and deduplicate via disconnectTimers.
    const connState = this.players.get(conn.id);
    if (connState?.authed && connState.playerId && !this.disconnectTimers.has(connState.playerId)) {
      const { playerId, seatIndex } = connState;
      this.savedTimebankMs.set(playerId, connState.timebankMs);
      const timer = setTimeout(() => {
        this.disconnectTimers.delete(playerId);
        this.onDisconnectExpired(playerId, seatIndex);
      }, DISCONNECT_GRACE_MS);
      this.disconnectTimers.set(playerId, timer);
    }
    this.players.delete(conn.id);
  }

  override async onMessage(sender: Connection, raw: string | ArrayBuffer): Promise<void> {
    // Decode — throws if not valid JSON with a t field
    let msg: { t: string; jwt?: string };
    try {
      msg = decode<{ t: string; jwt?: string }>(raw as string);
    } catch {
      sender.send(encode({ t: "error", message: "invalid_message" }));
      sender.close();
      return;
    }

    const isDev = !this.env.SUPABASE_JWT_SECRET ||
      this.env.SUPABASE_JWT_SECRET === "";

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

    // Handle action messages from authed players
    if (msg.t === "action") {
      const connState = this.players.get(sender.id);
      if (!connState?.authed || connState.seatIndex === null) {
        sender.send(encode({ t: "error", message: "not_authed" }));
        return;
      }
      if (!this.tableState || this.tableState.street === "complete") return;

      // Must be the active seat
      if (this.tableState.toAct !== connState.seatIndex) {
        sender.send(encode({ t: "error", message: "not_your_turn" }));
        return;
      }

      // Build typed action from ClientMsg
      const actionMsg = msg as { t: "action"; seat: number; action: "fold" | "check" | "call" | "raise"; amount?: number };
      const action: Action = {
        seat: connState.seatIndex,
        type: actionMsg.action,
        amount: actionMsg.amount ?? 0,
      };

      // Validate legality
      const mask = legalActions(this.tableState, connState.seatIndex);
      if (!isLegal(action, mask)) {
        sender.send(encode({ t: "error", message: "illegal_action" }));
        return;
      }

      // Cancel the turn timer before applying the action
      this.turnTimer.cancel();

      // Apply action
      const { state, events } = applyAction(this.tableState, action);
      this.tableState = state;

      // Broadcast events then snapshots
      for (const event of events) {
        this.broadcast(encode({ t: "event", event }));
      }
      this.broadcastSnapshots();

      // Continue or end hand
      if (this.tableState.street === "complete") {
        this.onHandComplete();
      } else {
        this.sendYourTurn();
      }
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
    const jwtSecret = this.env.SUPABASE_JWT_SECRET;
    const devTokensEnabled = this.env.DEV_TOKENS === "true";
    let playerId: string;
    try {
      // Always try parseDevToken first if token starts with "dev:"
      if (jwt.startsWith("dev:")) {
        if (devTokensEnabled) {
          const dev = parseDevToken(jwt);
          if (!dev) throw new Error("Invalid dev token");
          playerId = dev.sub;
        } else {
          throw new Error("dev: tokens not allowed in production");
        }
      } else {
        // Otherwise verify as JWT — via shared secret (legacy HS256 projects) or
        // JWKS (newer ES256 projects); verifyJwt dispatches on the token's own alg.
        const auth = await verifyJwt(jwt, { secret: jwtSecret, supabaseUrl: this.env.SUPABASE_URL });
        playerId = auth.sub;
      }
    } catch {
      sender.send(encode({ t: "error", message: "auth_failed" }));
      sender.close();
      return;
    }

    // Check for reconnect: if a disconnect grace timer is running for this playerId,
    // cancel it and restore the player's original seat.
    const existingTimer = this.disconnectTimers.get(playerId);
    if (existingTimer !== undefined) {
      clearTimeout(existingTimer);
      this.disconnectTimers.delete(playerId);

      // Find the original seat in the current table state (or fall back to scanning timebankMs)
      let restoredSeatIndex: number | null = null;
      if (this.tableState) {
        for (let si = 0; si < this.tableState.seats.length; si++) {
          if (this.tableState.seats[si]?.id === playerId) {
            restoredSeatIndex = si;
            break;
          }
        }
      }

      state.playerId = playerId;
      state.seatIndex = restoredSeatIndex;
      state.authed = true;
      // Restore the saved timebank from before the disconnect; fall back to initial if not saved
      state.timebankMs = this.savedTimebankMs.get(playerId) ?? TIMEBANK_INITIAL_MS;
      this.savedTimebankMs.delete(playerId);

      if (restoredSeatIndex !== null) {
        sender.send(encode({ t: "seated", seatIndex: restoredSeatIndex, playerId }));
      }

      // Send current snapshot so the reconnecting player is up to date
      if (this.tableState) {
        const view = redactFor(playerId, this.tableState);
        sender.send(encode({ t: "snapshot", view }));
        const rFormat = this.tableState.format;
        const rFmt = MATCH_FORMATS[rFormat];
        if (rFmt) {
          sender.send(encode({
            t: "matchInfo",
            format: rFormat,
            matchStartMs: this.matchStartMs,
            matchDurationMs: rFmt.matchDurationMs,
          }));
        }

        // If it's this player's turn, cancel the stale timer and restart via sendYourTurn()
        // (TurnTimer.start() calls cancel() internally, so sendYourTurn() handles both)
        if (
          restoredSeatIndex !== null &&
          this.tableState.street !== "complete" &&
          this.tableState.toAct === restoredSeatIndex
        ) {
          this.sendYourTurn();
        }
      }

      return;
    }

    // Provisioned rooms only admit invited humans.
    if (this.provisioned && !this.expectedHumanIds.has(playerId)) {
      sender.send(encode({ t: "error", message: "not_invited" }));
      sender.close();
      return;
    }

    // Seat assignment (new connection, not a reconnect)
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
    state.timebankMs = TIMEBANK_INITIAL_MS;

    sender.send(encode({ t: "seated", seatIndex, playerId }));

    // Start match when the table is full, or (provisioned) when all invited humans are seated.
    const authedCount = [...this.players.values()].filter((p) => p.authed).length;
    if (this.provisioned) {
      const seatedExpected = [...this.players.values()].filter(
        (p) => p.authed && this.expectedHumanIds.has(p.playerId),
      ).length;
      if (seatedExpected >= this.expectedHumanIds.size) {
        if (this.connectGraceTimer !== null) {
          clearTimeout(this.connectGraceTimer);
          this.connectGraceTimer = null;
        }
        this.startMatch();
      }
    } else if (authedCount === TABLE_SIZE) {
      this.startMatch();
    }
  }

  /** Start the match: build seats, deal first hand, broadcast snapshots. */
  private startMatch(): void {
    if (this.tableState !== null) return;
    const formatId = this.provisionedFormat ?? DEFAULT_FORMAT;
    const format = MATCH_FORMATS[formatId] ?? MATCH_FORMATS[DEFAULT_FORMAT]!;
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
      format: formatId,
    });
    this.handNumber++;

    this.botRngSeed = csprngSeed();
    this.seatRngs = Array.from({ length: TABLE_SIZE }, (_, i) => {
      const seat = this.tableState!.seats[i];
      if (seat?.id.startsWith("bot-")) {
        return mulberry32(deriveSeed(this.botRngSeed, `bot-${i}`));
      }
      return null;
    });

    this.broadcastSnapshots();
    this.sendDealPrivate();
    this.sendYourTurn();
    this.broadcast(encode({
      t: "matchInfo",
      format: formatId,
      matchStartMs: this.matchStartMs,
      matchDurationMs: format.matchDurationMs,
    }));
  }

  /** Send a redacted snapshot to each authed connected player. */
  private broadcastSnapshots(): void {
    if (!this.tableState) return;
    for (const [connId, connState] of this.players) {
      if (!connState.authed) continue;
      const view: PublicView = redactFor(connState.playerId, this.tableState);
      const found = [...this.getConnections()].find((c) => c.id === connId);
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
      const conn = [...this.getConnections()].find((c) => c.id === connId);
      conn?.send(encode({ t: "dealPrivate", holeCards: seat.holeCards }));
    }
  }

  /** Send a yourTurn message to the currently active seat and start the turn timer. */
  private sendYourTurn(): void {
    if (!this.tableState || this.tableState.street === "complete") return;
    const seatIdx = this.tableState.toAct;
    if (seatIdx === null) return;

    const format = MATCH_FORMATS[this.tableState.format];
    if (!format) return;

    const seatId = this.tableState.seats[seatIdx]?.id;
    const isBot = seatId?.startsWith("bot-") ?? false;

    if (isBot) {
      const rng = this.seatRngs[seatIdx] ?? mulberry32(0);
      const delay = botThinkDelayMs(rng, BOT_DECISION_DELAY_MIN_MS, BOT_DECISION_DELAY_MAX_MS);
      setTimeout(() => this.executeBotAction(seatIdx), delay);
      return; // DO NOT start the turn timer for bots
    }

    const deadlineTs = Date.now() + format.turnTimeMs;
    const mask = legalActions(this.tableState, seatIdx);

    // Find the connection for this seat and send yourTurn
    for (const c of this.getConnections()) {
      if (this.players.get(c.id)?.seatIndex === seatIdx) {
        c.send(encode({ t: "yourTurn", mask, deadlineTs }));
        break;
      }
    }

    // Start the turn timer
    this.timebankUsedThisTurn = false;
    this.turnTimer.start(format.turnTimeMs, () => this.onTurnExpired(seatIdx));
  }

  /** Execute an action on behalf of a bot seat. */
  private executeBotAction(seatIdx: number): void {
    if (!this.tableState || this.tableState.street === "complete") return;
    if (this.tableState.toAct !== seatIdx) return;
    const seat = this.tableState.seats[seatIdx];
    if (!seat?.holeCards) return;
    const rng = this.seatRngs[seatIdx] ?? mulberry32(0);
    const view = redactFor(seat.id, this.tableState);
    const mask = legalActions(this.tableState, seatIdx);
    const action = decideBotAction(view, seat.holeCards, mask, rng);
    const { state, events } = applyAction(this.tableState, action);
    this.tableState = state;
    for (const event of events) this.broadcast(encode({ t: "event", event }));
    this.broadcastSnapshots();
    if (this.tableState.street === "complete") {
      this.onHandComplete();
    } else {
      this.sendYourTurn();
    }
  }

  /** Called when the turn timer fires for the given seat. */
  private onTurnExpired(seatIdx: number): void {
    if (!this.tableState || this.tableState.street === "complete") return;
    if (this.tableState.toAct !== seatIdx) return;

    // Check if the player has timebank remaining and hasn't used it this turn
    const connState = [...this.players.values()].find((p) => p.seatIndex === seatIdx);
    if (connState && !this.timebankUsedThisTurn && TIMEBANK_REPLENISH_MS > 0 && connState.timebankMs > 0) {
      const ext = Math.min(connState.timebankMs, TIMEBANK_REPLENISH_MS);
      connState.timebankMs -= ext;
      this.timebankUsedThisTurn = true;
      // Notify the player that their timebank is being used
      for (const c of this.getConnections()) {
        if (this.players.get(c.id)?.seatIndex === seatIdx) {
          c.send(encode({ t: "timebankUsed", seatIdx, remainingMs: connState.timebankMs }));
          break;
        }
      }
      this.turnTimer.start(ext, () => this.onTurnExpired(seatIdx));
      return;
    }

    // Auto-act: check if legal, else fold
    const mask = legalActions(this.tableState, seatIdx);
    const action: Action = mask.canCheck
      ? { seat: seatIdx, type: "check", amount: 0 }
      : { seat: seatIdx, type: "fold", amount: 0 };

    const { state, events } = applyAction(this.tableState, action);
    this.tableState = state;

    for (const event of events) {
      this.broadcast(encode({ t: "event", event }));
    }
    this.broadcastSnapshots();

    if (this.tableState.street === "complete") {
      this.onHandComplete();
    } else {
      this.sendYourTurn();
    }
  }

  /**
   * Called when the disconnect grace timer expires for a player.
   * If they are the active seat, auto-fold. Then mark their seat as "busted" (stack=0)
   * so that future hands skip them — effectively treating them as permanently folded
   * for the match (Unit 2 simplification: no chip-neutral sit-out, just busted).
   */
  private onDisconnectExpired(playerId: string, seatIndex: number | null): void {
    if (!this.tableState || seatIndex === null) return;

    const wasActiveSeat =
      this.tableState.toAct === seatIndex && this.tableState.street !== "complete";

    // Step 1: if active seat, auto-fold/check so the hand can continue
    if (wasActiveSeat) {
      this.turnTimer.cancel();
      const mask = legalActions(this.tableState, seatIndex);
      const action: Action = mask.canCheck
        ? { seat: seatIndex, type: "check", amount: 0 }
        : { seat: seatIndex, type: "fold", amount: 0 };
      const { state, events } = applyAction(this.tableState, action);
      this.tableState = state;
      for (const event of events) {
        this.broadcast(encode({ t: "event", event }));
      }
    }

    // Step 2: mark seat as busted via a clone so the engine's immutable contract is honoured.
    // We do this BEFORE advancing the hand so onHandComplete() sees the busted status.
    if (this.tableState) {
      const newState = cloneState(this.tableState);
      const clonedSeat = newState.seats[seatIndex];
      if (clonedSeat && clonedSeat.status !== "busted") {
        clonedSeat.status = "busted";
        clonedSeat.stack = 0;
      }
      if (!this.bustOrder.includes(playerId)) {
        this.bustOrder.push(playerId);
      }
      this.tableState = newState;
    }

    // Step 3: broadcast updated snapshots and advance the hand
    if (wasActiveSeat && this.tableState) {
      this.broadcastSnapshots();
      if (this.tableState.street === "complete") {
        this.onHandComplete();
      } else {
        this.sendYourTurn();
      }
    }
  }

  /** Called when a hand completes — bust detection, match clock check, next hand. */
  private onHandComplete(): void {
    if (!this.tableState) return;
    this.turnTimer.cancel();

    // Detect newly busted seats
    for (const seat of this.tableState.seats) {
      if (!seat) continue;
      if (seat.status === "busted" && !this.bustOrder.includes(seat.id)) {
        this.bustOrder.push(seat.id);
      }
    }

    const elapsedMs = Date.now() - this.matchStartMs;
    const format = MATCH_FORMATS[this.tableState.format];
    if (!format) return;
    const matchOver = elapsedMs >= format.matchDurationMs || this.isMatchOver();
    if (matchOver) {
      this.endMatch();
      return;
    }

    setTimeout(() => this.startNextHand(), INTER_HAND_PAUSE_MS);
  }

  /** Returns true when only 0 or 1 non-busted seats remain. */
  private isMatchOver(): boolean {
    if (!this.tableState) return true;
    const active = this.tableState.seats.filter(s => s && s.status !== "busted");
    return active.length <= 1;
  }

  /** Starts the next hand: rotates button, deals, broadcasts. */
  private startNextHand(): void {
    if (!this.tableState) return;
    const elapsedMs = Date.now() - this.matchStartMs;
    const seed = csprngSeed();
    const deck = shuffledDeck(seed);
    const format = MATCH_FORMATS[this.tableState.format];
    if (!format) return;
    const { sb, bb } = blindLevelAt(elapsedMs, format);
    const nextButton = nextNonBustedSeat(this.tableState.seats, this.tableState.buttonIndex);
    this.tableState = createHand({
      seats: this.tableState.seats,
      buttonIndex: nextButton,
      sb,
      bb,
      deck,
      handNumber: this.handNumber,
      elapsedMs,
      format: this.tableState.format,
    });
    this.handNumber++;
    this.broadcastSnapshots();
    this.sendDealPrivate();
    this.sendYourTurn();
  }

  /** Determine finishing places, compute ELO deltas, and broadcast matchOver. */
  private endMatch(): void {
    if (!this.tableState) return;
    this.turnTimer.cancel();

    const finishPlaceById: Record<string, number> = {};

    // Survivors: non-busted seats sorted by stack descending → places 1..n (ties get same place)
    const survivors = this.tableState.seats
      .filter((s): s is Seat => s !== null && s.status !== "busted")
      .sort((a, b) => b.stack - a.stack);

    let place = 1;
    for (let i = 0; i < survivors.length; i++) {
      if (i > 0 && survivors[i]!.stack < survivors[i - 1]!.stack) place = i + 1;
      finishPlaceById[survivors[i]!.id] = place;
    }

    // Busted: reverse bust order (last to bust = best among busted)
    const reversedBust = [...this.bustOrder].reverse();
    for (let i = 0; i < reversedBust.length; i++) {
      finishPlaceById[reversedBust[i]!] = survivors.length + 1 + i;
    }

    // Build ELO player list from all non-null seats
    const players: EloPlayer[] = this.tableState.seats
      .filter((s): s is Seat => s !== null)
      .map(s => ({ id: s.id, rating: ELO_DEFAULT_RATING }));

    const deltas = pairwiseElo(players, finishPlaceById, () => ELO_K_FACTOR);

    // Filter bots out of the payload — no profile rows exist for them
    const humanFinishPlaces: Record<string, number> = {};
    const humanEloDeltas: Record<string, number> = {};
    for (const [id, place] of Object.entries(finishPlaceById)) {
      if (!id.startsWith("bot-")) {
        humanFinishPlaces[id] = place;
        humanEloDeltas[id] = deltas[id] ?? 0;
      }
    }

    this.broadcast(encode({
      t: "matchOver",
      finishPlaceById,
      eloDeltas: deltas,
    }));

    const supabaseUrl = this.env.SUPABASE_URL;
    const serviceKey = this.env.SUPABASE_SERVICE_ROLE_KEY;
    const isDev = !this.env.SUPABASE_JWT_SECRET ||
      this.env.SUPABASE_JWT_SECRET === "";

    if (!isDev && supabaseUrl && serviceKey) {
      void fetch(`${supabaseUrl}/functions/v1/report-match`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          roomId: this.name,
          format: this.tableState.format,
          finishPlaceById: humanFinishPlaces,
          eloDeltas: humanEloDeltas,
        }),
      }).catch((err: unknown) => {
        console.error("[report-match] fetch failed:", err);
      });
    }
  }

  /** Exposed for tests — number of currently tracked connections. */
  get playerCount(): number {
    return this.players.size;
  }

  /** Exposed for tests — whether a disconnect grace timer is running for a given playerId. */
  hasDisconnectTimer(playerId: string): boolean {
    return this.disconnectTimers.has(playerId);
  }

  /** Exposed for tests — snapshot of a connection's state. */
  getPlayer(connId: string): ConnState | undefined {
    return this.players.get(connId);
  }

  /** Exposed for tests — the current table state. */
  get currentTableState(): TableState | null {
    return this.tableState;
  }

  /** Exposed for tests — bust order array. */
  get currentBustOrder(): string[] {
    return this.bustOrder;
  }

  /** Exposed for tests — current hand number. */
  get currentHandNumber(): number {
    return this.handNumber;
  }

  /** Exposed for tests — seatRngs array. */
  get currentSeatRngs(): Array<(() => number) | null> {
    return this.seatRngs;
  }

  /** Exposed for tests — provisioning status. */
  get isProvisioned(): boolean {
    return this.provisioned;
  }

  /** Exposed for tests — expected human roster. */
  get expectedHumans(): Set<string> {
    return this.expectedHumanIds;
  }
}

export { csprngSeed, nextNonBustedSeat };
