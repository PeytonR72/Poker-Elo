import { describe, expect, it } from "vitest";
import { countUpText, defaultCountUpFormat } from "./count-up.js";
import { formatChips } from "../game/viewHelpers.js";

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

describe("countUpText", () => {
  it("rounds spring frame values before a non-rounding custom format runs", () => {
    // Regression: seat stacks showed "910.015" / "1,160.007" because the
    // spring's fractional/asymptotic value reached formatChips un-rounded.
    expect(countUpText(910.015, formatChips)).toBe("910");
    expect(countUpText(1160.007, formatChips)).toBe("1,160");
    expect(countUpText(1159.51, formatChips)).toBe("1,160");
  });

  it("rounds for the default formatter too", () => {
    expect(countUpText(412.6, defaultCountUpFormat)).toBe("413");
  });
});
