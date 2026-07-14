import type React from "react";
import { useState, useEffect } from "react";
import type { ActionMask } from "@poker/shared";
import { maskToButtons, clampRaiseTo, formatChips, quickRaiseOptions } from "./viewHelpers.js";

export default function ActionBar({
  mask,
  currentBet,
  onAction,
}: {
  mask: ActionMask;
  currentBet: number;
  onAction: (action: "fold" | "check" | "call" | "raise", amount?: number) => void;
}) {
  const b = maskToButtons(mask);
  const [raiseTo, setRaiseTo] = useState<number>(mask.minRaiseTo);

  useEffect(() => {
    setRaiseTo(mask.minRaiseTo);
  }, [mask]);

  const quickRaises = quickRaiseOptions(mask, currentBet);

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", padding: 12, flexWrap: "wrap" }}>
      {b.fold && <button onClick={() => onAction("fold")} style={btn("#7a2d2d")}>Fold</button>}
      {b.check && <button onClick={() => onAction("check")} style={btn("#2d5d7a")}>Check</button>}
      {b.call && <button onClick={() => onAction("call", b.callAmount)} style={btn("#2d5d7a")}>Call {formatChips(b.callAmount)}</button>}
      {b.raise && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {quickRaises.map((q) => (
            <button
              key={q.label}
              onClick={() => onAction("raise", q.raiseTo)}
              style={btn("#3d3560")}
              title={`Raise to ${formatChips(q.raiseTo)}`}
            >
              {q.label}
            </button>
          ))}
          <input
            type="range"
            min={mask.minRaiseTo}
            max={mask.maxRaiseTo}
            value={raiseTo}
            onChange={(e) => setRaiseTo(clampRaiseTo(Number(e.target.value), mask))}
          />
          <button onClick={() => onAction("raise", clampRaiseTo(raiseTo, mask))} style={btn("#2d7d46")}>
            Raise to {formatChips(raiseTo)}
          </button>
        </span>
      )}
    </div>
  );
}

function btn(bg: string): React.CSSProperties {
  return { padding: "10px 16px", background: bg, color: "white", border: 0, borderRadius: 6 };
}
