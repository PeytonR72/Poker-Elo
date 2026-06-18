import { jwtVerify } from "jose";

export type AuthPayload = { sub: string };

export async function verifyJwt(
  token: string,
  secret: string
): Promise<AuthPayload> {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
  if (typeof payload.sub !== "string") throw new Error("JWT missing sub");
  return { sub: payload.sub };
}

// Dev-mode bypass: accept this literal token in non-production envs.
// Format: "dev:<userId>" — e.g. "dev:player-1"
export function parseDevToken(token: string): AuthPayload | null {
  if (!token.startsWith("dev:")) return null;
  const sub = token.slice(4);
  if (!sub) return null;
  return { sub };
}
