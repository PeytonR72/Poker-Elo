import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowLeft,
  ChevronDown,
  Star,
  Gamepad2,
  Trophy,
  Percent,
  Flame,
  Target,
} from "lucide-react";
import { buildProfile, type ProfileHistoryEntry } from "../data/profile.js";
import { sparklineGeometry } from "./sparkline.js";
import { useProfile } from "./useProfile.js";
import TierLadder from "./TierLadderBar.js";
import { TierAvatar } from "../components/tier-avatar.js";
import CountUp from "../components/count-up.js";
import StatCard from "../components/stat-card.js";
import { Button } from "../components/ui/button.js";
import { Badge } from "../components/ui/badge.js";
import { Skeleton } from "../components/ui/skeleton.js";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip.js";
import { SpadeWatermark, NoMatches, GenericError } from "../assets/decor/index.js";
import { TABLE_SIZE, RANK_TIERS, rankForRating } from "@poker/shared";

const TIER_LADDER_TEXT = RANK_TIERS.map((t) => t.name).join(" → ");

function RatingSparkline({ values }: { values: number[] }) {
  const geo = sparklineGeometry(values, 132, 40, 3);
  if (!geo) return null;
  const rising = values[values.length - 1]! >= values[0]!;
  const stroke = rising ? "var(--color-emerald)" : "var(--color-danger)";
  return (
    <svg
      viewBox={`0 0 ${geo.width} ${geo.height}`}
      width={geo.width}
      height={geo.height}
      aria-hidden="true"
      className="block"
    >
      <polygon points={geo.areaPoints} fill={stroke} fillOpacity={0.1} />
      <polyline
        points={geo.points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={geo.last.x} cy={geo.last.y} r={2.4} fill={stroke} />
    </svg>
  );
}

function ResultChip({ place }: { place: number }) {
  const win = place === 1;
  return (
    <span
      className={`inline-grid size-8 shrink-0 place-items-center rounded-md font-display text-sm font-bold ${
        win ? "bg-emerald/15 text-emerald" : "bg-danger/15 text-danger"
      }`}
    >
      {win ? "W" : "L"}
    </span>
  );
}

function MatchRow({ h, index }: { h: ProfileHistoryEntry; index: number }) {
  const [open, setOpen] = useState(false);
  const positive = h.eloDelta >= 0;
  const deltaText = positive ? `▲ ${h.eloDelta}` : `▼ ${Math.abs(h.eloDelta)}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.5) }}
      className="border-b border-edge last:border-0"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-emerald-tint"
      >
        <div className="flex min-w-0 items-center gap-3">
          <ResultChip place={h.finishPlace} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm text-neutral-100">
              {h.formatLabel} · {h.finishPlace} / {TABLE_SIZE}
            </span>
            <span className="text-xs text-muted-foreground">
              {h.date ? new Date(h.date).toLocaleDateString() : "—"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className={`text-stat text-sm ${positive ? "text-emerald" : "text-danger"}`}>
              {deltaText}
            </span>
            <span className="text-stat text-xs text-muted-foreground">{h.ratingAfter}</span>
          </div>
          <ChevronDown
            className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>
      {open && (
        <motion.dl
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="grid grid-cols-2 gap-x-6 gap-y-2 overflow-hidden px-4 pb-4 text-sm sm:grid-cols-4"
        >
          <Detail label="Placement" value={`${h.finishPlace} of ${TABLE_SIZE}`} />
          <Detail
            label="Rating Δ"
            value={deltaText}
            className={positive ? "text-emerald" : "text-danger"}
          />
          <Detail label="New rating" value={String(h.ratingAfter)} />
          <Detail label="Format" value={h.formatLabel} />
          {h.durationLabel && <Detail label="Duration" value={h.durationLabel} />}
        </motion.dl>
      )}
    </motion.div>
  );
}

function Detail({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-label-caps text-muted-foreground">{label}</dt>
      <dd className={`text-stat ${className ?? "text-neutral-100"}`}>{value}</dd>
    </div>
  );
}

export default function ProfileScreen({
  playerId,
  onBack,
}: {
  playerId: string | null;
  onBack: () => void;
}) {
  const { loading, error, profile, results, refetch } = useProfile(playerId);
  const built = useMemo(() => (profile ? buildProfile(profile, results) : null), [profile, results]);

  // Rating trajectory oldest → newest for the sparkline.
  const ratingSeries = useMemo(
    () => (built ? built.history.map((h) => h.ratingAfter).reverse() : []),
    [built],
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-16" />
        <Skeleton className="h-24 rounded-xl" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-14 text-center">
        <GenericError size={112} />
        <p className="max-w-sm text-sm text-muted-foreground">Couldn&apos;t load profile: {error}</p>
        <Button variant="outline" onClick={refetch}>
          Try again
        </Button>
      </div>
    );
  }

  if (!profile || !built) return <p className="text-sm text-muted-foreground">Profile not found.</p>;

  const { header, history } = built;
  const streakPositive = header.streak?.startsWith("W");

  return (
    <div className="bg-noise relative flex flex-col gap-6">
      <SpadeWatermark
        size={360}
        className="pointer-events-none absolute -top-12 right-0 -z-0"
        opacity={0.05}
      />

      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="w-fit gap-1 text-muted-foreground"
      >
        <ArrowLeft className="size-4" />
        Back
      </Button>

      {/* Header */}
      <div className="relative flex flex-wrap items-center gap-5">
        <TierAvatar seed={header.id} rating={header.rating} name={header.name} size={96} />
        <div className="flex flex-col gap-2">
          <h1 className="text-h1">{header.name}</h1>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-stat text-2xl text-neutral-50">
              <CountUp value={header.rating} />
            </span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="cursor-help bg-surface-2 text-emerald">
                    {rankForRating(header.rating)}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {TIER_LADDER_TEXT} — climb by winning rated matches.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {ratingSeries.length >= 2 && (
            <div className="flex items-center gap-2">
              <RatingSparkline values={ratingSeries} />
              <span className="text-label-caps text-muted-foreground">
                last {ratingSeries.length}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="relative grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="RATING" value={<CountUp value={header.rating} />} icon={<Star className="size-3.5" />} />
        <StatCard label="GAMES" value={header.gamesPlayed} icon={<Gamepad2 className="size-3.5" />} />
        <StatCard label="WINS" value={header.firstPlaceCount} icon={<Trophy className="size-3.5" />} />
        <StatCard
          label="WIN RATE"
          value={header.winRate != null ? `${Math.round(header.winRate * 100)}%` : "—"}
          icon={<Percent className="size-3.5" />}
        />
        <StatCard
          label="STREAK"
          value={
            header.streak ? (
              <span className={streakPositive ? "text-emerald" : "text-danger"}>{header.streak}</span>
            ) : (
              "—"
            )
          }
          icon={<Flame className="size-3.5" />}
        />
        <StatCard
          label="BEST FINISH"
          value={header.bestFinish != null ? `#${header.bestFinish}` : "—"}
          icon={<Target className="size-3.5" />}
        />
      </div>

      {/* Tier ladder */}
      <div className="relative">
        <TierLadder rating={header.rating} />
      </div>

      {/* Recent activity */}
      <div className="relative flex flex-col gap-3">
        <h2 className="text-h2">Recent Activity</h2>
        {history.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-edge bg-surface py-12 text-center">
            <NoMatches size={112} />
            <p className="max-w-xs text-sm text-muted-foreground">
              No matches played yet. Jump into the arena to start building a record.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-edge bg-surface">
            {history.map((h, i) => (
              <MatchRow key={h.matchId} h={h} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
