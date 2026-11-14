/**
 * Rotation scoring. Transparent rules, no trained model: every score keeps
 * the plain-language reasons and numbers that produced it.
 * The rules are described in PLAN.md section 6.
 */
import { CROPS, FALLOW, cropById, type Crop } from "@/data/crops";
import type { ClimateProfile } from "@/lib/climate";
import { hasSoil, soilFit, type SoilFit, type SoilInfo } from "@/lib/soil";

/** Prices the farmer typed in, ZMW per kg: what buyers pay now, and what they expect at harvest. */
export type PriceOverrides = Record<string, { now?: number; harvest?: number }>;

/** Each priority runs 1 (not important) to 5 (very important). */
export type Priorities = { water: number; soil: number; market: number };

export type CropFit = {
  crop: Crop;
  /** 0–100: how well the crop suits this field's climate. */
  score: number;
  /** Seasons with rainfall inside the crop's ideal range (FAO ECOCROP). */
  idealRainSeasons: number;
  /** Seasons with less rain than the crop's absolute minimum. */
  failedRainSeasons: number;
  /** Seasons long enough for the crop to mature. */
  lengthOkSeasons: number;
  seasons: number;
  /** Average rainfall suitability (0–1) across seasons, adjusted for dry-spell sensitivity. */
  waterSafety: number;
  tooHot: boolean;
  tooWet: boolean;
  /** How the farmer's soil suits the crop (factor 1 when no soil is given). */
  soil: SoilFit;
};

export type RotationScores = {
  overall: number;
  water: number;
  soil: number;
  pest: number;
  market: number;
  fit: number;
};

export type RotationResult = {
  cropIds: string[];
  crops: Crop[];
  /** current: what the farmer grows now. common: maize every season, shown to new farmers as the usual practice. */
  kind: "current" | "common" | "best" | "alternative";
  scores: RotationScores;
  why: string[];
  evidence: string[];
  benefits: string[];
  gaps: string[];
  risks: string[];
  value: RotationValue;
};

/** Rough market value of the harvest, where both a price and a yield are known. */
export type RotationValue = {
  /** ZMW per hectare over the three seasons at today's prices, summed over the crops in `covered`. */
  zmwPerHa: number;
  /** The same at the farmer's expected harvest prices, or null if they gave none. */
  zmwPerHaAtHarvest: number | null;
  covered: string[];
  missing: string[];
  /** True if any price in this rotation came from the farmer. */
  usesOwnPrices: boolean;
};

/**
 * Hot days (above 32 °C) per season a crop can take, from the top of its
 * ideal temperature range in ECOCROP.
 */
function hotDaysAllowed(crop: Crop): number {
  if (crop.tempOptMaxC <= 25) return 5;
  if (crop.tempOptMaxC <= 28) return 15;
  if (crop.tempOptMaxC <= 32) return 30;
  if (crop.tempOptMaxC <= 34) return 50;
  return 999;
}

/**
 * The FAO EcoCrop rainfall rule: 0 below the absolute minimum, rising to 1
 * at the ideal range, falling back to 0 at the absolute maximum.
 */
export function rainSuitability(crop: Crop, rainMm: number): number {
  const r = crop.rain;
  if (rainMm <= r.min || rainMm >= r.max) return 0;
  if (rainMm < r.optMin) return (rainMm - r.min) / (r.optMin - r.min);
  if (rainMm <= r.optMax) return 1;
  return (r.max - rainMm) / (r.max - r.optMax);
}
const MIN_FIT = 60;
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function cropFit(crop: Crop, climate: ClimateProfile, soilInfo: SoilInfo = {}): CropFit {
  const { seasons, summary } = climate;
  const n = seasons.length;
  const idealRainSeasons = seasons.filter(
    (s) => s.rainMm >= crop.rain.optMin && s.rainMm <= crop.rain.optMax,
  ).length;
  const failedRainSeasons = seasons.filter((s) => s.rainMm < crop.rain.min).length;
  // Seasons where the rains never properly started count as too short.
  const lengthOkSeasons = seasons.filter(
    (s) => s.lengthDays !== null && s.lengthDays >= crop.daysToMaturity[0],
  ).length;
  const lengthShare = lengthOkSeasons / n;

  const rainMean = seasons.reduce((a, s) => a + rainSuitability(crop, s.rainMm), 0) / n;
  // Dry spells hurt drought-sensitive crops even in seasons with enough total rain.
  const drySpellPenalty = summary.drySpellRisk * ((5 - crop.droughtTolerance) / 4) * 0.5;
  const waterSafety = Math.max(0, rainMean * (1 - drySpellPenalty));

  const allowed = hotDaysAllowed(crop);
  const tooHot = summary.meanHotDays > allowed;
  const heat = tooHot ? Math.max(0.4, 1 - (summary.meanHotDays - allowed) / 60) : 1;
  const tooWet = summary.medianRainMm > crop.rain.optMax;

  const soil = soilFit(crop, soilInfo);
  const score = clamp(100 * waterSafety * (0.4 + 0.6 * lengthShare) * heat * soil.factor);
  return {
    crop,
    score,
    idealRainSeasons,
    failedRainSeasons,
    lengthOkSeasons,
    seasons: n,
    waterSafety,
    tooHot,
    tooWet,
    soil,
  };
}

