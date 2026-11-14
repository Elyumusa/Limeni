/**
 * Crop table for Zambian rain-fed smallholder farming.
 *
 * WHERE EACH FIELD COMES FROM
 *
 * rain, ph, phAbs, texture, fertility, toleratesPoorDrainage, tempOptMaxC —
 *   FAO ECOCROP database, copied exactly from the record given in `ecocrop`
 *   (texture: TEXT / TEXTR, ignoring "organic" and "wide"; fertility: FER / FERR;
 *   drainage: whether DRAR includes "poorly"). Maize and sweet potato have no
 *   texture or drainage entries in ECOCROP, so those are null. (ECOCROP is listed with FAO GAEZ, which is on
 *   the challenge's resource list.)
 *   One judgment call: ECOCROP's grain sorghum record gives an upper rainfall
 *   limit of 700 mm, which would rule sorghum out of central Zambia where it
 *   is widely grown. The upper limits here use ECOCROP's other Sorghum
 *   bicolor record (1000 / 3000 mm).
 *
 * price — Ministry of Agriculture (Zambia), Department of Agribusiness and
 *   Marketing, Market Bulletin No. 020430 (30 April 2025 – 31 January 2026),
 *   Table 3. Each price is the mean of the June, July and August 2025
 *   national averages, the months when most farmers sell. These are MARKET
 *   prices, so they are higher than what a farmer is paid at the farm gate.
 *   For reference, the Food Reserve Agency's 2026 maize price was K347 per
 *   50 kg bag (K6.94/kg).
 *
 * yieldTPerHa — Zambia Crop Forecasting Survey 2024/25 (a normal-rain
 *   season), national average yields, as read to the National Assembly by the
 *   Minister of Agriculture on 10 June 2025. Common bean is that statement's
 *   "mixed beans" production divided by area planted (38,382 t / 80,391 ha).
 *   Sweet potato is not in that statement, so it keeps the FAO / ZamStats
 *   Integrated Agriculture Survey 2023/24 figure (a drought year).
 *
 * daysToMaturity — Zambian sources for five crops:
 *   groundnut 90–160: varieties released in Zambia 1950–2015 (ISSD Africa,
 *     "Climate-resilient seed systems … in Zambia", 2017, Table 7);
 *   sorghum 100–125 (Kuyuma, Sima), pearl millet 85–100 (Dora, Lubasi),
 *   sunflower 90–110, pigeon pea 140–180 (MPPV 2–4): Kagezi Seeds, a
 *     Zambian seed company, variety pages.
 *   Maize, soybean, cowpea, common bean, cotton and sweet potato are still
 *   general figures, not checked against a Zambian source.
 *
 * NOT from a cited source (general agronomy, still to be checked locally):
 *   droughtTolerance, nitrogen, deepRooted, market.
 *
 * null means no figure was found. Nothing here is estimated to fill a gap.
 */

export type SoilTexture = "light" | "medium" | "heavy";
export type Fertility = "low" | "moderate" | "high";

export type CropFamily = "cereal" | "legume" | "oilseed" | "root" | "fibre" | "fallow";

