import type React from "react";
import { Card } from "./ui/card.js";

export default function StatCard({
  label,
  value,
  icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  /** Optional leading glyph (e.g. a lucide icon), rendered left of the label. */
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={
        "gap-1 p-4 transition-all duration-150 hover:-translate-y-px hover:border-edge-bright" +
        (className ? ` ${className}` : "")
      }
    >
      <span className="flex items-center gap-1.5 text-label-caps text-muted-foreground">
        {icon != null && (
          <span className="inline-flex text-muted-foreground">{icon}</span>
        )}
        {label}
      </span>
      <span className="text-stat text-2xl">{value}</span>
    </Card>
  );
}
