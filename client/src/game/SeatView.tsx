import type React from "react";
import type { PublicSeat } from "@poker/shared";
import CardView from "./CardView.js";
import { formatChips } from "./viewHelpers.js";

const ACTION_LABEL: Record<string, string> = {
  fold: "FOLD",
  check: "CHECK",
  call: "CALL",
  raise: "RAISE",
};

const ACTION_COLOR: Record<string, string> = {
  fold: "#6b7280",
  check: "#3b82f6",
  call: "#22c55e",
  raise: "#ef4444",
};

const POSITION_COLOR: Record<string, string> = {
  BTN: "#f0c419",
  SB: "#38bdf8",
  BB: "#38bdf8",
  LJ: "#94a3b8",
  HJ: "#94a3b8",
  CO: "#94a3b8",
};

export default function SeatView({
  seat,
  isOwn,
  isToAct,
  ownHole,
  lastAction,
  position,
  isWinner,
}: {
  seat: PublicSeat | null;
  isOwn: boolean;
  isToAct: boolean;
  ownHole: [number, number] | null;
  lastAction?: { action: string; amount: number };
  position?: string;
  isWinner?: boolean;
}) {
  if (!seat) {
    return <div style={box(false, false)}><span style={{ opacity: 0.4 }}>empty</span></div>;
  }
  const hole = seat.holeCards ?? (isOwn ? ownHole : null);
  const label = seat.isBot ? `🤖 ${seat.id}` : seat.id.slice(0, 8);
  const dim = seat.status === "folded" || seat.status === "busted";
  return (
    <div style={{ ...box(isToAct, !!isWinner), opacity: dim ? 0.5 : 1, position: "relative" }}>
      {position && (
        <div
          style={{
            position: "absolute",
            top: -10,
            left: -10,
            background: POSITION_COLOR[position] ?? "#374151",
            color: "#0e1116",
            fontWeight: 800,
            fontSize: 11,
            padding: "2px 6px",
            borderRadius: 6,
            boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
          }}
        >
          {position}
        </div>
      )}
      {lastAction && (
        <div
          key={`${lastAction.action}-${lastAction.amount}`}
          style={{
            position: "absolute",
            top: -16,
            left: "50%",
            transform: "translateX(-50%)",
            background: ACTION_COLOR[lastAction.action] ?? "#374151",
            color: "#fff",
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: 0.5,
            padding: "3px 10px",
            borderRadius: 999,
            whiteSpace: "nowrap",
            boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
            animation: "seatActionPop 180ms ease-out",
          }}
        >
          {ACTION_LABEL[lastAction.action] ?? lastAction.action}
          {(lastAction.action === "call" || lastAction.action === "raise") && lastAction.amount > 0
            ? ` ${formatChips(lastAction.amount)}`
            : ""}
        </div>
      )}
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

function box(active: boolean, isWinner: boolean): React.CSSProperties {
  return {
    width: 130, padding: 8, borderRadius: 10, textAlign: "center",
    background: "#16203a", border: active ? "2px solid #f0c419" : "2px solid transparent",
    boxShadow: isWinner ? "0 0 18px 4px rgba(255, 215, 0, 0.85)" : undefined,
    animation: isWinner ? "seatWinnerGlow 1.1s ease-in-out infinite" : undefined,
  };
}
