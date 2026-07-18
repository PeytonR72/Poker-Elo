import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import type { ProfileRow } from "../data/leaderboard.js";

export interface LeaderboardData {
  loading: boolean;
  error: string | null;
  rows: ProfileRow[];
  ownRow: ProfileRow | null;
  ownPosition: number | null;
  /** First-place finish counts keyed by player id, for the loaded ids. */
  winsById: Record<string, number>;
  /** Re-run the fetch (used by the error-state retry button). */
  refetch: () => void;
}

const PROFILE_COLS = "id, username, rating, games_played";

const EMPTY: Omit<LeaderboardData, "refetch"> = {
  loading: true, error: null, rows: [], ownRow: null, ownPosition: null, winsById: {},
};

/** Count 1st-place finishes per player for the given ids (one row per win). */
async function fetchWins(ids: string[]): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  const { data } = await supabase
    .from("match_results")
    .select("player_id")
    .eq("finish_place", 1)
    .in("player_id", ids);
  const wins: Record<string, number> = {};
  for (const r of (data ?? []) as { player_id: string }[]) {
    wins[r.player_id] = (wins[r.player_id] ?? 0) + 1;
  }
  return wins;
}

export function useLeaderboard(ownId: string | null): LeaderboardData {
  const [state, setState] = useState<Omit<LeaderboardData, "refetch">>(EMPTY);
  const [nonce, setNonce] = useState(0);
  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    async function load() {
      const { data, error } = await supabase
        .from("profiles")
        .select(PROFILE_COLS)
        .gt("games_played", 0)
        .order("rating", { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (error) {
        setState({ ...EMPTY, loading: false, error: error.message });
        return;
      }
      const rows = (data ?? []) as ProfileRow[];

      let ownRow: ProfileRow | null = null;
      let ownPosition: number | null = null;
      if (ownId && !rows.some((r) => r.id === ownId)) {
        const { data: own } = await supabase
          .from("profiles").select(PROFILE_COLS).eq("id", ownId).maybeSingle();
        const o = own as ProfileRow | null;
        if (o && o.games_played > 0) {
          ownRow = o;
          const { count } = await supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .gt("games_played", 0)
            .gt("rating", o.rating);
          ownPosition = (count ?? 0) + 1;
        }
      }
      if (cancelled) return;

      const ids = rows.map((r) => r.id);
      if (ownRow) ids.push(ownRow.id);
      const winsById = await fetchWins(ids);
      if (cancelled) return;

      setState({ loading: false, error: null, rows, ownRow, ownPosition, winsById });
    }
    void load();
    return () => { cancelled = true; };
  }, [ownId, nonce]);

  return { ...state, refetch };
}
