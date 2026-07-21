import type React from "react";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { MATCH_FORMATS } from "@poker/shared";
import type { MatchUiState } from "./matchReducer.js";
import type { PlayerNameMap } from "./usePlayerNames.js";
import SeatView from "./SeatView.js";
import Board from "./Board.js";
import SpadeWatermark from "../assets/decor/SpadeWatermark.js";
import { positionLabel } from "./viewHelpers.js";
import { handNameFor } from "./handName.js";

// UI-only feedback timings (not poker rules — see shared/src/constants.ts for those).
const WINNER_GLOW_MS = 2_500;
const WINNER_GLOW_MS_SHOWDOWN = 6_000;
// Fallback per-turn duration for the timebank ring when a format lookup misses.
const FALLBACK_TURN_MS = 15_000;

// Six seats on an ellipse, own seat forced to bottom-center (slot 0). Percentages
// are of the felt container; the ellipse keeps pods clear of the rail on both axes.
// Top/bottom offsets leave enough headroom for the fixed-pixel pod+card
// stack (which is centered on each point via translate(-50%,-50%)) so it
// never clips the felt container's edges, even at the max table height.
const POSITIONS: Array<React.CSSProperties> = [
  { left: "50%", top: "85%" }, // bottom-center (hero)
  { left: "13%", top: "76%" }, // bottom-left
  { left: "4%", top: "34%" }, // top-left
  { left: "35%", top: "14%" }, // top-center-left
  { left: "65%", top: "14%" }, // top-center-right
  { left: "96%", top: "34%" }, // top-right
];

// Compact portrait layout: pods pulled inward so nothing clips at ~390px.
const COMPACT_POSITIONS: Array<React.CSSProperties> = [
  { left: "50%", top: "86%" },
  { left: "21%", top: "78%" },
  { left: "17%", top: "37%" },
  { left: "40%", top: "14%" },
  { left: "60%", top: "14%" },
  { left: "83%", top: "37%" },
];

export default function Table({
  state,
  names,
  compact = false,
}: {
  state: MatchUiState;
  names: PlayerNameMap;
  compact?: boolean;
}) {
  const view = state.view;

  const [glowSeats, setGlowSeats] = useState<number[]>([]);
  const lastHandleSeq = useRef(0);
  useEffect(() => {
    if (state.handCompleteSeq === lastHandleSeq.current) return;
    lastHandleSeq.current = state.handCompleteSeq;
    setGlowSeats(state.winners);
    const duration = state.showdownThisHand ? WINNER_GLOW_MS_SHOWDOWN : WINNER_GLOW_MS;
    const timer = setTimeout(() => setGlowSeats([]), duration);
    return () => clearTimeout(timer);
  }, [state.handCompleteSeq, state.winners, state.showdownThisHand]);

  const lastHandNumber = useRef<number | null>(null);
  useEffect(() => {
    const hn = view?.handNumber ?? null;
    if (hn === null) return;
    if (lastHandNumber.current !== null && hn !== lastHandNumber.current) {
      setGlowSeats([]);
    }
    lastHandNumber.current = hn;
  }, [view?.handNumber]);

  if (!view) return <p className="text-center text-neutral-400">Waiting for the table…</p>;
  const n = view.seats.length;
  const own = state.ownSeat ?? 0;
  const pot = view.seats.reduce((sum, s) => sum + (s?.committedTotal ?? 0), 0);
  const streetCommitted = view.seats.reduce((sum, s) => sum + (s?.committedThisStreet ?? 0), 0);

  // Timebank ring timing. Hero: exact remaining from the server's yourTurn deadline.
  // Opponents: best-effort format turn cap (no per-turn deadline is broadcast).
  const now = Date.now();
  const formatTurnMs = MATCH_FORMATS[state.matchInfo?.format ?? ""]?.turnTimeMs ?? FALLBACK_TURN_MS;
  const heroRemaining =
    state.turn && state.ownSeat !== null && view.toAct === state.ownSeat
      ? Math.max(0, state.turn.deadlineTs - now)
      : null;
  const turnKey = `${view.handNumber}:${view.street}:${view.toAct}`;

  // Winning hand name at showdown: derive from the first winner's revealed cards.
  let handName: string | null = null;
  if (glowSeats.length > 0 && state.showdownThisHand) {
    const w = glowSeats[0];
    const winner = w != null ? view.seats[w] : null;
    if (winner?.holeCards) handName = handNameFor(winner.holeCards, view.board);
  }

  const positions = compact ? COMPACT_POSITIONS : POSITIONS;

  return (
    <div
      className={`relative mx-auto h-full w-auto max-w-full ${compact ? "aspect-[7/9] max-w-[min(420px,94vw)]" : "aspect-[16/11] max-w-[min(960px,96vw)]"}`}
    >
      {/* Outer rail ring (wood-ish) */}
      <div className="absolute inset-0 rounded-[46%] bg-[radial-gradient(ellipse_at_center,#1c130c,#0b0705)] shadow-e3" />
      <div className="absolute inset-[1.5%] rounded-[46%] border border-emerald-dim/40" />
      {/* Felt */}
      <div className="absolute inset-[4%] overflow-hidden rounded-[46%] border border-black/40 bg-[radial-gradient(ellipse_at_center,var(--color-felt-hi),var(--color-felt-1)_55%,var(--color-felt-2))] shadow-[inset_0_0_70px_rgba(0,0,0,0.6)]">
        {/* Fabric noise */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />
        {/* Center watermark */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <SpadeWatermark size={220} opacity={0.05} />
        </div>
      </div>

      {/* Center board + pot */}
      <div className="absolute inset-0 flex items-center justify-center">
        <Board
          board={view.board}
          pot={pot}
          handNumber={view.handNumber}
          handName={handName}
          compact={compact}
        />
      </div>

      {/* Pot-collect flight target (bet chips re-parent here on street end) */}
      {streetCommitted === 0 &&
        pot > 0 &&
        view.seats.map((seat, i) =>
          seat && seat.committedTotal > 0 ? (
            <motion.div
              key={`pot-collect-${i}`}
              layoutId={`commit-${i}`}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              className="pointer-events-none absolute top-1/2 left-1/2 h-0 w-0 -translate-x-1/2 -translate-y-1/2"
            />
          ) : null,
        )}

      {/* Seats */}
      {view.seats.map((seat, i) => {
        const slot = (i - own + n) % n;
        const pos = positions[slot] ?? positions[0]!;
        const isToAct = view.toAct === i;
        const isOwnSeat = i === state.ownSeat;
        // remaining: hero = exact server deadline remainder; opponents = full cap.
        // The ring's total duration is the format's turn cap for both, so a
        // mid-turn (re)mount starts the arc at the correct partial fraction.
        const remaining = isToAct ? (isOwnSeat ? heroRemaining : formatTurnMs) : null;
        const info = names[seat?.id ?? ""];
        return (
          <div
            key={i}
            className="absolute z-10"
            style={{ ...pos, transform: "translate(-50%, -50%)" }}
          >
            <SeatView
              seat={seat}
              seatIndex={i}
              isOwn={isOwnSeat}
              isToAct={isToAct}
              isDealer={view.buttonIndex === i}
              ownHole={state.ownHole}
              lastAction={state.actionBySeat[i]}
              position={positionLabel(i, view.buttonIndex)}
              isWinner={glowSeats.includes(i)}
              name={info?.name}
              rating={info?.rating}
              turnRemainingMs={remaining}
              turnDurationMs={formatTurnMs}
              turnKey={turnKey}
              compact={compact}
            />
          </div>
        );
      })}
    </div>
  );
}
