import type React from "react";
import { useState } from "react";
import { motion } from "motion/react";
import type { SessionApi } from "./useSession.js";
import Logo from "../shell/Logo.js";
import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

export default function AuthScreen({ auth }: { auth: SessionApi }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "up" && !USERNAME_RE.test(username.trim())) {
      setError("Username must be 3–20 letters, numbers or underscores.");
      return;
    }
    setBusy(true);
    const err =
      mode === "in"
        ? await auth.signIn(email, password)
        : await auth.signUp(email, password, username.trim());
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-base bg-[radial-gradient(ellipse_at_top,rgba(47,217,135,0.08),transparent_60%)] p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-sm"
      >
        <Card>
          <CardHeader className="flex flex-col items-center gap-2 text-center">
            <Logo size={44} />
            <CardTitle className="text-xl">
              Poker<span className="text-emerald">Elo</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="flex flex-col gap-3">
              {mode === "up" && (
                <Input
                  type="text"
                  placeholder="username"
                  value={username}
                  required
                  minLength={3}
                  maxLength={20}
                  onChange={(e) => setUsername(e.target.value)}
                />
              )}
              <Input
                type="email"
                placeholder="email"
                value={email}
                required
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                type="password"
                placeholder="password"
                value={password}
                required
                minLength={6}
                autoComplete={mode === "in" ? "current-password" : "new-password"}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button type="submit" disabled={busy} className="font-semibold">
                {mode === "in" ? "Sign in" : "Create account"}
              </Button>
            </form>
            {error && (
              <motion.p
                key={error}
                animate={{ x: [0, -6, 6, -3, 3, 0] }}
                transition={{ duration: 0.4 }}
                className="mt-3 text-sm text-danger"
              >
                {error}
              </motion.p>
            )}
            <button
              onClick={() => {
                setMode(mode === "in" ? "up" : "in");
                setError(null);
              }}
              className="mt-4 text-sm text-neutral-400 hover:text-emerald"
            >
              {mode === "in" ? "Need an account? Sign up" : "Have an account? Sign in"}
            </button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