function soilScore(crops: Crop[]): number {
  let score = 50;
  for (const c of crops) {
    // A resting season neither feeds nor drains the soil much.
    if (c.family === "fallow") {
      score += 5;
      continue;
    }
    if (c.nitrogen === "fixes") score += c.id === "common-bean" ? 12 : 20;
    if (c.nitrogen === "heavy feeder") score -= 15;
    if (c.nitrogen === "moderate feeder") score -= 7;
    if (c.nitrogen === "light feeder") score -= 3;
    if (c.deepRooted) score += 5;
  }
  return clamp(score);
}

/** The rotation repeats, so the third crop is followed by the first again. */
function pestScore(crops: Crop[]): number {
  let score = 100;
  for (let i = 0; i < crops.length; i++) {
    const next = crops[(i + 1) % crops.length];
    if (crops[i].id === next.id) score -= 35;
    else if (crops[i].family === next.family) score -= 15;
  }
  return clamp(score);
}

function scoreRotation(crops: Crop[], fits: Map<string, CropFit>, p: Priorities): RotationScores {
  // Resting seasons count for soil and pests, but not for climate fit, water or market.
  const planted = crops.filter((c) => c.family !== "fallow");
  const f = planted.map((c) => fits.get(c.id) as CropFit);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const water = planted.length ? clamp(mean(f.map((x) => x.waterSafety * 100))) : 100;
  const soil = soilScore(crops);
  const pest = pestScore(crops);
  const market = clamp((mean(planted.map((c) => c.market)) / 3) * 100);
  const fit = planted.length ? clamp(mean(f.map((x) => x.score))) : 100;
  const weighted =
    (p.water * water + p.soil * ((soil + pest) / 2) + p.market * market) / (p.water + p.soil + p.market);
  // A rotation of badly suited crops cannot score well, whatever else it offers.
  const overall = clamp(weighted * (0.5 + 0.5 * (fit / 100)));
  return { overall, water, soil, pest, market, fit };
}

