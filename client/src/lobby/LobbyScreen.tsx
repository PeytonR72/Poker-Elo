import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { MATCH_FORMATS, DEFAULT_FORMAT, rankForRating } from "@poker/shared";
import type { SessionApi } from "../auth/useSession.js";
import { useLobbySocket } from "./useLobbySocket.js";
import RatingBadge from "../home/RatingBadge.js";
import Logo from "../shell/Logo.js";
import { Card } from "../components/ui/card.js";
import { Button } from "../components/ui/button.js";
import { Badge } from "../components/ui/badge.js";
import StatCard from "../components/stat-card.js";

export default function LobbyScreen({
  auth,
  rating,
  onMatchFound,
}: {
  auth: SessionApi;
  rating: number;
  onMatchFound: (roomId: string, format: string) => void;
}) {
  const { state, connStatus, enqueue, leave } = useLobbySocket(auth.getJwt);
  const [format, setFormat] = useState<string>(DEFAULT_FORMAT);
  const connected = connStatus === "open";
  const queued = state.status === "queued";

  useEffect(() => {
    if (state.status === "matched" && state.match) {
      onMatchFound(state.match.roomId, state.match.format);
    }
  }, [state.status, state.match, onMatchFound]);

  const activeFormat = MATCH_FORMATS[format];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Arena</h1>
        <RatingBadge rating={rating} />
      </div>

      <Card className="mx-auto w-full max-w-md items-center gap-5 p-8 text-center">
        <div className="relative mx-auto h-20 w-20">
          {queued && (
            <motion.span
              className="absolute inset-0 rounded-full border-2 border-emerald"
              animate={{ scale: [1, 1.6], opacity: [0.6, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
            />
          )}
          <span className="absolute inset-3 grid place-items-center rounded-full border border-edge bg-surface-2">
            <Logo size={28} />
          </span>
        </div>

        <div>
          <h2 className="text-lg font-semibold">
            {queued ? "Searching for match…" : "Ready to play"}
          </h2>
        </div>

        {connStatus === "connecting" && (
          <p className="text-sm text-muted-foreground">Connecting to game server…</p>
        )}
        {connStatus === "closed" && (
          <p className="text-sm text-danger">
            Can't reach the game server — matchmaking is unavailable. Retrying…
          </p>
        )}

        {!queued ? (
          <>
            <div className="flex flex-wrap justify-center gap-2">
              {Object.values(MATCH_FORMATS).map((f) => (
                <Badge
                  key={f.id}
                  variant={f.id === format ? "default" : "outline"}
                  onClick={() => setFormat(f.id)}
                  className={f.id === format ? "cursor-pointer" : "cursor-pointer text-muted-foreground"}
                >
                  {f.label}
                </Badge>
              ))}
            </div>

            <Button
              size="lg"
              disabled={!connected}
              onClick={() => enqueue(rating, format)}
              className="w-full font-semibold shadow-[0_0_18px_rgba(47,217,135,0.45)]"
            >
              Find Match
              {activeFormat && (
                <Badge variant="secondary" className="ml-1">
                  6-Max No-Limit · {activeFormat.label}
                </Badge>
              )}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              In queue — position {state.position} of {state.waiting}.
            </p>
            <p className="text-sm text-muted-foreground">
              Filling with bots in ~{state.etaSec}s if no humans join.
            </p>
            <button
              onClick={leave}
              className="text-sm text-neutral-400 hover:text-danger"
            >
              Cancel Search
            </button>
          </>
        )}

        {state.error && <p className="text-sm text-danger">{state.error}</p>}
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="RATING" value={rating} />
        <StatCard label="RANK" value={rankForRating(rating)} />
        <StatCard label="QUEUE" value={queued ? `~${state.etaSec}s` : "Idle"} />
      </div>
    </div>
  );
}
