"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DemoLocation } from "@/data/locations";
import type { ClimateProfile } from "@/lib/climate";

const RAIN = "#1f6b3a";
const DROUGHT = "#d99a1e";

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-3 sm:p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold sm:text-2xl">{value}</p>
      <p className="mt-1 text-xs leading-snug text-muted sm:text-sm">{note}</p>
    </div>
  );
}

function signed(n: number, unit: string) {
  if (n === 0) return `no change`;
  return `${n > 0 ? "+" : "−"}${Math.abs(n)} ${unit}`;
}

export default function ClimateStory({
  location,
  profile,
}: {
  location: DemoLocation;
  profile: ClimateProfile;
}) {
  const s = profile.summary;
  const drySpellSeasons = Math.round(s.drySpellRisk * 10);

  return (
    <section className="flex flex-col gap-6">
      <p className="text-sm text-muted">
        {location.name}{location.province ? `, ${location.province}` : ""} · Zone {location.region}: {location.regionNote.toLowerCase()} ·
        records for {s.seasons} seasons ({s.firstSeason} to {s.lastSeason})
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat
          label="Rains usually start"
          value={s.medianOnsetDate ?? "—"}
          note="Middle date across all seasons"
        />
        <Stat
          label="Rain you can rely on"
          value={`${s.reliableRainMm} mm`}
          note={`Reached in 4 seasons out of 5. Typical season: ${s.medianRainMm} mm`}
        />
        <Stat
          label="Reliable growing season"
          value={s.reliableLengthDays === null ? "—" : `${s.reliableLengthDays} days`}
          note="From the start of the rains to the last rains, 4 seasons out of 5"
        />
        <Stat
          label="Mid-season dry spells"
          value={`${drySpellSeasons} in 10 seasons`}
          note="Seasons with 10 or more dry days in a row in January–February"
        />
        <Stat
          label="Hot days"
          value={`${s.meanHotDays} per season`}
          note={`Days above 32 °C, December–March. Trend: ${signed(s.hotDaysTrendPerDecade, "days per decade")}`}
        />
        <Stat
          label="Rainfall trend"
          value={signed(s.rainTrendMmPerDecade, "mm")}
          note="Change in season rainfall per decade"
        />
      </div>

      <div>
        <h3 className="font-medium text-foreground">Rainfall each season</h3>
        <p className="text-sm text-muted">
          October–April total. The line is the amount you can rely on.{" "}
          <span style={{ color: DROUGHT }} className="font-medium">
            Gold
          </span>{" "}
          bars are drought seasons.
        </p>
        <div className="mt-2 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={profile.seasons} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#e4ddcf" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={4} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit=" mm" width={64} />
              <Tooltip formatter={(v) => [`${v} mm`, "Rainfall"]} />
              <ReferenceLine y={s.reliableRainMm} stroke="#231d16" strokeDasharray="4 4" />
              <Bar dataKey="rainMm" radius={[2, 2, 0, 0]}>
                {profile.seasons.map((season) => (
                  <Cell key={season.year} fill={season.drought ? DROUGHT : RAIN} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h3 className="font-medium text-foreground">A typical farming year</h3>
        <p className="text-sm text-muted">Average rainfall by month, July to June.</p>
        <div className="mt-2 h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={profile.monthly} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#e4ddcf" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit=" mm" width={64} />
              <Tooltip formatter={(v) => [`${v} mm`, "Rainfall"]} />
              <Bar dataKey="rainMm" fill={RAIN} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <p className="text-sm text-muted">
        Rainfall: CHIRPS satellite and rain-gauge records (about 5 km across), through NASA SERVIR. Temperature:
        NASA POWER (about 50 km). Treat these as your area&apos;s climate, not a measurement of your exact field.
      </p>
    </section>
  );
}
