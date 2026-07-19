import type React from "react";
import { useState } from "react";
import { motion } from "motion/react";
import { Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
import type { SessionApi } from "./useSession.js";
import Logo from "../shell/Logo.js";
import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

/** Small caps label sitting above an input. */
function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-label-caps text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

export default function AuthScreen({ auth }: { auth: SessionApi }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "up" && !USERNAME_RE.test(username.trim())) {
      setError("Username must be 3–20 letters, numbers or underscores.");
      return;
    }
    setBusy(true);
    if (mode === "in") {
      const err = await auth.signIn(email, password);
      setBusy(false);
      if (err) setError(err);
    } else {
      const { error: err, needsConfirmation } = await auth.signUp(email, password, username.trim());
      setBusy(false);
      if (err) setError(err);
      else if (needsConfirmation) setPendingConfirm(true);
      // else: a session was created; onAuthStateChange navigates away.
    }
  }

  function switchMode() {
    setMode(mode === "in" ? "up" : "in");
    setError(null);
    setPendingConfirm(false);
  }

  return (
    <div className="bg-noise bg-vignette relative flex min-h-screen items-center justify-center bg-base bg-[radial-gradient(ellipse_at_top,rgba(47,217,135,0.08),transparent_60%)] p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative z-10 w-full max-w-sm"
      >
        <Card>
          <CardHeader className="flex flex-col items-center gap-2 text-center">
            <Logo size={44} />
            <CardTitle className="font-display text-xl">
              Poker<span className="text-emerald">Elo</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingConfirm ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center gap-3 text-center"
              >
                <span className="grid size-12 place-items-center rounded-full bg-emerald-tint text-emerald">
                  <MailCheck className="size-6" />
                </span>
                <p className="font-display text-lg font-semibold text-neutral-100">
                  Check your email
                </p>
                <p className="text-sm text-muted-foreground">
                  We sent a confirmation link to{" "}
                  <span className="text-neutral-200">{email || "your inbox"}</span>. Confirm your
                  account, then sign in to play.
                </p>
                <Button
                  variant="outline"
                  className="mt-1"
                  onClick={() => {
                    setPendingConfirm(false);
                    setMode("in");
                  }}
                >
                  Back to sign in
                </Button>
              </motion.div>
            ) : (
              <>
                <form onSubmit={submit} className="flex flex-col gap-3">
                  {mode === "up" && (
                    <Field label="Username" htmlFor="auth-username">
                      <Input
                        id="auth-username"
                        type="text"
                        placeholder="e.g. river_rat"
                        value={username}
                        required
                        minLength={3}
                        maxLength={20}
                        autoComplete="username"
                        onChange={(e) => setUsername(e.target.value)}
                      />
                    </Field>
                  )}
                  <Field label="Email" htmlFor="auth-email">
                    <Input
                      id="auth-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      required
                      autoComplete="email"
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </Field>
                  <Field label="Password" htmlFor="auth-password">
                    <div className="relative">
                      <Input
                        id="auth-password"
                        type={showPw ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        required
                        minLength={6}
                        autoComplete={mode === "in" ? "current-password" : "new-password"}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        aria-label={showPw ? "Hide password" : "Show password"}
                        aria-pressed={showPw}
                        className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground transition-colors hover:text-neutral-100"
                      >
                        {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </Field>
                  <Button type="submit" disabled={busy} className="mt-1 font-semibold">
                    {busy && <Loader2 className="size-4 animate-spin" />}
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
                  onClick={switchMode}
                  className="mt-4 text-sm text-neutral-400 transition-colors hover:text-emerald"
                >
                  {mode === "in" ? "Need an account? Sign up" : "Have an account? Sign in"}
                </button>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
