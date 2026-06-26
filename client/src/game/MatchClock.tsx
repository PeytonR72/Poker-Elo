import { useEffect, useState } from "react";
import { blindLevelLabel } from "./viewHelpers.js";

export default function MatchClock({
  matchStartMs,
  matchDurationMs,
  format,
  sb,
  bb,
}: {
  matchStartMs: number;
  matchDurationMs: number;
  format: string;
  sb: number;
  bb: number;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const remainingMs = Math.max(0, matchStartMs + matchDurationMs - now);
  const mm = Math.floor(remainingMs / 60000);
  const ss = Math.floor((remainingMs % 60000) / 1000);
  return (
    <div style={{ textAlign: "center", fontSize: 14 }}>
      <span style={{ marginRight: 12 }}>⏱ {mm}:{String(ss).padStart(2, "0")}</span>
      <span>{blindLevelLabel(sb, bb, format)} ({sb}/{bb})</span>
    </div>
  );
}
