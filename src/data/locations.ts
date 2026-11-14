export type DemoLocation = {
  id: string;
  name: string;
  /** Shown after the name, e.g. "Southern Province". */
  province: string;
  /** Zambia's official agro-ecological region. */
  region: "I" | "II" | "IIa" | "III";
  regionNote: string;
  lat: number;
  lon: number;
};

/** Zambia's official rainfall zone for a typical season's rainfall. */
export function zoneFor(medianRainMm: number): Pick<DemoLocation, "region" | "regionNote"> {
  if (medianRainMm < 800) return { region: "I", regionNote: "Low rainfall zone (under 800 mm)" };
  if (medianRainMm <= 1000) return { region: "II", regionNote: "Medium rainfall zone (800–1000 mm)" };
  return { region: "III", regionNote: "High rainfall zone (over 1000 mm)" };
}

export const LOCATIONS: DemoLocation[] = [
  {
    id: "sinazongwe",
    name: "Sinazongwe",
    province: "Southern Province",
    region: "I",
    regionNote: "Low rainfall valley zone (under 800 mm)",
    lat: -17.26,
    lon: 27.46,
  },
  {
    id: "mkushi",
    name: "Mkushi",
    province: "Central Province",
    region: "IIa",
    regionNote: "Central plateau (800–1000 mm)",
    lat: -13.62,
    lon: 29.39,
  },
  {
    id: "kasama",
    name: "Kasama",
    province: "Northern Province",
    region: "III",
    regionNote: "High rainfall zone (over 1000 mm)",
    lat: -10.21,
    lon: 31.18,
  },
];
