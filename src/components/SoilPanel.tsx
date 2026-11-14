"use client";

import { useRef, useState } from "react";
import type { Fertility, SoilTexture } from "@/data/crops";
import { CACL2_TO_WATER, fertilityOf, hasSoil, phInWater, type SoilInfo } from "@/lib/soil";

type Choice<T> = { value: T | undefined; label: string; hint?: string };

const TEXTURES: Choice<SoilTexture>[] = [
  { value: "light", label: "Sandy", hint: "Gritty. Falls apart when you squeeze a wet handful." },
  { value: "medium", label: "Loam", hint: "Soft. Holds its shape loosely when squeezed." },
  { value: "heavy", label: "Clay", hint: "Sticky. Rolls into a thin sausage when wet." },
  { value: undefined, label: "Not sure" },
];

const DRAINAGE: Choice<"well" | "poor">[] = [
  { value: "well", label: "Drains well", hint: "Water soaks away within a day after heavy rain." },
  { value: "poor", label: "Stays wet", hint: "Water stands for days in the rainy season." },
  { value: undefined, label: "Not sure" },
];

const FERTILITY: Choice<Fertility>[] = [
  { value: "low", label: "Low", hint: "Crops look pale or yellow without fertiliser." },
  { value: "moderate", label: "Medium" },
  { value: "high", label: "High", hint: "Dark soil, crops grow well with little fertiliser." },
  { value: undefined, label: "Not sure" },
];

