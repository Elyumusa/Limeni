/**
 * The farming year for a rotation: when to plant, when each crop grows, when
 * it is most sensitive, and when the field lies bare.
 *
 * Days count from 1 July (day 0) to 30 June (day 364), the farming year.
 * Sensitive stage: flowering and grain or pod fill, taken as 40–65% of the way
 * to maturity. That is a general rule, not variety-specific.
 */
import type { Crop } from "@/data/crops";
import type { ClimateProfile } from "@/lib/climate";

export const MONTHS = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const MONTH_START = [0, 31, 62, 92, 123, 153, 184, 215, 243, 274, 304, 335, 365];
const OCT_1 = 92;
/** A month with less average rain than this is dry season. */
const BARE_RAIN_MM = 20;

export type CropWindow = {
  crop: Crop;
  start: number;
  /** Earliest and latest harvest, by the crop's maturity range. */
  endEarly: number;
  endLate: number;
  sensitiveStart: number;
  sensitiveEnd: number;
  /** The sensitive stage falls in the dry-spell or hot months. */
  sensitiveAtRisk: boolean;
  /** Even early varieties finish after the usual end of the rains. */
  outlastsRains: boolean;
};

export type FarmCalendar = {
  plantDay: number;
  rainsEndDay: number;
  dryMonths: number[];
  drySpellMonths: number[];
  hotMonths: number[];
  bareMonths: number[];
  crops: CropWindow[];
  notes: string[];
};

const monthOf = (day: number) => MONTH_START.findIndex((start, i) => day >= start && day < MONTH_START[i + 1]);
const overlaps = (a0: number, a1: number, months: number[]) =>
  months.some((m) => a0 < MONTH_START[m + 1] && a1 > MONTH_START[m]);

export function dayLabel(day: number): string {
  const m = monthOf(Math.min(364, Math.max(0, day)));
  const d = day - MONTH_START[m] + 1;
  return `${d <= 10 ? "early" : d <= 20 ? "mid" : "late"} ${MONTHS[m]}`;
}

function monthRange(months: number[]): string {
  if (months.length === 0) return "";
  return months.length === 1 ? MONTHS[months[0]] : `${MONTHS[months[0]]} to ${MONTHS[months[months.length - 1]]}`;
}

export function farmCalendar(crops: Crop[], climate: ClimateProfile): FarmCalendar {
  const s = climate.summary;
  const plantDay = OCT_1 + (s.medianOnsetDay ?? 46);
  const rainsEndDay = Math.min(364, plantDay + (s.medianLengthDays ?? 140));

  const dryMonths = climate.monthly.map((m, i) => (m.rainMm < BARE_RAIN_MM ? i : -1)).filter((i) => i >= 0);
  // Dry spells are measured in January–February; hot days in December–March.
  const drySpellMonths = s.drySpellRisk >= 0.15 ? [6, 7] : [];
  const hotMonths = s.meanHotDays >= 10 ? [5, 6, 7, 8] : [];
  const riskMonths = [...new Set([...drySpellMonths, ...hotMonths])];

  const planted = [...new Map(crops.filter((c) => c.family !== "fallow").map((c) => [c.id, c])).values()];
  const windows: CropWindow[] = planted.map((crop) => {
    const [early, late] = crop.daysToMaturity;
    const mid = (early + late) / 2;
    const sensitiveStart = plantDay + Math.round(mid * 0.4);
    const sensitiveEnd = plantDay + Math.round(mid * 0.65);
    return {
      crop,
      start: plantDay,
      endEarly: Math.min(364, plantDay + early),
      endLate: Math.min(364, plantDay + late),
      sensitiveStart,
      sensitiveEnd,
      sensitiveAtRisk: overlaps(sensitiveStart, sensitiveEnd, riskMonths),
      outlastsRains: plantDay + early > rainsEndDay + 14,
    };
  });

  const lastHarvest = Math.max(plantDay, ...windows.map((w) => w.endLate));
  const growing = (m: number) => MONTH_START[m + 1] > plantDay && MONTH_START[m] < lastHarvest;
  // Order the bare months from after harvest round to planting (e.g. May → Oct).
  const after = monthOf(lastHarvest);
  const bareMonths = [...Array(12).keys()]
    .map((i) => (after + 1 + i) % 12)
    .filter((m) => dryMonths.includes(m) && !growing(m));

  const notes: string[] = [];
  notes.push(
    `Plant when the rains have properly started, usually ${dayLabel(plantDay)}. The rains usually ease off around ${dayLabel(rainsEndDay)}.`,
  );
  if (bareMonths.length >= 3)
    notes.push(
      `Your field is usually bare from ${monthRange(bareMonths)}, about ${bareMonths.length} months. With almost no rain then, a dry-season cover crop would need irrigation, so leave crop residue on the field as mulch to protect the soil and keep moisture in.`,
    );
  for (const w of windows) {
    if (w.sensitiveAtRisk) {
      const what = [drySpellMonths.length ? "dry spells" : "", hotMonths.length ? "hot days" : ""].filter(Boolean).join(" and ");
      notes.push(
        `${w.crop.name} is most sensitive around ${dayLabel(w.sensitiveStart)} to ${dayLabel(w.sensitiveEnd)} (flowering and filling), which is when ${what} are common here.`,
      );
    }
    if (w.outlastsRains)
      notes.push(
        `${w.crop.name} needs at least ${w.crop.daysToMaturity[0]} days, longer than the usual rainy season here. It must finish on stored soil moisture, so plant it early.`,
      );
  }
  return { plantDay, rainsEndDay, dryMonths, drySpellMonths, hotMonths, bareMonths, crops: windows, notes };
}
