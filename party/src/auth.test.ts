import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
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

    const payload = await verifyJwt(token, secret);
    expect(payload).toEqual({ sub: "user-123" });
  });

  it("rejects a JWT signed with a different secret", async () => {
    const key = new TextEncoder().encode("other-secret");
    const token = await new SignJWT({ sub: "user-abc" })
      .setProtectedHeader({ alg: "HS256" })
      .sign(key);

    await expect(verifyJwt(token, "test-secret")).rejects.toThrow();
  });

  it("rejects a JWT without a sub claim", async () => {
    const secret = "test-secret";
    const key = new TextEncoder().encode(secret);
    const token = await new SignJWT({ role: "user" })
      .setProtectedHeader({ alg: "HS256" })
      .sign(key);

    await expect(verifyJwt(token, secret)).rejects.toThrow("JWT missing sub");
  });
});
