import { rankForRating } from "@poker/shared";

// Keyed by RANK_TIERS names (Fish/Limper/Grinder/Shark/Semi-Pro/Final Tablist).
const TIER_CLASS: Record<string, string> = {
  Fish: "text-neutral-500",
  Limper: "text-sky-400",
  Grinder: "text-emerald",
  Shark: "text-gold",
  "Semi-Pro": "text-purple-400",
  "Final Tablist": "text-danger",
};

export default function RatingBadge({ rating }: { rating: number }) {
  const tier = rankForRating(rating);
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <b className="font-mono-num text-neutral-100">{rating}</b>
      <span className={`text-[13px] ${TIER_CLASS[tier] ?? "text-neutral-200"}`}>{tier}</span>
    </span>
  );
}
