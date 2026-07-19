import { describe, expect, it } from "vitest";
import type { ActionMask } from "@poker/shared";
import { potPresets } from "./potPresets.js";

const mask = (over: Partial<ActionMask> = {}): ActionMask => ({
  seat: 0, canFold: true, canCheck: false, canCall: true, canRaise: true,
  callAmount: 100, minRaiseTo: 200, maxRaiseTo: 10_000, ...over,
});

describe("potPresets", () => {
  it("returns [] when raising is illegal", () => {
    expect(potPresets(mask({ canRaise: false }), 500, 100)).toEqual([]);
  });
  it("produces Min/third-pot/half-pot/pot/Max raise-TO values, clamped", () => {
    const p = potPresets(mask(), 1000, 100);
    expect(p[0]).toEqual({ label: "Min", raiseTo: 200 });
    expect(p.at(-1)).toEqual({ label: "Max", raiseTo: 10_000 });
    // ⅓ Pot: call (100) + round(1/3 * (pot 1000 + call 100)) = 100 + 367 = 467
    expect(p.find((x) => x.label === "1/3 Pot")).toEqual({ label: "1/3 Pot", raiseTo: 467 });
    // ½ Pot: call (100) + 0.5 * (pot 1000 + call 100) = 650
    expect(p.find((x) => x.label === "1/2 Pot")).toEqual({ label: "1/2 Pot", raiseTo: 650 });
    // Pot: call (100) + 1.0 * (pot 1000 + call 100) = 1200
    expect(p.find((x) => x.label === "Pot")).toEqual({ label: "Pot", raiseTo: 1200 });
  });
  it("dedupes when presets collapse to the same clamped value", () => {
    const p = potPresets(mask({ maxRaiseTo: 200 }), 1000, 100);
    expect(p).toEqual([{ label: "Min", raiseTo: 200 }]);
  });
});
