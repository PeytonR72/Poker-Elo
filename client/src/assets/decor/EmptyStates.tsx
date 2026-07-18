import type React from "react";
import { cn } from "../../lib/utils.js";

/**
 * Small line-icon empty-state illustrations in the brand stroke style
 * (~1.5px strokes, emerald accents, muted neutral base). Decorative; each
 * accepts `size`/`className`. Pair with a headline + CTA at call sites.
 */
export interface EmptyIllustrationProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

const BASE = "#5b636d"; // muted neutral stroke
const ACCENT = "var(--color-emerald)";
const GOLD = "var(--color-gold)";

function frame(
  size: number,
  className: string | undefined,
  style: React.CSSProperties | undefined,
  children: React.ReactNode,
) {
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-hidden="true"
      className={cn("block select-none", className)}
      style={style}
      fill="none"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** Empty leaderboard — a podium with a trophy on top. */
export function EmptyLeaderboard({ size = 96, className, style }: EmptyIllustrationProps) {
  return frame(
    size,
    className,
    style,
    <>
      {/* trophy */}
      <path d="M50 26h20v10a10 10 0 0 1-20 0z" stroke={GOLD} />
      <path d="M50 30h-7a6 6 0 0 0 7 6M70 30h7a6 6 0 0 1-7 6" stroke={GOLD} />
      <path d="M60 46v7M54 60h12" stroke={GOLD} />
      {/* podiums */}
      <path d="M18 96h28V74H18z" stroke={BASE} />
      <path d="M46 96h28V64H46z" stroke={ACCENT} />
      <path d="M74 96h28V80H74z" stroke={BASE} />
      <path d="M12 96h96" stroke={BASE} />
    </>,
  );
}

/** No matches yet — two cards with a sparkle. */
export function NoMatches({ size = 96, className, style }: EmptyIllustrationProps) {
  return frame(
    size,
    className,
    style,
    <>
      <rect x="34" y="34" width="34" height="48" rx="5" stroke={BASE} transform="rotate(-10 51 58)" />
      <rect x="52" y="38" width="34" height="48" rx="5" stroke={ACCENT} transform="rotate(8 69 62)" />
      <path d="M63 52l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" stroke={ACCENT} />
      {/* sparkle */}
      <path d="M90 30v10M85 35h10" stroke={GOLD} />
    </>,
  );
}

/** Generic error — a tilted card with a small alert glyph. */
export function GenericError({ size = 96, className, style }: EmptyIllustrationProps) {
  return frame(
    size,
    className,
    style,
    <>
      <rect x="40" y="32" width="40" height="56" rx="6" stroke={BASE} transform="rotate(-14 60 60)" />
      <g transform="rotate(-14 60 60)">
        <path d="M60 46v18" stroke="var(--color-danger)" />
        <circle cx="60" cy="72" r="0.8" stroke="var(--color-danger)" fill="var(--color-danger)" />
      </g>
    </>,
  );
}
