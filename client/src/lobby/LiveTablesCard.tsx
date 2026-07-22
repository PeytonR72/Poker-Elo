import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { MATCH_FORMATS } from "@poker/shared";
import type { LiveMatchInfo } from "@poker/shared";
import { Card } from "../components/ui/card.js";
import { Button } from "../components/ui/button.js";
import { usePlayerNames } from "../game/usePlayerNames.js";
import { displayName } from "../data/displayName.js";

/** Milliseconds elapsed -> "m:ss". */
function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function playersLabel(
  players: LiveMatchInfo["players"],
  names: ReturnType<typeof usePlayerNames>,
): string {
  const labels = players.map((p) => {
    const name = names[p.playerId]?.name ?? displayName({ id: p.playerId });
    const rating = names[p.playerId]?.rating ?? p.rating;
    return `${name} (${rating})`;
  });
  if (labels.length === 0) return "Bots only";
  if (labels.length === 1) return `${labels[0]} vs bots`;
  return labels.join(" vs ");
}

export default function LiveTablesCard({
  matches,
  onWatch,
}: {
  matches: LiveMatchInfo[];
  onWatch: (roomId: string, format: string) => void;
}) {
  const names = usePlayerNames(matches.flatMap((m) => m.players.map((p) => p.playerId)));

  // Tick once a second so elapsed times stay live between the 15s liveMatches re-polls.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Card className="gap-3 p-4">
      <h3 className="text-label-caps text-muted-foreground">Live Tables</h3>

      {matches.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No live tables right now.</p>
      ) : (
        <div className="flex flex-col divide-y divide-edge">
          {matches.map((m) => {
            const fmt = MATCH_FORMATS[m.format];
            return (
              <div
                key={m.roomId}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-edge bg-surface-2 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald uppercase">
                      {fmt?.label ?? m.format}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatElapsed(now - m.startedAt)}</span>
                  </div>
                  <span className="truncate text-sm text-neutral-200">{playersLabel(m.players, names)}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1.5"
                  onClick={() => onWatch(m.roomId, m.format)}
                >
                  <Eye className="size-3.5" />
                  Watch
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
