import { describe, expect, it } from "vitest";
import { defaultCountUpFormat } from "./count-up.js";

describe("defaultCountUpFormat", () => {
  it("rounds to the nearest integer", () => {
    expect(defaultCountUpFormat(412.4)).toBe("412");
    expect(defaultCountUpFormat(412.6)).toBe("413");
  });

  it("groups thousands with en-US separators", () => {
    expect(defaultCountUpFormat(1234)).toBe("1,234");
    expect(defaultCountUpFormat(1234567)).toBe("1,234,567");
  });

  it("handles zero and negatives", () => {
    expect(defaultCountUpFormat(0)).toBe("0");
    expect(defaultCountUpFormat(-1500.2)).toBe("-1,500");
  });
});
