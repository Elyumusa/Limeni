/**
 * Turns daily rainfall and temperature data into the season numbers the app shows.
 * Definitions are listed in PLAN.md section 5.
 *
 * A season runs 1 July – 30 June and is named by its starting year,
 * so season 2023 is the 2023/24 rainy season.
 */

export const WET_DAY_MM = 1;
export const HEAT_THRESHOLD_C = 32;
export const ONSET_RAIN_MM = 20;
export const DROUGHT_FRACTION = 0.75;

/** One value per day, keyed "YYYYMMDD". */
export type DailySeries = Record<string, number>;

/**
 * Daily inputs. Rainfall comes from CHIRPS (satellite + rain gauges, ~5 km);
 * temperature and soil wetness come from NASA POWER (~50 km).
 */
export type DailyData = {
  rain: DailySeries;
  tmax: DailySeries;
  tmin: DailySeries;
  wetness?: DailySeries;
};

export type Season = {
  year: number;
  label: string;
  rainMm: number;
  /** Days after 1 October. null if the rains never properly started. */
  onsetDay: number | null;
  onsetDate: string | null;
  lengthDays: number | null;
  drySpellJanFeb: number;
  hotDays: number;
  rootWetness: number | null;
  drought: boolean;
};

export type ClimateSummary = {
  seasons: number;
  firstSeason: string;
  lastSeason: string;
  medianRainMm: number;
  reliableRainMm: number;
  medianOnsetDay: number | null;
  medianOnsetDate: string | null;
  medianLengthDays: number | null;
  reliableLengthDays: number | null;
  /** Share of seasons (0–1) with a dry spell of 10+ days in Jan–Feb. */
  drySpellRisk: number;
  meanHotDays: number;
  rainTrendMmPerDecade: number;
  hotDaysTrendPerDecade: number;
  droughtSeasons: string[];
};

export type Monthly = { month: string; rainMm: number; tmaxC: number; tminC: number };

export type ClimateProfile = {
  seasons: Season[];
  summary: ClimateSummary;
  monthly: Monthly[];
  sources?: { rainfall: string; temperature: string };
};

const DAY = 86_400_000;
const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);
const key = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

function valid(v: number | undefined): v is number {
  // Both sources mark missing days with large negative numbers (-999, -9999).
  return v !== undefined && v > -900 && !Number.isNaN(v);
}

/** Values for each day from `from` up to but not including `to`. Missing days are null. */
function range(series: Record<string, number>, from: number, to: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let t = from; t < to; t += DAY) {
    const v = series[key(t)];
    out.push(valid(v) ? v : null);
  }
  return out;
}

