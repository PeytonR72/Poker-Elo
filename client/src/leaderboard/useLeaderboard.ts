import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import type { ProfileRow } from "../data/leaderboard.js";

export interface LeaderboardData {
  loading: boolean;
  error: string | null;
  rows: ProfileRow[];
  ownRow: ProfileRow | null;
  ownPosition: number | null;
}

const PROFILE_COLS = "id, username, rating, games_played";

export function useLeaderboard(ownId: string | null): LeaderboardData {
  const [state, setState] = useState<LeaderboardData>({
    loading: true, error: null, rows: [], ownRow: null, ownPosition: null,
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase
        .from("profiles")
        .select(PROFILE_COLS)
        .gt("games_played", 0)
        .order("rating", { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (error) {
        setState({ loading: false, error: error.message, rows: [], ownRow: null, ownPosition: null });
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
      setState({ loading: false, error: null, rows, ownRow, ownPosition });
    }
    void load();
    return () => { cancelled = true; };
  }, [ownId]);

  return state;
}
