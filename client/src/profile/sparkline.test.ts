import { describe, it, expect } from "vitest";
import { sparklineGeometry } from "./sparkline.js";

describe("sparklineGeometry", () => {
  it("returns null for fewer than two points", () => {
    expect(sparklineGeometry([], 100, 30)).toBeNull();
    expect(sparklineGeometry([420], 100, 30)).toBeNull();
  });

  it("maps the max value to the top and min to the bottom", () => {
    const g = sparklineGeometry([400, 500], 100, 30, 2)!;
    const [p0, p1] = g.points.split(" ");
    const y0 = Number(p0!.split(",")[1]);
    const y1 = Number(p1!.split(",")[1]);
    // 400 is the min → lower on screen (larger y); 500 is the max → top (y=pad).
    expect(y1).toBeLessThan(y0);
    expect(y1).toBeCloseTo(2); // max sits at pad
    expect(y0).toBeCloseTo(28); // min sits at height - pad
  });

  it("centers a flat series vertically", () => {
    const g = sparklineGeometry([450, 450, 450], 100, 30, 2)!;
    for (const p of g.points.split(" ")) {
      expect(Number(p.split(",")[1])).toBeCloseTo(15); // height/2
    }
  });

  it("spans the full width across evenly spaced x steps", () => {
    const g = sparklineGeometry([1, 2, 3], 100, 30, 0)!;
    const xs = g.points.split(" ").map((p) => Number(p.split(",")[0]));
    expect(xs).toEqual([0, 50, 100]);
  });

  it("builds a closed area polygon anchored to the baseline", () => {
    const g = sparklineGeometry([1, 2], 100, 30, 0)!;
    // starts and ends on the baseline (y = height)
    expect(g.areaPoints.startsWith("0,30 ")).toBe(true);
    expect(g.areaPoints.endsWith(" 100,30")).toBe(true);
  });
});
