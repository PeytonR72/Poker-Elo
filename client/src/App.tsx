import { useState } from "react";
import { useSession } from "./auth/useSession.js";
import AuthScreen from "./auth/AuthScreen.js";
import Home from "./home/Home.js";
import GameScreen from "./game/GameScreen.js";

export default function App() {
  const auth = useSession();
  const [match, setMatch] = useState<{ roomId: string; format: string } | null>(null);
  const [ratingRefreshKey, setRatingRefreshKey] = useState(0);

  if (auth.loading) return <div className="grid h-screen place-items-center bg-base p-6 text-neutral-400">Loading…</div>;
  if (!auth.session) return <AuthScreen auth={auth} />;

  if (match) {
    return (
      <GameScreen
        roomId={match.roomId}
        getJwt={auth.getJwt}
        ownId={auth.userId}
        onLeave={() => {
          setMatch(null);
          setRatingRefreshKey((k) => k + 1);
        }}
      />
    );
  }

  return <Home auth={auth} onMatchFound={(roomId, format) => setMatch({ roomId, format })} ratingRefreshKey={ratingRefreshKey} />;
}
