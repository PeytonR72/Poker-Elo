import { buildLeaderboard, type LeaderboardEntry } from "../data/leaderboard.js";
import { useLeaderboard } from "./useLeaderboard.js";
import RatingBadge from "../home/RatingBadge.js";

function Row({ e, onOpenProfile }: { e: LeaderboardEntry; onOpenProfile: (id: string) => void }) {
  return (
    <tr
      onClick={() => onOpenProfile(e.id)}
      style={{ cursor: "pointer", fontWeight: e.isOwn ? 700 : 400, background: e.isOwn ? "#1b2540" : "transparent" }}
    >
      <td style={{ padding: "6px 8px" }}>{e.position}</td>
      <td style={{ padding: "6px 8px" }}>{e.name}{e.isOwn ? " (you)" : ""}</td>
      <td style={{ padding: "6px 8px" }}><RatingBadge rating={e.rating} /></td>
      <td align="right" style={{ padding: "6px 8px" }}>{e.gamesPlayed}</td>
    </tr>
  );
}

export default function LeaderboardScreen({
  ownId,
  onOpenProfile,
}: {
  ownId: string | null;
  onOpenProfile: (id: string) => void;
}) {
  const { loading, error, rows, ownRow, ownPosition } = useLeaderboard(ownId);

  if (loading) return <p>Loading leaderboard…</p>;
  if (error) return <p style={{ color: "#ff6b6b" }}>Couldn't load leaderboard: {error}</p>;

  const { entries, ownTail } = buildLeaderboard(rows, ownRow, ownPosition, ownId);
  if (entries.length === 0) return <p>No ranked players yet. Play a match to get on the board!</p>;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ color: "#8b92a5", textAlign: "left" }}>
          <th style={{ padding: "6px 8px" }}>#</th>
          <th style={{ padding: "6px 8px" }}>Player</th>
          <th style={{ padding: "6px 8px" }}>Rating</th>
          <th align="right" style={{ padding: "6px 8px" }}>Games</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => <Row key={e.id} e={e} onOpenProfile={onOpenProfile} />)}
        {ownTail && (
          <>
            <tr><td colSpan={4} style={{ textAlign: "center", color: "#8b92a5" }}>⋯</td></tr>
            <Row e={ownTail} onOpenProfile={onOpenProfile} />
          </>
        )}
      </tbody>
    </table>
  );
}
