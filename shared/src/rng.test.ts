import { describe, it, expect } from "vitest";
import { mulberry32, deriveSeed } from "./rng.js";

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("returns floats in [0, 1)", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("different seeds produce different sequences", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });
});

describe("deriveSeed", () => {
  it("is deterministic and label-sensitive", () => {
    expect(deriveSeed(100, "hand:1")).toBe(deriveSeed(100, "hand:1"));
    expect(deriveSeed(100, "hand:1")).not.toBe(deriveSeed(100, "hand:2"));
    expect(deriveSeed(100, "hand:1")).not.toBe(deriveSeed(200, "hand:1"));
  });

  it("returns a 32-bit unsigned integer", () => {
    const s = deriveSeed(123, "x");
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });
});
