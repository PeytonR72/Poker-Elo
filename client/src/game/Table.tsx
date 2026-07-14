import type React from "react";
import { useEffect, useRef, useState } from "react";
import type { MatchUiState } from "./matchReducer.js";
import SeatView from "./SeatView.js";
import Board from "./Board.js";
import { positionLabel } from "./viewHelpers.js";

// UI-only feedback timings (not poker rules — see shared/src/constants.ts for those).
const WINNER_GLOW_MS = 2_500;
const WINNER_GLOW_MS_SHOWDOWN = 6_000;

// Six fixed positions around an oval (own seat forced to the bottom-center by rotation).
const POSITIONS: Array<React.CSSProperties> = [
  { left: "50%", bottom: "2%", transform: "translateX(-50%)" },
  { left: "8%", bottom: "22%" },
  { left: "8%", top: "22%" },
  { left: "50%", top: "2%", transform: "translateX(-50%)" },
  { right: "8%", top: "22%" },
  { right: "8%", bottom: "22%" },
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

  if (!view) return <p style={{ textAlign: "center" }}>Waiting for the table…</p>;
  const n = view.seats.length;
  const own = state.ownSeat ?? 0;
  // view.pots is only ever populated transiently inside settleShowdown/awardSingleWinner
  // (reset to [] immediately after distributing chips), so every snapshot we actually
  // receive has pots === []. The live pot during a hand is each seat's total contribution.
  const pot = view.seats.reduce((sum, s) => sum + (s?.committedTotal ?? 0), 0);

  return (
    <div style={{ position: "relative", width: "min(900px, 95vw)", height: 520, margin: "0 auto" }}>
      <div style={{
        position: "absolute", inset: "12% 6%", borderRadius: "50%",
        background: "radial-gradient(ellipse at center, #1f7a4d, #0f5132)",
        border: "10px solid #5b3a1e",
      }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Board board={view.board} pot={pot} />
      </div>
      {view.seats.map((seat, i) => {
        // Rotate so our seat sits at POSITIONS[0] (bottom-center).
        const slot = (i - own + n) % n;
        const pos = POSITIONS[slot] ?? POSITIONS[0]!;
        return (
          <div key={i} style={{ position: "absolute", ...pos }}>
            <SeatView
              seat={seat}
              isOwn={i === state.ownSeat}
              isToAct={view.toAct === i}
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
