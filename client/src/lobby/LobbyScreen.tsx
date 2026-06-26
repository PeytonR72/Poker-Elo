import { useEffect } from "react";
import { MATCH_FORMATS, DEFAULT_FORMAT } from "@poker/shared";
import { useState } from "react";
import type { SessionApi } from "../auth/useSession.js";
import { useLobbySocket } from "./useLobbySocket.js";

export default function LobbyScreen({
  auth,
  rating,
  onMatchFound,
}: {
  auth: SessionApi;
  rating: number;
  onMatchFound: (roomId: string, format: string) => void;
}) {
  const { state, enqueue, leave } = useLobbySocket(auth.getJwt);
  const [format, setFormat] = useState<string>(DEFAULT_FORMAT);

  useEffect(() => {
    if (state.status === "matched" && state.match) {
      onMatchFound(state.match.roomId, state.match.format);
    }
  }, [state.status, state.match, onMatchFound]);

  return (
    <div>
      {state.status !== "queued" ? (
        <>
          <label style={{ display: "block", margin: "12px 0" }}>
            Format:{" "}
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              {Object.values(MATCH_FORMATS).map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </label>
          <button onClick={() => enqueue(rating, format)}
            style={{ padding: "10px 20px", background: "#2d7d46", color: "white", border: 0, borderRadius: 6 }}>
            Find Match
          </button>
        </>
      ) : (
        <div>
          <p>In queue — position {state.position} of {state.waiting}.</p>
          <p>Filling with bots in ~{state.etaSec}s if no humans join.</p>
          <button onClick={leave} style={{ padding: "8px 16px" }}>Cancel</button>
        </div>
      )}
      {state.error && <p style={{ color: "#ff6b6b" }}>{state.error}</p>}
    </div>
  );
}
