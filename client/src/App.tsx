import type React from "react";
import { lazy, Suspense, useState } from "react";
import { useSession } from "./auth/useSession.js";
import AuthScreen from "./auth/AuthScreen.js";
import Home from "./home/Home.js";
import PageTransition from "./components/page-transition.js";

const GameScreen = lazy(() => import("./game/GameScreen.js"));

const loadingScreen = (
  <div className="grid h-screen place-items-center bg-base p-6 text-neutral-400">Loading…</div>
);

export default function App() {
  const auth = useSession();
  const [match, setMatch] = useState<{ roomId: string; format: string } | null>(null);
  const [ratingRefreshKey, setRatingRefreshKey] = useState(0);

  let screenKey: string;
  let screen: React.ReactNode;

  if (auth.loading) {
    screenKey = "loading";
    screen = loadingScreen;
  } else if (!auth.session) {
    screenKey = "auth";
    screen = <AuthScreen auth={auth} />;
  } else if (match) {
    screenKey = "game";
    screen = (
      <Suspense fallback={loadingScreen}>
        <GameScreen
          roomId={match.roomId}
          getJwt={auth.getJwt}
          ownId={auth.userId}
          onLeave={() => {
            setMatch(null);
            setRatingRefreshKey((k) => k + 1);
          }}
        />
      </Suspense>
    );
  } else {
    screenKey = "home";
    screen = (
      <Home auth={auth} onMatchFound={(roomId, format) => setMatch({ roomId, format })} ratingRefreshKey={ratingRefreshKey} />
    );
  }

  return <PageTransition key={screenKey}>{screen}</PageTransition>;
}
