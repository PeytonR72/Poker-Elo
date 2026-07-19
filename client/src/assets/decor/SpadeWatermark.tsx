import type React from "react";
import { cn } from "../../lib/utils.js";
import { SUIT_PATHS } from "../cards/suits.js";

/**
 * Large ring-and-spade brand watermark — very low-opacity emerald strokes for
 * empty regions and the table center. Purely decorative (aria-hidden).
 */
export interface SpadeWatermarkProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  /** overall opacity multiplier (default subtle) */
  opacity?: number;
}

export function SpadeWatermark({
  size = 240,
  className,
  style,
  opacity = 0.06,
}: SpadeWatermarkProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      aria-hidden="true"
      className={cn("block select-none", className)}
      style={{ opacity, ...style }}
    >
      <g fill="none" stroke="var(--color-emerald)" strokeWidth={2}>
        <circle cx={100} cy={100} r={82} />
        <circle cx={100} cy={100} r={66} strokeOpacity={0.5} />
      </g>
      <path
        d={SUIT_PATHS.s}
        transform="translate(58 58) scale(0.84)"
        fill="none"
        stroke="var(--color-emerald)"
        strokeWidth={2.4}
      />
    </svg>
  );
}

export default SpadeWatermark;
