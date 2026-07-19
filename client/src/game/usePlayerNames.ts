import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { displayName } from "../data/displayName.js";

export interface PlayerName {
  name: string;
  rating?: number;
}

export type PlayerNameMap = Record<string, PlayerName>;

/**
 * Resolves human player ids → { username, rating } from `profiles`. The server
 * roster carries only ids for humans, so the table would otherwise show a raw
 * id prefix. Bots are never fetched — `displayName` already renders their
 * `bot-N` label. Fetch failure degrades gracefully (map simply omits the id,
 * and callers fall back to `displayName({ id })`).
 *
 * `ids` is the full seat id list; the hook filters bots and re-queries only when
 * the set of human ids actually changes (joined+sorted key), not on every
 * snapshot.
 */
export function usePlayerNames(ids: (string | null | undefined)[]): PlayerNameMap {
  const [map, setMap] = useState<PlayerNameMap>({});
  const lastKey = useRef<string>("");

  const humanIds = Array.from(
    new Set(ids.filter((id): id is string => !!id && !id.startsWith("bot-"))),
  ).sort();
  const key = humanIds.join(",");

  useEffect(() => {
    if (key === lastKey.current || humanIds.length === 0) return;
    lastKey.current = key;
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, rating")
        .in("id", humanIds);
      if (cancelled || error || !data) return;
      setMap((prev) => {
        const next: PlayerNameMap = { ...prev };
        for (const row of data as { id: string; username: string | null; rating: number | null }[]) {
          next[row.id] = {
            name: displayName({ id: row.id, username: row.username }),
            rating: row.rating ?? undefined,
          };
        }
        return next;
      });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return map;
}
