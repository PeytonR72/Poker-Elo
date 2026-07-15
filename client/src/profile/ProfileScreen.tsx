import { useMemo } from "react";
import { motion } from "motion/react";
import { ArrowLeft, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { buildProfile } from "../data/profile.js";
import { avatarUrl } from "../data/avatar.js";
import { useProfile } from "./useProfile.js";
import RatingBadge from "../home/RatingBadge.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { Badge } from "../components/ui/badge.js";
import { RANK_TIERS, rankForRating } from "@poker/shared";

export default function ProfileScreen({
  playerId,
  onBack,
}: {
  playerId: string | null;
  onBack: () => void;
}) {
  const { loading, error, profile, results } = useProfile(playerId);

  const built = useMemo(() => (profile ? buildProfile(profile, results) : null), [profile, results]);

  const avgFinish = useMemo(() => {
    if (!built || built.history.length === 0) return null;
    const sum = built.history.reduce((s, h) => s + h.finishPlace, 0);
    return sum / built.history.length;
  }, [built]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-24 animate-pulse rounded-xl bg-surface-2" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-2" />
          ))}
        </div>
      </div>
    );
  }

  if (error) return <p className="text-sm text-danger">Couldn't load profile: {error}</p>;
  if (!profile || !built) return <p className="text-sm text-muted-foreground">Profile not found.</p>;

  const { header, history } = built;
  const isTopTier = header.tier === RANK_TIERS[RANK_TIERS.length - 1]!.name;

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="w-fit gap-1 text-muted-foreground">
        <ArrowLeft className="size-4" />
        Back
      </Button>

      <div className="flex flex-wrap items-center gap-5">
        <img
          src={avatarUrl(header.id)}
          alt=""
          width={96}
          height={96}
          className={`rounded-full border border-edge bg-surface-2 ring-2 ${
            isTopTier ? "ring-gold" : "ring-emerald"
          }`}
        />
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold">{header.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <RatingBadge rating={header.rating} />
            <Badge variant="secondary">{rankForRating(header.rating)}</Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Card className="gap-1 p-4">
          <span className="font-mono-num text-[11px] tracking-widest text-muted-foreground">RATING</span>
          <span className="font-mono-num text-2xl">{header.rating}</span>
        </Card>
        <Card className="gap-1 p-4">
          <span className="font-mono-num text-[11px] tracking-widest text-muted-foreground">GAMES</span>
          <span className="font-mono-num text-2xl">{header.gamesPlayed}</span>
        </Card>
        <Card className="gap-1 p-4">
          <span className="font-mono-num text-[11px] tracking-widest text-muted-foreground">WINS</span>
          <span className="font-mono-num text-2xl">{header.firstPlaceCount}</span>
        </Card>
        <Card className="gap-1 p-4">
          <span className="font-mono-num text-[11px] tracking-widest text-muted-foreground">
            BEST FINISH
          </span>
          <span className="font-mono-num text-2xl">
            {header.bestFinish != null ? `#${header.bestFinish}` : "—"}
          </span>
        </Card>
        <Card className="gap-1 p-4">
          <span className="font-mono-num text-[11px] tracking-widest text-muted-foreground">
            AVG FINISH
          </span>
          <span className="font-mono-num text-2xl">{avgFinish != null ? avgFinish.toFixed(1) : "—"}</span>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Recent Activity</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No matches played yet.</p>
        ) : (
          <Card className="gap-0 divide-y divide-edge p-0">
            {history.map((h, i) => {
              const positive = h.eloDelta >= 0;
              return (
                <motion.div
                  key={h.matchId}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.6) }}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    {positive ? (
                      <ArrowUpRight className="size-4 text-emerald" />
                    ) : (
                      <ArrowDownRight className="size-4 text-danger" />
                    )}
                    <div className="flex flex-col">
                      <span className="text-sm">
                        {h.formatLabel} · Finish #{h.finishPlace}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {h.date ? new Date(h.date).toLocaleDateString() : "—"}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={`font-mono-num text-sm ${positive ? "text-emerald" : "text-danger"}`}>
                      {positive ? `+${h.eloDelta}` : `−${Math.abs(h.eloDelta)}`}
                    </span>
                    <span className="font-mono-num text-xs text-muted-foreground">{h.ratingAfter}</span>
                  </div>
                </motion.div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
