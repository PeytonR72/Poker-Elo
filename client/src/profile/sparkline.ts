export interface SparklineGeometry {
  /** `points` attribute for an SVG <polyline> (space-separated "x,y"). */
  points: string;
  /** `points` for a closed <polygon> fill under the line (baseline at height). */
  areaPoints: string;
  /** last point, useful for an end-cap dot */
  last: { x: number; y: number };
  width: number;
  height: number;
}

/**
 * Maps a numeric series to SVG coordinates for a sparkline. Values are scaled
 * so the min sits at `height - pad` and the max at `pad`; a flat series is
 * centered vertically. Returns null when there are fewer than two points (a
 * single value cannot form a line). Pure — no DOM, unit-tested.
 */
export function sparklineGeometry(
  values: number[],
  width: number,
  height: number,
  pad = 2,
): SparklineGeometry | null {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const innerH = height - pad * 2;
  const stepX = (width - pad * 2) / (values.length - 1);

  const coords = values.map((v, i) => {
    const x = pad + i * stepX;
    // Higher value → smaller y (SVG y grows downward). Flat series → centered.
    const t = span === 0 ? 0.5 : (v - min) / span;
    const y = pad + (1 - t) * innerH;
    return { x, y };
  });

  const points = coords.map((c) => `${round(c.x)},${round(c.y)}`).join(" ");
  const first = coords[0]!;
  const last = coords[coords.length - 1]!;
  const areaPoints =
    `${round(first.x)},${round(height)} ` +
    points +
    ` ${round(last.x)},${round(height)}`;

  return { points, areaPoints, last: { x: round(last.x), y: round(last.y) }, width, height };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
