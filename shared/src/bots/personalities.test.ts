import { describe, it, expect } from "vitest";
import {
  BOT_PERSONALITIES,
  GRINDER_GREG,
  assignPersonas,
  makeBotSeatId,
  personaForSeatId,
} from "./personalities.js";
import { mulberry32 } from "../rng.js";

describe("BOT_PERSONALITIES", () => {
  it("has distinct ids and names", () => {
    const ids = new Set(BOT_PERSONALITIES.map((p) => p.id));
    const names = new Set(BOT_PERSONALITIES.map((p) => p.name));
    expect(ids.size).toBe(BOT_PERSONALITIES.length);
    expect(names.size).toBe(BOT_PERSONALITIES.length);
  });

  it("includes Grinder Greg as the baseline", () => {
    expect(BOT_PERSONALITIES).toContain(GRINDER_GREG);
  });
});

describe("assignPersonas", () => {
  it("returns the requested count with no duplicates, deterministic for a fixed seed", () => {
    const a = assignPersonas(6, mulberry32(42));
    const b = assignPersonas(6, mulberry32(42));
    expect(a).toHaveLength(6);
    expect(new Set(a.map((p) => p.id)).size).toBe(6);
    expect(a.map((p) => p.id)).toEqual(b.map((p) => p.id));
  });

  it("varies across different seeds", () => {
    const a = assignPersonas(6, mulberry32(1));
    const b = assignPersonas(6, mulberry32(2));
    expect(a.map((p) => p.id)).not.toEqual(b.map((p) => p.id));
  });
});

describe("makeBotSeatId / personaForSeatId", () => {
  it("round-trips a persona through a seat id", () => {
    for (const persona of BOT_PERSONALITIES) {
      const id = makeBotSeatId(2, persona);
      expect(id.startsWith("bot-")).toBe(true);
      expect(personaForSeatId(id)).toBe(persona);
    }
  });

  it("falls back to the baseline persona for an unrecognized id", () => {
    expect(personaForSeatId("bot-3")).toBe(GRINDER_GREG);
    expect(personaForSeatId("bot-0-unknown-persona")).toBe(GRINDER_GREG);
  });
});
