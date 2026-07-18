import type React from "react";
import { cn } from "@/lib/utils";
import {
  CARD_BORDER,
  CARD_FACE,
  COURTS,
  SUIT_PATHS,
  suitColor,
  rankLabel,
  type Rank,
  type Suit,
} from "@/assets/cards/suits";
import { PIP_LAYOUTS, colX } from "@/assets/cards/pips";

/**
 * Parametric playing card. Every one of the 52 faces is drawn from data
 * (corner index + pip layout / court letter), so the deck adds no per-card SVG
 * to the bundle. Restyled for the dark table aesthetic: off-white face,
 * near-black spades/clubs, deep-red hearts/diamonds, and a custom emerald back.
 *
 * The intrinsic viewBox is 100×140 (standard poker ratio); size via `className`
 * (e.g. `h-20 w-14`).
 */
export interface PlayingCardProps {
  rank: Rank;
  suit: Suit;
  faceDown?: boolean;
  className?: string;
  style?: React.CSSProperties;
  "aria-label"?: string;
}

const VB_W = 100;
const VB_H = 140;
// Central pip band (below the top index, above the bottom index).
const BAND_TOP = 30;
const BAND_BOT = 110;

/**
 * One suit glyph fitted into a `size`×`size` box centered at (cx, cy).
 * Uses a nested <svg> viewport so the path is always scaled AND clipped to its
 * box — a glyph can never overflow the card face regardless of path extents.
 */
function Glyph({
  suit,
  cx,
  cy,
  size,
  flip = false,
  fill,
}: {
  suit: Suit;
  cx: number;
  cy: number;
  size: number;
  flip?: boolean;
  fill: string;
}) {
  return (
    <svg
      x={cx - size / 2}
      y={cy - size / 2}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
    >
      <path
        d={SUIT_PATHS[suit]}
        fill={fill}
        transform={flip ? "rotate(180 50 50)" : undefined}
      />
    </svg>
  );
}

/** Top-left corner index (rank over mini suit); mirrored copy drawn by caller. */
function CornerIndex({ rank, suit, fill }: { rank: Rank; suit: Suit; fill: string }) {
  return (
    <g>
      <text
        x={11}
        y={20}
        fontFamily='"Space Grotesk", system-ui, sans-serif'
        fontSize={18}
        fontWeight={700}
        textAnchor="middle"
        fill={fill}
      >
        {rankLabel(rank)}
      </text>
      <Glyph suit={suit} cx={11} cy={30} size={11} fill={fill} />
    </g>
  );
}

function CardFace({ rank, suit }: { rank: Rank; suit: Suit }) {
  const fill = suitColor(suit);
  const label = rankLabel(rank);
  const pips = PIP_LAYOUTS[rankLabelToNum(rank)];

  let center: React.ReactNode;
  if (COURTS.has(rank)) {
    // Court: large typographic letter inside a thin inner frame + framing suits.
    center = (
      <g>
        <rect
          x={20}
          y={26}
          width={60}
          height={88}
          rx={7}
          fill="none"
          stroke={fill}
          strokeOpacity={0.28}
          strokeWidth={1.4}
        />
        <Glyph suit={suit} cx={50} cy={40} size={15} fill={fill} />
        <text
          x={50}
          y={78}
          fontFamily='"Space Grotesk", system-ui, sans-serif'
          fontSize={46}
          fontWeight={600}
          textAnchor="middle"
          fill={fill}
        >
          {label}
        </text>
        <Glyph suit={suit} cx={50} cy={100} size={15} flip fill={fill} />
      </g>
    );
  } else if (rank === "A") {
    // One contained center pip, ~40-45% of card height, clear of the corner
    // indices. The ace of spades is traditionally slightly larger.
    const aceSize = suit === "s" ? 62 : 56;
    center = <Glyph suit={suit} cx={50} cy={70} size={aceSize} fill={fill} />;
  } else if (pips) {
    center = (
      <g>
        {pips.map((p, i) => {
          const cy = BAND_TOP + p.y * (BAND_BOT - BAND_TOP);
          return (
            <Glyph
              key={i}
              suit={suit}
              cx={colX(p.col)}
              cy={cy}
              size={16}
              flip={p.y > 0.5}
              fill={fill}
            />
          );
        })}
      </g>
    );
  }

  return (
    <g>
      <CornerIndex rank={rank} suit={suit} fill={fill} />
      {center}
      {/* Bottom-right index: mirror the whole top-left index. */}
      <g transform={`rotate(180 ${VB_W / 2} ${VB_H / 2})`}>
        <CornerIndex rank={rank} suit={suit} fill={fill} />
      </g>
    </g>
  );
}

