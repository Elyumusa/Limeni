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
import Glossary from "@/components/Glossary";
import { quantile, type ClimateProfile } from "@/lib/climate";
import { rainTrendMeaning, reliableRainMeaning, seasonLengthMeaning, soilWetnessMeaning } from "@/lib/explain";
import type { Terrain } from "@/lib/terrain";

const RAIN = "#1f6b3a";
const DROUGHT = "#d99a1e";

function Stat({ label, value, note, meaning }: { label: string; value: string; note: string; meaning?: string }) {
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-card p-3 sm:p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold sm:text-2xl">{value}</p>
      <p className="mt-1 text-xs leading-snug text-muted sm:text-sm">{note}</p>
      {meaning && (
        <p className="mt-3 rounded-xl bg-leaf-soft px-3 py-2 text-xs leading-snug text-foreground sm:text-sm">
          <span className="font-semibold text-leaf-dark">What it means: </span>
          {meaning}
        </p>
      )}
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
  terrain,
}: {
  location: DemoLocation;
  profile: ClimateProfile;
  /** undefined while loading, null if the lookup failed. */
  terrain?: Terrain | null;
}) {
  const s = profile.summary;
  const drySpellSeasons = Math.round(s.drySpellRisk * 10);

  // Root-zone soil wetness (Jan–Mar) compared with this area's usual level, in percentage points.
  const wet = profile.seasons.filter((x) => x.rootWetness !== null);
  const usualWet = wet.length ? quantile(wet.map((x) => x.rootWetness as number), 0.5) : null;
  const wetness = wet.map((x) => ({
    label: x.label,
    anomaly: Math.round(((x.rootWetness as number) - (usualWet as number)) * 100),
  }));
  const RISK_WORD = { low: "Low", moderate: "Moderate", high: "High" };
  const trend = rainTrendMeaning(profile);
  const soilWet = usualWet === null ? null : soilWetnessMeaning(usualWet);

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
          note="In half of the years the rains start earlier than this, and in half later."
          meaning="Plant when the ground is properly wet, after a good soaking rain, not on a fixed date. A few early showers followed by dry days can make seeds sprout and then die."
        />
        <Stat
          label="Rain you can rely on"
          value={`${s.reliableRainMm} mm`}
          note={`In 4 years out of 5, at least this much rain falls in the season. A normal year brings about ${s.medianRainMm} mm.`}
          meaning={reliableRainMeaning(s.reliableRainMm)}
        />
        <Stat
          label="Reliable growing season"
          value={s.reliableLengthDays === null ? "—" : `${s.reliableLengthDays} days`}
          note="In 4 years out of 5, the rains last at least this long, from the first planting rains to the last rains."
          meaning={s.reliableLengthDays === null ? undefined : seasonLengthMeaning(s.reliableLengthDays)}
        />
        <Stat
          label="Mid-season dry spells"
          value={`${drySpellSeasons} in 10 seasons`}
          note="Years with 10 or more dry days in a row in January–February."
          meaning="That is when many crops are flowering and filling their grain, so a dry spell then hurts the harvest most. Drought-hardy crops and mulch help."
        />
        <Stat
          label="Hot days"
          value={`${s.meanHotDays} per season`}
          note={`Days above 32 °C, December–March. Change: ${signed(s.hotDaysTrendPerDecade, "days every 10 years")}.`}
          meaning="Very hot days dry out the soil faster and can stop maize and beans from setting grain when they flower."
        />
        <Stat
          label="Is the rain changing?"
          value={trend.word}
          note={`Change in season rainfall: ${signed(s.rainTrendMmPerDecade, "mm every 10 years")}, over ${s.seasons} years of records.`}
          meaning={trend.meaning}
        />
        <Stat
          label="How wet the soil stays, Jan–Mar"
          value={usualWet === null || !soilWet ? "—" : `${soilWet.word} (${Math.round(usualWet * 100)}%)`}
          note="How full of water the soil around plant roots usually is in the main growing months. 0% is bone dry; 100% is soaked through."
          meaning={soilWet?.meaning}
        />
        <Stat
          label={terrain?.basis === "field" ? "Slope of your field" : "Slope around here"}
          value={terrain === undefined ? "Checking…" : terrain === null ? "—" : `${terrain.slopePct}%`}
          note={
            terrain
              ? `${RISK_WORD[terrain.erosionRisk]} risk of soil washing away in heavy rain. From NASA SRTM elevation (${terrain.elevationM} m above sea level).`
              : terrain === null
                ? "Elevation data isn't available right now."
                : "Reading NASA SRTM elevation data."
          }
          meaning={
            !terrain
              ? undefined
              : `A ${terrain.slopePct}% slope means the ground drops about ${Math.round(terrain.slopePct)} m over 100 m. ` +
                (terrain.erosionRisk === "low"
                  ? "That is nearly flat, so heavy rain rarely washes soil away."
                  : terrain.erosionRisk === "moderate"
                    ? "Heavy rain can wash bare soil away: plant across the slope and keep the ground covered."
                    : "Heavy rain washes bare soil away easily: plant across the slope, build contour ridges and keep the ground covered.")
          }
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

      {wetness.length > 0 && (
        <div>
          <h3 className="font-medium text-foreground">Was the soil wetter or drier than usual?</h3>
          <p className="text-sm text-muted">
            Root-zone soil moisture in January–March each season, compared with what is normal here.{" "}
            <span style={{ color: DROUGHT }} className="font-medium">
              Gold
            </span>{" "}
            bars mean drier soil than usual, when crops are more likely to wilt.
          </p>
          <div className="mt-2 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={wetness} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e4ddcf" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={4} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit="%" width={48} />
                <Tooltip formatter={(v) => [`${Number(v) > 0 ? "+" : ""}${v} points`, "Compared with usual"]} />
                <ReferenceLine y={0} stroke="#231d16" />
                <Bar dataKey="anomaly">
                  {wetness.map((x) => (
                    <Cell key={x.label} fill={x.anomaly < 0 ? DROUGHT : RAIN} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

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
        Rainfall: CHIRPS satellite and rain-gauge records (about 5 km across), through NASA SERVIR. Temperature and
        soil moisture: NASA POWER (about 50 km). Treat the weather as your area&apos;s conditions, not a measurement
        of your exact field. Slope: NASA SRTM elevation (30 m),{" "}
        {terrain?.basis === "field" ? "across the field you drew" : "around your spot; draw your field for its own slope"}.
      </p>
      <Glossary />
    </section>
  );
}
