import { jwtVerify, decodeProtectedHeader, createRemoteJWKSet } from "jose";
import type { JWTVerifyGetKey } from "jose";

export type AuthPayload = { sub: string };

export interface VerifyJwtConfig {
  /** Legacy shared HS256 secret (older Supabase projects). */
  secret?: string;
  /** Supabase project URL, used to fetch the JWKS for newer asymmetric (ES256) signing keys. */
  supabaseUrl?: string;
  /** Key resolver used in preference to fetching supabaseUrl's JWKS, e.g. for offline tests. */
  jwks?: JWTVerifyGetKey;
}

const jwksCache = new Map<string, JWTVerifyGetKey>();

function getJwks(supabaseUrl: string): JWTVerifyGetKey {
  let jwks = jwksCache.get(supabaseUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
    jwksCache.set(supabaseUrl, jwks);
  }
  return jwks;
}

/**
 * Supabase projects sign JWTs with either the legacy shared HS256 secret or,
 * on newer projects, an asymmetric key (ES256) verified via the project's
 * published JWKS — the token's own header says which. Dispatch on that
 * rather than assuming one scheme, since both are seen in the wild.
 */
export async function verifyJwt(
  token: string,
  config: VerifyJwtConfig
): Promise<AuthPayload> {
  const { alg } = decodeProtectedHeader(token);
  let payload: Record<string, unknown>;
  if (alg === "HS256") {
    if (!config.secret) throw new Error("HS256 token received but no shared secret is configured");
    const key = new TextEncoder().encode(config.secret);
    ({ payload } = await jwtVerify(token, key, { algorithms: ["HS256"] }));
  } else {
    let jwks = config.jwks;
    if (!jwks) {
      if (!config.supabaseUrl) {
        throw new Error(`${alg ?? "unknown"}-signed token received but no supabaseUrl is configured for JWKS verification`);
      }
      jwks = getJwks(config.supabaseUrl);
    }
    ({ payload } = await jwtVerify(token, jwks, {
      algorithms: alg ? [alg] : undefined,
    }));
  }
  if (typeof payload["sub"] !== "string") throw new Error("JWT missing sub");
  return { sub: payload["sub"] };
}

// Dev-mode bypass: accept this literal token in non-production envs.
// Format: "dev:<userId>" — e.g. "dev:player-1"
export function parseDevToken(token: string): AuthPayload | null {
  if (!token.startsWith("dev:")) return null;
  const sub = token.slice(4);
  if (!sub) return null;
  return { sub };
}
