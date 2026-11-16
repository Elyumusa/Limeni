"use client";

import { useId, useState } from "react";
import { formatCoords, parseCoordinates, type LatLon } from "@/lib/geo";
import { inZambiaBox } from "@/lib/sources";

type Props = {
  /** Called with the exact point the farmer typed, pasted or located. */
  onPick: (point: LatLon & { name: string; detail: string }) => void;
};

/** Go to a farm by its exact coordinates, or by the phone's GPS. */
export default function CoordinateInput({ onPick }: Props) {
  const id = useId();
  const [text, setText] = useState("");
  const [message, setMessage] = useState<{ kind: "error" | "note"; text: string } | null>(null);
  const [locating, setLocating] = useState(false);

  function go() {
    const r = parseCoordinates(text);
    if ("error" in r) {
      setMessage({ kind: "error", text: r.error });
      return;
    }
    setMessage(r.note ? { kind: "note", text: r.note } : null);
    onPick({ lat: r.lat, lon: r.lon, name: formatCoords(r), detail: "From the coordinates you entered" });
  }

  function locate() {
    if (!("geolocation" in navigator)) {
      setMessage({ kind: "error", text: "This phone or browser can't share its location." });
      return;
    }
    setLocating(true);
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude: lat, longitude: lon, accuracy } = pos.coords;
        if (!inZambiaBox(lat, lon)) {
          setMessage({ kind: "error", text: "Your location is outside Zambia. Limeni's data covers Zambia only." });
          return;
        }
        setText(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
        setMessage({ kind: "note", text: `Found you to within about ${Math.max(1, Math.round(accuracy))} m.` });
        onPick({ lat, lon, name: formatCoords({ lat, lon }), detail: "From your phone's location" });
      },
      (err) => {
        setLocating(false);
        setMessage({
          kind: "error",
          text:
            err.code === err.PERMISSION_DENIED
              ? "Location access was blocked. Allow it in your browser settings, or type the coordinates."
              : "Couldn't get your location. Try again outside, or type the coordinates.",
        });
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        Or enter your farm&apos;s exact coordinates
      </label>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <input
          id={id}
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="e.g. -13.5432, 29.0811"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-describedby={`${id}-help`}
          className="min-w-0 flex-1 basis-56 rounded-xl border border-line bg-card px-3 py-3 text-base shadow-sm outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20"
        />
        <button
          type="submit"
          className="rounded-xl bg-leaf px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-leaf-dark"
        >
          Go
        </button>
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          className="flex items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-3 text-sm font-semibold shadow-sm hover:border-muted disabled:opacity-60"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
          </svg>
          {locating ? "Finding you…" : "Use my location"}
        </button>
      </form>
      <p id={`${id}-help`} className="text-xs text-muted">
        Decimal (-13.5432, 29.0811), degrees (13°32&apos;35&quot;S 29°04&apos;52&quot;E) or a Google Maps link.
      </p>
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-clay" : "text-leaf-dark"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
