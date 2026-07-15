import type React from "react";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { MatchUiState } from "./matchReducer.js";
import SeatView from "./SeatView.js";
import Board from "./Board.js";
import { positionLabel } from "./viewHelpers.js";

// UI-only feedback timings (not poker rules — see shared/src/constants.ts for those).
const WINNER_GLOW_MS = 2_500;
const WINNER_GLOW_MS_SHOWDOWN = 6_000;

// Six fixed positions around an oval (own seat forced to bottom-center by rotation).
const POSITIONS: Array<React.CSSProperties> = [
  { left: "50%", top: "88%", transform: "translate(-50%, -50%)" },
  { left: "18%", top: "75%", transform: "translate(-50%, -50%)" },
  { left: "6%", top: "40%", transform: "translate(-50%, -50%)" },
  { left: "35%", top: "8%", transform: "translate(-50%, -50%)" },
  { left: "65%", top: "8%", transform: "translate(-50%, -50%)" },
  { left: "94%", top: "40%", transform: "translate(-50%, -50%)" },
];

export default function Table({ state }: { state: MatchUiState }) {
  const view = state.view;

  const [glowSeats, setGlowSeats] = useState<number[]>([]);
  const lastHandleSeq = useRef(0);
  useEffect(() => {
    if (state.handCompleteSeq === lastHandleSeq.current) return;
    lastHandleSeq.current = state.handCompleteSeq;
    setGlowSeats(state.winners);
    // This timer is a fallback cap only — the real clear signal is the next hand
    // actually starting (below), since the server's inter-hand pause clock and this
    // client's display pacing aren't the same clock and can drift.
    const duration = state.showdownThisHand ? WINNER_GLOW_MS_SHOWDOWN : WINNER_GLOW_MS;
    const timer = setTimeout(() => setGlowSeats([]), duration);
    return () => clearTimeout(timer);
  }, [state.handCompleteSeq, state.winners, state.showdownThisHand]);

  // Authoritative clear: the moment the server confirms a new hand has actually dealt,
  // drop any lingering winner glow from the previous one immediately.
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
  // view.pots is only ever populated transiently inside settleShowdown/awardSingleWinner
  // (reset to [] immediately after distributing chips), so every snapshot we actually
  // receive has pots === []. The live pot during a hand is each seat's total contribution.
  const pot = view.seats.reduce((sum, s) => sum + (s?.committedTotal ?? 0), 0);
  const streetCommitted = view.seats.reduce((sum, s) => sum + (s?.committedThisStreet ?? 0), 0);

  return (
    <div className="relative mx-auto h-[520px] w-[min(900px,95vw)]">
      <div className="absolute inset-[12%_6%] rounded-[50%] border border-emerald/15 bg-[radial-gradient(ellipse_at_center,#0d3326,#071a13)] shadow-[inset_0_0_80px_rgba(0,0,0,0.55)]" />
      <div className="absolute inset-0 flex items-center justify-center">
        <Board board={view.board} pot={pot} handNumber={view.handNumber} />
      </div>
      {/* Slide target: once a street's commits have been swept into the pot (all seats
          back to 0 committedThisStreet, but the pot itself is nonzero), each seat's commit
          pill's shared layoutId re-parents here so Motion animates the "collect to pot"
          flight instead of just vanishing. */}
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
      {view.seats.map((seat, i) => {
        // Rotate so our seat sits at POSITIONS[0] (bottom-center).
        const slot = (i - own + n) % n;
        const pos = POSITIONS[slot] ?? POSITIONS[0]!;
        return (
          <div key={i} className="absolute" style={pos}>
            <SeatView
              seat={seat}
              seatIndex={i}
              isOwn={i === state.ownSeat}
              isToAct={view.toAct === i}
              isDealer={view.buttonIndex === i}
              ownHole={state.ownHole}
              lastAction={state.actionBySeat[i]}
              position={positionLabel(i, view.buttonIndex)}
              isWinner={glowSeats.includes(i)}
            />
          </div>
        );
      })}
    </div>
  );
}
