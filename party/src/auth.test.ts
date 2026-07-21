import { describe, it, expect } from "vitest";
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from "jose";
import { verifyJwt, parseDevToken } from "./auth.js";

describe("parseDevToken", () => {
  it("parses a valid dev token", () => {
    expect(parseDevToken("dev:alice")).toEqual({ sub: "alice" });
  });

  it("parses dev token with complex id", () => {
    expect(parseDevToken("dev:player-1")).toEqual({ sub: "player-1" });
  });

  it("returns null for non-dev token", () => {
    expect(parseDevToken("Bearer xyz")).toBeNull();
  });

  it("returns null for bare 'dev:' with no sub", () => {
    expect(parseDevToken("dev:")).toBeNull();
  });
});

describe("verifyJwt", () => {
  it("accepts a valid HS256 JWT signed with the correct secret", async () => {
    const secret = "test-secret";
    const key = new TextEncoder().encode(secret);
    const token = await new SignJWT({ sub: "user-123" })
      .setProtectedHeader({ alg: "HS256" })
      .sign(key);

    const payload = await verifyJwt(token, { secret });
    expect(payload).toEqual({ sub: "user-123" });
  });

  it("rejects a JWT signed with a different secret", async () => {
    const key = new TextEncoder().encode("other-secret");
    const token = await new SignJWT({ sub: "user-abc" })
      .setProtectedHeader({ alg: "HS256" })
      .sign(key);

    await expect(verifyJwt(token, { secret: "test-secret" })).rejects.toThrow();
  });

  it("rejects a JWT without a sub claim", async () => {
    const secret = "test-secret";
    const key = new TextEncoder().encode(secret);
    const token = await new SignJWT({ role: "user" })
      .setProtectedHeader({ alg: "HS256" })
      .sign(key);

    await expect(verifyJwt(token, { secret })).rejects.toThrow("JWT missing sub");
  });

  it("rejects an HS256 token when no secret is configured", async () => {
    const key = new TextEncoder().encode("some-secret");
    const token = await new SignJWT({ sub: "user-123" })
      .setProtectedHeader({ alg: "HS256" })
      .sign(key);

    await expect(verifyJwt(token, {})).rejects.toThrow("no shared secret is configured");
  });

  it("rejects a non-HS256 token when no supabaseUrl is configured", async () => {
    // Supabase's newer projects sign with ES256, verified via JWKS rather than a shared
    // secret — this is a regression test for exactly that dispatch path, without requiring
    // a live network call: an unconfigured supabaseUrl must fail fast with a clear error
    // rather than silently falling back to (or crashing inside) HS256 verification.
    const { generateKeyPair, SignJWT: SignJWTLocal } = await import("jose");
    const { privateKey } = await generateKeyPair("ES256");
    const token = await new SignJWTLocal({ sub: "user-456" })
      .setProtectedHeader({ alg: "ES256" })
      .sign(privateKey);

    await expect(verifyJwt(token, { secret: "irrelevant-for-es256" })).rejects.toThrow(
      "no supabaseUrl is configured"
    );
  });

  describe("ES256/JWKS success path (offline, injected key resolver)", () => {
    it("accepts a valid ES256 JWT verified against a local JWKS", async () => {
      const { publicKey, privateKey } = await generateKeyPair("ES256");
      const jwk = await exportJWK(publicKey);
      jwk.kid = "test-key-1";
      const jwks = createLocalJWKSet({ keys: [jwk] });

      const token = await new SignJWT({ sub: "user-789" })
        .setProtectedHeader({ alg: "ES256", kid: "test-key-1" })
        .sign(privateKey);

      const payload = await verifyJwt(token, { jwks });
      expect(payload).toEqual({ sub: "user-789" });
    });

    it("rejects an ES256 JWT signed by a different keypair", async () => {
      const { publicKey } = await generateKeyPair("ES256");
      const jwk = await exportJWK(publicKey);
      jwk.kid = "test-key-1";
      const jwks = createLocalJWKSet({ keys: [jwk] });

      const { privateKey: otherPrivateKey } = await generateKeyPair("ES256");
      const token = await new SignJWT({ sub: "user-789" })
        .setProtectedHeader({ alg: "ES256", kid: "test-key-1" })
        .sign(otherPrivateKey);

      await expect(verifyJwt(token, { jwks })).rejects.toThrow();
    });

    it("rejects a valid ES256 JWT missing the sub claim", async () => {
      const { publicKey, privateKey } = await generateKeyPair("ES256");
      const jwk = await exportJWK(publicKey);
      jwk.kid = "test-key-1";
      const jwks = createLocalJWKSet({ keys: [jwk] });

      const token = await new SignJWT({ role: "user" })
        .setProtectedHeader({ alg: "ES256", kid: "test-key-1" })
        .sign(privateKey);

      await expect(verifyJwt(token, { jwks })).rejects.toThrow("JWT missing sub");
    });
  });
});
