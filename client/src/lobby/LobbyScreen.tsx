import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, useReducedMotion } from "motion/react";
import { TrendingUp, Award, Timer, X } from "lucide-react";
import { MATCH_FORMATS, DEFAULT_FORMAT, rankForRating } from "@poker/shared";
import type { SessionApi } from "../auth/useSession.js";
import { useLobbySocket } from "./useLobbySocket.js";
import { useArenaHistory } from "./useArenaHistory.js";
import { buildArenaHistory, ratingSeries } from "../data/arenaHistory.js";
import RatingBadge from "../home/RatingBadge.js";
import { Card } from "../components/ui/card.js";
import { Button } from "../components/ui/button.js";
import StatCard from "../components/stat-card.js";
import CountUp from "../components/count-up.js";
import ArenaEmblem from "./ArenaEmblem.js";
import FormatSegmentedControl from "./FormatSegmentedControl.js";
import MatchFoundOverlay from "./MatchFoundOverlay.js";
import RecentMatchesStrip from "./RecentMatchesStrip.js";
import RatingSparklineCard from "./RatingSparklineCard.js";
import TierProgressCard from "./TierProgressCard.js";

/** Seconds → "m:ss". */
function formatElapsed(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const CEREMONY_MS = 2000;

export default function LobbyScreen({
  auth,
  rating,
  onMatchFound,
}: {
  auth: SessionApi;
  rating: number;
  onMatchFound: (roomId: string, format: string) => void;
}) {
  const reduced = useReducedMotion();
  const { state, connStatus, enqueue, leave } = useLobbySocket(auth.getJwt);
  const [format, setFormat] = useState<string>(DEFAULT_FORMAT);
  const connected = connStatus === "open";
  const queued = state.status === "queued";
  const activeFormat = MATCH_FORMATS[format];

  // ── Recent-match data (feeds the strip + sparkline) ──────────────────────
  const { results, loading: historyLoading, error: historyError } = useArenaHistory(auth.userId);
  const strip = useMemo(() => buildArenaHistory(results, 5), [results]);
  const series = useMemo(() => ratingSeries(results, 12), [results]);

  // ── Searching elapsed clock ──────────────────────────────────────────────
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!queued) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [queued]);

  // ── Match-found ceremony: hold navigation ~2s while the overlay plays ─────
  const [ceremony, setCeremony] = useState(false);
  const firedRef = useRef(false);
  useEffect(() => {
    if (state.status !== "matched" || !state.match || firedRef.current) return;
    firedRef.current = true;
    const { roomId, format: fmt } = state.match;
    if (reduced) {
      onMatchFound(roomId, fmt); // reduced motion → skip the ceremony entirely
      return;
    }
    setCeremony(true);
    const timer = setTimeout(() => onMatchFound(roomId, fmt), CEREMONY_MS);
    return () => clearTimeout(timer); // clean up if unmounted mid-ceremony
  }, [state.status, state.match, reduced, onMatchFound]);

  const ceremonyFormatLabel = state.match
    ? (MATCH_FORMATS[state.match.format]?.label ?? state.match.format)
    : "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-h1">Arena</h1>
        <RatingBadge rating={rating} />
      </div>

      {/* ── Hero match finder ────────────────────────────────────────────── */}
      <Card className="relative mx-auto w-full max-w-lg items-center gap-6 overflow-hidden border-edge bg-noise p-6 text-center sm:p-8">
        {/* Felt backdrop echoing the table */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--color-felt-hi) 55%, transparent) 0%, color-mix(in srgb, var(--color-felt-1) 40%, transparent) 45%, transparent 75%)",
          }}
        />

        <div className="relative z-10 flex w-full flex-col items-center gap-6">
          <ArenaEmblem queued={queued} />

          <div className="min-h-[2.5rem]">
            <h2 className="text-h2">{queued ? "Searching for a table…" : "Ready to play"}</h2>
            {connStatus === "connecting" && (
              <p className="mt-1 text-sm text-muted-foreground">Connecting to game server…</p>
            )}
            {connStatus === "closed" && (
              <p className="mt-1 text-sm text-danger">
                Can't reach the game server — retrying…
              </p>
            )}
          </div>

          {!queued ? (
            <div className="flex w-full flex-col gap-4">
              <FormatSegmentedControl value={format} onChange={setFormat} disabled={!connected} />
              <Button
                size="lg"
                disabled={!connected}
                onClick={() => enqueue(rating, format)}
                className="w-full font-semibold shadow-glow-md hover:shadow-glow-lg"
              >
                Find Match
              </Button>
              <p className="text-xs text-muted-foreground">
                6-Max No-Limit · {activeFormat?.label ?? format}
              </p>
            </div>
          ) : (
            <div className="flex w-full flex-col items-center gap-4">
              <div className="text-stat text-4xl tabular-nums">{formatElapsed(elapsed)}</div>
              <div className="flex w-full items-center justify-center gap-6 text-sm">
                <span className="text-muted-foreground">
                  Position <span className="text-stat text-neutral-100">{state.position}</span> of{" "}
                  <span className="text-stat text-neutral-100">{state.waiting}</span>
                </span>
                <span className="text-muted-foreground">
                  Bots in <span className="text-stat text-neutral-100">~{state.etaSec}s</span>
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={leave} className="gap-1.5">
                <X className="size-4" />
                Cancel
              </Button>
            </div>
          )}

          {state.error && <p className="text-sm text-danger">{state.error}</p>}
        </div>
      </Card>

      {/* ── Stat row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="RATING" value={<CountUp value={rating} />} icon={<TrendingUp className="size-3.5" />} />
        <StatCard label="RANK" value={rankForRating(rating)} icon={<Award className="size-3.5" />} />
        <StatCard
          label="QUEUE"
          value={queued ? formatElapsed(elapsed) : "Idle"}
          icon={<Timer className="size-3.5" />}
        />
      </div>

      {/* ── Lower cards (fills the void) ─────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <RecentMatchesStrip entries={strip} loading={historyLoading} error={historyError} />
        </div>
        <RatingSparklineCard rating={rating} series={series} loading={historyLoading} />
        <TierProgressCard rating={rating} seed={auth.userId ?? "player"} />
      </div>

      <AnimatePresence>
        {ceremony && <MatchFoundOverlay key="ceremony" formatLabel={ceremonyFormatLabel} />}
      </AnimatePresence>
    </div>
  );
}
