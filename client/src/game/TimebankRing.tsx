import { motion } from "motion/react";

/**
 * A countdown ring drawn around the acting player's avatar. It drains from a
 * full circle to empty over `remainingMs`, starting at the `remainingMs /
 * durationMs` fraction so a mid-turn mount (e.g. reconnect) lands correctly.
 *
 * Duration source: for the hero, callers pass the exact `deadlineTs - now`
 * remaining derived from the server's `yourTurn` message; for opponents (no
 * per-turn deadline is broadcast) callers pass the format's `turnTimeMs` as a
 * best-effort visual. The ring is remounted (via a `key` on whose turn it is)
 * whenever the acting seat changes, which restarts the drain.
 */
export default function TimebankRing({
  size,
  remainingMs,
  durationMs,
  danger = false,
}: {
  size: number;
  remainingMs: number;
  durationMs: number;
  danger?: boolean;
}) {
  const stroke = 3;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const startFrac = durationMs > 0 ? Math.min(1, Math.max(0, remainingMs / durationMs)) : 1;
  const color = danger ? "var(--color-danger)" : "var(--color-emerald)";

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="pointer-events-none absolute -inset-[3px]"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* Track */}
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={stroke} />
      {/* Draining arc — starts at top (rotate -90) and empties clockwise. */}
      <motion.circle
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="1 1"
        transform={`rotate(-90 ${cx} ${cx})`}
        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        initial={{ strokeDashoffset: 1 - startFrac }}
        animate={{ strokeDashoffset: 1 }}
        transition={{ duration: Math.max(0, remainingMs) / 1000, ease: "linear" }}
      />
    </svg>
  );
}
