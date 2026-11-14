import type { ClimateProfile } from "@/lib/climate";
import kasama from "./kasama.json";
import mkushi from "./mkushi.json";
import sinazongwe from "./sinazongwe.json";

/** Saved NASA POWER climate profiles, keyed by location id. Rebuild with `npm run data`. */
export const CLIMATE: Record<string, ClimateProfile> = {
  sinazongwe: sinazongwe as ClimateProfile,
  mkushi: mkushi as ClimateProfile,
  kasama: kasama as ClimateProfile,
};
