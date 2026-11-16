/**
 * Live climate profile for any point in Zambia.
 *
 * Rainfall comes from a queue (ClimateSERV), so this is two steps, each a
 * short request that works on serverless hosting:
 *   POST /api/climate  { lat, lon }               → { status: "done", profile } if known,
 *                                                    or { status: "pending", jobs } (new jobs, or ones already running)
 *   GET  /api/climate?lat=..&lon=..&jobs=a,b,c     → { status: "pending", progress } or { status: "done", profile }
 *   GET  /api/climate?lat=..&lon=..                → a finished profile if this server has one (cacheable), else { status: "none" }
 *
 * Every point is snapped to its rainfall grid cell (see lib/cell), so nearby
 * points share one download. While a cell is downloading, everyone asking for
 * it joins the same jobs instead of starting new ones.
 */
import { cellOf, type Cell } from "@/lib/cell";
import { buildClimateProfile, type ClimateProfile } from "@/lib/climate";
import { SOURCES, chirpsProgress, chirpsResult, fetchPower, inZambiaBox, isJobId, submitChirps } from "@/lib/sources";

export const maxDuration = 60;

/** Finished profiles by cell. In memory: lost when the server restarts, so phones keep their own copy too. */
const done = new Map<string, ClimateProfile>();
const DONE_MAX = 500;
/** Downloads in progress by cell, so a second request joins them. */
const pending = new Map<string, { jobs: string[]; startedAt: number }>();
const PENDING_TTL_MS = 15 * 60_000;

/** Profiles never change for past seasons, so a finished answer can be cached by the CDN for a week. */
const CACHE_DONE = { "Cache-Control": "public, max-age=3600, s-maxage=604800" };
const NO_STORE = { "Cache-Control": "no-store" };

function remember(key: string, profile: ClimateProfile) {
  done.delete(key);
  done.set(key, profile);
  if (done.size > DONE_MAX) done.delete(done.keys().next().value as string);
}

function runningJobs(key: string): string[] | null {
  const p = pending.get(key);
  if (!p) return null;
  if (Date.now() - p.startedAt > PENDING_TTL_MS) {
    pending.delete(key);
    return null;
  }
  return p.jobs;
}

function parseCell(lat: unknown, lon: unknown): Cell | string {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return "Latitude and longitude must be numbers.";
  if (!inZambiaBox(la, lo)) return "That point is outside Zambia. Limeni's crop data covers Zambia only.";
  return cellOf(la, lo);
}

export async function POST(request: Request): Promise<Response> {
  let body: { lat?: unknown; lon?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const cell = parseCell(body.lat, body.lon);
  if (typeof cell === "string") return Response.json({ error: cell }, { status: 400 });

  const cached = done.get(cell.key);
  if (cached) return Response.json({ status: "done", profile: cached }, { headers: NO_STORE });
  const running = runningJobs(cell.key);
  if (running) return Response.json({ status: "pending", jobs: running }, { headers: NO_STORE });

  try {
    const jobs = await submitChirps(cell.lat, cell.lon);
    pending.set(cell.key, { jobs, startedAt: Date.now() });
    return Response.json({ status: "pending", jobs }, { headers: NO_STORE });
  } catch (error) {
    console.error("Climate: could not start rainfall request", error);
    return Response.json({ error: "The satellite rainfall service did not respond. Try again in a minute." }, { status: 502 });
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const cell = parseCell(url.searchParams.get("lat"), url.searchParams.get("lon"));
  if (typeof cell === "string") return Response.json({ error: cell }, { status: 400 });

  const cached = done.get(cell.key);
  const jobParam = url.searchParams.get("jobs");
  // Lookup only: is this cell already known here?
  if (jobParam === null)
    return cached
      ? Response.json({ status: "done", profile: cached }, { headers: CACHE_DONE })
      : Response.json({ status: "none" }, { headers: NO_STORE });

  const jobs = jobParam.split(",").filter(Boolean);
  if (jobs.length === 0 || jobs.length > 4 || !jobs.every(isJobId))
    return Response.json({ error: "Missing or invalid job ids." }, { status: 400 });
  if (cached) return Response.json({ status: "done", profile: cached }, { headers: NO_STORE });

  try {
    const progress = await chirpsProgress(jobs);
    if (progress < 100)
      return Response.json({ status: "pending", progress: Math.round(progress) }, { headers: NO_STORE });

    const [rain, power] = await Promise.all([chirpsResult(jobs), fetchPower(cell.lat, cell.lon)]);
    const profile = {
      ...buildClimateProfile({ rain, tmax: power.T2M_MAX, tmin: power.T2M_MIN, wetness: power.GWETROOT }),
      sources: SOURCES,
    };
    remember(cell.key, profile);
    pending.delete(cell.key);
    return Response.json({ status: "done", profile }, { headers: NO_STORE });
  } catch (error) {
    pending.delete(cell.key);
    console.error("Climate: request failed", error);
    return Response.json({ error: "Could not get the weather records for this point. Try again." }, { status: 502 });
  }
}
