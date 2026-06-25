import { describe, it, expect } from "vitest";
import { maskToButtons, clampRaiseTo, blindLevelLabel, formatCard, formatChips } from "./viewHelpers.js";
import type { ActionMask } from "@poker/shared";
import { MATCH_FORMATS, cardFromString } from "@poker/shared";

function mask(over: Partial<ActionMask> = {}): ActionMask {
  return {
    seat: 0, canFold: true, canCheck: false, canCall: true, callAmount: 20,
    canRaise: true, minRaiseTo: 40, maxRaiseTo: 200, ...over,
  };
}

describe("maskToButtons", () => {
  it("reflects the mask flags and call amount", () => {
    const b = maskToButtons(mask());
    expect(b).toEqual({ fold: true, check: false, call: true, raise: true, callAmount: 20 });
  });
  it("disables call/raise when the mask forbids them", () => {
    const b = maskToButtons(mask({ canCall: false, canRaise: false, canCheck: true, callAmount: 0 }));
    expect(b.call).toBe(false);
    expect(b.raise).toBe(false);
    expect(b.check).toBe(true);
  });
});

describe("clampRaiseTo", () => {
  it("clamps below the minimum up to minRaiseTo", () => {
    expect(clampRaiseTo(10, mask())).toBe(40);
  });
  it("clamps above the maximum down to maxRaiseTo", () => {
    expect(clampRaiseTo(9999, mask())).toBe(200);
  });
  it("passes an in-range value through", () => {
    expect(clampRaiseTo(120, mask())).toBe(120);
  });
});

describe("blindLevelLabel", () => {
  it("labels the current level by matching sb/bb against the format", () => {
    const lvl = MATCH_FORMATS["turbo"]!.blindLevels[2]!; // { sb: 20, bb: 40 }
    expect(blindLevelLabel(lvl.sb, lvl.bb, "turbo")).toBe("Level 3");
  });
  it("falls back when the blinds do not match a known level", () => {
    expect(blindLevelLabel(7, 13, "turbo")).toBe("Blinds 7/13");
  });
});

describe("formatCard", () => {
  it("formats a card int as its short string", () => {
    const c = cardFromString("As");
    expect(formatCard(c)).toBe("As");
  });
});

describe("formatChips", () => {
  it("renders a plain integer chip count", () => {
    expect(formatChips(1000)).toBe("1,000");
  });
});
