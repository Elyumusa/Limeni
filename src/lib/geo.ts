/**
 * Small geometry helpers for the farm map: reading coordinates the way
 * farmers have them, and measuring a field drawn on the map.
 */
import { inZambiaBox } from "@/lib/sources";

export type LatLon = { lat: number; lon: number };
export type ParsedCoords = LatLon & { note?: string };

const HEMI = /^[NSEW]$/i;

function signed(value: number, hemi: string | undefined): number {
  if (!hemi) return value;
  return /[SW]/i.test(hemi) ? -Math.abs(value) : Math.abs(value);
}

type Part = { value: number; hemi?: string };

/** Degrees, minutes and seconds, e.g. 13°32'35"S 29°04'52"E. */
function dmsParts(text: string, leading: boolean): Part[] {
  const re = leading
    ? /([NSEW])\s*(-?\d+(?:\.\d+)?)\s*°\s*(?:(\d+(?:\.\d+)?)\s*'\s*)?(?:(\d+(?:\.\d+)?)\s*(?:"|'')\s*)?()/gi
    : /()(-?\d+(?:\.\d+)?)\s*°\s*(?:(\d+(?:\.\d+)?)\s*'\s*)?(?:(\d+(?:\.\d+)?)\s*(?:"|'')\s*)?([NSEW])?/gi;
  const parts: Part[] = [];
  for (const m of text.matchAll(re)) {
    const deg = Number(m[2]);
    const min = m[3] ? Number(m[3]) : 0;
    const sec = m[4] ? Number(m[4]) : 0;
    if (min >= 60 || sec >= 60) continue;
    const value = Math.sign(deg || 1) * (Math.abs(deg) + min / 60 + sec / 3600);
    parts.push({ value, hemi: m[1] || m[5] || undefined });
  }
  return parts;
}

/** Plain decimal numbers, e.g. -13.5432, 29.0811 or 13.5432 S 29.0811 E. */
function decimalParts(text: string, leading: boolean): Part[] {
  // A Google Maps link carries the point after "@" or in "q=" / "ll=" / "query=".
  const link =
    text.match(/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/) ??
    text.match(/[?&](?:q|ll|query|center)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i);
  if (link) return [{ value: Number(link[1]) }, { value: Number(link[2]) }];
  const parts: Part[] = [];
  const re = leading ? /([NSEW])\s*(-?\d+(?:\.\d+)?)()/gi : /()(-?\d+(?:\.\d+)?)\s*([NSEW])?/gi;
  for (const m of text.matchAll(re)) {
    parts.push({ value: Number(m[2]), hemi: m[1] || m[3] || undefined });
  }
  return parts;
}

/**
 * Reads coordinates typed or pasted by a farmer. Returns the point, or an
 * error message written for the farmer. Common slips (a missing minus sign,
 * longitude first) are corrected when that lands the point in Zambia, with a
 * note saying what was changed.
 */
export function parseCoordinates(input: string): ParsedCoords | { error: string } {
  const text = input
    .trim()
    .replace(/[′’‘`]/g, "'")
    .replace(/[″“”]/g, '"')
    .replace(/º/g, "°");
  if (!text) return { error: "Type or paste your farm's coordinates." };

  // Hemisphere letters come either before every number (S13.5 E29.1) or after (13.5S 29.1E).
  const leading = /^[NSEW]\s*\d/i.test(text);
  const parts = text.includes("°") ? dmsParts(text, leading) : decimalParts(text, leading);
  if (parts.length < 2)
    return { error: "We couldn't read two numbers there. Try the form -13.5432, 29.0811." };
  let [a, b] = parts;
  // If hemisphere letters say the first number is east/west, swap them.
  if ((a.hemi && /[EW]/i.test(a.hemi)) || (b.hemi && /[NS]/i.test(b.hemi))) [a, b] = [b, a];
  let lat = signed(a.value, a.hemi && HEMI.test(a.hemi) ? a.hemi : undefined);
  let lon = signed(b.value, b.hemi && HEMI.test(b.hemi) ? b.hemi : undefined);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180)
    return { error: "Those numbers are outside the range of coordinates. Check them and try again." };

  if (inZambiaBox(lat, lon)) return { lat, lon };
  const notes: string[] = [];
  if (inZambiaBox(lon, lat)) {
    [lat, lon] = [lon, lat];
    notes.push("We swapped the two numbers: latitude comes first.");
  } else if (inZambiaBox(-lat, lon) && !a.hemi) {
    lat = -lat;
    notes.push(`We read ${Math.abs(lat)} as south of the equator, where all of Zambia lies.`);
  } else if (inZambiaBox(-lon, lat) && !a.hemi) {
    [lat, lon] = [-lon, lat];
    notes.push("We swapped the two numbers and read the latitude as south of the equator.");
  }
  if (inZambiaBox(lat, lon)) return { lat, lon, note: notes.join(" ") };
  return { error: "That point is outside Zambia. Limeni's data covers Zambia only." };
}

export function formatCoords({ lat, lon }: LatLon, digits = 4): string {
  return `${Math.abs(lat).toFixed(digits)}°${lat < 0 ? "S" : "N"}, ${Math.abs(lon).toFixed(digits)}°${lon < 0 ? "W" : "E"}`;
}

const EARTH_R = 6378137;
const rad = (d: number) => (d * Math.PI) / 180;

/** Area of a field outline on the Earth's surface, in hectares. */
export function polygonAreaHa(points: LatLon[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    sum += rad(p2.lon - p1.lon) * (2 + Math.sin(rad(p1.lat)) + Math.sin(rad(p2.lat)));
  }
  return Math.abs((sum * EARTH_R * EARTH_R) / 2) / 10_000;
}

/** Middle of a field outline (vertex average; fine for farm-sized shapes). */
export function centroid(points: LatLon[]): LatLon {
  const n = points.length;
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / n,
    lon: points.reduce((s, p) => s + p.lon, 0) / n,
  };
}

/** Straight-line distance in metres. */
export function distanceM(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

export function formatHa(ha: number): string {
  if (ha < 0.1) return `${Math.round(ha * 10_000).toLocaleString("en-US")} m²`;
  return `${ha < 10 ? ha.toFixed(2) : ha.toFixed(1)} ha`;
}
