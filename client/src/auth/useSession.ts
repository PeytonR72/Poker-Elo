import { useEffect, useState, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase.js";
import { isDevHost } from "../lib/env.js";

/**
 * Result of a sign-up attempt. `error` is the human-readable message (or null on
 * success). `needsConfirmation` is true when the account was created but no
 * session was returned — i.e. Supabase is waiting on email confirmation, so the
 * UI must tell the user to check their inbox rather than sit on a silent form.
 */
export interface SignUpResult {
  error: string | null;
  needsConfirmation: boolean;
}

export interface SessionApi {
  session: Session | null;
  userId: string | null;
  loading: boolean;
  getJwt: () => string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, username: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
}

export function useSession(): SessionApi {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  const getJwt = useCallback((): string | null => {
    if (!session) return null;
    // Local PartyKit dev server has no JWT secret → it accepts dev:<id> tokens.
    return isDevHost() ? `dev:${session.user.id}` : session.access_token;
  }, [session]);

  const signIn = useCallback(async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, username: string): Promise<SignUpResult> => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } },
      });
      if (error) return { error: error.message, needsConfirmation: false };
      // No session on success ⇒ email confirmation is pending (behaviour of the
      // auth call is unchanged; we only read the result to drive the UI).
      return { error: null, needsConfirmation: !data.session };
    },
    [],
  );

  const signOut = useCallback(async (): Promise<void> => {
    await supabase.auth.signOut();
  }, []);

  return { session, userId, loading, getJwt, signIn, signUp, signOut };
}
