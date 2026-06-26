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
}: {
  auth: SessionApi;
  onMatchFound: (roomId: string, format: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("play");
  const [rating, setRating] = useState<number>(ELO_DEFAULT_RATING);
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.userId) return;
    supabase
      .from("profiles")
      .select("rating")
      .eq("id", auth.userId)
      .single()
      .then(({ data }) => {
        if (data && typeof data.rating === "number") setRating(data.rating);
      });
  }, [auth.userId]);

  function openProfile(id: string) {
    setProfileId(id);
    setTab("profile");
  }

  return (
    <div style={{ maxWidth: 560, margin: "6vh auto", padding: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>PokerElo</h1>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <RatingBadge rating={rating} />
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
      {tab === "profile" && <ProfileScreen playerId={profileId ?? auth.userId} onBack={() => setTab("leaderboard")} />}
    </div>
  );
}