export type Crop = {
  id: string;
  name: string;
  family: CropFamily;
  /** ECOCROP record: scientific name and EcoPort code. */
  ecocrop: string;
  /** Annual rainfall in mm: absolute minimum, ideal range, absolute maximum. */
  rain: { min: number; optMin: number; optMax: number; max: number };
  /** Ideal soil pH range (in water). */
  ph: [number, number];
  /** Absolute soil pH limits; outside these the crop fails. */
  phAbs: [number, number];
  /** Soil textures: ideal, and the wider range the crop tolerates. null = no limit in ECOCROP. */
  texture: { ideal: SoilTexture[]; ok: SoilTexture[] } | null;
  /** Soil fertility: ideal level, and the lowest level the crop tolerates. */
  fertility: { ideal: Fertility; min: Fertility };
  /** Tolerates soil that stays waterlogged in the rainy season. null = no data. */
  toleratesPoorDrainage: boolean | null;
  /** Upper end of the ideal temperature range, °C. */
  tempOptMaxC: number;
  /** Days from planting to maturity for common varieties. */
  daysToMaturity: [number, number];
  /** 1 = very sensitive to dry spells, 5 = very tolerant. */
  droughtTolerance: 1 | 2 | 3 | 4 | 5;
  /** Effect on soil nitrogen: fixes it, or how heavily it feeds. */
  nitrogen: "fixes" | "light feeder" | "moderate feeder" | "heavy feeder";
  deepRooted: boolean;
  /** How easy it is to sell: 1 = mostly home use or thin market, 3 = established buyers. */
  market: 1 | 2 | 3;
  /** National average market price, ZMW per kg, June–August 2025. */
  priceZmwPerKg: number | null;
  /** National average yield, tonnes per hectare, 2024/25 season (see header). */
  yieldTPerHa: number | null;
  note: string;
};

