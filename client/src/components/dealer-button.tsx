import type React from "react";
import { cn } from "@/lib/utils";

/**
 * The dealer button: an off-white disc with an embossed "D" and a soft shadow.
 * Default ~24px; size via the `size` prop.
 */
export interface DealerButtonProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function DealerButton({ size = 24, className, style }: DealerButtonProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn("block select-none drop-shadow-md", className)}
      style={style}
      role="img"
      aria-label="Dealer button"
    >
      <defs>
        <radialGradient id="dealer-face" cx="40%" cy="34%" r="72%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="70%" stopColor="#efece2" />
          <stop offset="100%" stopColor="#d6d1c3" />
        </radialGradient>
      </defs>
      <circle cx={50} cy={50} r={47} fill="#bdb8a8" />
      <circle cx={50} cy={50} r={45} fill="url(#dealer-face)" />
      <circle cx={50} cy={50} r={39} fill="none" stroke="#c7c2b3" strokeWidth={2} />
      {/* embossed D: dark base offset + light highlight on top */}
      <text
        x={50}
        y={51}
        dominantBaseline="central"
        textAnchor="middle"
        fontFamily='"Space Grotesk", system-ui, sans-serif'
        fontSize={52}
        fontWeight={700}
        fill="#b7b1a1"
      >
        D
      </text>
      <text
        x={50}
        y={49}
        dominantBaseline="central"
        textAnchor="middle"
        fontFamily='"Space Grotesk", system-ui, sans-serif'
        fontSize={52}
        fontWeight={700}
        fill="#3a382f"
      >
        D
      </text>
    </svg>
  );
}

export default DealerButton;
