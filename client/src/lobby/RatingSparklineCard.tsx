import { useId } from "react";
import { Card } from "../components/ui/card.js";
import { Skeleton } from "../components/ui/skeleton.js";
import CountUp from "../components/count-up.js";
import { buildSparkline } from "../data/arenaSparkline.js";

export default function RatingSparklineCard({
  rating,
  series,
  loading,
}: {
  rating: number;
  /** chronological (oldest → newest) rating_after values */
  series: number[];
  loading: boolean;
}) {
  const gradId = useId();
  const geo = buildSparkline(series, { width: 220, height: 56, pad: 6 });
  const stroke = geo && !geo.up ? "var(--color-danger)" : "var(--color-emerald)";

  return (
    <Card className="gap-3 p-4">
      <h3 className="text-label-caps text-muted-foreground">Rating Progress</h3>

      <div className="text-stat text-3xl">
        <CountUp value={rating} />
      </div>

      {loading ? (
        <Skeleton className="h-14 w-full rounded-lg" />
      ) : geo ? (
        <svg
          viewBox={`0 0 ${geo.width} ${geo.height}`}
          className="h-14 w-full"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={geo.area} fill={`url(#${gradId})`} />
          <polyline
            points={geo.line}
            fill="none"
            stroke={stroke}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : (
        <p className="py-3 text-xs text-muted-foreground">
          Play a match to start your rating graph.
        </p>
      )}
    </Card>
  );
}
