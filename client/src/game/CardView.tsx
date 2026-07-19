import { motion } from "motion/react";
import PlayingCard from "../components/playing-card.js";
import { cardIntToProps } from "../assets/cards/cardMap.js";

/**
 * A single playing card for the felt. `card === null` renders the emerald
 * face-down back (opponent hole cards, undealt board slots); a number renders
 * the real face via the parametric `<PlayingCard>` deck. `flip` plays a 3D
 * rotateY reveal on mount (board streets, showdown).
 *
 * Size is controlled by `className` (defaults to the table card size); a
 * face-down back keeps the same footprint.
 */
export default function CardView({
  card,
  flip = false,
  className,
}: {
  card: number | null;
  flip?: boolean;
  className?: string;
}) {
  const size = className ?? "h-[4.5rem] w-[3.25rem]";
  if (card === null) {
    return <PlayingCard rank="A" suit="s" faceDown className={`m-0.5 ${size}`} />;
  }
  const { rank, suit } = cardIntToProps(card);
  const face = <PlayingCard rank={rank} suit={suit} className={`m-0.5 ${size}`} />;
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
