import { useEffect, useState } from "react";
import { ELO_DEFAULT_RATING } from "@poker/shared";
import { supabase } from "../lib/supabase.js";
import type { SessionApi } from "../auth/useSession.js";
import AppShell, { type ShellTab } from "../shell/AppShell.js";
import LobbyScreen from "../lobby/LobbyScreen.js";
import LeaderboardScreen from "../leaderboard/LeaderboardScreen.js";
import ProfileScreen from "../profile/ProfileScreen.js";

type Tab = ShellTab;

export default function Home({
  auth,
  onMatchFound,
  ratingRefreshKey,
}: {
  auth: SessionApi;
  onMatchFound: (roomId: string, format: string) => void;
  ratingRefreshKey: number;
}) {
  const [tab, setTab] = useState<Tab>("play");
  const [rating, setRating] = useState<number>(ELO_DEFAULT_RATING);
  const [username, setUsername] = useState<string>("");
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileFromTab, setProfileFromTab] = useState<Tab>("play");

  useEffect(() => {
    if (!auth.userId) return;
    setRatingError(null);
    const timer = setTimeout(() => {
      supabase
        .from("profiles")
        .select("rating, username")
        .eq("id", auth.userId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) {
            setRatingError(error.message);
          } else {
            // No row yet (account predates profile provisioning) → default rating.
            setRatingError(null);
            setRating(data && typeof data.rating === "number" ? data.rating : ELO_DEFAULT_RATING);
            setUsername(data && typeof data.username === "string" ? data.username : "");
          }
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [auth.userId, ratingRefreshKey]);

  function openProfile(id: string) {
    setProfileFromTab(tab);
    setProfileId(id);
    setTab("profile");
  }

  return (
    <AppShell
      tab={tab}
      onTabChange={(t) => {
        setTab(t);
        if (t === "profile") setProfileId(null);
      }}
      onFindMatch={() => setTab("play")}
      rating={rating}
      username={username}
      userId={auth.userId ?? ""}
      onSignOut={() => void auth.signOut()}
    >
      {ratingError && <p className="mb-4 text-sm text-danger">{ratingError}</p>}
      {tab === "play" && <LobbyScreen auth={auth} rating={rating} onMatchFound={onMatchFound} />}
      {tab === "leaderboard" && <LeaderboardScreen ownId={auth.userId} onOpenProfile={openProfile} />}
      {tab === "profile" && <ProfileScreen playerId={profileId ?? auth.userId} onBack={() => setTab(profileFromTab)} />}
    </AppShell>
  );
}
