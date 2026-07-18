import type React from "react";
import { cn } from "../../lib/utils.js";

/**
 * Subtle dot-pattern panel background, rendered via a tiling SVG <pattern>.
 * Fills its container; place behind content in a `relative` parent. Decorative.
 */
export interface DotGridProps {
  /** dot spacing in px (default 22) */
  gap?: number;
  /** dot radius in px (default 1) */
  radius?: number;
  className?: string;
  style?: React.CSSProperties;
}

let uid = 0;

export function DotGrid({ gap = 22, radius = 1, className, style }: DotGridProps) {
  // Unique pattern id so multiple instances don't collide.
  const id = `dotgrid-${(uid = (uid + 1) % 1e6)}`;
  return (
    <svg
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      style={style}
    >
      <defs>
        <pattern id={id} width={gap} height={gap} patternUnits="userSpaceOnUse">
          <circle cx={radius} cy={radius} r={radius} fill="var(--color-emerald)" fillOpacity={0.14} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

export default DotGrid;