export function quantile(values: number[], q: number): number {
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Least-squares slope of y against x. */
export function slope(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    den += (x[i] - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function longestDryRun(rain: number[]): number {
  let best = 0;
  let run = 0;
  for (const r of rain) {
    run = r < WET_DAY_MM ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

function computeSeason(daily: DailyData, year: number): Season | null {
  const oct1 = utc(year, 10, 1);
  // Rain from 1 Oct to 30 Jun, the window every rainfall number is taken from.
  const rainRaw = range(daily.rain, oct1, utc(year + 1, 7, 1));
  const missing = rainRaw.filter((v) => v === null).length;
  if (missing > 10) return null;
  const rain = rainRaw.map((v) => v ?? 0);

  const dayOf = (t: number) => Math.round((t - oct1) / DAY);
  const may1 = dayOf(utc(year + 1, 5, 1));
  const jan1 = dayOf(utc(year + 1, 1, 1));
  const feb1 = dayOf(utc(year + 1, 2, 1));
  const mar1 = dayOf(utc(year + 1, 3, 1));

  const rainMm = rain.slice(0, may1).reduce((a, b) => a + b, 0);

  // Onset: 20 mm over 3 days, with no 10-day dry spell in the following 30 days.
  let onsetDay: number | null = null;
  for (let d = 0; d < feb1; d++) {
    if (rain[d] + rain[d + 1] + rain[d + 2] < ONSET_RAIN_MM) continue;
    if (longestDryRun(rain.slice(d + 3, d + 33)) >= 10) continue;
    onsetDay = d;
    break;
  }

  // Season end: first 20-day dry run starting after 1 March.
  let endDay = rain.length - 1;
  for (let d = mar1; d + 20 <= rain.length; d++) {
    if (rain.slice(d, d + 20).every((r) => r < WET_DAY_MM)) {
      endDay = d;
      break;
    }
  }

  const tmax = range(daily.tmax, utc(year, 12, 1), utc(year + 1, 4, 1));
  const hotDays = tmax.filter((v) => v !== null && v > HEAT_THRESHOLD_C).length;

  const wet = range(daily.wetness ?? {}, utc(year + 1, 1, 1), utc(year + 1, 4, 1)).filter(
    (v): v is number => v !== null,
  );

  return {
    year,
    label: `${year}/${String((year + 1) % 100).padStart(2, "0")}`,
    rainMm: Math.round(rainMm),
    onsetDay,
    onsetDate: onsetDay === null ? null : shortDate(oct1 + onsetDay * DAY),
    lengthDays: onsetDay === null ? null : endDay - onsetDay,
    drySpellJanFeb: longestDryRun(rain.slice(jan1, mar1)),
    hotDays,
    rootWetness: wet.length ? +(wet.reduce((a, b) => a + b, 0) / wet.length).toFixed(2) : null,
    drought: false,
  };
}

function computeMonthly(daily: DailyData): Monthly[] {
  const sums = MONTHS.map(() => ({ rain: 0, tmax: 0, tmin: 0, nRain: 0, nMax: 0, nMin: 0 }));
  for (const [k, v] of Object.entries(daily.rain)) {
    if (!valid(v)) continue;
    const m = Number(k.slice(4, 6)) - 1;
    sums[m].rain += v;
    sums[m].nRain++;
  }
  for (const [k, v] of Object.entries(daily.tmax)) {
    if (!valid(v)) continue;
    const m = Number(k.slice(4, 6)) - 1;
    sums[m].tmax += v;
    sums[m].nMax++;
  }
  for (const [k, v] of Object.entries(daily.tmin)) {
    if (!valid(v)) continue;
    const m = Number(k.slice(4, 6)) - 1;
    sums[m].tmin += v;
    sums[m].nMin++;
  }
  const daysIn = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  // Order Jul → Jun so the chart follows the farming year.
  const order = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5];
  return order.map((m) => ({
    month: MONTHS[m],
    rainMm: Math.round((sums[m].rain / Math.max(1, sums[m].nRain)) * daysIn[m]),
    tmaxC: +(sums[m].tmax / Math.max(1, sums[m].nMax)).toFixed(1),
    tminC: +(sums[m].tmin / Math.max(1, sums[m].nMin)).toFixed(1),
  }));
}

export function buildClimateProfile(daily: DailyData): ClimateProfile {
  const allYears = Object.keys(daily.rain).map((k) => Number(k.slice(0, 4)));
  const first = Math.min(...allYears);
  const last = Math.max(...allYears);

  const seasons: Season[] = [];
  for (let y = first; y < last; y++) {
    const s = computeSeason(daily, y);
    if (s) seasons.push(s);
  }
  if (seasons.length === 0) throw new Error("No complete seasons in the data");

  const rains = seasons.map((s) => s.rainMm);
  const medianRainMm = Math.round(quantile(rains, 0.5));
  for (const s of seasons) s.drought = s.rainMm < DROUGHT_FRACTION * medianRainMm;

  const onsets = seasons.map((s) => s.onsetDay).filter((v): v is number => v !== null);
  const lengths = seasons.map((s) => s.lengthDays).filter((v): v is number => v !== null);
  const medianOnsetDay = onsets.length ? Math.round(quantile(onsets, 0.5)) : null;
  const years = seasons.map((s) => s.year);

  const summary: ClimateSummary = {
    seasons: seasons.length,
    firstSeason: seasons[0].label,
    lastSeason: seasons[seasons.length - 1].label,
    medianRainMm,
    reliableRainMm: Math.round(quantile(rains, 0.2)),
    medianOnsetDay,
    medianOnsetDate:
      medianOnsetDay === null ? null : shortDate(utc(2001, 10, 1) + medianOnsetDay * DAY),
    medianLengthDays: lengths.length ? Math.round(quantile(lengths, 0.5)) : null,
    reliableLengthDays: lengths.length ? Math.round(quantile(lengths, 0.2)) : null,
    drySpellRisk: +(seasons.filter((s) => s.drySpellJanFeb >= 10).length / seasons.length).toFixed(2),
    meanHotDays: Math.round(seasons.reduce((a, s) => a + s.hotDays, 0) / seasons.length),
    rainTrendMmPerDecade: Math.round(slope(years, rains) * 10),
    hotDaysTrendPerDecade: +(slope(years, seasons.map((s) => s.hotDays)) * 10).toFixed(1),
    droughtSeasons: seasons.filter((s) => s.drought).map((s) => s.label),
  };

  return { seasons, summary, monthly: computeMonthly(daily) };
}
