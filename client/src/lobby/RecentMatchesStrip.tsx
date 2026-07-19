import { motion } from "motion/react";
import { Card } from "../components/ui/card.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { NoMatches } from "../assets/decor/index.js";
import type { ArenaHistoryEntry } from "../data/arenaHistory.js";

export default function RecentMatchesStrip({
  entries,
  loading,
  error,
}: {
  entries: ArenaHistoryEntry[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-label-caps text-muted-foreground">Recent Matches</h3>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <p className="py-6 text-center text-sm text-danger">Couldn't load matches: {error}</p>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <NoMatches size={72} />
          <p className="text-sm font-medium">Your matches will appear here</p>
          <p className="text-xs text-muted-foreground">Hit Find Match to play your first.</p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-edge">
          {entries.map((e, i) => {
            const positive = e.eloDelta >= 0;
            return (
              <motion.div
                key={e.matchId}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.05, 0.4) }}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs font-bold ${
                      e.won
                        ? "bg-emerald/15 text-emerald"
                        : "bg-danger/12 text-danger"
                    }`}
                  >
                    {e.won ? "W" : "L"}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">
                      {e.placement}
                      <span className="text-muted-foreground"> · {e.formatLabel}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {e.date ? new Date(e.date).toLocaleDateString() : "—"}
                    </span>
                  </div>
                </div>
                <span
                  className={`text-stat text-sm ${positive ? "text-emerald" : "text-danger"}`}
                >
                  {positive ? "▲" : "▼"}
                  {Math.abs(e.eloDelta)}
                </span>
              </motion.div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
