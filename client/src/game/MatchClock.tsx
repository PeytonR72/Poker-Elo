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
    <div className="flex items-center gap-2 font-mono-num text-sm text-neutral-300">
      <span>
        ⏱ {mm}:{String(ss).padStart(2, "0")}
      </span>
      <span className="text-neutral-500">
        {blindLevelLabel(sb, bb, format)} ({sb}/{bb})
      </span>
    </div>
  );
}
