"use client";

import { useState } from "react";
import type { ClimateProfile } from "@/lib/climate";
import { MONTHS, dayLabel, farmCalendar } from "@/lib/calendar";
import type { RotationResult } from "@/lib/rotation";

const pct = (day: number) => `${(day / 365) * 100}%`;

const TAB_LABEL: Record<RotationResult["kind"], string> = {
  best: "Best match",
  alternative: "Other option",
  current: "What you grow",
  common: "Usual practice",
};

export default function FarmingCalendar({ results, climate }: { results: RotationResult[]; climate: ClimateProfile }) {
  const [kind, setKind] = useState<RotationResult["kind"]>("best");
  const chosen = results.find((r) => r.kind === kind) ?? results[0];
  const cal = farmCalendar(chosen.crops, climate);

  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
      <h3 className="font-display text-2xl">Your farming year</h3>
      <p className="mt-1 text-sm text-muted">
        When to plant, when each crop grows, and the risky months, from 45 years of weather here.
      </p>

      <div role="tablist" aria-label="Which option" className="mt-4 flex flex-wrap gap-2">
        {results.map((r) => (
          <button
            key={r.kind}
            role="tab"
            type="button"
            aria-selected={r.kind === chosen.kind}
            onClick={() => setKind(r.kind)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              r.kind === chosen.kind ? "bg-leaf text-white" : "bg-background text-muted hover:text-foreground"
            }`}
          >
            {TAB_LABEL[r.kind]}
          </button>
        ))}
      </div>

      <div className="mt-5" role="tabpanel">
        {/* Month header */}
        <div className="grid grid-cols-[4.5rem_1fr] gap-2 sm:grid-cols-[7rem_1fr]">
          <span />
          <div className="grid grid-cols-12 text-center text-[11px] text-muted">
            {MONTHS.map((m) => (
              <span key={m}>
                <span className="sm:hidden">{m[0]}</span>
                <span className="hidden sm:inline">{m}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Conditions row */}
        <div className="mt-1 grid grid-cols-[4.5rem_1fr] items-center gap-2 sm:grid-cols-[7rem_1fr]">
          <span className="text-xs text-muted">Weather</span>
          <div className="grid h-7 grid-cols-12 overflow-hidden rounded-md">
            {MONTHS.map((m, i) => {
              const risky = cal.drySpellMonths.includes(i) || cal.hotMonths.includes(i);
              const dry = cal.dryMonths.includes(i);
              return (
                <span
                  key={m}
                  title={risky ? "Dry spells or heat are common" : dry ? "Dry season" : "Rainy season"}
                  className={risky ? "bg-maize" : dry ? "bg-line" : "bg-leaf-soft"}
                />
              );
            })}
          </div>
        </div>

        {/* One row per season of the rotation */}
        {chosen.crops.map((crop, i) => {
          const w = cal.crops.find((x) => x.crop.id === crop.id);
          return (
            <div key={`${crop.id}-${i}`} className="mt-2 grid grid-cols-[4.5rem_1fr] items-center gap-2 sm:grid-cols-[7rem_1fr]">
              <span className="text-xs leading-tight">
                <span className="block text-muted">Season {i + 1}</span>
                <span className="font-semibold">{crop.family === "fallow" ? "Rest" : crop.name}</span>
              </span>
              <div className="relative h-8 rounded-md bg-background">
                {cal.bareMonths.map((m) => (
                  <span
                    key={m}
                    className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,transparent_0_4px,var(--line)_4px_6px)]"
                    style={{ left: pct([0, 31, 62, 92, 123, 153, 184, 215, 243, 274, 304, 335][m]), width: `${100 / 12}%` }}
                  />
                ))}
                {w && (
                  <>
                    <span
                      className="absolute inset-y-1 rounded bg-leaf"
                      style={{ left: pct(w.start), width: pct(w.endEarly - w.start) }}
                      title={`Grows from ${dayLabel(w.start)} to ${dayLabel(w.endEarly)}`}
                    />
                    <span
                      className="absolute inset-y-1 rounded-r bg-leaf/40"
                      style={{ left: pct(w.endEarly), width: pct(Math.max(0, w.endLate - w.endEarly)) }}
                      title="Later-maturing varieties"
                    />
                    <span
                      className={`absolute inset-y-0 rounded border-2 ${w.sensitiveAtRisk ? "border-clay" : "border-white/80"}`}
                      style={{ left: pct(w.sensitiveStart), width: pct(w.sensitiveEnd - w.sensitiveStart) }}
                      title="Most sensitive stage: flowering and filling"
                    />
                  </>
                )}
              </div>
            </div>
          );
        })}

        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
          <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-leaf" />Growing</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-leaf/40" />Later varieties</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded border-2 border-clay" />Sensitive stage at risk</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-maize" />Dry spells or heat common</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-[repeating-linear-gradient(135deg,transparent_0_4px,var(--line)_4px_6px)] ring-1 ring-line" />Field bare</li>
        </ul>
      </div>

      <ul className="mt-5 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
        {cal.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">
        Growing periods use typical maturity times; the sensitive stage is estimated as 40–65% of the way to harvest.
        Your seed packet or extension officer can give exact dates for your variety.
      </p>
    </section>
  );
}
