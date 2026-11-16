/**
 * GET /api/terrain?lat=..&lon=..              → { terrain } around one point
 * GET /api/terrain?field=lat,lon;lat,lon;...  → { terrain } across a drawn field
 * Slope and erosion risk from NASA SRTM elevation, or { terrain: null } if the lookup fails.
 */
import { fetchFieldTerrain, fetchTerrain, type Terrain } from "@/lib/terrain";
import { inZambiaBox } from "@/lib/sources";

const cache = new Map<string, Terrain>();

function readField(raw: string): { lat: number; lon: number }[] | null {
  const points = raw.split(";").map((pair) => {
    const [lat, lon] = pair.split(",").map(Number);
    return { lat, lon };
  });
  const ok =
    points.length >= 3 &&
    points.length <= 50 &&
    points.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && inZambiaBox(p.lat, p.lon));
  return ok ? points : null;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const fieldParam = url.searchParams.get("field");

  if (fieldParam) {
    const field = readField(fieldParam);
    if (!field) return Response.json({ terrain: null, error: "The field outline must be 3–50 points in Zambia." }, { status: 400 });
    const key = `field:${field.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join(";")}`;
    const hit = cache.get(key);
    if (hit) return Response.json({ terrain: hit });
    try {
      const terrain = await fetchFieldTerrain(field);
      cache.set(key, terrain);
      return Response.json({ terrain });
    } catch (error) {
      console.error("Terrain: field lookup failed", error);
      return Response.json({ terrain: null });
    }
  }

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
