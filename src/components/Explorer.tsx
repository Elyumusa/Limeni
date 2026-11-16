"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import ClimateStory from "@/components/ClimateStory";
import CoordinateInput from "@/components/CoordinateInput";
import type { BaseMap, FocusRequest, MapPoint } from "@/components/FieldMap";
import PlaceSearch, { type PlacePick } from "@/components/PlaceSearch";
import RotationPlanner from "@/components/RotationPlanner";
import StepHeader from "@/components/StepHeader";
import { CLIMATE } from "@/data/climate";
import { GIBS_LAYERS } from "@/data/gibs";
import { LOCATIONS, zoneFor, type DemoLocation } from "@/data/locations";
import type { ClimateProfile } from "@/lib/climate";
import { centroid, distanceM, formatCoords, formatHa, polygonAreaHa, type LatLon } from "@/lib/geo";
import { findClearHls, formatDay, type HlsImage } from "@/lib/hls";
import type { Terrain } from "@/lib/terrain";

// Leaflet needs the browser, so the map is loaded on the client only.
const FieldMap = dynamic(() => import("@/components/FieldMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-line" />,
});

type Custom = {
  point: MapPoint;
  detail: string;
  status: "loading" | "done" | "error";
  progress: number;
  profile?: ClimateProfile;
  error?: string;
};

