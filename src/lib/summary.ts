/**
 * Plain-language summary of a rotation comparison.
 *
 * The same compact facts feed both the AI summary (src/app/api/summary) and
 * the fixed fallback text below, so the two never disagree on numbers.
 */
import type { ClimateProfile } from "@/lib/climate";
import type { RotationResult } from "@/lib/rotation";
import { TEXTURE_WORDS, fertilityOf, hasSoil, phInWater, type SoilInfo } from "@/lib/soil";

export type SummaryFacts = {
  place: string;
  startingOut: boolean;
  /** A "what if" weather scenario the farmer is looking at, or null for past weather as it was. */
  scenario: string | null;
  /** What the farmer told us about their soil, if anything. */
  soil: { phInWater?: number; texture?: string; drainage?: string; fertility?: string } | null;
  climate: {
    rainsStart: string | null;
    reliableRainMm: number;
    typicalRainMm: number;
    drySpellSeasonsInTen: number;
    hotDaysPerSeason: number;
    reliableSeasonDays: number | null;
  };
  options: {
    label: string;
    crops: string[];
    score: number;
    roughValueZmwPerHa: number | null;
    roughValueAtHarvestZmwPerHa: number | null;
    usesFarmersPrices: boolean;
    why: string[];
    risks: string[];
  }[];
};

export type SummaryResponse = { text: string; source: "ai" | "template" };

const LABELS: Record<RotationResult["kind"], string> = {
  current: "What you grow now",
  common: "What most farmers here do",
  best: "Best match for your priorities",
  alternative: "A different option",
};

export function buildFacts(
  place: string,
  climate: ClimateProfile,
  results: RotationResult[],
  startingOut: boolean,
  soil: SoilInfo = {},
  scenario: string | null = null,
): SummaryFacts {
  const s = climate.summary;
  return {
    place,
    startingOut,
    scenario,
    soil: hasSoil(soil)
      ? {
          phInWater: phInWater(soil),
          texture: soil.texture ? TEXTURE_WORDS[soil.texture] : undefined,
          drainage: soil.drainage === "poor" ? "stays wet in the rains" : soil.drainage === "well" ? "drains well" : undefined,
          fertility: fertilityOf(soil),
        }
      : null,
    climate: {
      rainsStart: s.medianOnsetDate,
      reliableRainMm: s.reliableRainMm,
      typicalRainMm: s.medianRainMm,
      drySpellSeasonsInTen: Math.round(s.drySpellRisk * 10),
      hotDaysPerSeason: s.meanHotDays,
      reliableSeasonDays: s.reliableLengthDays,
    },
    options: results.map((r) => ({
      label: LABELS[r.kind],
      crops: r.crops.map((c) => c.name),
      score: r.scores.overall,
      roughValueZmwPerHa: r.value.covered.length ? r.value.zmwPerHa : null,
      roughValueAtHarvestZmwPerHa: r.value.covered.length ? r.value.zmwPerHaAtHarvest : null,
      usesFarmersPrices: r.value.usesOwnPrices,
      why: r.why.slice(0, 3),
      risks: r.risks.slice(0, 3),
    })),
  };
}

const kwacha = (n: number) => `K${n.toLocaleString("en-US")}`;
const lowerList = (xs: string[]) => xs.map((x) => x.toLowerCase()).join(", then ");

/** Fixed summary used when the AI service is not set up or does not answer. */
export function templateSummary(f: SummaryFacts): string {
  const [base, best, alt] = f.options;
  const c = f.climate;
  const parts: string[] = [];

  if (f.scenario) parts.push(`This is a "what if" view, with ${f.scenario}.`);
  parts.push(
    `In ${f.place}, the rains usually start around ${c.rainsStart ?? "mid-November"}. ` +
      `In 4 years out of 5 you can count on at least ${c.reliableRainMm} mm of rain` +
      (c.drySpellSeasonsInTen >= 2
        ? `, but about ${c.drySpellSeasonsInTen} seasons in 10 have a dry spell of 10 days or more in January or February.`
        : "."),
  );

  if (best) {
    const gain = best.score - base.score;
    parts.push(
      `${f.startingOut ? "A good place to start" : "Our top suggestion"} is ${lowerList(best.crops)}, one per season. ` +
        `It scores ${best.score} out of 100 for what you care about` +
        (gain > 0 ? `, against ${base.score} for ${f.startingOut ? "planting maize every season" : "what you grow now"}.` : "."),
    );
    if (best.why[0]) parts.push(best.why[0]);
  }
  if (alt) parts.push(`Another option is ${lowerList(alt.crops)} (score ${alt.score}).`);

  const risk = best?.risks.find((r) => !r.startsWith("Check seed"));
  if (risk) parts.push(`One thing to watch: ${risk.charAt(0).toLowerCase()}${risk.slice(1)}`);

  if (best?.roughValueZmwPerHa && base.roughValueZmwPerHa)
    parts.push(
      `As a rough guide, these three crops could be worth about ${kwacha(best.roughValueZmwPerHa)} per hectare over three seasons at ${
        best.usesFarmersPrices ? "the prices you entered" : "market prices"
      }` +
        (best.roughValueAtHarvestZmwPerHa
          ? `, or about ${kwacha(best.roughValueAtHarvestZmwPerHa)} at the harvest prices you expect, before costs.`
          : ", before costs."),
    );

  parts.push("Talk it through with your agricultural extension officer before you change what you plant.");
  return parts.join(" ");
}
