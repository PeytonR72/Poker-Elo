import { useEffect, useState } from "react";
import { ELO_DEFAULT_RATING } from "@poker/shared";
import { supabase } from "../lib/supabase.js";
import type { SessionApi } from "../auth/useSession.js";
import RatingBadge from "./RatingBadge.js";
import LobbyScreen from "../lobby/LobbyScreen.js";
import LeaderboardScreen from "../leaderboard/LeaderboardScreen.js";
import ProfileScreen from "../profile/ProfileScreen.js";

type Tab = "play" | "leaderboard" | "profile";
const TAB_LABEL: Record<Tab, string> = { play: "Play", leaderboard: "Leaderboard", profile: "Profile" };

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
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileFromTab, setProfileFromTab] = useState<Tab>("play");

  useEffect(() => {
    if (!auth.userId) return;
    setRatingError(null);
    const timer = setTimeout(() => {
      supabase
        .from("profiles")
        .select("rating")
        .eq("id", auth.userId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) {
            setRatingError(error.message);
          } else {
            // No row yet (account predates profile provisioning) → default rating.
            setRatingError(null);
            setRating(data && typeof data.rating === "number" ? data.rating : ELO_DEFAULT_RATING);
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
    <div style={{ maxWidth: 560, margin: "6vh auto", padding: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>PokerElo</h1>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <RatingBadge rating={rating} />
          {ratingError && <span style={{ color: "#ff6b6b", fontSize: 12 }}>{ratingError}</span>}
          <button onClick={() => void auth.signOut()} style={{ background: "none", border: 0, color: "#7aa2f7" }}>
            Sign out
          </button>
        </div>
      </header>

      <nav style={{ display: "flex", gap: 4, margin: "16px 0", borderBottom: "1px solid #2a2f3a" }}>
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); if (t === "profile") setProfileId(null); }}
            style={{
              background: "none", border: 0, padding: "8px 12px",
              color: tab === t ? "#e6e6e6" : "#8b92a5",
              borderBottom: tab === t ? "2px solid #2d7d46" : "2px solid transparent",
            }}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </nav>

      {tab === "play" && <LobbyScreen auth={auth} rating={rating} onMatchFound={onMatchFound} />}
      {tab === "leaderboard" && <LeaderboardScreen ownId={auth.userId} onOpenProfile={openProfile} />}
      {tab === "profile" && <ProfileScreen playerId={profileId ?? auth.userId} onBack={() => setTab(profileFromTab)} />}
    </div>
  );
}
