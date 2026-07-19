import { tierLadder } from "./tierLadder.js";

/**
 * Horizontal ladder of all rank tiers connected by a track. The player's
 * current tier glows emerald and shows its progress toward the next; already
 * -passed tiers read dimmed emerald, future tiers stay neutral. Decorative +
 * informational; scrolls horizontally on narrow screens.
 */
export default function TierLadder({ rating }: { rating: number }) {
  const rungs = tierLadder(rating);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-edge bg-surface p-5">
      <span className="text-label-caps text-muted-foreground">Tier ladder</span>
      <div className="flex min-w-fit items-start gap-0 overflow-x-auto pb-1">
        {rungs.map((r, i) => {
          const isCurrent = r.state === "current";
          const isPassed = r.state === "passed";
          const dot = isCurrent
            ? "bg-emerald shadow-glow-sm"
            : isPassed
              ? "bg-emerald-dim"
              : "bg-surface-3 border border-edge-bright";
          const label = isCurrent
            ? "text-emerald font-semibold"
            : isPassed
              ? "text-neutral-300"
              : "text-muted-foreground";
          return (
            <div key={r.name} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex w-full items-center">
                <span
                  className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : isPassed || isCurrent ? "bg-emerald-dim" : "bg-edge"}`}
                />
                <span className={`size-3 shrink-0 rounded-full ${dot}`} />
                <span
                  className={`h-0.5 flex-1 ${i === rungs.length - 1 ? "opacity-0" : isPassed ? "bg-emerald-dim" : "bg-edge"}`}
                />
              </div>
              <span className={`px-1 text-center text-[11px] leading-tight whitespace-nowrap ${label}`}>
                {r.name}
              </span>
              {isCurrent && (
                <span className="text-[10px] text-muted-foreground">
                  {r.progressToNext >= 1 ? "max" : `${Math.round(r.progressToNext * 100)}%`}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