export const CROPS: Crop[] = [
  {
    id: "maize",
    name: "Maize",
    family: "cereal",
    ecocrop: "Zea mays (2175)",
    rain: { min: 400, optMin: 600, optMax: 1200, max: 1800 },
    ph: [5.0, 7.0],
    phAbs: [4.5, 8.5],
    texture: null,
    fertility: { ideal: "high", min: "low" },
    toleratesPoorDrainage: null,
    tempOptMaxC: 33,
    daysToMaturity: [110, 150],
    droughtTolerance: 2,
    nitrogen: "heavy feeder",
    deepRooted: false,
    market: 3,
    priceZmwPerKg: 5.52,
    yieldTPerHa: 1.68,
    note: "Staple crop. Very sensitive to dry spells at flowering.",
  },
  {
    id: "sorghum",
    name: "Sorghum",
    family: "cereal",
    ecocrop: "Sorghum bicolor (48747; upper limits from 1982)",
    rain: { min: 300, optMin: 400, optMax: 1000, max: 3000 },
    ph: [5.5, 7.5],
    phAbs: [5, 8],
    texture: { ideal: ["heavy", "medium"], ok: ["heavy", "medium", "light"] },
    fertility: { ideal: "high", min: "low" },
    toleratesPoorDrainage: false,
    tempOptMaxC: 35,
    daysToMaturity: [100, 125],
    droughtTolerance: 4,
    nitrogen: "moderate feeder",
    deepRooted: true,
    market: 1,
    priceZmwPerKg: 15.95,
    yieldTPerHa: 1.04,
    note: "Drought-tolerant cereal suited to drier zones.",
  },
  {
    id: "pearl-millet",
    name: "Pearl millet",
    family: "cereal",
    ecocrop: "Pennisetum glaucum (8418)",
    rain: { min: 200, optMin: 400, optMax: 900, max: 1700 },
    ph: [5.0, 6.5],
    phAbs: [4.5, 8.3],
    texture: { ideal: ["medium", "light"], ok: ["medium", "light"] },
    fertility: { ideal: "moderate", min: "low" },
    toleratesPoorDrainage: false,
    tempOptMaxC: 35,
    daysToMaturity: [85, 100],
    droughtTolerance: 5,
    nitrogen: "light feeder",
    deepRooted: true,
    market: 1,
    priceZmwPerKg: 15.93,
    yieldTPerHa: null,
    note: "Short season, copes with poor sandy soils.",
  },
  {
    id: "soybean",
    name: "Soybean",
    family: "legume",
    ecocrop: "Glycine max (1150)",
    rain: { min: 450, optMin: 600, optMax: 1500, max: 1800 },
    ph: [5.5, 6.5],
    phAbs: [4.5, 8.4],
    texture: { ideal: ["medium"], ok: ["heavy", "medium", "light"] },
    fertility: { ideal: "high", min: "low" },
    toleratesPoorDrainage: true,
    tempOptMaxC: 33,
    daysToMaturity: [100, 130],
    droughtTolerance: 2,
    nitrogen: "fixes",
    deepRooted: false,
    market: 3,
    priceZmwPerKg: 9.44,
    yieldTPerHa: 0.98,
    note: "Cash crop with a strong market. Dislikes acidic soil.",
  },
  {
    id: "groundnut",
    name: "Groundnut",
    family: "legume",
    ecocrop: "Arachis hypogaea (2199)",
    rain: { min: 400, optMin: 600, optMax: 1500, max: 4000 },
    ph: [5.5, 6.5],
    phAbs: [4.5, 8.5],
    texture: { ideal: ["medium"], ok: ["heavy", "medium", "light"] },
    fertility: { ideal: "high", min: "moderate" },
    toleratesPoorDrainage: false,
    tempOptMaxC: 32,
    daysToMaturity: [90, 160],
    droughtTolerance: 3,
    nitrogen: "fixes",
    deepRooted: false,
    market: 2,
    priceZmwPerKg: 32.83,
    yieldTPerHa: 0.6,
    note: "Food and cash crop. Needs calcium; prefers lighter soils.",
  },
  {
    id: "cowpea",
    name: "Cowpea",
    family: "legume",
    ecocrop: "Vigna unguiculata (2153)",
    rain: { min: 300, optMin: 500, optMax: 1500, max: 4100 },
    ph: [5.5, 7.5],
    phAbs: [4, 8.8],
    texture: { ideal: ["medium", "light"], ok: ["heavy", "medium", "light"] },
    fertility: { ideal: "moderate", min: "low" },
    toleratesPoorDrainage: false,
    tempOptMaxC: 35,
    daysToMaturity: [70, 100],
    droughtTolerance: 4,
    nitrogen: "fixes",
    deepRooted: false,
    market: 2,
    priceZmwPerKg: null,
    yieldTPerHa: 0.19,
    note: "Fast, hardy legume. Leaves are also eaten.",
  },
  {
    id: "common-bean",
    name: "Common bean",
    family: "legume",
    ecocrop: "Phaseolus vulgaris (1668)",
    rain: { min: 300, optMin: 500, optMax: 2000, max: 4300 },
    ph: [5.5, 7.5],
    phAbs: [4, 9],
    texture: { ideal: ["medium"], ok: ["heavy", "medium", "light"] },
    fertility: { ideal: "moderate", min: "low" },
    toleratesPoorDrainage: false,
    tempOptMaxC: 25,
    daysToMaturity: [80, 100],
    droughtTolerance: 2,
    nitrogen: "fixes",
    deepRooted: false,
    market: 3,
    priceZmwPerKg: 36.5,
    yieldTPerHa: 0.48,
    note: "Prefers cooler, wetter areas. A weaker nitrogen fixer than other legumes.",
  },
  {
    id: "pigeon-pea",
    name: "Pigeon pea",
    family: "legume",
    ecocrop: "Cajanus cajan (576)",
    rain: { min: 400, optMin: 600, optMax: 1500, max: 4000 },
    ph: [5.0, 7.0],
    phAbs: [4.5, 8.4],
    texture: { ideal: ["medium", "light"], ok: ["heavy", "medium", "light"] },
    fertility: { ideal: "moderate", min: "low" },
    toleratesPoorDrainage: false,
    tempOptMaxC: 38,
    daysToMaturity: [140, 180],
    droughtTolerance: 5,
    nitrogen: "fixes",
    deepRooted: true,
    market: 1,
    priceZmwPerKg: null,
    yieldTPerHa: null,
    note: "Long season. Deep roots break hard soil layers.",
  },
  {
    id: "sunflower",
    name: "Sunflower",
    family: "oilseed",
    ecocrop: "Helianthus annuus (1191)",
    rain: { min: 300, optMin: 600, optMax: 1000, max: 1600 },
    ph: [6.0, 7.5],
    phAbs: [5.5, 8],
    texture: { ideal: ["medium", "light"], ok: ["heavy", "medium", "light"] },
    fertility: { ideal: "high", min: "low" },
    toleratesPoorDrainage: false,
    tempOptMaxC: 34,
    daysToMaturity: [90, 110],
    droughtTolerance: 4,
    nitrogen: "moderate feeder",
    deepRooted: true,
    market: 2,
    priceZmwPerKg: 7.04,
    yieldTPerHa: 0.32,
    note: "Oil crop that can be planted late.",
  },
  {
    id: "cotton",
    name: "Cotton",
    family: "fibre",
    ecocrop: "Gossypium hirsutum (1160)",
    rain: { min: 450, optMin: 750, optMax: 1200, max: 1500 },
    ph: [6.0, 7.5],
    phAbs: [5, 9.5],
    texture: { ideal: ["heavy", "medium"], ok: ["heavy", "medium", "light"] },
    fertility: { ideal: "moderate", min: "moderate" },
    toleratesPoorDrainage: false,
    tempOptMaxC: 36,
    daysToMaturity: [150, 180],
    droughtTolerance: 3,
    nitrogen: "moderate feeder",
    deepRooted: true,
    market: 2,
    priceZmwPerKg: null,
    yieldTPerHa: null,
    note: "Cash crop, usually grown under contract.",
  },
  {
    id: "sweet-potato",
    name: "Sweet potato",
    family: "root",
    ecocrop: "Ipomoea batatas (1265)",
    rain: { min: 350, optMin: 750, optMax: 2000, max: 5000 },
    ph: [5.0, 7.0],
    phAbs: [4, 8.7],
    texture: null,
    fertility: { ideal: "high", min: "low" },
    toleratesPoorDrainage: null,
    tempOptMaxC: 28,
    daysToMaturity: [110, 150],
    droughtTolerance: 3,
    nitrogen: "light feeder",
    deepRooted: false,
    market: 2,
    priceZmwPerKg: 3.87,
    yieldTPerHa: 2.4,
    note: "Good ground cover, which reduces erosion.",
  },
];

