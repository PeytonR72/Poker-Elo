import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import type { ProfileRow } from "../data/leaderboard.js";
import type { MatchResultRow } from "../data/profile.js";

export interface ProfileFetch {
  loading: boolean;
  error: string | null;
  profile: ProfileRow | null;
  results: MatchResultRow[];
}

export function useProfile(playerId: string | null): ProfileFetch {
  const [state, setState] = useState<ProfileFetch>({
    loading: true, error: null, profile: null, results: [],
  });

  useEffect(() => {
    if (!playerId) {
      setState({ loading: false, error: null, profile: null, results: [] });
      return;
    }
    let cancelled = false;
    async function load() {
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id, username, rating, games_played")
        .eq("id", playerId)
        .single();
      if (cancelled) return;
      if (profErr) {
        setState({ loading: false, error: profErr.message, profile: null, results: [] });
        return;
      }

      const { data: res, error: resErr } = await supabase
        .from("match_results")
        .select("match_id, finish_place, elo_delta, rating_after, matches(format, ended_at)")
        .eq("player_id", playerId)
        .order("ended_at", { ascending: false, referencedTable: "matches" });
      if (cancelled) return;
      if (resErr) {
        setState({ loading: false, error: resErr.message, profile: prof as ProfileRow, results: [] });
        return;
      }
      setState({
        loading: false,
        error: null,
        profile: prof as ProfileRow,
        results: (res ?? []) as unknown as MatchResultRow[],
      });
    }
    void load();
    return () => { cancelled = true; };
  }, [playerId]);

  return state;
}
