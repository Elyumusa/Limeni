/**
 * NASA GIBS map layers (the same imagery as NASA Worldview).
 * Ready-made tiles, no login. Layer names and settings come from
 * https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml
 */

export type GibsLayer = {
  id: string;
  label: string;
  description: string;
  gibsName: string;
  /** A date (YYYY-MM-DD) or "default" for the most recent image. */
  time: string;
  tileMatrixSet: string;
  maxNativeZoom: number;
  ext: "png" | "jpg";
};

export const GIBS_LAYERS: GibsLayer[] = [
  {
    id: "ndvi-wet",
    label: "Vegetation · rainy season",
    description: "MODIS vegetation index (NDVI), March 2026. Greener means more plant growth.",
    gibsName: "MODIS_Terra_L3_NDVI_Monthly",
    time: "2026-03-01",
    tileMatrixSet: "GoogleMapsCompatible_Level7",
    maxNativeZoom: 7,
    ext: "png",
  },
  {
    id: "ndvi-dry",
    label: "Vegetation · dry season",
    description: "MODIS vegetation index (NDVI), September 2026. Shows how bare the land gets.",
    gibsName: "MODIS_Terra_L3_NDVI_Monthly",
    time: "2026-09-01",
    tileMatrixSet: "GoogleMapsCompatible_Level7",
    maxNativeZoom: 7,
    ext: "png",
  },
  {
    id: "smap",
    label: "Soil moisture",
    description: "SMAP root-zone soil moisture, latest available day.",
    gibsName: "SMAP_L4_Analyzed_Root_Zone_Soil_Moisture",
    time: "default",
    tileMatrixSet: "GoogleMapsCompatible_Level6",
    maxNativeZoom: 6,
    ext: "png",
  },
  {
    id: "imerg",
    label: "Rainfall",
    description: "GPM IMERG rainfall rate, latest available day.",
    gibsName: "IMERG_Precipitation_Rate",
    time: "default",
    tileMatrixSet: "GoogleMapsCompatible_Level6",
    maxNativeZoom: 6,
    ext: "png",
  },
];

export function gibsTileUrl(layer: GibsLayer): string {
  return (
    "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/" +
    `${layer.gibsName}/default/${layer.time}/${layer.tileMatrixSet}/{z}/{y}/{x}.${layer.ext}`
  );
}
