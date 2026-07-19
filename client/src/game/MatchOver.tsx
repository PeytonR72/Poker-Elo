import { useEffect, useState } from "react";
import { animate } from "motion";
import { motion } from "motion/react";
import { Trophy } from "lucide-react";
import { displayName } from "../data/displayName.js";
import { TierAvatar } from "../components/tier-avatar.js";
import type { PlayerNameMap } from "./usePlayerNames.js";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { Button } from "../components/ui/button.js";

function EloDelta({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const controls = animate(0, value, {
      duration: 0.8,
      ease: "easeOut",
      onUpdate: (v) => setShown(Math.round(v)),
    });
    return () => controls.stop();
  }, [value]);
  const positive = value >= 0;
  return (
    <span className={`font-mono-num text-sm font-semibold ${positive ? "text-emerald" : "text-danger"}`}>
      {positive ? `+${shown}` : shown}
    </span>
  );
}

export default function MatchOver({
  ownId,
  finishPlaceById,
  eloDeltas,
  names = {},
  onLeave,
}: {
  ownId: string | null;
  finishPlaceById: Record<string, number>;
  eloDeltas: Record<string, number>;
  names?: PlayerNameMap;
  onLeave: () => void;
}) {
  const rows = Object.entries(finishPlaceById).sort((a, b) => a[1] - b[1]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-base/90 backdrop-blur">
      <Card className="w-full max-w-md border-edge bg-surface">
        <CardHeader>
          <CardTitle className="text-center text-xl text-neutral-100">Match Over</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            {rows.map(([id, place], i) => {
              const isOwn = id === ownId;
              const isFirst = place === 1;
              return (
                <motion.div
                  key={id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.12, ease: "easeOut" }}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                    isOwn ? "border-emerald/40 bg-emerald/10" : "border-edge bg-surface-2"
                  }`}
                >
                  <span
                    className={`w-6 shrink-0 text-center font-mono-num text-sm font-bold ${
                      isFirst ? "text-gold drop-shadow-[0_0_6px_rgba(232,195,90,0.6)]" : "text-neutral-400"
                    }`}
                  >
                    {isFirst ? <Trophy className="mx-auto h-4 w-4" /> : place}
                  </span>
                  <TierAvatar
                    seed={id}
                    rating={names[id]?.rating}
                    name={names[id]?.name ?? displayName({ id })}
                    size={28}
                    className="shrink-0"
                  />
                  <span className="flex-1 truncate text-sm text-neutral-200">
                    {names[id]?.name ?? displayName({ id })}
                    {isOwn ? " (you)" : ""}
                  </span>
                  <EloDelta value={eloDeltas[id] ?? 0} />
                </motion.div>
              );
            })}
          </div>
          <Button className="mt-6 w-full" onClick={onLeave}>
            Back to Arena
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
