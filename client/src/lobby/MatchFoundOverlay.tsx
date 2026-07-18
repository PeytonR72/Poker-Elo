import { motion } from "motion/react";
import { TABLE_SIZE } from "@poker/shared";
import { SpadeWatermark } from "../assets/decor/index.js";

/**
 * Full-screen "match found" ceremony. Purely presentational — the parent holds
 * navigation for the ceremony's duration and unmounts this when it fires
 * `onMatchFound`. Seats fade in staggered around a felt disc echoing the table.
 * (Under reduced motion the parent skips the hold and never mounts this.)
 */
export default function MatchFoundOverlay({ formatLabel }: { formatLabel: string }) {
  const seats = Array.from({ length: TABLE_SIZE });
  const radius = 42; // % of the disc

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/80 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      role="dialog"
      aria-label="Match found"
    >
      <div className="flex flex-col items-center gap-8 px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="text-label-caps text-emerald">Match found</div>
          <div className="text-display mt-1">Take your seat</div>
          <div className="mt-2 text-sm text-muted-foreground">
            6-Max No-Limit · {formatLabel}
          </div>
        </motion.div>

        {/* Felt disc with staggered opponent seats */}
        <div className="relative aspect-square w-64 max-w-[70vw]">
          <div
            className="absolute inset-0 rounded-full border border-felt-hi/40"
            style={{
              background:
                "radial-gradient(circle at 50% 42%, var(--color-felt-hi) 0%, var(--color-felt-1) 55%, var(--color-felt-2) 100%)",
              boxShadow: "inset 0 0 40px rgba(0,0,0,0.55)",
            }}
          />
          <SpadeWatermark
            size={120}
            opacity={0.12}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          />
          {seats.map((_, i) => {
            const angle = (i / TABLE_SIZE) * Math.PI * 2 - Math.PI / 2;
            const x = 50 + radius * Math.cos(angle);
            const y = 50 + radius * Math.sin(angle);
            return (
              <motion.span
                key={i}
                className="absolute grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-edge bg-surface-2 shadow-e2"
                style={{ left: `${x}%`, top: `${y}%` }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.3 + i * 0.12, type: "spring", stiffness: 320, damping: 22 }}
              >
                <span className="h-2 w-2 rounded-full bg-emerald" />
              </motion.span>
            );
          })}
        </div>

        <motion.div
          className="h-1 w-40 overflow-hidden rounded-full bg-surface-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <motion.span
            className="block h-full bg-emerald"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 1.6, ease: "easeInOut", delay: 0.4 }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}
