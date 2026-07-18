import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Clock } from "lucide-react";

const WARN_MS = 60_000; // amber warning under one minute

export default function MatchClock({
  matchStartMs,
  matchDurationMs,
}: {
  matchStartMs: number;
  matchDurationMs: number;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const remainingMs = Math.max(0, matchStartMs + matchDurationMs - now);
  const mm = Math.floor(remainingMs / 60000);
  const ss = Math.floor((remainingMs % 60000) / 1000);
  const warn = remainingMs > 0 && remainingMs < WARN_MS;

  return (
    <motion.div
      animate={warn ? { opacity: [1, 0.55, 1] } : { opacity: 1 }}
      transition={warn ? { repeat: Infinity, duration: 1.1, ease: "easeInOut" } : { duration: 0.2 }}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-stat text-sm font-semibold tabular-nums ${
        warn
          ? "border-gold/50 bg-gold/10 text-gold shadow-glow-gold"
          : "border-edge bg-surface-2 text-neutral-200"
      }`}
    >
      <Clock className="h-3.5 w-3.5" />
      {mm}:{String(ss).padStart(2, "0")}
    </motion.div>
  );
}
