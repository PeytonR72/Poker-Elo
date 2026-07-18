import { motion, useReducedMotion } from "motion/react";

/** Gold / silver / bronze metal gradients + glow for ranks 1–3. */
const METAL: Record<number, { from: string; to: string; ring: string; glow: string }> = {
  1: { from: "#f6d873", to: "#b8891f", ring: "#f8e08a", glow: "0 0 14px rgba(232,195,90,0.45)" },
  2: { from: "#e4e9ef", to: "#98a1ad", ring: "#eef2f6", glow: "0 0 12px rgba(210,218,226,0.35)" },
  3: { from: "#e0a76c", to: "#a15f2c", ring: "#eeb87f", glow: "0 0 12px rgba(200,138,75,0.4)" },
};

/**
 * A circular gold/silver/bronze rank badge for the top three, with a periodic
 * diagonal "shine" sweep. The sweep is a `motion` element, so the app-level
 * `<MotionConfig reducedMotion="user">` degrades it to a static highlight for
 * users who prefer reduced motion.
 */
export function RankMedallion({ position, size = 30 }: { position: number; size?: number }) {
  const reduced = useReducedMotion();
  const metal = METAL[position];
  if (!metal) {
    return (
      <span className="font-mono-num text-sm text-muted-foreground tabular-nums">{position}</span>
    );
  }

  return (
    <span
      className="relative inline-grid place-items-center overflow-hidden rounded-full"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 30% 25%, ${metal.from}, ${metal.to})`,
        boxShadow: `inset 0 0 0 1.5px ${metal.ring}, ${metal.glow}`,
      }}
      aria-hidden="true"
    >
      <span
        className="font-display font-bold leading-none"
        style={{ fontSize: Math.round(size * 0.44), color: "#221a05" }}
      >
        {position}
      </span>
      {!reduced && (
        <motion.span
          className="pointer-events-none absolute inset-y-0 w-1/3"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent)",
            filter: "blur(1px)",
          }}
          initial={{ x: "-140%", skewX: -18 }}
          animate={{ x: "340%" }}
          transition={{
            duration: 1.1,
            ease: "easeInOut",
            repeat: Infinity,
            repeatDelay: 2.4 + position * 0.4,
          }}
        />
      )}
    </span>
  );
}

export default RankMedallion;
