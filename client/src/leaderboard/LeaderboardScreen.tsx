import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Search, Trophy, Lock } from "lucide-react";
import { buildLeaderboard, type LeaderboardEntry } from "../data/leaderboard.js";
import { filterEntries } from "./filterEntries.js";
import { useLeaderboard } from "./useLeaderboard.js";
import RankMedallion from "./RankMedallion.js";
import { TierAvatar } from "../components/tier-avatar.js";
import { Input } from "../components/ui/input.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table.js";
import { SpadeWatermark, DotGrid, EmptyLeaderboard, GenericError } from "../assets/decor/index.js";
import { rankForRating } from "@poker/shared";

// Tier name → accent class for the tier badge.
const TIER_CLASS: Record<string, string> = {
  Fish: "text-neutral-400",
  Limper: "text-sky-400",
  Grinder: "text-emerald",
  Shark: "text-gold",
  "Semi-Pro": "text-purple-400",
  "Final Tablist": "text-danger",
};

function winRateLabel(winRate: number | null): string {
  return winRate == null ? "—" : `${Math.round(winRate * 100)}%`;
}

function TierBadge({ rating }: { rating: number }) {
  const tier = rankForRating(rating);
  return (
    <Badge variant="secondary" className={`${TIER_CLASS[tier] ?? ""} bg-surface-2`}>
      {tier}
    </Badge>
  );
}

function Cells({ e }: { e: LeaderboardEntry }) {
  return (
    <>
      <TableCell className="w-12 text-center">
        <RankMedallion position={e.position} />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <TierAvatar seed={e.id} rating={e.rating} name={e.name} size={34} />
          <span className={`truncate ${e.isOwn ? "font-semibold text-neutral-50" : ""}`}>
            {e.name}
            {e.isOwn ? " (you)" : ""}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-stat text-right text-neutral-100">{e.rating}</TableCell>
      <TableCell className="hidden text-stat text-right text-muted-foreground sm:table-cell">
        {e.gamesPlayed}
      </TableCell>
      <TableCell className="hidden text-stat text-right text-muted-foreground sm:table-cell">
        {winRateLabel(e.winRate)}
      </TableCell>
      <TableCell className="text-right">
        <TierBadge rating={e.rating} />
      </TableCell>
    </>
  );
}

function Row({
  e,
  index,
  onOpenProfile,
}: {
  e: LeaderboardEntry;
  index: number;
  onOpenProfile: (id: string) => void;
}) {
  return (
    <motion.tr
      className={`cursor-pointer border-b border-edge transition-colors hover:bg-emerald-tint ${
        e.isOwn ? "bg-emerald/10" : ""
      }`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.025, 0.5) }}
      onClick={() => onOpenProfile(e.id)}
    >
      <Cells e={e} />
    </motion.tr>
  );
}

const HEAD_CLASS = "text-label-caps text-muted-foreground";

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="relative flex min-h-64 flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-edge bg-surface p-10 text-center">
      <DotGrid />
      <Lock className="relative size-6 text-muted-foreground" />
      <p className="relative font-display text-lg font-semibold text-neutral-100">{title}</p>
      <p className="relative max-w-xs text-sm text-muted-foreground">
        Friends and weekly boards are on the way. For now, climb the global ladder.
      </p>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-md px-2 py-2">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onFindMatch }: { onFindMatch?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-14 text-center">
      <EmptyLeaderboard size={128} />
      <p className="max-w-sm text-sm text-muted-foreground">
        No ranked players yet. Play a match to claim the first spot on the board.
      </p>
      {/* TODO(shell): Home.tsx should pass onFindMatch={() => setTab("play")} to
          LeaderboardScreen so this CTA switches tabs. Renders regardless; no-op safe. */}
      <Button onClick={() => onFindMatch?.()} className="gap-2">
        <Trophy className="size-4" />
        Find a Match
      </Button>
    </div>
  );
}

