/**
 * Pure geometry helper for the Arena rating sparkline. Turns a chronological
 * (oldest → newest) series of rating values into SVG coordinate strings — a
 * polyline for the stroke and a closed path for the soft gradient fill. No
 * chart library; the card renders these strings into a tiny inline <svg>.
 *
 * Kept pure + colocated-tested (house convention: logic in a testable core,
 * components stay thin). All rendering/units are caller-supplied via `opts`.
 */

export interface SparklineOpts {
  width?: number;
  height?: number;
  /** inner padding so the stroke never clips at the edges */
  pad?: number;
}

export interface SparklineGeometry {
  /** `"x,y x,y …"` for a <polyline> / <polygon> `points` attribute */
  line: string;
  /** closed `d` path (line, then down to the baseline and back) for the fill */
  area: string;
  width: number;
  height: number;
  first: number;
  last: number;
  /** last >= first — drives emerald (up/flat) vs danger (down) styling */
  up: boolean;
}

const DEFAULTS = { width: 220, height: 56, pad: 6 } as const;

/**
 * Build sparkline geometry from a rating series. Returns `null` for an empty
 * series (caller shows an empty/skeleton state). A single point renders as a
 * flat centered line; an all-equal series renders flat at mid-height.
 */
export function buildSparkline(
  values: number[],
  opts: SparklineOpts = {},
): SparklineGeometry | null {
  if (values.length === 0) return null;

  const width = opts.width ?? DEFAULTS.width;
  const height = opts.height ?? DEFAULTS.height;
  const pad = opts.pad ?? DEFAULTS.pad;

  const first = values[0]!;
  const last = values[values.length - 1]!;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const xAt = (i: number): number =>
    values.length === 1 ? width / 2 : pad + (i / (values.length - 1)) * innerW;

  // Higher rating → smaller y (drawn toward the top). Flat series sit at mid.
  const yAt = (v: number): number =>
    range === 0 ? height / 2 : pad + (1 - (v - min) / range) * innerH;

  const pts = values.map((v, i) => `${round(xAt(i))},${round(yAt(v))}`);
  const line = pts.join(" ");

  const x0 = round(xAt(0));
  const xN = round(xAt(values.length - 1));
  const baseY = round(height);
  const area = `M${x0},${baseY} ${pts.map((p) => `L${p}`).join(" ")} L${xN},${baseY} Z`;

  return { line, area, width, height, first, last, up: last >= first };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
