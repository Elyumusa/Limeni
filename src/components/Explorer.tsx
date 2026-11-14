"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import ClimateStory from "@/components/ClimateStory";
import type { MapPoint } from "@/components/FieldMap";
import PlaceSearch, { type PlacePick } from "@/components/PlaceSearch";
import RotationPlanner from "@/components/RotationPlanner";
import StepHeader from "@/components/StepHeader";
import { CLIMATE } from "@/data/climate";
import { GIBS_LAYERS } from "@/data/gibs";
import { LOCATIONS, zoneFor, type DemoLocation } from "@/data/locations";
import type { ClimateProfile } from "@/lib/climate";

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
const coords = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(2)}°${lat < 0 ? "S" : "N"}, ${Math.abs(lon).toFixed(2)}°${lon < 0 ? "W" : "E"}`;

export default function Explorer() {
  const [selectedId, setSelectedId] = useState<string | null>("mkushi");
  const [custom, setCustom] = useState<Custom | null>(null);
  const [layerId, setLayerId] = useState<string>("none");
  const ticket = useRef(0);

  const layer = GIBS_LAYERS.find((l) => l.id === layerId) ?? null;

  function pickDemo(id: string) {
    ticket.current++;
    setCustom(null);
    setSelectedId(id);
  }

  async function pickPoint(place: PlacePick | { lat: number; lon: number }) {
    const my = ++ticket.current;
    const named = "name" in place;
    setSelectedId(null);
    setCustom({
      point: { lat: place.lat, lon: place.lon, name: named ? place.name : coords(place.lat, place.lon) },
      detail: named ? place.detail : "",
      status: "loading",
      progress: 0,
    });
    const update = (patch: Partial<Custom>) =>
      my === ticket.current && setCustom((c) => (c ? { ...c, ...patch, point: { ...c.point, ...patch.point } } : c));

    // A tapped point has no name yet: look one up while the weather loads.
    if (!named) {
      fetch(`/api/places?lat=${place.lat}&lon=${place.lon}`)
        .then((r) => r.json())
        .then(({ place: p }: { place: PlacePick | null }) => {
          if (p) update({ point: { lat: place.lat, lon: place.lon, name: `Near ${p.name}` }, detail: p.detail });
        })
        .catch(() => {});
    }

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

  return (
    <div id="plan" className="flex scroll-mt-4 flex-col gap-16">
      <section className="flex flex-col gap-6">
        <StepHeader
          n={1}
          title="Find your farm"
          lead="Search for the nearest town or village, or tap anywhere in Zambia on the map. Not sure? Start with one of the three example areas."
        />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
          <div className="flex flex-col gap-3">
            <PlaceSearch onPick={pickPoint} />
            <div className="relative h-[340px] overflow-hidden rounded-2xl border border-line lg:h-[440px]">
              <FieldMap
                selectedId={selectedId}
                onSelect={pickDemo}
                customPoint={custom?.point ?? null}
                onMapClick={(lat, lon) => pickPoint({ lat, lon })}
                layer={layer}
              />
              <p className="pointer-events-none absolute bottom-2 left-2 z-[2] rounded-full bg-card/90 px-3 py-1 text-xs text-muted shadow-sm">
                Tap the map to choose a spot
              </p>
            </div>
            <label className="flex flex-col gap-1 text-sm text-muted">
              Show a NASA satellite view on the map
              <select
                value={layerId}
                onChange={(e) => setLayerId(e.target.value)}
                className="rounded-lg border border-line bg-card px-3 py-2.5 text-base text-foreground"
              >
                <option value="none">None (plain map)</option>
                {GIBS_LAYERS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            {layer && <p className="text-sm text-muted">{layer.description}</p>}
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
                  </p>
                )}
                {custom.status === "error" && <p className="mt-2 text-sm text-clay">{custom.error}</p>}
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
            <ClimateStory location={location} profile={climate} />
          </section>
          <RotationPlanner location={location} climate={climate} />
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
