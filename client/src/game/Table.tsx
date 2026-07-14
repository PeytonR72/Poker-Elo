import type React from "react";
import type { MatchUiState } from "./matchReducer.js";
import SeatView from "./SeatView.js";
import Board from "./Board.js";

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
  if (!view) return <p style={{ textAlign: "center" }}>Waiting for the table…</p>;
  const n = view.seats.length;
  const own = state.ownSeat ?? 0;
  const pot = view.pots.reduce((sum, p) => sum + p.amount, 0);

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
            />
          </div>
        );
      })}
    </div>
  );
}
