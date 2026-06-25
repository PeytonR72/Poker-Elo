export default function MatchOver({
  ownId,
  finishPlaceById,
  eloDeltas,
  onLeave,
}: {
  ownId: string | null;
  finishPlaceById: Record<string, number>;
  eloDeltas: Record<string, number>;
  onLeave: () => void;
}) {
  const rows = Object.entries(finishPlaceById).sort((a, b) => a[1] - b[1]);
  return (
    <div style={{ maxWidth: 420, margin: "10vh auto", padding: 24, background: "#16203a", borderRadius: 12 }}>
      <h2 style={{ textAlign: "center" }}>Match Over</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th align="left">#</th><th align="left">Player</th><th align="right">ELO</th></tr></thead>
        <tbody>
          {rows.map(([id, place]) => {
            const d = eloDeltas[id] ?? 0;
            return (
              <tr key={id} style={{ fontWeight: id === ownId ? 700 : 400 }}>
                <td>{place}</td>
                <td>{id.startsWith("bot-") ? `🤖 ${id}` : id.slice(0, 8)}{id === ownId ? " (you)" : ""}</td>
                <td align="right" style={{ color: d >= 0 ? "#5dd39e" : "#ff6b6b" }}>{d >= 0 ? `+${d}` : d}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button onClick={onLeave} style={{ marginTop: 16, padding: "10px 16px", width: "100%" }}>
        Back to Lobby
      </button>
    </div>
  );
}
