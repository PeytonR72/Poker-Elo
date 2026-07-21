import { motion, useReducedMotion } from "motion/react";
import { SUIT_PATHS } from "../assets/cards/suits.js";

/**
 * The Arena match-finder emblem: a spade inside a segmented ring that rotates
 * slowly while idle and faster (with a soft pulse) while queueing, plus radar
 * rings that expand outward only during the search. All motion respects
 * `prefers-reduced-motion` (falls back to a static emblem).
 */
export default function ArenaEmblem({
  queued,
  size = 112,
}: {
  queued: boolean;
  size?: number;
}) {
  const reduced = useReducedMotion();
  const animate = !reduced;

  return (
    <div
      className="relative mx-auto grid place-items-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* Radar rings — search only */}
      {queued && animate &&
        [0, 0.8].map((delay) => (
          <motion.span
            key={delay}
            className="absolute inset-0 rounded-full border border-emerald"
            initial={{ scale: 0.6, opacity: 0.55 }}
            animate={{ scale: 1.9, opacity: 0 }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut", delay }}
          />
        ))}

      {/* Rotating segmented ring */}
      <motion.svg
        viewBox="0 0 120 120"
        width={size}
        height={size}
        className="absolute inset-0"
        animate={animate ? { rotate: 360 } : undefined}
        transition={
          animate
            ? { duration: queued ? 3.5 : 14, repeat: Infinity, ease: "linear" }
            : undefined
        }
      >
        <circle
          cx="60"
          cy="60"
          r="52"
          fill="none"
          stroke="var(--color-emerald)"
          strokeOpacity={queued ? 0.9 : 0.5}
          strokeWidth="2.5"
          pathLength={100}
          strokeDasharray="15 10"
          strokeLinecap="round"
        />
        <circle
          cx="60"
          cy="60"
          r="44"
          fill="none"
          stroke="var(--color-emerald-dim)"
          strokeOpacity="0.35"
          strokeWidth="1.5"
        />
      </motion.svg>

      {/* Center disc + spade, gentle pulse while queued */}
      <motion.span
        className="relative grid place-items-center rounded-full border border-edge bg-surface-2 shadow-glow-sm"
        style={{ width: size * 0.56, height: size * 0.56 }}
        animate={
          queued && animate
            ? { scale: [1, 1.06, 1], boxShadow: [
                "0 0 12px rgba(47,217,135,0.25)",
                "0 0 26px rgba(47,217,135,0.55)",
                "0 0 12px rgba(47,217,135,0.25)",
              ] }
            : undefined
        }
        transition={queued && animate ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" } : undefined}
      >
        <svg viewBox="0 0 100 100" width={size * 0.3} height={size * 0.3}>
          <path d={SUIT_PATHS.s} fill="var(--color-emerald)" transform="translate(6 6) scale(0.88)" />
        </svg>
      </motion.span>
    </div>
  );
}
