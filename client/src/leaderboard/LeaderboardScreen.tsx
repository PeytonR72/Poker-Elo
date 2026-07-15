import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Search } from "lucide-react";
import { buildLeaderboard, type LeaderboardEntry } from "../data/leaderboard.js";
import { avatarUrl } from "../data/avatar.js";
import { filterEntries } from "./filterEntries.js";
import { useLeaderboard } from "./useLeaderboard.js";
import RatingBadge from "../home/RatingBadge.js";
import { Input } from "../components/ui/input.js";
import { Badge } from "../components/ui/badge.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table.js";
import { rankForRating } from "@poker/shared";

const RANK_COLOR: Record<number, string> = {
  1: "text-gold",
  2: "text-neutral-300",
  3: "text-[#c88a4b]",
};

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
      className={`cursor-pointer border-b border-edge transition-colors hover:bg-surface-2 ${
        e.isOwn ? "bg-emerald/10" : ""
      }`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.6) }}
      onClick={() => onOpenProfile(e.id)}
    >
      <TableCell className={`font-mono-num ${RANK_COLOR[e.position] ?? "text-muted-foreground"}`}>
        {e.position}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <img
            src={avatarUrl(e.id)}
            alt=""
            width={32}
            height={32}
            className="rounded-full border border-edge bg-surface-2"
          />
          <span className={e.isOwn ? "font-semibold" : ""}>
            {e.name}
            {e.isOwn ? " (you)" : ""}
          </span>
        </div>
      </TableCell>
      <TableCell className="font-mono-num text-emerald">
        <RatingBadge rating={e.rating} />
      </TableCell>
      <TableCell align="right">
        <Badge variant="secondary">{rankForRating(e.rating)}</Badge>
      </TableCell>
    </motion.tr>
  );
}

export default function LeaderboardScreen({
  ownId,
  onOpenProfile,
}: {
  ownId: string | null;
  onOpenProfile: (id: string) => void;
}) {
  const { loading, error, rows, ownRow, ownPosition } = useLeaderboard(ownId);
  const [query, setQuery] = useState("");

  const { entries, ownTail } = useMemo(
    () => buildLeaderboard(rows, ownRow, ownPosition, ownId),
    [rows, ownRow, ownPosition, ownId],
  );
  const filtered = useMemo(() => filterEntries(entries, query), [entries, query]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Global Leaderboard</h1>
          <p className="text-sm text-muted-foreground">Top ranked players by Elo rating.</p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players…"
            className="pl-9"
          />
        </div>
      </div>

      {loading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-md bg-surface-2" />
          ))}
        </div>
      )}

      {!loading && error && <p className="text-sm text-danger">Couldn't load leaderboard: {error}</p>}

      {!loading && !error && entries.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No ranked players yet. Play a match to get on the board!
        </p>
      )}

      {!loading && !error && entries.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow className="border-edge hover:bg-transparent">
              <TableHead className="font-mono-num text-[11px] tracking-widest text-muted-foreground">
                RANK
              </TableHead>
              <TableHead className="font-mono-num text-[11px] tracking-widest text-muted-foreground">
                PLAYER
              </TableHead>
              <TableHead className="font-mono-num text-[11px] tracking-widest text-muted-foreground">
                RATING
              </TableHead>
              <TableHead
                align="right"
                className="font-mono-num text-[11px] tracking-widest text-muted-foreground"
              >
                TIER
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((e, i) => (
              <Row key={e.id} e={e} index={i} onOpenProfile={onOpenProfile} />
            ))}
            {ownTail && !query.trim() && (
              <>
                <TableRow className="border-edge hover:bg-transparent">
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    ⋯
                  </TableCell>
                </TableRow>
                <Row e={ownTail} index={filtered.length} onOpenProfile={onOpenProfile} />
              </>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
