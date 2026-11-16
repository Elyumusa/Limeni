/**
 * Slope and erosion risk around a point, from NASA's Shuttle Radar Topography
 * Mission (SRTM, 30 m), read through the free OpenTopoData service.
 *
 * Points are sampled about 300 m north, south, east and west of the spot. At
 * closer spacing SRTM's few-metre height errors would swamp the slope, so the
 * result describes the land around the point, not one field's exact slope.
 */
export type Terrain = {
  elevationM: number;
  slopePct: number;
  erosionRisk: "low" | "moderate" | "high";
  /** "point": the land around one spot. "field": measured across the farmer's drawn field. */
  basis?: "point" | "field";
};

/** About 300 m in latitude. */
const STEP_DEG = 0.0027;

/**
 * Rule of thumb for rain-fed fields: under 2% is nearly flat, 2–8% erodes in
 * heavy rain without cover, over 8% erodes easily.
 */
export function erosionRiskFor(slopePct: number): Terrain["erosionRisk"] {
  if (slopePct < 2) return "low";
  if (slopePct <= 8) return "moderate";
  return "high";
}

async function elevations(points: number[][]): Promise<number[]> {
  const locations = points.map(([a, b]) => `${a.toFixed(5)},${b.toFixed(5)}`).join("|");
  const res = await fetch(`https://api.opentopodata.org/v1/srtm30m?locations=${locations}`, {
    headers: { "User-Agent": "Limeni (NASA Space Apps 2026 prototype)" },
    signal: AbortSignal.timeout(15_000),
    next: { revalidate: 60 * 60 * 24 * 30 },
  });
  if (!res.ok) throw new Error(`OpenTopoData returned ${res.status}`);
  const body = (await res.json()) as { status: string; results: { elevation: number | null }[] };
  const z = body.results.map((r) => r.elevation);
  if (body.status !== "OK" || z.some((v) => v === null)) throw new Error("No elevation for this point");
  return z as number[];
}

/** Half the width of the sampled square: at least ~300 m, so SRTM's height errors don't swamp the slope. */
const MIN_HALF_SPAN_M = 300;
const M_PER_DEG = 111_320;

/**
 * Slope across a field the farmer drew. A 5 × 5 grid of SRTM heights covers
 * the field (widened to at least 600 m for small fields), and a flat plane is
 * fitted through them; its tilt is the slope. Server-side only.
 */
export async function fetchFieldTerrain(outline: { lat: number; lon: number }[]): Promise<Terrain> {
  const lats = outline.map((p) => p.lat);
  const lons = outline.map((p) => p.lon);
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lon0 = (Math.min(...lons) + Math.max(...lons)) / 2;
  const cos = Math.cos((lat0 * Math.PI) / 180);
  const halfY = Math.max(((Math.max(...lats) - Math.min(...lats)) / 2) * M_PER_DEG, MIN_HALF_SPAN_M);
  const halfX = Math.max(((Math.max(...lons) - Math.min(...lons)) / 2) * M_PER_DEG * cos, MIN_HALF_SPAN_M);
  const steps = [-1, -0.5, 0, 0.5, 1];
  const grid: { x: number; y: number }[] = [];
  for (const fy of steps) for (const fx of steps) grid.push({ x: fx * halfX, y: fy * halfY });
  const z = await elevations(grid.map((g) => [lat0 + g.y / M_PER_DEG, lon0 + g.x / (M_PER_DEG * cos)]));
  // The grid is symmetric about the middle, so the best-fit plane's tilts separate.
  const mean = z.reduce((s, v) => s + v, 0) / z.length;
  let sxz = 0, sxx = 0, syz = 0, syy = 0;
  grid.forEach((g, i) => {
    sxz += g.x * (z[i] - mean);
    sxx += g.x * g.x;
    syz += g.y * (z[i] - mean);
    syy += g.y * g.y;
  });
  const slopePct = +(Math.hypot(sxz / sxx, syz / syy) * 100).toFixed(1);
  return { elevationM: Math.round(mean), slopePct, erosionRisk: erosionRiskFor(slopePct), basis: "field" };
}

/** Server-side only. */
export async function fetchTerrain(lat: number, lon: number): Promise<Terrain> {
  const dLon = STEP_DEG / Math.cos((lat * Math.PI) / 180);
  const points = [
    [lat, lon],
    [lat + STEP_DEG, lon],
    [lat - STEP_DEG, lon],
    [lat, lon + dLon],
    [lat, lon - dLon],
  ];
  const [c, n, s, e, w] = await elevations(points);
  const span = 2 * STEP_DEG * 111_320; // metres between the north and south points (and east–west)
  const dzNS = (n - s) / span;
  const dzEW = (e - w) / span;
  const slopePct = +(Math.hypot(dzNS, dzEW) * 100).toFixed(1);
  return { elevationM: Math.round(c), slopePct, erosionRisk: erosionRiskFor(slopePct), basis: "point" };
}