type ClimateReply =
  | { status: "done"; profile: ClimateProfile }
  | { status: "pending"; jobs?: string[]; progress?: number }
  | { error: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** How the farmer chose a spot. It decides how far the map zooms in. */
type PickHow = "search" | "tap" | "exact" | "drag" | "field";
const ZOOM_FOR: Record<PickHow, number | null> = { search: 11, tap: 8, exact: 16, drag: null, field: null };

/** Rainfall is ~5 km data: moving within the same 0.01° cell needn't download it again. */
const cellKey = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

type Field = { points: LatLon[]; areaHa: number };
const FIELD_KEY = "limeni.field.v1";
/** A field counts as "this farm" when its middle is this close to the chosen spot. */
const FIELD_NEAR_M = 5_000;

type HlsResult = { key: string; image: HlsImage | null };

export default function Explorer() {
  const [selectedId, setSelectedId] = useState<string | null>("mkushi");
  const [custom, setCustom] = useState<Custom | null>(null);
  const [layerId, setLayerId] = useState<string>("none");
  const ticket = useRef(0);
  // Slope from NASA SRTM, keyed by point so a stale answer is never shown for a new spot.
  const [terrain, setTerrain] = useState<{ key: string; value: Terrain | null } | null>(null);
  const [base, setBase] = useState<BaseMap>("map");
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const focusN = useRef(0);
  const [field, setField] = useState<Field | null>(null);
  const [savedField, setSavedField] = useState<Field | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<LatLon[]>([]);
  const [hlsBefore, setHlsBefore] = useState<string | null>(null);
  const [hlsResult, setHlsResult] = useState<HlsResult | null>(null);

  const showHls = layerId === "hls";
  const layer = showHls ? null : (GIBS_LAYERS.find((l) => l.id === layerId) ?? null);

  // A field saved on this phone from an earlier visit.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FIELD_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time load from storage after mount
      if (raw) setSavedField(JSON.parse(raw) as Field);
    } catch {
      /* storage unavailable: nothing saved */
    }
  }, []);

  function moveMap(lat: number, lon: number, zoom: number, bounds?: LatLon[], exact = false) {
    setFocus({ lat, lon, zoom, bounds, exact, n: ++focusN.current });
  }

  function pickDemo(id: string) {
    ticket.current++;
    setCustom(null);
    setSelectedId(id);
    const loc = LOCATIONS.find((l) => l.id === id);
    if (loc) moveMap(loc.lat, loc.lon, 6);
  }

  async function pickPoint(place: { lat: number; lon: number; name?: string; detail?: string }, how: PickHow) {
    // Same ~5 km rainfall cell as the spot already chosen: keep its weather
    // (or its download in progress) and only move the pin.
    const sameCell =
      custom !== null && custom.status !== "error" && cellKey(custom.point.lat, custom.point.lon) === cellKey(place.lat, place.lon);
    const my = sameCell ? ticket.current : ++ticket.current;
    const named = how === "search" && !!place.name;
    const zoom = ZOOM_FOR[how];
    if (zoom !== null) moveMap(place.lat, place.lon, zoom);
    if (how === "exact") setBase("satellite");
    setSelectedId(null);

    const exactDetail = how === "search" ? "" : formatCoords(place);
    const point = { lat: place.lat, lon: place.lon, name: place.name ?? formatCoords(place, 2) };
    const detail = named ? (place.detail ?? "") : exactDetail;
    setCustom((c) =>
      sameCell && c ? { ...c, point, detail } : { point, detail, status: "loading", progress: 0 },
    );
    const update = (patch: Partial<Custom>) =>
      my === ticket.current && setCustom((c) => (c ? { ...c, ...patch, point: { ...c.point, ...patch.point } } : c));

    // Typed, tapped and dragged points have no place name yet: look one up while the weather loads.
    if (!named) {
      fetch(`/api/places?lat=${place.lat}&lon=${place.lon}`)
        .then((r) => r.json())
        .then(({ place: p }: { place: PlacePick | null }) => {
          // Only name the pin if it hasn't moved again since.
          if (p)
            setCustom((c) =>
              c && c.point.lat === place.lat && c.point.lon === place.lon
                ? {
                    ...c,
                    point: { ...c.point, name: `Near ${p.name}` },
                    detail: [p.detail, exactDetail].filter(Boolean).join(" · "),
                  }
                : c,
            );
        })
        .catch(() => {});
    }
    if (sameCell) return;

    try {
      let reply = (await (
        await fetch("/api/climate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: place.lat, lon: place.lon }),
        })
      ).json()) as ClimateReply;
      const jobs = "jobs" in reply ? reply.jobs : undefined;
      while ("status" in reply && reply.status === "pending") {
        if (my !== ticket.current) return;
        await sleep(4000);
        reply = (await (
          await fetch(`/api/climate?lat=${place.lat}&lon=${place.lon}&jobs=${(jobs ?? []).join(",")}`)
        ).json()) as ClimateReply;
        if ("status" in reply && reply.status === "pending") update({ progress: reply.progress ?? 0 });
      }
      if ("error" in reply) update({ status: "error", error: reply.error });
      else update({ status: "done", progress: 100, profile: reply.profile });
    } catch {
      update({ status: "error", error: "Could not reach the weather service. Check your connection and try again." });
    }
  }

  // The location and climate the rest of the page works from.
  let location: DemoLocation | null = null;
  let climate: ClimateProfile | null = null;
  if (custom?.status === "done" && custom.profile) {
    climate = custom.profile;
    location = {
      id: `point-${custom.point.lat.toFixed(2)},${custom.point.lon.toFixed(2)}`,
      name: custom.point.name,
      province: custom.detail,
      ...zoneFor(climate.summary.medianRainMm),
      lat: custom.point.lat,
      lon: custom.point.lon,
    };
  } else if (!custom && selectedId) {
    location = LOCATIONS.find((l) => l.id === selectedId) ?? null;
    climate = location ? CLIMATE[location.id] : null;
  }

  // The spot the farmer chose (even while its weather is still loading).
  const spot: LatLon | null = custom ? custom.point : location;
  // The drawn field belongs to this spot when its middle is close by.
  const fieldHere = field && spot && distanceM(centroid(field.points), spot) < FIELD_NEAR_M ? field : null;

  const pointKey = fieldHere
    ? `field=${fieldHere.points.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join(";")}`
    : location
      ? `lat=${location.lat.toFixed(3)}&lon=${location.lon.toFixed(3)}`
      : null;
  useEffect(() => {
    if (!pointKey) return;
    let live = true;
    fetch(`/api/terrain?${pointKey}`)
      .then((r) => r.json())
      .then((d: { terrain: Terrain | null }) => live && setTerrain({ key: pointKey, value: d.terrain }))
      .catch(() => live && setTerrain({ key: pointKey, value: null }));
    return () => {
      live = false;
    };
  }, [pointKey]);
  const terrainNow = terrain && terrain.key === pointKey ? terrain.value : undefined;

  // NASA HLS: find the latest clear 30 m image of the spot when that view is on.
  const hlsKey = showHls && spot ? `${spot.lat.toFixed(4)},${spot.lon.toFixed(4)}|${hlsBefore ?? "now"}` : null;
  useEffect(() => {
    if (!hlsKey) return;
    const [ll, before] = hlsKey.split("|");
    const [lat, lon] = ll.split(",").map(Number);
    const ctrl = new AbortController();
    findClearHls({ lat, lon }, ctrl.signal, before === "now" ? new Date() : new Date(`${before}T12:00:00Z`))
      .then((image) => !ctrl.signal.aborted && setHlsResult({ key: hlsKey, image }))
      .catch(() => !ctrl.signal.aborted && setHlsResult({ key: hlsKey, image: null }));
    return () => ctrl.abort();
  }, [hlsKey]);
  const hlsNow = hlsKey && hlsResult?.key === hlsKey ? hlsResult : null;
  const hlsImage = hlsNow?.image ?? null;

  function chooseLayer(id: string) {
    setLayerId(id);
    setHlsBefore(null);
    // 30 m pixels look sharp around zoom 14; closer in they turn to blocks.
    if (id === "hls" && spot) moveMap(spot.lat, spot.lon, 14, undefined, true);
  }

  function olderHls() {
    if (!hlsImage) return;
    const d = new Date(`${hlsImage.date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    setHlsBefore(d.toISOString().slice(0, 10));
  }

  function onMapClick(lat: number, lon: number) {
    if (drawing) setDraft((d) => [...d, { lat, lon }]);
    else pickPoint({ lat, lon }, "tap");
  }

  function startDrawing() {
    setDrawing(true);
    setDraft([]);
    setBase("satellite");
    if (spot) moveMap(spot.lat, spot.lon, 16);
  }

  function saveField(points: LatLon[]): Field {
    const next: Field = { points, areaHa: polygonAreaHa(points) };
    setField(next);
    setSavedField(next);
    try {
      window.localStorage.setItem(FIELD_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: the field still works for this visit */
    }
    return next;
  }

  function finishDrawing() {
    if (draft.length < 3) return;
    const next = saveField(draft);
    setDrawing(false);
    setDraft([]);
    const mid = centroid(next.points);
    // The field's middle becomes the farm's spot, unless the pin is already on the field.
    if (!spot || distanceM(mid, spot) > 150) pickPoint(mid, "field");
    moveMap(mid.lat, mid.lon, 17, next.points);
  }

  function goToSavedField() {
    if (!savedField) return;
    setField(savedField);
    setBase("satellite");
    const mid = centroid(savedField.points);
    pickPoint(mid, "field");
    moveMap(mid.lat, mid.lon, 17, savedField.points);
  }

  function removeField() {
    setField(null);
    setSavedField(null);
    try {
      window.localStorage.removeItem(FIELD_KEY);
    } catch {
      /* nothing to remove */
    }
  }

  const draftHa = polygonAreaHa(draft);

  return (
    <div id="plan" className="flex scroll-mt-4 flex-col gap-16">
      <section className="flex flex-col gap-6">
        <StepHeader
          n={1}
          title="Find your farm"
          lead="Search for the nearest town or village, enter your farm's exact coordinates, or tap anywhere in Zambia on the map. Then draw your field to see it from space. Not sure? Start with one of the three example areas."
        />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <PlaceSearch onPick={(p) => pickPoint(p, "search")} />
            <CoordinateInput onPick={(p) => pickPoint(p, "exact")} />
            <div className="relative h-[380px] overflow-hidden rounded-2xl border border-line lg:h-[480px]">
              <FieldMap
                selectedId={selectedId}
                onSelect={pickDemo}
                customPoint={custom?.point ?? null}
                onMapClick={onMapClick}
                onPinMove={(lat, lon) => pickPoint({ lat, lon }, "drag")}
                layer={layer}
                base={base}
                hls={showHls ? hlsImage : null}
                focus={focus}
                drawing={drawing}
                draft={draft}
                field={drawing || !field ? null : field.points}
              />
              <div
                role="radiogroup"
                aria-label="Map style"
                className="absolute right-2 top-2 z-[2] flex rounded-full bg-card/95 p-1 text-xs font-semibold shadow-md"
              >
                {(["map", "satellite"] as const).map((b) => (
                  <button
                    key={b}
                    type="button"
                    role="radio"
                    aria-checked={base === b}
                    onClick={() => setBase(b)}
                    className={`rounded-full px-3 py-1.5 ${base === b ? "bg-leaf text-white" : "text-muted hover:text-foreground"}`}
                  >
                    {b === "map" ? "Map" : "Satellite"}
                  </button>
                ))}
              </div>
              <p className="pointer-events-none absolute left-12 top-2 z-[2] max-w-[calc(100%-11rem)] rounded-2xl bg-card/95 px-3 py-1.5 text-xs font-medium text-foreground shadow-md">
                {drawing
                  ? draft.length === 0
                    ? "Zoom in to your field, then tap each corner"
                    : `${draft.length} corner${draft.length > 1 ? "s" : ""}${draft.length >= 3 ? ` · ${formatHa(draftHa)}` : ""}`
                  : custom
                    ? "Drag the pin to fine-tune your spot"
                    : "Tap the map to choose a spot"}
              </p>
            </div>

            {drawing ? (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border-2 border-maize bg-maize-soft p-3">
                <p className="w-full text-sm">
                  <strong>Drawing your field.</strong> Tap each corner of your field in order, then press Finish.
                </p>
                <button
                  type="button"
                  onClick={finishDrawing}
                  disabled={draft.length < 3}
                  className="rounded-xl bg-leaf px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Finish{draft.length >= 3 ? ` (${formatHa(draftHa)})` : ""}
                </button>
                <button
                  type="button"
                  onClick={() => setDraft((d) => d.slice(0, -1))}
                  disabled={draft.length === 0}
                  className="rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  Undo corner
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawing(false);
                    setDraft([]);
                  }}
                  className="rounded-xl px-3 py-2.5 text-sm font-semibold text-muted hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            ) : field ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-card p-3">
                <p className="text-sm">
                  <span className="font-semibold">Your field: {formatHa(field.areaHa)}</span>
                  <span className="text-muted"> · saved on this phone{fieldHere ? "" : " · far from the chosen spot"}</span>
                </p>
                <span className="flex gap-2">
                  <button
                    type="button"
                    onClick={startDrawing}
                    className="rounded-xl border border-line px-3 py-2 text-sm font-semibold hover:border-muted"
                  >
                    Redraw
                  </button>
                  <button
                    type="button"
                    onClick={removeField}
                    className="rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:text-clay"
                  >
                    Remove
                  </button>
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={startDrawing}
                  className="flex items-center gap-2 rounded-xl border-2 border-leaf bg-card px-4 py-2.5 text-sm font-semibold text-leaf-dark hover:bg-leaf-soft"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path d="M4 18 8 5l11 3-2 11z" strokeLinejoin="round" />
                  </svg>
                  Draw my field
                </button>
                {savedField && (
                  <button
                    type="button"
                    onClick={goToSavedField}
                    className="rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold hover:border-muted"
                  >
                    Go to my saved field ({formatHa(savedField.areaHa)})
                  </button>
                )}
              </div>
            )}

            <label className="flex flex-col gap-1 text-sm text-muted">
              Show a NASA satellite view on the map
              <select
                value={layerId}
                onChange={(e) => chooseLayer(e.target.value)}
                className="w-full min-w-0 rounded-lg border border-line bg-card px-3 py-2.5 text-base text-foreground"
              >
                <option value="none">None (plain map)</option>
                <option value="hls">Your farm up close (30 m)</option>
                {GIBS_LAYERS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            {layer && <p className="text-sm text-muted">{layer.description}</p>}
            {showHls && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted" aria-live="polite">
                {!spot ? (
                  <p>Choose a spot first, then we&apos;ll find a recent cloud-free NASA image of it.</p>
                ) : !hlsNow ? (
                  <p>Looking for the latest cloud-free NASA image of your spot…</p>
                ) : hlsImage ? (
                  <>
                    <p>
                      NASA Harmonized Landsat and Sentinel-2 image from{" "}
                      <strong className="text-foreground">{formatDay(hlsImage.date)}</strong> ({hlsImage.source.label}), 30 m
                      detail. Greener means more growing plants.
                    </p>
                    <button type="button" onClick={olderHls} className="font-semibold text-leaf-dark underline underline-offset-2">
                      Show an older image
                    </button>
                  </>
                ) : (
                  <p>No cloud-free image of this spot in the last 90 days. Try the Satellite map style instead.</p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {custom && (
              <div className="rounded-2xl border-2 border-maize bg-maize-soft p-5" aria-live="polite">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-clay">Your spot</p>
                <p className="mt-1 text-lg font-semibold">{custom.point.name}</p>
                {custom.detail && <p className="text-sm text-muted">{custom.detail}</p>}
                {custom.status === "loading" && (
                  <>
                    <p className="mt-3 text-sm">
                      Downloading 45 years of satellite rainfall for this spot. This can take up to 2 minutes, because the rainfall service works through a queue.
                    </p>
                    <div className="mt-2 h-2 rounded-full bg-card">
                      <div
                        className="h-2 rounded-full bg-leaf transition-all duration-700"
                        style={{ width: `${Math.max(6, custom.progress)}%` }}
                      />
                    </div>
                  </>
                )}
                {custom.status === "done" && custom.profile && (
                  <p className="mt-2 text-sm">
                    About <strong>{custom.profile.summary.medianRainMm} mm</strong> of rain in a typical season
                    {fieldHere && (
                      <>
                        {" "}
                        · your field is <strong>{formatHa(fieldHere.areaHa)}</strong>
                      </>
                    )}
                  </p>
                )}
                {custom.status === "error" && <p className="mt-2 text-sm text-clay">{custom.error}</p>}
                <p className="mt-3 text-xs text-muted">
                  Rainfall is satellite data for about 5 km around your spot, so nearby farms share it. Slope
                  {fieldHere ? ", field size" : ""} and the satellite view are for your exact spot.
                </p>
              </div>
            )}

            <p className="text-sm font-medium text-muted">{custom ? "Or use an example area" : "Example areas"}</p>
            <div role="radiogroup" aria-label="Example areas" className="flex flex-col gap-3">
              {LOCATIONS.map((loc) => {
                const on = loc.id === selectedId;
                const s = CLIMATE[loc.id].summary;
                return (
                  <button
                    key={loc.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => pickDemo(loc.id)}
                    className={`rounded-2xl border-2 p-4 text-left transition ${
                      on ? "border-leaf bg-leaf-soft" : "border-line bg-card hover:border-muted"
                    }`}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">{loc.name}</span>
                      <span className="text-sm text-muted">{loc.province}</span>
                    </span>
                    <span className="mt-1 block text-sm text-muted">
                      {loc.regionNote} · about {s.medianRainMm} mm a season
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {location && climate ? (
        <>
          <section className="flex flex-col gap-6">
            <StepHeader
              n={2}
              title={`The weather in ${location.name}`}
              lead="What 45 years of satellite records say about rain and heat here. This is what decides which crops can thrive."
            />
            <ClimateStory location={location} profile={climate} terrain={terrainNow} />
          </section>
          <RotationPlanner
            location={location}
            climate={climate}
            terrain={terrainNow ?? null}
            fieldHa={fieldHere ? fieldHere.areaHa : null}
          />
        </>
      ) : (
        <section className="rounded-2xl border border-dashed border-line p-8 text-center text-muted">
          {custom?.status === "error"
            ? "Pick another spot, or one of the example areas, to continue."
            : "Your weather, farm questions and options will appear here once the rainfall records for your spot have loaded."}
        </section>
      )}
    </div>
  );
}
