import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import type { ArenaMatchRow } from "../data/arenaHistory.js";

export interface ArenaHistoryFetch {
  loading: boolean;
  error: string | null;
  /** newest-first match results for the current player (up to LIMIT) */
  results: ArenaMatchRow[];
}

// Enough rows to feed both the 5-card strip and the ~12-point sparkline.
const LIMIT = 20;

/**
 * Fetches the player's most recent `match_results` joined with `matches`,
 * mirroring the query shape in `profile/useProfile.ts` (which this must not
 * touch). Supabase I/O lives here; the pure shapers in `data/arenaHistory.ts`
 * turn these rows into view models.
 */
export function useArenaHistory(playerId: string | null): ArenaHistoryFetch {
  const [state, setState] = useState<ArenaHistoryFetch>({
    loading: true,
    error: null,
    results: [],
  });

  useEffect(() => {
    if (!playerId) {
      setState({ loading: false, error: null, results: [] });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    async function load() {
      const { data, error } = await supabase
        .from("match_results")
        .select("match_id, finish_place, elo_delta, rating_after, matches(format, ended_at)")
        .eq("player_id", playerId)
        .order("ended_at", { ascending: false, referencedTable: "matches" })
        .limit(LIMIT);
      if (cancelled) return;
      if (error) {
        setState({ loading: false, error: error.message, results: [] });
        return;
      }
      setState({
        loading: false,
        error: null,
        results: (data ?? []) as unknown as ArenaMatchRow[],
      });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  return state;
}
