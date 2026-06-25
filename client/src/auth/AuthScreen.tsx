import type React from "react";
import { useState } from "react";
import type { SessionApi } from "./useSession.js";

export default function AuthScreen({ auth }: { auth: SessionApi }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = mode === "in" ? await auth.signIn(email, password) : await auth.signUp(email, password);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <div style={{ maxWidth: 360, margin: "10vh auto", padding: 24 }}>
      <h1 style={{ textAlign: "center" }}>PokerElo</h1>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input type="email" placeholder="email" value={email} required
          onChange={(e) => setEmail(e.target.value)} style={{ padding: 10 }} />
        <input type="password" placeholder="password" value={password} required minLength={6}
          onChange={(e) => setPassword(e.target.value)} style={{ padding: 10 }} />
        <button type="submit" disabled={busy} style={{ padding: 10, background: "#2d7d46", color: "white", border: 0, borderRadius: 6 }}>
          {mode === "in" ? "Sign in" : "Create account"}
        </button>
      </form>
      {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}
      <button onClick={() => setMode(mode === "in" ? "up" : "in")}
        style={{ marginTop: 12, background: "none", border: 0, color: "#7aa2f7" }}>
        {mode === "in" ? "Need an account? Sign up" : "Have an account? Sign in"}
      </button>
    </div>
  );
}