/**
 * Not a crop: a season where the land rests with nothing planted. Only used
 * for describing what a farmer grows now; never recommended.
 */
export const FALLOW: Crop = {
  id: "fallow",
  name: "Rest (nothing planted)",
  family: "fallow",
  ecocrop: "none",
  rain: { min: -1, optMin: 0, optMax: 1e9, max: 1e10 },
  ph: [0, 14],
  phAbs: [0, 14],
  texture: null,
  fertility: { ideal: "low", min: "low" },
  toleratesPoorDrainage: true,
  tempOptMaxC: 99,
  daysToMaturity: [0, 0],
  droughtTolerance: 5,
  nitrogen: "light feeder",
  deepRooted: false,
  market: 1,
  priceZmwPerKg: null,
  yieldTPerHa: null,
  note: "The land rests for a season.",
};

export const cropById = (id: string) => (id === FALLOW.id ? FALLOW : CROPS.find((c) => c.id === id));

/** When the official prices in this table were collected. */
export const PRICE_PERIOD = { label: "June–August 2025", end: "2025-08-31" };

export const DATA_SOURCES = [
  "Rainfall: CHIRPS daily rainfall (UCSB Climate Hazards Center / USGS), through NASA SERVIR ClimateSERV.",
  "Temperature and soil wetness: NASA POWER daily data (MERRA-2).",
  "Map layers: NASA GIBS — MODIS vegetation index, SMAP soil moisture, GPM IMERG rainfall.",
  "Crop rainfall, temperature and pH requirements: FAO ECOCROP database.",
  "Crop prices: Ministry of Agriculture (Zambia), Market Bulletin No. 020430, national average market prices, June–August 2025.",
  "Crop yields: Zambia Crop Forecasting Survey 2024/25 (Ministerial Statement to the National Assembly, 10 June 2025); sweet potato from the FAO / ZamStats Integrated Agriculture Survey 2023/24.",
  "Days to maturity: Zambian variety lists (ISSD Africa 2017; Kagezi Seeds) for groundnut, sorghum, pearl millet, sunflower and pigeon pea.",
];
