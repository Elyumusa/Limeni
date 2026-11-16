/**
 * NASA Harmonized Landsat and Sentinel-2 (HLS) images, 30 m, through NASA GIBS.
 *
 * Each day's HLS layer only covers the strips the satellites passed over, and
 * many images are cloudy. So, in the browser, we look back day by day for the
 * most recent image where the farmer's spot is covered and not white with
 * cloud, by reading the pixels of one small tile.
 */
import type { LatLon } from "@/lib/geo";

export type HlsSource = { layer: string; label: string };
export const HLS_SOURCES: HlsSource[] = [
  { layer: "HLS_S30_Nadir_BRDF_Adjusted_Reflectance", label: "Sentinel-2" },
  { layer: "HLS_L30_Nadir_BRDF_Adjusted_Reflectance", label: "Landsat 8/9" },
];
export const HLS_MAX_ZOOM = 12;

export type HlsImage = { source: HlsSource; date: string };

export function hlsTileUrl(img: HlsImage): string {
  return (
    "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/" +
    `${img.source.layer}/default/${img.date}/GoogleMapsCompatible_Level12/{z}/{y}/{x}.png`
  );
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The level-12 tile holding a point, and the point's pixel inside it. */
function tileFor({ lat, lon }: LatLon) {
  const n = 2 ** HLS_MAX_ZOOM;
  const fx = ((lon + 180) / 360) * n;
  const latR = (lat * Math.PI) / 180;
  const fy = ((1 - Math.asinh(Math.tan(latR)) / Math.PI) / 2) * n;
  const x = Math.floor(fx);
  const y = Math.floor(fy);
  return { x, y, px: Math.floor((fx - x) * 256), py: Math.floor((fy - y) * 256) };
}

function loadImage(url: string, signal: AbortSignal): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const done = (v: HTMLImageElement | null) => {
      signal.removeEventListener("abort", abort);
      resolve(v);
    };
    const abort = () => {
      img.src = "";
      done(null);
    };
    signal.addEventListener("abort", abort);
    img.onload = () => done(img);
    img.onerror = () => done(null);
    img.src = url;
  });
}

/** True when the area around the spot is covered and mostly free of cloud. */
function clearAt(img: HTMLImageElement, px: number, py: number): boolean {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0);
  const r = 6; // ±6 px ≈ ±230 m at this zoom
  const x0 = Math.max(0, px - r);
  const y0 = Math.max(0, py - r);
  const w = Math.min(256, px + r + 1) - x0;
  const h = Math.min(256, py + r + 1) - y0;
  const data = ctx.getImageData(x0, y0, w, h).data;
  let covered = 0;
  let cloudy = 0;
  const total = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    covered++;
    const [red, green, blue] = [data[i], data[i + 1], data[i + 2]];
    if (red > 190 && green > 190 && blue > 190) cloudy++;
  }
  return covered / total > 0.9 && cloudy / Math.max(covered, 1) < 0.15;
}

/**
 * Finds the latest clear HLS image of a spot, on or before `before`
 * (default today), looking back up to `days` days. Returns null if none.
 */
export async function findClearHls(
  point: LatLon,
  signal: AbortSignal,
  before: Date = new Date(),
  days = 90,
): Promise<HlsImage | null> {
  const { x, y, px, py } = tileFor(point);
  const BATCH = 6; // days checked at once
  for (let start = 0; start < days; start += BATCH) {
    const tries: HlsImage[] = [];
    for (let d = start; d < Math.min(days, start + BATCH); d++) {
      const date = iso(new Date(before.getTime() - d * 86_400_000));
      for (const source of HLS_SOURCES) tries.push({ source, date });
    }
    const results = await Promise.all(
      tries.map(async (t) => {
        const url = hlsTileUrl(t).replace("{z}", String(HLS_MAX_ZOOM)).replace("{y}", String(y)).replace("{x}", String(x));
        const img = await loadImage(url, signal);
        return img && clearAt(img, px, py) ? t : null;
      }),
    );
    if (signal.aborted) return null;
    const hit = results.find((r) => r !== null);
    if (hit) return hit;
  }
  return null;
}

export function formatDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
