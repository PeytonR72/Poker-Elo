import type React from "react";
import { Card } from "./ui/card.js";

export default function StatCard({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className ? `gap-1 p-4 ${className}` : "gap-1 p-4"}>
      <span className="font-mono-num text-[11px] tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="font-mono-num text-2xl">{value}</span>
    </Card>
  );
}
