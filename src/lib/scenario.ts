/**
 * "What if" scenarios: shift the past 45 seasons to see how the options hold
 * up if future seasons are drier or hotter.
 *
 * Deliberately simple and stated plainly in the app: rainfall in every past
 * season is scaled by the same percentage, and extra hot days are added to
 * each season. Rain start dates, season length and dry-spell frequency are
 * left unchanged, so the real effect of a drier future may be larger.
 */
import { DROUGHT_FRACTION, quantile, type ClimateProfile } from "@/lib/climate";

export type Scenario = { rainPct: number; extraHotDays: number };

export const NO_SCENARIO: Scenario = { rainPct: 0, extraHotDays: 0 };

export const isScenario = (s: Scenario) => s.rainPct !== 0 || s.extraHotDays !== 0;

export function describeScenario(s: Scenario): string {
  const parts: string[] = [];
  if (s.rainPct !== 0) parts.push(`${Math.abs(s.rainPct)}% ${s.rainPct < 0 ? "less" : "more"} rain`);
  if (s.extraHotDays !== 0) parts.push(`${s.extraHotDays} more hot days`);
  return parts.length ? `${parts.join(" and ")} every season` : "past weather as it was";
}

export function applyScenario(profile: ClimateProfile, s: Scenario): ClimateProfile {
  if (!isScenario(s)) return profile;
  const factor = 1 + s.rainPct / 100;
  // Droughts are still judged against the area's real median, so a drier scenario shows more of them.
  const droughtLine = DROUGHT_FRACTION * profile.summary.medianRainMm;
  const seasons = profile.seasons.map((season) => {
    const rainMm = Math.round(season.rainMm * factor);
    return { ...season, rainMm, hotDays: season.hotDays + s.extraHotDays, drought: rainMm < droughtLine };
  });
  const rains = seasons.map((x) => x.rainMm);
  return {
    ...profile,
    seasons,
    monthly: profile.monthly.map((m) => ({ ...m, rainMm: Math.round(m.rainMm * factor) })),
    summary: {
      ...profile.summary,
      medianRainMm: Math.round(quantile(rains, 0.5)),
      reliableRainMm: Math.round(quantile(rains, 0.2)),
      meanHotDays: profile.summary.meanHotDays + s.extraHotDays,
      droughtSeasons: seasons.filter((x) => x.drought).map((x) => x.label),
    },
  };
}
