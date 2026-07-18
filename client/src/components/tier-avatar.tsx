import type React from "react";
import { RANK_TIERS, rankForRating } from "@poker/shared";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarUrl } from "@/data/avatar";

/**
 * The googly player avatar wrapped in a tier-colored ring. The ring color is
 * derived from the player's rating via `RANK_TIERS` (Fish → neutral, up through
 * Final Tablist → gold). Falls back to initials on an emerald gradient when the
 * avatar image fails to load.
 */

// Tier name → [ring inner, ring outer] gradient stops. Keyed off RANK_TIERS
// names; a 6-step ramp from neutral → emerald → gold.
const TIER_RING: Record<string, [string, string]> = {
  Fish: ["#3a434e", "#2a323b"],
  Limper: ["#5b6b7a", "#3f4b57"],
  Grinder: ["#3aa0a0", "#1f6d6d"],
  Shark: ["#1a8f5c", "#146b45"],
  "Semi-Pro": ["#2fd987", "#1a8f5c"],
  "Final Tablist": ["#e8c35a", "#a8862f"],
};

const FALLBACK_RING = TIER_RING.Fish ?? ["#3a434e", "#2a323b"];

/** Ring gradient stops for a tier name. */
export function ringForTier(tier: string): [string, string] {
  return TIER_RING[tier] ?? FALLBACK_RING;
}

function initialsFor(name: string | undefined): string {
  if (!name) return "?";
  const letters = name.replace(/[^\p{L}\p{N}]/gu, "");
  return letters.slice(0, 2).toUpperCase() || "?";
}

export interface TierAvatarProps {
  /** avatar seed — player id or bot name (feeds `avatarUrl`) */
  seed: string;
  /** rating used to derive the tier ring color (default: Fish tier) */
  rating?: number;
  /** explicit tier name; overrides `rating` when provided */
  tier?: string;
  /** display name, used for the initials fallback */
  name?: string;
  /** overall diameter in px (default 40) */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function TierAvatar({
  seed,
  rating,
  tier,
  name,
  size = 40,
  className,
  style,
}: TierAvatarProps) {
  const tierName = tier ?? (rating != null ? rankForRating(rating) : RANK_TIERS[0]!.name);
  const [c0, c1] = ringForTier(tierName);
  const pad = Math.max(2, Math.round(size * 0.06));
  const inner = size - pad * 2;

  return (
    <span
      className={cn("inline-grid place-items-center rounded-full", className)}
      style={{
        width: size,
        height: size,
        padding: pad,
        background: `linear-gradient(135deg, ${c0}, ${c1})`,
        ...style,
      }}
      title={tierName}
      aria-label={name ? `${name} (${tierName})` : tierName}
    >
      <Avatar
        className="rounded-full ring-1 ring-black/30"
        style={{ width: inner, height: inner }}
      >
        <AvatarImage src={avatarUrl(seed)} alt="" className="rounded-full" />
        <AvatarFallback
          className="rounded-full bg-gradient-to-br from-emerald to-emerald-dim font-semibold"
          style={{ fontSize: Math.round(inner * 0.4), color: "#07130d" }}
        >
          {initialsFor(name)}
        </AvatarFallback>
      </Avatar>
    </span>
  );
}

export default TierAvatar;
