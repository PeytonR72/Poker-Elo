import type React from "react";
import type { PublicSeat } from "@poker/shared";
import CardView from "./CardView.js";
import { formatChips } from "./viewHelpers.js";

export default function SeatView({
  seat,
  isOwn,
  isToAct,
  ownHole,
}: {
  seat: PublicSeat | null;
  isOwn: boolean;
  isToAct: boolean;
  ownHole: [number, number] | null;
}) {
  if (!seat) {
    return <div style={box(false)}><span style={{ opacity: 0.4 }}>empty</span></div>;
  }
  const hole = seat.holeCards ?? (isOwn ? ownHole : null);
  const label = seat.isBot ? `🤖 ${seat.id}` : seat.id.slice(0, 8);
  const dim = seat.status === "folded" || seat.status === "busted";
  return (
    <div style={{ ...box(isToAct), opacity: dim ? 0.5 : 1 }}>
      <div style={{ fontSize: 12, marginBottom: 4 }}>{label}{isOwn ? " (you)" : ""}</div>
      <div>
        <CardView card={hole ? hole[0] : null} />
        <CardView card={hole ? hole[1] : null} />
      </div>
      <div style={{ fontSize: 13, marginTop: 4 }}>
        {formatChips(seat.stack)}{seat.status === "allin" ? " · ALL IN" : ""}
      </div>
    </div>
  );
}

function box(active: boolean): React.CSSProperties {
  return {
    width: 130, padding: 8, borderRadius: 10, textAlign: "center",
    background: "#16203a", border: active ? "2px solid #f0c419" : "2px solid transparent",
  };
}
