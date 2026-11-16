/**
 * Plain-language meanings for the weather numbers, written for farmers who
 * are new to this. Each one turns a number into what it means on the farm,
 * compared with what Limeni's crops need.
 */
import { CROPS } from "@/data/crops";
import { quantile, type ClimateProfile } from "@/lib/climate";

const list = (names: string[]): string =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
const lower = (names: string[]) => names.map((n) => n.toLowerCase());
/** A list of crop names to start a sentence: only the first word capitalised. */
const startList = (names: string[]) => {
  const text = list(lower(names));
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** "Rain you can rely on": what the millimetres mean, and which crops it is enough for. */
export function reliableRainMeaning(reliableMm: number): string {
  const cm = Math.round(reliableMm / 10);
  const enough = CROPS.filter((c) => c.rain.optMin <= reliableMm);
  const short = CROPS.filter((c) => c.rain.optMin > reliableMm);
  const bucket = `Picture a straight-sided bucket left outside from October to April: in 4 years out of 5 it would fill at least ${cm} cm deep.`;
  if (short.length === 0) return `${bucket} That is enough water for every crop Limeni compares.`;
  if (enough.length === 0)
    return `${bucket} That is less than any crop Limeni compares needs for a full harvest, so expect smaller harvests in poor years.`;
  const need = Math.min(...short.map((c) => c.rain.optMin));
  return (
    `${bucket} That is enough for ${list(lower(enough.map((c) => c.name)))}. ` +
    `${startList(short.map((c) => c.name))} ${short.length > 1 ? "want" : "wants"} more (from about ${need} mm), so in drier years ${short.length > 1 ? "they" : "it"} may give a smaller harvest.`
  );
}

/** "Reliable growing season": how many months, and which crops ripen in time. */
export function seasonLengthMeaning(days: number): string {
  const months = Math.round((days / 30.4) * 2) / 2;
  const monthWord = `${months % 1 === 0 ? months : `${Math.floor(months)}½`} months`;
  const fits = CROPS.filter((c) => c.daysToMaturity[1] <= days);
  const shortVariety = CROPS.filter((c) => c.daysToMaturity[0] <= days && c.daysToMaturity[1] > days);
  const tooLong = CROPS.filter((c) => c.daysToMaturity[0] > days);
  const parts = [
    `That is about ${monthWord} of rain for crops to grow. A crop should be ready before the rains stop, or it runs short of water at the end.`,
  ];
  if (fits.length) parts.push(`${startList(fits.map((c) => c.name))} ${fits.length > 1 ? "ripen" : "ripens"} in time.`);
  if (shortVariety.length)
    parts.push(`For ${list(lower(shortVariety.map((c) => c.name)))}, choose an early (short-season) seed variety.`);
  if (tooLong.length)
    parts.push(
      `${startList(tooLong.map((c) => c.name))} usually ${tooLong.length > 1 ? "take" : "takes"} longer, finishing on water left in the soil, so ${tooLong.length > 1 ? "they" : "it"} may yield less in a short season.`,
    );
  return parts.join(" ");
}

export type Trend = { word: string; meaning: string };

/** "Is the rain changing?": the trend, set against the normal swing between years. */
export function rainTrendMeaning(profile: ClimateProfile): Trend {
  const s = profile.summary;
  const rains = profile.seasons.map((x) => x.rainMm);
  const swing = Math.round(quantile(rains.map((r) => Math.abs(r - s.medianRainMm)), 0.5) / 10) * 10;
  const t = s.rainTrendMmPerDecade;
  const amount = `about ${Math.abs(t)} mm ${t > 0 ? "more" : "less"} every 10 years`;
  const years = profile.seasons.length;
  // A trend smaller than a quarter of the normal year-to-year swing is too small to plan around.
  if (Math.abs(t) < Math.max(10, swing / 4))
    return {
      word: "About the same",
      meaning:
        `Over ${years} years the rain has barely changed (${t === 0 ? "no change" : amount}). ` +
        `The difference between one year and the next is much bigger: often ${swing} mm. So plan for good and bad years, not for a trend.`,
    };
  if (t > 0)
    return {
      word: "Getting wetter",
      meaning: `Seasons here have slowly got wetter: ${amount}. Years still differ a lot (often by ${swing} mm), so dry years still happen.`,
    };
  return {
    word: "Getting drier",
    meaning: `Seasons here have slowly got drier: ${amount}. Years also differ a lot (often by ${swing} mm). Crops that cope with drought matter more here.`,
  };
}

const FRACTIONS: [number, string][] = [
  [0.25, "a quarter"],
  [1 / 3, "a third"],
  [0.5, "half"],
  [2 / 3, "two-thirds"],
  [0.75, "three-quarters"],
  [0.9, "almost completely"],
];

export type Wetness = { word: string; meaning: string };

/** Root-zone soil wetness (0–1) in January–March, in words. */
export function soilWetnessMeaning(wetness: number): Wetness {
  const fraction = FRACTIONS.reduce((best, f) => (Math.abs(f[0] - wetness) < Math.abs(best[0] - wetness) ? f : best))[1];
  const sponge = `The soil around plant roots is like a sponge that is usually ${fraction} full of water in the main growing months.`;
  if (wetness < 0.4)
    return {
      word: "Fairly dry",
      meaning: `${sponge} Crops can run short of water between rains: drought-hardy crops, mulch and planting early help.`,
    };
  if (wetness <= 0.8)
    return { word: "Moist", meaning: `${sponge} That is good for most crops: wet enough to grow, not so wet that roots drown.` };
  return {
    word: "Very wet",
    meaning: `${sponge} Low-lying fields and heavy clay can become waterlogged, which drowns roots. Ridges or raised beds help there.`,
  };
}
