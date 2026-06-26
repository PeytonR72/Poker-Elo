import CardView from "./CardView.js";
import { formatChips } from "./viewHelpers.js";

export default function Board({ board, pot }: { board: number[]; pot: number }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div>{board.map((c, i) => <CardView key={i} card={c} />)}</div>
      <div style={{ marginTop: 8, fontSize: 14, opacity: 0.85 }}>Pot: {formatChips(pot)}</div>
    </div>
  );
}
