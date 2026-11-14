/**
 * GET /api/places?q=chong          → places matching the text, for the search box
 * GET /api/places?lat=..&lon=..     → { place } nearest to a tapped point
 * Place search inside Zambia. Uses Photon (komoot), a free
 * geocoder built on OpenStreetMap that is meant for search-as-you-type.
 */
import { ZAMBIA_BOUNDS } from "@/lib/sources";

export type Place = { name: string; detail: string; lat: number; lon: number };

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    countrycode?: string;
    osm_value?: string;
  };
};

function toPlace(f: PhotonFeature): Place | null {
  const p = f.properties;
  if (p.countrycode && p.countrycode !== "ZM") return null;
  const name = p.name ?? [p.street, p.housenumber].filter(Boolean).join(" ");
  if (!name) return null;
  const detail = [p.city ?? p.district ?? p.county, p.state].filter((x) => x && x !== name).join(", ");
  const [lon, lat] = f.geometry.coordinates;
  return { name, detail, lat, lon };
}

async function reverse(lat: number, lon: number): Promise<Response> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon), lang: "en", limit: "1" });
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?${params}`, {
      headers: { "User-Agent": "Limeni (NASA Space Apps 2026 prototype)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Photon returned ${res.status}`);
    const { features } = (await res.json()) as { features: PhotonFeature[] };
    // Name a tapped point after its town rather than the nearest street or shop.
    const f = features.find((x) => !x.properties.countrycode || x.properties.countrycode === "ZM");
    if (!f) return Response.json({ place: null });
    const p = f.properties;
    const town = p.city ?? p.district ?? p.county ?? p.name;
    if (!town) return Response.json({ place: null });
    const detail = [p.county !== town ? p.county : undefined, p.state].filter(Boolean).join(", ");
    return Response.json({ place: { name: town, detail, lat, lon } satisfies Place });
  } catch (error) {
    console.error("Places: reverse lookup failed", error);
    return Response.json({ place: null });
  }
}

export async function GET(request: Request): Promise<Response> {
  const params0 = new URL(request.url).searchParams;
  if (params0.has("lat") && params0.has("lon")) {
    const lat = Number(params0.get("lat"));
    const lon = Number(params0.get("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return Response.json({ place: null }, { status: 400 });
    return reverse(lat, lon);
  }
  const q = (params0.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return Response.json({ places: [] });

  const b = ZAMBIA_BOUNDS;
  const params = new URLSearchParams({ q, limit: "8", lang: "en", bbox: `${b.west},${b.south},${b.east},${b.north}` });
  try {
    const res = await fetch(`https://photon.komoot.io/api/?${params}`, {
      headers: { "User-Agent": "Limeni (NASA Space Apps 2026 prototype)" },
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Photon returned ${res.status}`);
    const { features } = (await res.json()) as { features: PhotonFeature[] };

    const seen = new Set<string>();
    const places: Place[] = [];
    for (const f of features) {
      const place = toPlace(f);
      if (!place) continue;
      const key = `${place.name}|${place.detail}`;
      if (seen.has(key)) continue;
      seen.add(key);
      places.push(place);
    }
    return Response.json({ places: places.slice(0, 6) });
  } catch (error) {
    console.error("Places: search failed", error);
    return Response.json({ places: [], error: "Place search is not available right now." }, { status: 502 });
  }
}