function GlobalBoard({
  ownId,
  onOpenProfile,
  onFindMatch,
}: {
  ownId: string | null;
  onOpenProfile: (id: string) => void;
  onFindMatch?: () => void;
}) {
  const { loading, error, rows, ownRow, ownPosition, winsById, refetch } = useLeaderboard(ownId);
  const [query, setQuery] = useState("");

  const { entries, ownTail } = useMemo(
    () => buildLeaderboard(rows, ownRow, ownPosition, ownId, winsById),
    [rows, ownRow, ownPosition, ownId, winsById],
  );
  const filtered = useMemo(() => filterEntries(entries, query), [entries, query]);

  if (loading) return <LoadingRows />;

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-14 text-center">
        <GenericError size={112} />
        <p className="max-w-sm text-sm text-muted-foreground">
          Couldn&apos;t load the leaderboard: {error}
        </p>
        <Button variant="outline" onClick={refetch}>
          Try again
        </Button>
      </div>
    );
  }

  if (entries.length === 0) return <EmptyState onFindMatch={onFindMatch} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players…"
          className="pl-9"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-edge bg-surface">
        <Table>
          <TableHeader>
            <TableRow className="border-edge hover:bg-transparent">
              <TableHead className={`sticky top-0 z-10 bg-surface text-center ${HEAD_CLASS}`}>
                #
              </TableHead>
              <TableHead className={`sticky top-0 z-10 bg-surface ${HEAD_CLASS}`}>PLAYER</TableHead>
              <TableHead className={`sticky top-0 z-10 bg-surface text-right ${HEAD_CLASS}`}>
                RATING
              </TableHead>
              <TableHead
                className={`sticky top-0 z-10 hidden bg-surface text-right sm:table-cell ${HEAD_CLASS}`}
              >
                GAMES
              </TableHead>
              <TableHead
                className={`sticky top-0 z-10 hidden bg-surface text-right sm:table-cell ${HEAD_CLASS}`}
              >
                WIN %
              </TableHead>
              <TableHead className={`sticky top-0 z-10 bg-surface text-right ${HEAD_CLASS}`}>
                TIER
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((e, i) => (
              <Row key={e.id} e={e} index={i} onOpenProfile={onOpenProfile} />
            ))}
            {filtered.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No players match “{query}”.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Own row pinned as a distinct bottom bar when the player is off-board. */}
        {ownTail && !query.trim() && (
          <div className="sticky bottom-0 z-20 border-t border-emerald/40 bg-surface-2/95 backdrop-blur">
            <button
              type="button"
              onClick={() => onOpenProfile(ownTail.id)}
              className="grid w-full grid-cols-[3rem_1fr_auto] items-center gap-2.5 px-2 py-2.5 text-left text-sm hover:bg-emerald-tint sm:grid-cols-[3rem_1fr_auto_auto_auto_auto]"
            >
              <span className="text-center text-stat text-muted-foreground">{ownTail.position}</span>
              <span className="flex items-center gap-2.5">
                <TierAvatar seed={ownTail.id} rating={ownTail.rating} name={ownTail.name} size={30} />
                <span className="truncate font-semibold text-neutral-50">{ownTail.name} (you)</span>
              </span>
              <span className="text-stat text-right text-neutral-100">{ownTail.rating}</span>
              <span className="hidden text-stat text-right text-muted-foreground sm:block">
                {ownTail.gamesPlayed}
              </span>
              <span className="hidden text-stat text-right text-muted-foreground sm:block">
                {winRateLabel(ownTail.winRate)}
              </span>
              <span className="hidden justify-self-end sm:block">
                <TierBadge rating={ownTail.rating} />
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LeaderboardScreen({
  ownId,
  onOpenProfile,
  onFindMatch,
}: {
  ownId: string | null;
  onOpenProfile: (id: string) => void;
  /** Navigate to the Play tab from the empty-state CTA. Wired by the shell. */
  onFindMatch?: () => void;
}) {
  return (
    <div className="bg-noise relative flex flex-col gap-6">
      <SpadeWatermark
        size={340}
        className="pointer-events-none absolute -top-10 right-0 -z-0"
        opacity={0.05}
      />

      <div className="relative">
        <h1 className="text-h1">Leaderboard</h1>
        <p className="text-sm text-muted-foreground">The highest-rated players in the arena.</p>
      </div>

      <Tabs defaultValue="global" className="relative gap-5">
        <TabsList className="w-full max-w-md">
          <TabsTrigger value="global">Global</TabsTrigger>
          <TabsTrigger value="friends">Friends</TabsTrigger>
          <TabsTrigger value="week">This Week</TabsTrigger>
        </TabsList>

        <TabsContent value="global">
          <GlobalBoard ownId={ownId} onOpenProfile={onOpenProfile} onFindMatch={onFindMatch} />
        </TabsContent>
        <TabsContent value="friends">
          <ComingSoon title="Friends leaderboard" />
        </TabsContent>
        <TabsContent value="week">
          <ComingSoon title="This week's board" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