function CardBack() {
  return (
    <g>
      {/* Inner panel: surface-2-ish fill with a crisp emerald-dim border. */}
      <rect
        x={6}
        y={6}
        width={88}
        height={128}
        rx={7}
        fill="#1a222b"
        stroke="var(--color-emerald-dim)"
        strokeWidth={1.8}
      />
      {/* Fine emerald diagonal lattice — visible but recessive. */}
      <g clipPath="url(#pk-back-clip)">
        <g stroke="var(--color-emerald)" strokeOpacity={0.18} strokeWidth={0.9}>
          {LATTICE.map((x, i) => (
            <g key={i}>
              <line x1={x - 70} y1={140} x2={x + 70} y2={0} />
              <line x1={x - 70} y1={0} x2={x + 70} y2={140} />
            </g>
          ))}
        </g>
      </g>
      <clipPath id="pk-back-clip">
        <rect x={7} y={7} width={86} height={126} rx={6} />
      </clipPath>
      {/* Centered ring-and-spade emblem on a darker puck so it pops at 56px. */}
      <circle cx={50} cy={70} r={27} fill="#10161d" />
      <g fill="none" stroke="var(--color-emerald)" strokeOpacity={0.4} strokeWidth={1.6}>
        <circle cx={50} cy={70} r={27} />
        <circle cx={50} cy={70} r={21} strokeOpacity={0.2} strokeWidth={1.1} />
      </g>
      <svg x={35} y={55} width={30} height={30} viewBox="0 0 100 100">
        <path d={SUIT_PATHS.s} fill="var(--color-emerald)" fillOpacity={0.42} />
      </svg>
    </g>
  );
}

// X anchors for the diagonal lattice lines (spacing 20 across the 100-wide face).
const LATTICE: number[] = [-30, -10, 10, 30, 50, 70, 90, 110, 130];

function rankLabelToNum(rank: Rank): number {
  switch (rank) {
    case "T":
      return 10;
    case "J":
    case "Q":
    case "K":
    case "A":
      return 0; // handled by court / ace branches
    default:
      return Number(rank);
  }
}

export function PlayingCard({
  rank,
  suit,
  faceDown = false,
  className,
  style,
  "aria-label": ariaLabel,
}: PlayingCardProps) {
  const label = ariaLabel ?? (faceDown ? "face-down card" : `${rankLabel(rank)} of ${SUIT_NAMES[suit]}`);
  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className={cn("block h-20 w-14 select-none", className)}
      style={style}
      role="img"
      aria-label={label}
    >
      <rect
        x={1}
        y={1}
        width={VB_W - 2}
        height={VB_H - 2}
        rx={9}
        fill={faceDown ? "#0a0e12" : CARD_FACE}
        stroke={faceDown ? "transparent" : CARD_BORDER}
        strokeWidth={1.5}
      />
      {faceDown ? <CardBack /> : <CardFace rank={rank} suit={suit} />}
    </svg>
  );
}

const SUIT_NAMES: Record<Suit, string> = {
  s: "spades",
  h: "hearts",
  d: "diamonds",
  c: "clubs",
};

export default PlayingCard;
