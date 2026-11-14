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
  const [c, n, s, e, w] = z as number[];
  const span = 2 * STEP_DEG * 111_320; // metres between the north and south points (and east–west)
  const dzNS = (n - s) / span;
  const dzEW = (e - w) / span;
  const slopePct = +(Math.hypot(dzNS, dzEW) * 100).toFixed(1);
  return { elevationM: Math.round(c), slopePct, erosionRisk: erosionRiskFor(slopePct) };
}
