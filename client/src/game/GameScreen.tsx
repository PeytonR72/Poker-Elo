import { useMatchSocket } from "./useMatchSocket.js";
import Table from "./Table.js";
import ActionBar from "./ActionBar.js";
import MatchClock from "./MatchClock.js";
import MatchOver from "./MatchOver.js";

export default function GameScreen({
  roomId,
  getJwt,
  ownId,
  onLeave,
}: {
  roomId: string;
  getJwt: () => string | null;
  ownId: string | null;
  onLeave: () => void;
}) {
  const { state, sendAction } = useMatchSocket(roomId, getJwt);

  if (state.result) {
    return (
      <MatchOver
        ownId={ownId}
        finishPlaceById={state.result.finishPlaceById}
        eloDeltas={state.result.eloDeltas}
        onLeave={onLeave}
      />
    );
  }

  return (
    <div style={{ padding: 16 }}>
      {state.matchInfo && state.view && (
        <MatchClock
          matchStartMs={state.matchInfo.matchStartMs}
          matchDurationMs={state.matchInfo.matchDurationMs}
          format={state.matchInfo.format}
          sb={state.view.sb}
          bb={state.view.bb}
        />
      )}
      <Table state={state} />
      {state.turn ? (
        <ActionBar mask={state.turn.mask} onAction={sendAction} />
      ) : (
        <div style={{ textAlign: "center", padding: 12, opacity: 0.7 }}>Waiting…</div>
      )}
      {state.error && <p style={{ textAlign: "center", color: "#ff6b6b" }}>{state.error}</p>}
    </div>
  );
}
