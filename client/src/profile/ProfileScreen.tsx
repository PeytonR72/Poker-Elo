import { buildProfile } from "../data/profile.js";
import { useProfile } from "./useProfile.js";
import RatingBadge from "../home/RatingBadge.js";

export default function ProfileScreen({
  playerId,
  onBack,
}: {
  playerId: string | null;
  onBack: () => void;
}) {
  const { loading, error, profile, results } = useProfile(playerId);

  if (loading) return <p>Loading profile…</p>;
  if (error) return <p style={{ color: "#ff6b6b" }}>Couldn't load profile: {error}</p>;
  if (!profile) return <p>Profile not found.</p>;

  const { header, history } = buildProfile(profile, results);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{header.name}</h2>
        <RatingBadge rating={header.rating} />
      </div>
      <p style={{ color: "#8b92a5" }}>
        {header.gamesPlayed} games · {header.firstPlaceCount} wins
        {header.bestFinish != null ? ` · best finish #${header.bestFinish}` : ""}
      </p>

      <h3>Match history</h3>
      {history.length === 0 ? (
        <p style={{ color: "#8b92a5" }}>No matches played yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "#8b92a5", textAlign: "left" }}>
              <th style={{ padding: "6px 8px" }}>Date</th>
              <th style={{ padding: "6px 8px" }}>Format</th>
              <th style={{ padding: "6px 8px" }}>Finish</th>
              <th align="right" style={{ padding: "6px 8px" }}>ELO</th>
              <th align="right" style={{ padding: "6px 8px" }}>Rating</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.matchId}>
                <td style={{ padding: "6px 8px" }}>{h.date ? new Date(h.date).toLocaleDateString() : "—"}</td>
                <td style={{ padding: "6px 8px" }}>{h.formatLabel}</td>
                <td style={{ padding: "6px 8px" }}>#{h.finishPlace}</td>
                <td align="right" style={{ padding: "6px 8px", color: h.eloDelta >= 0 ? "#5dd39e" : "#ff6b6b" }}>
                  {h.eloDelta >= 0 ? `+${h.eloDelta}` : h.eloDelta}
                </td>
                <td align="right" style={{ padding: "6px 8px" }}>{h.ratingAfter}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button onClick={onBack} style={{ marginTop: 16, padding: "8px 16px" }}>Back</button>
    </div>
  );
}
