import { AnimatePresence, motion } from "motion/react";
import CardView from "./CardView.js";
import { ChipStack } from "../components/poker-chip.js";
import { CountUp } from "../components/count-up.js";
import { useBoardReveal } from "./useBoardReveal.js";

/**
 * Table center: the pot readout (chip stack + animated amount) above the five
 * community-card slots. Board cards flip in per street via `useBoardReveal`.
 * At showdown, a hand-name banner slides in beneath the board.
 */
export default function Board({
  board,
  pot,
  handNumber,
  handName,
  compact = false,
}: {
  board: number[];
  pot: number;
  handNumber: number;
  handName?: string | null;
  compact?: boolean;
}) {
  const revealed = useBoardReveal(board, handNumber);
  const slots = 5;
  const cardSize = compact ? "h-[3.25rem] w-[2.35rem]" : "h-[4.5rem] w-[3.25rem]";
  const emptySize = compact ? "h-[3.25rem] w-[2.35rem]" : "h-[4.5rem] w-[3.25rem]";

  return (
    <div className="flex flex-col items-center gap-2">
      {pot > 0 && (
        <motion.div
          layout
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 rounded-full border border-emerald/20 bg-black/35 px-3 py-1 shadow-e1 backdrop-blur-sm"
        >
          <ChipStack amount={pot} size={compact ? 18 : 22} showLabel={false} max={4} />
          <span className="flex flex-col leading-none">
            <span className="text-label-caps text-[9px] text-emerald/70">Pot</span>
            <CountUp value={pot} className="text-stat text-sm font-semibold text-neutral-100" />
          </span>
        </motion.div>
      )}
      <div className="flex">
        {Array.from({ length: slots }, (_, i) => {
          const entry = revealed[i];
          if (!entry) {
            return (
              <span
                key={i}
                className={`m-0.5 rounded-lg border border-dashed border-emerald/15 ${emptySize}`}
              />
            );
          }
          return <CardView key={i} card={entry.card} flip={entry.isNew} className={cardSize} />;
        })}
      </div>
      <AnimatePresence>
        {handName && (
          <motion.div
            key={handName}
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
            className="rounded-full border border-gold/40 bg-black/45 px-3 py-1 font-display text-xs font-semibold tracking-wide text-gold shadow-glow-gold"
          >
            {handName}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
