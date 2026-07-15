import { motion } from "motion/react";
import CardView from "./CardView.js";
import { formatChips } from "./viewHelpers.js";
import { useBoardReveal } from "./useBoardReveal.js";

export default function Board({ board, pot, handNumber }: { board: number[]; pot: number; handNumber: number }) {
  const revealed = useBoardReveal(board, handNumber);
  const slots = 5;
  return (
    <div className="flex flex-col items-center gap-3">
      <motion.div
        key={pot}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="rounded-full border border-edge bg-surface-2 px-3 py-1 font-mono-num text-xs tracking-wide text-neutral-300 uppercase"
      >
        Total Pot: {formatChips(pot)}
      </motion.div>
      <div className="flex">
        {Array.from({ length: slots }, (_, i) => {
          const entry = revealed[i];
          if (!entry) {
            return (
              <span
                key={i}
                className="m-0.5 h-20 w-14 rounded-lg border border-dashed border-edge/60"
              />
            );
          }
          return <CardView key={i} card={entry.card} flip={entry.isNew} />;
        })}
      </div>
    </div>
  );
}
