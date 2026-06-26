import { useEffect, useState } from "react";
import { ELO_DEFAULT_RATING, rankForRating, MATCH_FORMATS, DEFAULT_FORMAT } from "@poker/shared";
import { supabase } from "../lib/supabase.js";
import type { SessionApi } from "../auth/useSession.js";
import { useLobbySocket } from "./useLobbySocket.js";

export default function LobbyScreen({
  auth,
  onMatchFound,
}: {
  auth: SessionApi;
  onMatchFound: (roomId: string, format: string) => void;
}) {
  const { state, enqueue, leave } = useLobbySocket(auth.getJwt);
  const [rating, setRating] = useState<number>(ELO_DEFAULT_RATING);
  const [format, setFormat] = useState<string>(DEFAULT_FORMAT);

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

  useEffect(() => {
    if (state.status === "matched" && state.match) {
      onMatchFound(state.match.roomId, state.match.format);
    }
  }, [state.status, state.match, onMatchFound]);

  return (
    <div style={{ maxWidth: 480, margin: "8vh auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Lobby</h1>
        <button onClick={() => void auth.signOut()} style={{ background: "none", border: 0, color: "#7aa2f7" }}>
          Sign out
        </button>
      </div>
      <p>Rating: <b>{rating}</b> — <b>{rankForRating(rating)}</b></p>

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
