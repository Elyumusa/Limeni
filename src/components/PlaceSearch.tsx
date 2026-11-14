"use client";

import { useEffect, useId, useRef, useState } from "react";

export type PlacePick = { name: string; detail: string; lat: number; lon: number };

/** Search-as-you-type box for towns, villages and streets in Zambia. */
export default function PlaceSearch({ onPick }: { onPick: (place: PlacePick) => void }) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<PlacePick[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const listId = useId();
  const latest = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const ticket = ++latest.current;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as { places: PlacePick[] };
        if (ticket !== latest.current) return;
        setPlaces(data.places);
        setActive(data.places.length ? 0 : -1);
        setStatus(!res.ok ? "error" : data.places.length ? "idle" : "empty");
        setOpen(true);
      } catch {
        if (ticket === latest.current) setStatus("error");
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  function onType(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      latest.current++;
      setPlaces([]);
      setOpen(false);
      setStatus("idle");
    } else setStatus("loading");
  }

  function pick(place: PlacePick) {
    setQuery(place.name);
    setOpen(false);
    onPick(place);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || places.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % places.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + places.length) % places.length);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(places[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <label htmlFor={`${listId}-input`} className="text-sm font-medium">
        Search for your town, village or road
      </label>
      <div className="relative mt-1">
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          id={`${listId}-input`}
          type="text"
          role="combobox"
          aria-expanded={open && places.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          placeholder="e.g. Chongwe, Mazabuka, Kabwe"
          value={query}
          onChange={(e) => onType(e.target.value)}
          onFocus={() => places.length > 0 && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          className="w-full rounded-xl border border-line bg-card py-3 pl-10 pr-3 text-base shadow-sm outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20"
        />
      </div>
      {status === "loading" && <p className="mt-1 text-xs text-muted">Searching…</p>}
      {status === "empty" && <p className="mt-1 text-xs text-muted">No places found in Zambia. Try a nearby town, or tap the map.</p>}
      {status === "error" && <p className="mt-1 text-xs text-clay">Search isn&apos;t working right now. You can still tap the map.</p>}
      {open && places.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-line bg-card py-1 shadow-lg"
        >
          {places.map((p, i) => (
            <li
              key={`${p.name}-${p.lat}-${p.lon}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-4 py-2.5 ${i === active ? "bg-leaf-soft" : ""}`}
            >
              <span className="block font-medium">{p.name}</span>
              {p.detail && <span className="block text-sm text-muted">{p.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
