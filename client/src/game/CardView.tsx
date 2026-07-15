import { motion } from "motion/react";
import { formatCard } from "./viewHelpers.js";

const RED = new Set(["h", "d"]);

/** A single playing card: face-down back, or a static/flip-revealed face. */
export default function CardView({ card, flip = false }: { card: number | null; flip?: boolean }) {
  if (card === null) {
    return (
      <span className="relative m-0.5 grid h-20 w-14 place-items-center rounded-lg border border-edge bg-surface-2">
        <span className="h-8 w-8 rounded-full border-2 border-emerald/25" />
      </span>
    );
  }
  const s = formatCard(card);
  const suit = s.slice(-1);
  const rank = s.slice(0, -1);
  const color = RED.has(suit) ? "#d33" : "#1a1a1a";
  const face = (
    <span
      className="m-0.5 grid h-20 w-14 place-items-center rounded-lg border border-neutral-300 bg-white text-lg font-bold shadow-md"
      style={{ color }}
    >
      {rank}
      <span className="text-base">{suitGlyph(suit)}</span>
    </span>
  );
  if (!flip) return face;
  return (
    <motion.span
      className="inline-block"
      initial={{ rotateY: 90, opacity: 0 }}
      animate={{ rotateY: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      style={{ transformStyle: "preserve-3d", display: "inline-block" }}
    >
      {face}
    </motion.span>
  );
}

function suitGlyph(suit: string): string {
  switch (suit) {
    case "h":
      return "♥";
    case "d":
      return "♦";
    case "c":
      return "♣";
    case "s":
      return "♠";
    default:
      return suit;
  }
}
