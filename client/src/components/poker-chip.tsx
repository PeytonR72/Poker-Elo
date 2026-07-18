import type React from "react";
import { cn } from "@/lib/utils";
import { visibleDiscs } from "./chip-math.js";

/**
 * SVG poker chip with the classic 6-slot edge dashes and a subtle 3D top
 * highlight. Denominated by color from the app palette. `value` outside the
 * known denominations falls back to a neutral disc.
 */

interface ChipColor {
  /** body/base color */
  base: string;
  /** darker rim for depth */
  rim: string;
  /** edge dash + inner ring color */
  edge: string;
  /** center label text color */
  text: string;
}

// Visual design constants (chip colors), not poker game constants.
const CHIP_COLORS: Record<number, ChipColor> = {
  5: { base: "#c94f4f", rim: "#8f2f2f", edge: "#f2e9e0", text: "#f7efe6" },
  25: { base: "#2fa571", rim: "#1a6f4a", edge: "#eafaf1", text: "#f2fff8" },
  100: { base: "#12181f", rim: "#05090d", edge: "#2fd987", text: "#dff7ea" },
  500: { base: "#e8c35a", rim: "#a8862f", edge: "#5a4410", text: "#3a2c08" },
};

const NEUTRAL: ChipColor = { base: "#8a94a0", rim: "#5b636d", edge: "#eef1f4", text: "#12181f" };

function colorFor(value: number): ChipColor {
  return CHIP_COLORS[value] ?? NEUTRAL;
}

export interface PokerChipProps {
  value: number;
  size?: number;
  /** show the denomination number in the center (default true) */
  showValue?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function PokerChip({
  value,
  size = 36,
  showValue = true,
  className,
  style,
}: PokerChipProps) {
  const c = colorFor(value);
  // Six edge dashes rendered as arc segments INSIDE the rim annulus (via
  // stroke-dasharray on a hidden circle), so the outer silhouette stays a
  // perfect continuous circle — never a notched hexagon.
  const dashRadius = 42.5;
  const circumference = 2 * Math.PI * dashRadius;
  const dashLen = circumference * 0.09; // each arc ≈ 32° of sweep
  const gapLen = circumference / 6 - dashLen;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn("block select-none drop-shadow-sm", className)}
      style={style}
      role="img"
      aria-label={`${value} chip`}
    >
      <defs>
        <radialGradient id={`chip-hi-${value}`} cx="38%" cy="32%" r="72%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.28} />
          <stop offset="55%" stopColor="#ffffff" stopOpacity={0.04} />
          <stop offset="100%" stopColor="#000000" stopOpacity={0.22} />
        </radialGradient>
      </defs>
      {/* continuous outer rim + body — the silhouette is always a circle */}
      <circle cx={50} cy={50} r={48} fill={c.rim} />
      <circle cx={50} cy={50} r={46} fill={c.base} />
      {/* six edge dashes as arc segments inside the rim annulus */}
      <circle
        cx={50}
        cy={50}
        r={dashRadius}
        fill="none"
        stroke={c.edge}
        strokeWidth={7}
        strokeDasharray={`${dashLen} ${gapLen}`}
        strokeDashoffset={dashLen / 2}
        transform="rotate(-90 50 50)"
      />
      {/* inner ring */}
      <circle cx={50} cy={50} r={33} fill="none" stroke={c.edge} strokeWidth={2.4} strokeOpacity={0.85} />
      <circle cx={50} cy={50} r={29} fill={c.base} />
      {/* top highlight */}
      <circle cx={50} cy={50} r={48} fill={`url(#chip-hi-${value})`} />
      {showValue && (
        <text
          x={50}
          y={50}
          dominantBaseline="central"
          textAnchor="middle"
          fontFamily='"Space Grotesk", system-ui, sans-serif'
          fontSize={value >= 100 ? 22 : 26}
          fontWeight={700}
          fill={c.text}
        >
          {value}
        </text>
      )}
    </svg>
  );
}

export interface ChipStackProps {
  amount: number;
  /** max visible discs in the column (default 5) */
  max?: number;
  /** chip diameter in px (default 30) */
  size?: number;
  /** show the numeric amount label under the stack (default true) */
  showLabel?: boolean;
  className?: string;
}

/**
 * A single aligned vertical column of chips representing `amount`, with the
 * amount label below in mono. Discs share one x position; each sits a small
 * constant offset above the previous (largest denomination at the bottom,
 * bottom chip fully visible). Renders up to `max` discs; the numeric label is
 * always the source of truth.
 */
export function ChipStack({
  amount,
  max = 5,
  size = 30,
  showLabel = true,
  className,
}: ChipStackProps) {
  const { discs } = visibleDiscs(amount, max);
  const step = size * 0.2; // vertical offset between stacked discs (~20% of chip height)
  const stackHeight = discs.length > 0 ? size + (discs.length - 1) * step : 0;

  if (discs.length === 0) return null;

  return (
    <span className={cn("inline-flex flex-col items-center gap-0.5", className)}>
      <span className="relative block" style={{ width: size, height: stackHeight }}>
        {discs.map((v, i) => (
          <PokerChip
            key={i}
            value={v}
            size={size}
            showValue={false}
            className="absolute left-0 drop-shadow-none"
            style={{ bottom: i * step, zIndex: i }}
          />
        ))}
      </span>
      {showLabel && (
        <span className="text-stat text-[11px] leading-none text-neutral-200">
          {amount.toLocaleString("en-US")}
        </span>
      )}
    </span>
  );
}

export default PokerChip;
