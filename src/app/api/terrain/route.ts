/**
 * GET /api/terrain?lat=..&lon=..  → { terrain } with slope and erosion risk
 * from NASA SRTM elevation, or { terrain: null } if the lookup fails.
 */
import { fetchTerrain, type Terrain } from "@/lib/terrain";
import { inZambiaBox } from "@/lib/sources";

const cache = new Map<string, Terrain>();

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inZambiaBox(lat, lon))
    return Response.json({ terrain: null, error: "Point must be in Zambia." }, { status: 400 });

  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit) return Response.json({ terrain: hit });
  try {
    const terrain = await fetchTerrain(lat, lon);
    cache.set(key, terrain);
    return Response.json({ terrain });
  } catch (error) {
    console.error("Terrain: lookup failed", error);
    return Response.json({ terrain: null });
  }
}
