/**
 * Fetches the raw daily data behind a climate profile. Server-side only.
 *   - Rainfall: CHIRPS daily (satellite + rain gauges, ~5 km) through NASA SERVIR's
 *     ClimateSERV. It works as a queue: submit a job, poll its progress, then
 *     download. One job may cover at most 20 years, so 1981–now is three jobs.
 *   - Temperature and root-zone soil wetness: NASA POWER daily (~50 km).
 */
import type { DailySeries } from "@/lib/climate";

export const FIRST_YEAR = 1981;
const CLIMATESERV = "https://climateserv.servirglobal.net/api/";
const POWER_PARAMETERS = "T2M_MAX,T2M_MIN,GWETROOT";

/** Rough box around Zambia. Points inside it but over the border are allowed. */
export const ZAMBIA_BOUNDS = { south: -18.1, north: -8.2, west: 21.9, east: 33.8 };

export function inZambiaBox(lat: number, lon: number): boolean {
  const b = ZAMBIA_BOUNDS;
  return lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east;
}

const JOB_ID = /^[0-9a-f-]{36}$/i;
export const isJobId = (id: string) => JOB_ID.test(id);

function yearChunks(): [string, string][] {
  const thisYear = new Date().getUTCFullYear();
  const chunks: [string, string][] = [];
  for (let y = FIRST_YEAR; y <= thisYear; y += 19) {
    chunks.push([`01/01/${y}`, `12/31/${Math.min(y + 18, thisYear)}`]);
  }
  return chunks;
}

/** Starts the CHIRPS jobs for a point (averaged over a ~10 km box) and returns their ids. */
export async function submitChirps(lat: number, lon: number): Promise<string[]> {
  const d = 0.05;
  const geometry = {
    type: "Polygon",
    coordinates: [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]],
  };
  return Promise.all(
    yearChunks().map(async ([from, to]) => {
      const query = new URLSearchParams({
        datatype: "0", // CHIRPS
        begintime: from,
        endtime: to,
        intervaltype: "0", // daily
        operationtype: "5", // average over the box
        dateType_Category: "default",
        isZip_CurrentDataType: "false",
        geometry: JSON.stringify(geometry),
      });
      const res = await fetch(`${CLIMATESERV}submitDataRequest/?${query}`, { cache: "no-store" });
      const body = await res.json();
      const id = Array.isArray(body) ? String(body[0]) : "";
      if (!res.ok || !isJobId(id)) throw new Error(`ClimateSERV did not accept the request: ${JSON.stringify(body)}`);
      return id;
    }),
  );
}

/** Average progress of the jobs, 0–100. Throws if any job failed. */
export async function chirpsProgress(ids: string[]): Promise<number> {
  const values = await Promise.all(
    ids.map(async (id) => {
      const res = await fetch(`${CLIMATESERV}getDataRequestProgress/?id=${id}`, { cache: "no-store" });
      const [progress] = (await res.json()) as number[];
      if (typeof progress !== "number" || progress < 0) throw new Error(`ClimateSERV job ${id} failed`);
      return Math.min(100, progress);
    }),
  );
  return values.reduce((a, b) => a + b, 0) / values.length;
}

type ChirpsRow = { year: number; month: number; day: number; value: { avg: number } };

/** Downloads finished jobs and merges them into one daily series. */
export async function chirpsResult(ids: string[]): Promise<DailySeries> {
  const out: DailySeries = {};
  const parts = await Promise.all(
    ids.map(async (id) => {
      const res = await fetch(`${CLIMATESERV}getDataFromRequest/?id=${id}`, { cache: "no-store" });
      return ((await res.json()) as { data: ChirpsRow[] }).data;
    }),
  );
  for (const rows of parts)
    for (const row of rows) {
      out[`${row.year}${String(row.month).padStart(2, "0")}${String(row.day).padStart(2, "0")}`] = row.value.avg;
    }
  return out;
}

/** Submits, waits for and downloads CHIRPS in one call. For scripts, not web requests. */
export async function fetchChirps(lat: number, lon: number): Promise<DailySeries> {
  const ids = await submitChirps(lat, lon);
  for (let i = 0; i < 180; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    if ((await chirpsProgress(ids)) >= 100) return chirpsResult(ids);
  }
  throw new Error("ClimateSERV took too long");
}

export async function fetchPower(lat: number, lon: number): Promise<Record<string, DailySeries>> {
  const end = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10).replaceAll("-", "");
  const url =
    "https://power.larc.nasa.gov/api/temporal/daily/point" +
    `?parameters=${POWER_PARAMETERS}&community=AG&latitude=${lat}&longitude=${lon}` +
    `&start=${FIRST_YEAR}0101&end=${end}&format=JSON`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`NASA POWER returned ${res.status}: ${await res.text()}`);
  return (await res.json()).properties.parameter;
}

export const SOURCES = {
  rainfall: "CHIRPS daily rainfall (UCSB Climate Hazards Center / USGS) via NASA SERVIR ClimateSERV",
  temperature: "NASA POWER daily API (MERRA-2): T2M_MAX, T2M_MIN, GWETROOT",
};
