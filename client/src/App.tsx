import { useState } from "react";
import { useSession } from "./auth/useSession.js";
import AuthScreen from "./auth/AuthScreen.js";
import LobbyScreen from "./lobby/LobbyScreen.js";
import GameScreen from "./game/GameScreen.js";

export default function App() {
  const auth = useSession();
  const [match, setMatch] = useState<{ roomId: string; format: string } | null>(null);

  if (auth.loading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (!auth.session) return <AuthScreen auth={auth} />;

  if (match) {
    return (
      <GameScreen
        roomId={match.roomId}
        getJwt={auth.getJwt}
        ownId={auth.userId}
        onLeave={() => setMatch(null)}
      />
    );
  }

  return (
    <LobbyScreen
      auth={auth}
      onMatchFound={(roomId, format) => setMatch({ roomId, format })}
    />
  );
}