function ChoiceGroup<T extends string>({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: Choice<T>[];
  value: T | undefined;
  onChange: (v: T | undefined) => void;
}) {
  return (
    <fieldset>
      <legend className="font-medium">{label}</legend>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {choices.map((c) => {
          const on = c.value === value;
          return (
            <button
              key={c.label}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(c.value)}
              className={`rounded-xl border-2 px-3 py-2.5 text-left transition ${
                on ? "border-leaf bg-leaf-soft" : "border-line bg-background hover:border-muted"
              }`}
            >
              <span className="block text-sm font-semibold">{c.label}</span>
              {c.hint && <span className="mt-0.5 block text-xs leading-snug text-muted">{c.hint}</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

const numberOrUndefined = (raw: string, min: number, max: number) => {
  const n = Number(raw);
  return raw.trim() === "" || !Number.isFinite(n) || n < min || n > max ? undefined : n;
};

export default function SoilPanel({ soil, onChange }: { soil: SoilInfo; onChange: (soil: SoilInfo) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState<{ status: "idle" | "reading" | "done" | "error"; message?: string }>({
    status: "idle",
  });
  // Text boxes keep what is typed (e.g. "5."), and only valid numbers reach the scores.
  const [phText, setPhText] = useState(soil.ph?.toString() ?? "");
  const [ocText, setOcText] = useState(soil.organicCarbonPct?.toString() ?? "");
  const known = hasSoil(soil);
  const set = (patch: Partial<SoilInfo>) => onChange({ ...soil, ...patch });

  async function readReport(file: File) {
    setReading({ status: "reading" });
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/soil-report", { method: "POST", body });
      const data = (await res.json()) as { soil?: SoilInfo; found?: string[]; error?: string };
      if (!res.ok || !data.soil) {
        setReading({ status: "error", message: data.error ?? "Couldn't read that file." });
        return;
      }
      const next = { ...soil, ...data.soil };
      onChange(next);
      setPhText(next.ph?.toString() ?? "");
      setOcText(next.organicCarbonPct?.toString() ?? "");
      setReading({
        status: "done",
        message: `Found ${data.found?.join(", ")}. Check these below and correct anything that looks wrong.`,
      });
    } catch {
      setReading({ status: "error", message: "Couldn't upload the file. Check your connection." });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function clearAll() {
    onChange({});
    setPhText("");
    setOcText("");
    setReading({ status: "idle" });
  }

  const water = phInWater(soil);

  return (
    <details className="group rounded-2xl border border-line bg-card" open={known || reading.status !== "idle"}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4 sm:p-5">
        <span>
          <span className="block font-semibold">Your soil</span>
          <span className="block text-sm text-muted">
            {known
              ? "Your soil is being used in the scores below."
              : "Optional. Have a soil test, or know your soil? Add it for better advice."}
          </span>
        </span>
        <span className="mt-1 text-muted transition group-open:rotate-180" aria-hidden="true">
          ▾
        </span>
      </summary>

      <div className="flex flex-col gap-6 border-t border-line p-4 sm:p-5">
        <div className="rounded-xl bg-background p-4">
          <p className="font-medium">Have a soil test report?</p>
          <p className="mt-1 text-sm text-muted">
            Take a photo of it or upload the PDF, and we&apos;ll fill in the values for you to check. The file is sent to
            DeepSeek to read the numbers, and is not stored.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="sr-only"
            id="soil-report"
            onChange={(e) => e.target.files?.[0] && readReport(e.target.files[0])}
          />
          <label
            htmlFor="soil-report"
            className={`mt-3 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full px-5 py-3 font-semibold transition sm:w-auto ${
              reading.status === "reading" ? "pointer-events-none bg-line text-muted" : "bg-leaf text-white hover:bg-leaf-dark"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {reading.status === "reading" ? "Reading your report…" : "Upload photo or PDF"}
          </label>
          {reading.message && (
            <p
              role="status"
              className={`mt-3 rounded-lg px-3 py-2 text-sm ${reading.status === "error" ? "bg-maize-soft text-clay" : "bg-leaf-soft"}`}
            >
              {reading.message}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="soil-ph" className="font-medium">
              Soil pH
            </label>
            <p className="text-xs text-muted">How acidic the soil is. Most Zambian soils are 4.5–7.</p>
            <input
              id="soil-ph"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={3}
              max={10}
              placeholder="e.g. 5.2"
              value={phText}
              onChange={(e) => {
                setPhText(e.target.value);
                set({ ph: numberOrUndefined(e.target.value, 3, 10) });
              }}
              className="mt-2 w-full rounded-lg border border-line bg-background px-3 py-2.5 text-base"
            />
          </div>
          <div>
            <label htmlFor="soil-ph-method" className="font-medium">
              How was pH measured?
            </label>
            <p className="text-xs text-muted">Shown next to pH on lab reports.</p>
            <select
              id="soil-ph-method"
              value={soil.phMethod ?? "water"}
              onChange={(e) => set({ phMethod: e.target.value as SoilInfo["phMethod"] })}
              className="mt-2 w-full rounded-lg border border-line bg-background px-3 py-2.5 text-base"
            >
              <option value="water">In water (H₂O), or not stated</option>
              <option value="CaCl2">In CaCl₂ or KCl (common on Zambian reports)</option>
            </select>
          </div>
          {soil.phMethod === "CaCl2" && water !== undefined && (
            <p className="text-sm text-muted sm:col-span-2">
              CaCl₂ readings run about {CACL2_TO_WATER} lower than pH in water, so we use about <strong>{water}</strong>.
            </p>
          )}
        </div>

        <ChoiceGroup label="Soil texture" choices={TEXTURES} value={soil.texture} onChange={(v) => set({ texture: v })} />
        <ChoiceGroup label="Drainage" choices={DRAINAGE} value={soil.drainage} onChange={(v) => set({ drainage: v })} />

        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="soil-oc" className="font-medium">
              Organic carbon (%)
            </label>
            <p className="text-xs text-muted">From a lab report. If yours shows organic matter, divide it by 1.72.</p>
            <input
              id="soil-oc"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={0}
              max={30}
              placeholder="e.g. 0.9"
              value={ocText}
              onChange={(e) => {
                setOcText(e.target.value);
                set({ organicCarbonPct: numberOrUndefined(e.target.value, 0, 30) });
              }}
              className="mt-2 w-full rounded-lg border border-line bg-background px-3 py-2.5 text-base sm:w-48"
            />
          </div>
          {soil.organicCarbonPct === undefined ? (
            <ChoiceGroup
              label="No report? How fertile is the soil?"
              choices={FERTILITY}
              value={soil.fertility}
              onChange={(v) => set({ fertility: v })}
            />
          ) : (
            <p className="text-sm text-muted">
              That counts as <strong>{fertilityOf(soil)}</strong> fertility (under 1% is low, over 2% is high).
            </p>
          )}
        </div>

        {known && (
          <button type="button" onClick={clearAll} className="self-start text-sm font-medium text-clay underline">
            Clear soil details
          </button>
        )}
      </div>
    </details>
  );
}
