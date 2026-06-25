export const PARTYKIT_HOST: string = import.meta.env["VITE_PARTYKIT_HOST"] ?? "localhost:1999";
export const SUPABASE_URL: string = import.meta.env["VITE_SUPABASE_URL"] ?? "";
export const SUPABASE_ANON_KEY: string = import.meta.env["VITE_SUPABASE_ANON_KEY"] ?? "";

/** True when pointing at a local PartyKit dev server (use dev:<id> tokens). */
export function isDevHost(): boolean {
  // Anchor to the exact hostname (strip any port) so a host like
  // "localhost.evil.com" cannot pass and receive an unsigned dev:<id> token.
  const hostname = PARTYKIT_HOST.split(":")[0] ?? "";
  return hostname === "localhost" || hostname === "127.0.0.1";
}
