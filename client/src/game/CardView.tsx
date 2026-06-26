import type React from "react";
import { formatCard } from "./viewHelpers.js";

const RED = new Set(["h", "d"]);

export default function CardView({ card }: { card: number | null }) {
  const base: React.CSSProperties = {
    width: 38, height: 54, borderRadius: 6, display: "inline-flex",
    alignItems: "center", justifyContent: "center", fontWeight: 700, margin: 2,
  };
  if (card === null) {
    return <span style={{ ...base, background: "#24304a", border: "1px solid #3a4664" }} />;
  }
  const s = formatCard(card);
  const suit = s.slice(-1);
  return (
    <span style={{ ...base, background: "#f5f5f5", color: RED.has(suit) ? "#c1121f" : "#111" }}>
      {s}
    </span>
  );
}
