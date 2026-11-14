/**
 * Live climate profile for any point in Zambia.
 *
 * Rainfall comes from a queue (ClimateSERV), so this is two steps, each a
 * short request that works on serverless hosting:
 *   POST /api/climate  { lat, lon }               → { status: "pending", jobs } (or "done" if cached)
 *   GET  /api/climate?lat=..&lon=..&jobs=a,b,c     → { status: "pending", progress } or { status: "done", profile }
 */
import { buildClimateProfile, type ClimateProfile } from "@/lib/climate";
import { SOURCES, chirpsProgress, chirpsResult, fetchPower, inZambiaBox, isJobId, submitChirps } from "@/lib/sources";

export const maxDuration = 60;

// Finished profiles, keyed by the point rounded to ~5 km. Lost on restart; fine for a demo.
const cache = new Map<string, ClimateProfile>();
const keyFor = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

function parsePoint(lat: unknown, lon: unknown): { lat: number; lon: number } | string {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return "Latitude and longitude must be numbers.";
  if (!inZambiaBox(la, lo)) return "That point is outside Zambia. Limeni's crop data covers Zambia only.";
  return { lat: Math.round(la * 100) / 100, lon: Math.round(lo * 100) / 100 };
}

export async function POST(request: Request): Promise<Response> {
  let body: { lat?: unknown; lon?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const point = parsePoint(body.lat, body.lon);
  if (typeof point === "string") return Response.json({ error: point }, { status: 400 });

  const cached = cache.get(keyFor(point.lat, point.lon));
  if (cached) return Response.json({ status: "done", profile: cached });

  try {
    const jobs = await submitChirps(point.lat, point.lon);
    return Response.json({ status: "pending", jobs });
  } catch (error) {
    console.error("Climate: could not start rainfall request", error);
    return Response.json({ error: "The satellite rainfall service did not respond. Try again in a minute." }, { status: 502 });
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const point = parsePoint(url.searchParams.get("lat"), url.searchParams.get("lon"));
  if (typeof point === "string") return Response.json({ error: point }, { status: 400 });
  const jobs = (url.searchParams.get("jobs") ?? "").split(",").filter(Boolean);
  if (jobs.length === 0 || jobs.length > 4 || !jobs.every(isJobId))
    return Response.json({ error: "Missing or invalid job ids." }, { status: 400 });

  const key = keyFor(point.lat, point.lon);
  const cached = cache.get(key);
  if (cached) return Response.json({ status: "done", profile: cached });

  try {
    const progress = await chirpsProgress(jobs);
    if (progress < 100) return Response.json({ status: "pending", progress: Math.round(progress) });

    const [rain, power] = await Promise.all([chirpsResult(jobs), fetchPower(point.lat, point.lon)]);
    const profile = {
      ...buildClimateProfile({ rain, tmax: power.T2M_MAX, tmin: power.T2M_MIN, wetness: power.GWETROOT }),
      sources: SOURCES,
    };
    cache.set(key, profile);
    return Response.json({ status: "done", profile });
  } catch (error) {
    console.error("Climate: request failed", error);
    return Response.json({ error: "Could not get the weather records for this point. Try again." }, { status: 502 });
  }
}
