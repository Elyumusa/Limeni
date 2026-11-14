/**
 * What the farmer knows about their soil, and how each crop suits it.
 * Crop limits come from FAO ECOCROP (src/data/crops.ts). Every field is
 * optional: a farmer may know only one value, or none.
 */
import type { Crop, Fertility, SoilTexture } from "@/data/crops";

export type PhMethod = "water" | "CaCl2";

export type SoilInfo = {
  ph?: number;
  /** How the lab measured pH. CaCl2 readings run lower than pH in water. */
  phMethod?: PhMethod;
  texture?: SoilTexture;
  drainage?: "well" | "poor";
  organicCarbonPct?: number;
  /** Used when organic carbon is not known. */
  fertility?: Fertility;
};

/**
 * pH measured in calcium chloride reads about 0.6 lower than in water, and
 * FAO's crop ranges use pH in water. A rule of thumb, not a lab conversion.
 */
export const CACL2_TO_WATER = 0.6;

export function phInWater(soil: SoilInfo): number | undefined {
  if (soil.ph === undefined) return undefined;
  return soil.phMethod === "CaCl2" ? +(soil.ph + CACL2_TO_WATER).toFixed(1) : soil.ph;
}

/** Rule of thumb for tropical topsoil: under 1% organic carbon is low, over 2% is high. */
export function fertilityOf(soil: SoilInfo): Fertility | undefined {
  if (soil.organicCarbonPct !== undefined) {
    if (soil.organicCarbonPct < 1) return "low";
    if (soil.organicCarbonPct <= 2) return "moderate";
    return "high";
  }
  return soil.fertility;
}

/** Texture from a lab's class name, e.g. "Sandy loam". */
export function textureFromClass(name: string): SoilTexture | undefined {
  const n = name.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  if (!n) return undefined;
  if (/^(sand|loamy sand|sandy loam|sandy)$/.test(n)) return "light";
  if (/(^|\s)clay$/.test(n) && !/loam/.test(n)) return "heavy";
  if (/loam|silt/.test(n)) return "medium";
  return undefined;
}

/** Texture from particle sizes (%), for reports that give sand / clay but no class. */
export function textureFromParticles(sandPct?: number, clayPct?: number): SoilTexture | undefined {
  if (clayPct !== undefined && clayPct >= 35) return "heavy";
  if (sandPct !== undefined && sandPct >= 70 && (clayPct === undefined || clayPct < 20)) return "light";
  if (sandPct !== undefined || clayPct !== undefined) return "medium";
  return undefined;
}

export const TEXTURE_WORDS: Record<SoilTexture, string> = {
  light: "sandy (light)",
  medium: "loam (medium)",
  heavy: "clay (heavy)",
};

export function hasSoil(soil: SoilInfo): boolean {
  return (
    soil.ph !== undefined || !!soil.texture || !!soil.drainage || fertilityOf(soil) !== undefined
  );
}

const LEVEL: Record<Fertility, number> = { low: 0, moderate: 1, high: 2 };

export type SoilFit = {
  /** 0–1: multiplies the crop's climate fit. 1 when nothing is known. */
  factor: number;
  /** Facts, for "The evidence". */
  notes: string[];
  /** Problems, for "Risks to check". */
  problems: string[];
};

export function soilFit(crop: Crop, soil: SoilInfo): SoilFit {
  const notes: string[] = [];
  const problems: string[] = [];
  let factor = 1;
  if (crop.family === "fallow") return { factor, notes, problems };

  // pH: the FAO EcoCrop rule, 1 inside the ideal range, falling to 0 at the absolute limits.
  const ph = phInWater(soil);
  if (ph !== undefined) {
    const [lo, hi] = crop.ph;
    const [min, max] = crop.phAbs;
    let f = 1;
    if (ph <= min || ph >= max) f = 0;
    else if (ph < lo) f = (ph - min) / (lo - min);
    else if (ph > hi) f = (max - ph) / (max - hi);
    factor *= f;
    notes.push(`${crop.name}: FAO lists soil pH ${lo}–${hi} as ideal; yours is ${ph}${soil.phMethod === "CaCl2" ? " (converted from CaCl₂)" : ""}.`);
    if (f === 0) problems.push(`Your soil pH (${ph}) is outside the range ${crop.name.toLowerCase()} can grow in at all.`);
    else if (ph < lo)
      problems.push(`Your soil is more acidic than ${crop.name.toLowerCase()} likes (pH ${ph}, ideal from ${lo}). Liming would help.`);
    else if (ph > hi) problems.push(`Your soil is more alkaline than ${crop.name.toLowerCase()} likes (pH ${ph}, ideal up to ${hi}).`);
  }

  if (soil.texture && crop.texture) {
    const word = TEXTURE_WORDS[soil.texture];
    if (crop.texture.ideal.includes(soil.texture)) {
      notes.push(`${crop.name} does well on ${word} soil like yours (FAO).`);
    } else if (crop.texture.ok.includes(soil.texture)) {
      factor *= 0.85;
      notes.push(`${crop.name} grows on ${word} soil, but it is not its ideal texture (FAO).`);
    } else {
      factor *= 0.5;
      problems.push(`${crop.name} usually struggles on ${word} soil.`);
    }
  }

  if (soil.drainage === "poor" && crop.toleratesPoorDrainage === false) {
    factor *= 0.5;
    problems.push(`${crop.name} needs soil that drains well; waterlogging in the rains can rot its roots.`);
  }

  const fert = fertilityOf(soil);
  if (fert) {
    const have = LEVEL[fert];
    if (have < LEVEL[crop.fertility.min]) {
      factor *= 0.6;
      problems.push(`${crop.name} needs more fertile soil than yours. Plan for manure or fertiliser.`);
    } else if (have < LEVEL[crop.fertility.ideal]) {
      factor *= 0.85;
      if (crop.nitrogen === "heavy feeder")
        problems.push(`${crop.name} feeds heavily, and your soil is ${fert} in fertility, so it will need fertiliser or manure.`);
    }
  }

  return { factor: Math.max(0, Math.min(1, factor)), notes, problems };
}
