import { describe, it, expect } from "vitest";
import { buildSparkline } from "./arenaSparkline.js";

describe("buildSparkline", () => {
  it("returns null for an empty series", () => {
    expect(buildSparkline([])).toBeNull();
  });

  it("renders a single point as a flat centered line", () => {
    const g = buildSparkline([500], { width: 100, height: 40, pad: 4 })!;
    expect(g).not.toBeNull();
    // one point, centered horizontally, at mid height
    expect(g.line).toBe("50,20");
    expect(g.first).toBe(500);
    expect(g.last).toBe(500);
    expect(g.up).toBe(true);
  });

  it("keeps an all-equal series flat at mid-height", () => {
    const g = buildSparkline([400, 400, 400], { width: 100, height: 40, pad: 0 })!;
    const ys = g.line.split(" ").map((p) => Number(p.split(",")[1]));
    expect(ys.every((y) => y === 20)).toBe(true);
  });

  it("maps a rising series upward (higher rating → smaller y)", () => {
    const g = buildSparkline([400, 500], { width: 100, height: 40, pad: 0 })!;
    const [p0, p1] = g.line.split(" ");
    const y0 = Number(p0!.split(",")[1]);
    const y1 = Number(p1!.split(",")[1]);
    expect(y0).toBeGreaterThan(y1); // later, higher rating sits higher on screen
    expect(g.up).toBe(true);
  });

  it("marks a falling series as not up", () => {
    const g = buildSparkline([600, 500, 450])!;
    expect(g.up).toBe(false);
    expect(g.first).toBe(600);
    expect(g.last).toBe(450);
  });

  it("spans the full inner width across x", () => {
    const g = buildSparkline([1, 2, 3], { width: 100, height: 40, pad: 10 })!;
    const xs = g.line.split(" ").map((p) => Number(p.split(",")[0]));
    expect(xs[0]).toBe(10);
    expect(xs[xs.length - 1]).toBe(90);
  });

  it("produces a closed area path returning to the baseline", () => {
    const g = buildSparkline([1, 2], { width: 100, height: 40, pad: 0 })!;
    expect(g.area.startsWith("M")).toBe(true);
    expect(g.area.trimEnd().endsWith("Z")).toBe(true);
    // baseline segments sit at the full height
    expect(g.area).toContain(",40");
  });
});