function list(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
const lower = (c: Crop) => c.name.toLowerCase();
const unique = (crops: Crop[]) => [...new Map(crops.map((c) => [c.id, c])).values()];

function explain(
  crops: Crop[],
  kind: RotationResult["kind"],
  scores: RotationScores,
  fits: Map<string, CropFit>,
  climate: ClimateProfile,
  current: Crop[],
  currentScores: RotationScores,
  currentIsReal: boolean,
  prices: PriceOverrides,
  soilInfo: SoilInfo,
): Omit<RotationResult, "cropIds" | "crops" | "kind" | "scores"> {
  const s = climate.summary;
  const rests = crops.filter((c) => c.family === "fallow").length;
  const distinct = unique(crops.filter((c) => c.family !== "fallow"));
  const legumes = distinct.filter((c) => c.nitrogen === "fixes");
  const deep = distinct.filter((c) => c.deepRooted);
  const repeats = crops.some((c, i) => c.id === crops[(i + 1) % crops.length].id);
  const sameFamily = crops.some(
    (c, i) => c.id !== crops[(i + 1) % crops.length].id && c.family === crops[(i + 1) % crops.length].family,
  );

  const why: string[] = [];
  if (kind === "current") {
    why.push("This is what you grow now. It is here so you can compare the other options against it.");
  } else if (kind === "common") {
    why.push(
      "Most smallholder farmers in Zambia plant maize season after season. It is shown here so you can see what the other options change.",
    );
  } else {
    if (scores.soil > currentScores.soil && legumes.length)
      why.push(`It brings in ${list(legumes.map(lower))}, which ${legumes.length > 1 ? "add" : "adds"} natural fertiliser (nitrogen) to the soil instead of only using it up.`);
    if (scores.pest > currentScores.pest)
      why.push("It changes the crop every season, which interrupts pests and diseases that build up under one crop.");
    if (scores.water >= currentScores.water + 5)
      why.push(
        `Its crops are a safer match for the rain here (rain safety ${scores.water}, against ${currentScores.water} for ${currentIsReal ? "what you grow now" : "maize every season"}).`,
      );
    if (scores.market > currentScores.market) why.push("Its crops are, on balance, easier to sell.");
    const kept = distinct.filter((c) => current.some((x) => x.id === c.id));
    if (kept.length && currentIsReal) why.push(`It keeps ${list(kept.map(lower))}, which you already grow.`);
    if (!why.length) why.push("It scored highest for the priorities you set.");
  }

  const evidence: string[] = [];
  for (const c of distinct) {
    const f = fits.get(c.id) as CropFit;
    evidence.push(
      `${c.name}: FAO lists ${c.rain.optMin}–${c.rain.optMax} mm of rain as ideal and ${c.rain.min} mm as the bare minimum. ` +
        `This field was in the ideal range in ${f.idealRainSeasons} of ${f.seasons} seasons and below the minimum in ${f.failedRainSeasons}. ` +
        `The season was long enough (${c.daysToMaturity[0]} days) in ${f.lengthOkSeasons} of ${f.seasons}.`,
    );
  }
  for (const c of distinct) evidence.push(...(fits.get(c.id) as CropFit).soil.notes);
  evidence.push(
    `Seasons with a dry spell of 10 or more days in January–February: ${Math.round(s.drySpellRisk * s.seasons)} of ${s.seasons}.`,
  );
  if (s.meanHotDays >= 5) evidence.push(`Hot days above 32 °C, December–March: ${s.meanHotDays} in a typical season.`);

  const benefits: string[] = [];
  if (legumes.length >= 1)
    benefits.push(`${legumes.length} nitrogen-fixing crop${legumes.length > 1 ? "s" : ""} in three seasons can cut fertiliser needs for the crop that follows.`);
  if (deep.length) benefits.push(`${list(deep.map((c) => c.name))} ${deep.length > 1 ? "root" : "roots"} deeply, which helps water soak in and loosens hard soil.`);
  if (!repeats && !sameFamily) benefits.push("No crop family is planted twice in a row.");
  if (distinct.length >= 3) benefits.push("Three different crops spread the risk: one bad season is less likely to hurt all of them.");
  if (rests)
    benefits.push(`${rests === 1 ? "A resting season gives" : "Resting seasons give"} the soil time to recover, but ${rests === 1 ? "it earns" : "they earn"} nothing.`);
  if (!benefits.length) benefits.push("Simple to manage: one crop, one set of inputs, a known market.");

  const risks: string[] = [];
  if (repeats) risks.push("The same crop follows itself, so pests such as fall armyworm and soil-borne diseases can build up.");
  if (!legumes.length) risks.push("No crop here returns nitrogen to the soil, so fertility depends on fertiliser or manure.");
  for (const c of distinct) {
    const f = fits.get(c.id) as CropFit;
    if (f.failedRainSeasons > 0)
      risks.push(`${c.name} would have had less than its bare minimum rainfall in ${f.failedRainSeasons} of ${f.seasons} past seasons.`);
    else if (f.idealRainSeasons / f.seasons < 0.5)
      risks.push(`${c.name} got its ideal rainfall in only ${f.idealRainSeasons} of ${f.seasons} past seasons.`);
    if (s.drySpellRisk >= 0.2 && c.droughtTolerance <= 2)
      risks.push(`${c.name} is sensitive to mid-season dry spells, which are common here.`);
    if (f.tooHot) risks.push(`${c.name} may suffer in this area's heat.`);
    if (f.tooWet) risks.push(`Typical rainfall here is above ${c.name.toLowerCase()}'s ideal range, which raises disease risk.`);
  }
  for (const c of distinct) risks.push(...(fits.get(c.id) as CropFit).soil.problems);
  if (distinct.some((c) => c.id === "soybean") && soilInfo.ph === undefined)
    risks.push("Soybean dislikes acidic soil. Test soil pH first; lime may be needed.");
  if (distinct.some((c) => c.id === "groundnut")) risks.push("Groundnut needs calcium to fill its pods and prefers lighter soils.");
  if (distinct.some((c) => c.id === "cotton")) risks.push("Cotton is usually grown under contract. Confirm a buyer before planting.");
  if (distinct.some((c) => c.id === "pigeon-pea")) risks.push("Pigeon pea takes a long season and has a thin market in Zambia.");
  if (kind === "best" || kind === "alternative") risks.push("Check seed availability and local buyers with your extension officer before changing crops.");

  const value = rotationValue(crops, prices);
  const gaps = [
    hasSoil(soilInfo)
      ? "Soil values are the ones you entered. One sample may not represent the whole field, and anything you left blank is not counted."
      : "Soil is not counted yet. Adding your soil pH, texture or fertility in step 3 could change this ranking.",
    value.usesOwnPrices
      ? "Crop value uses the prices you entered where you gave one, national market prices (June–August 2025) elsewhere, and national average yields from the 2024/25 season. It leaves out all costs."
      : "Crop value uses national market prices from June–August 2025, which may be out of date and are higher than farm-gate prices, and national average yields from the 2024/25 season. It leaves out all costs.",
    ...(value.missing.length ? [`No price or yield figure was found for ${list(value.missing.map((n) => n.toLowerCase()))}.`] : []),
    "Rainfall is a satellite estimate for an area about 5 km across; temperature covers about 50 km.",
    "Crop needs are FAO's general figures, not specific to a seed variety.",
  ];

  return { why, evidence, benefits, gaps, risks, value };
}

export function rotationValue(crops: Crop[], prices: PriceOverrides = {}): RotationValue {
  let now = 0;
  let harvest = 0;
  let anyHarvest = false;
  let usesOwnPrices = false;
  const covered: string[] = [];
  const missing: string[] = [];
  for (const c of crops) {
    if (c.family === "fallow") continue;
    const own = prices[c.id] ?? {};
    const priceNow = own.now ?? c.priceZmwPerKg;
    if (priceNow === null || c.yieldTPerHa === null) {
      missing.push(c.name);
      continue;
    }
    if (own.now !== undefined || own.harvest !== undefined) usesOwnPrices = true;
    if (own.harvest !== undefined) anyHarvest = true;
    const kg = c.yieldTPerHa * 1000;
    now += priceNow * kg;
    harvest += (own.harvest ?? priceNow) * kg;
    covered.push(c.name);
  }
  const round = (n: number) => Math.round(n / 100) * 100;
  return {
    zmwPerHa: round(now),
    zmwPerHaAtHarvest: anyHarvest ? round(harvest) : null,
    covered,
    missing: [...new Set(missing)],
    usesOwnPrices,
  };
}

/** Rotations that are the same cycle starting at a different season share one key. */
function cycleKey(ids: string[]): string {
  const shifts = ids.map((_, i) => [...ids.slice(i), ...ids.slice(0, i)].join(">"));
  return shifts.sort()[0];
}

/** The usual Zambian smallholder practice, shown to farmers who are just starting out. */
export const COMMON_PRACTICE = ["maize", "maize", "maize"];

/**
 * Compare rotations for one location.
 * `currentIds` is what the farmer grows now (three seasons; "fallow" allowed),
 * or null for someone just starting out, who is shown COMMON_PRACTICE instead.
 */
export function compareRotations(
  currentIds: string[] | null,
  climate: ClimateProfile,
  priorities: Priorities,
  prices: PriceOverrides = {},
  soil: SoilInfo = {},
): { results: RotationResult[]; fits: CropFit[] } {
  const fits = new Map(CROPS.map((c) => [c.id, cropFit(c, climate, soil)]));
  const currentIsReal = currentIds !== null && currentIds.some((id) => id !== FALLOW.id);
  if (!currentIsReal) currentIds = COMMON_PRACTICE;
  const current = (currentIds as string[]).map((id) => cropById(id) as Crop);
  const currentScores = scoreRotation(current, fits, priorities);
  const currentKey = cycleKey(current.map((c) => c.id));

  const suited = CROPS.filter((c) => (fits.get(c.id) as CropFit).score >= MIN_FIT);
  const seen = new Set<string>([currentKey]);
  const candidates: { crops: Crop[]; scores: RotationScores }[] = [];
  for (const a of suited)
    for (const b of suited)
      for (const c of suited) {
        // Never the same crop twice: repeating a crop is what a rotation is meant to avoid.
        if (a === b || b === c || a === c) continue;
        const crops = [a, b, c];
        // A farm household needs a staple grain somewhere in the rotation.
        if (!crops.some((x) => x.family === "cereal")) continue;
        const key = cycleKey(crops.map((x) => x.id));
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({ crops, scores: scoreRotation(crops, fits, priorities) });
      }
  candidates.sort((x, y) => y.scores.overall - x.scores.overall || y.scores.fit - x.scores.fit);

  const best = candidates[0];
  // The second option should be a real alternative, not the best one with a single swap.
  const bestIds = new Set(best?.crops.map((c) => c.id));
  const shared = (c: (typeof candidates)[number]) => c.crops.filter((x) => bestIds.has(x.id)).length;
  // Prefer sharing at most one crop with the best; never the same three crops in another order.
  const alternative =
    candidates.slice(1).find((c) => shared(c) <= 1) ??
    candidates.slice(1).find((c) => shared(c) < 3) ??
    candidates[1];

  const make = (crops: Crop[], kind: RotationResult["kind"], scores: RotationScores): RotationResult => ({
    cropIds: crops.map((c) => c.id),
    crops,
    kind,
    scores,
    ...explain(crops, kind, scores, fits, climate, current, currentScores, currentIsReal, prices, soil),
  });

  const results = [make(current, currentIsReal ? "current" : "common", currentScores)];
  if (best) results.push(make(best.crops, "best", best.scores));
  if (alternative) results.push(make(alternative.crops, "alternative", alternative.scores));
  return { results, fits: [...fits.values()].sort((a, b) => b.score - a.score) };
}
