import { rankForRating } from "@poker/shared";

// Keyed by RANK_TIERS names (Fish/Limper/Grinder/Shark/Semi-Pro/Final Tablist).
const TIER_COLOR: Record<string, string> = {
  Fish: "#6b7280",
  Limper: "#7aa2f7",
  Grinder: "#5dd39e",
  Shark: "#e0af68",
  "Semi-Pro": "#bb9af7",
  "Final Tablist": "#f7768e",
};

export default function RatingBadge({ rating }: { rating: number }) {
  const tier = rankForRating(rating);
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "baseline" }}>
      <b>{rating}</b>
      <span style={{ color: TIER_COLOR[tier] ?? "#e6e6e6", fontSize: 13 }}>{tier}</span>
    </span>
  );
}
