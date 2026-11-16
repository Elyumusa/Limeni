/**
 * The rainfall grid cell a point belongs to.
 *
 * Weather is fetched for a 0.1° box (about 11 km) around a point, so two
 * clicks a few hundred metres apart would get almost the same answer. Every
 * point is snapped to a 0.05° grid (about 5.5 km) first: points in the same
 * cell share one download and one cache entry, on the phone and the server.
 * The box around the snapped centre still covers the original point.
 */
export const CELL_DEG = 0.05;

export type Cell = { key: string; lat: number; lon: number };

export function cellOf(lat: number, lon: number): Cell {
  const snap = (v: number) => +(Math.round(v / CELL_DEG) * CELL_DEG).toFixed(2);
  const sLat = snap(lat);
  const sLon = snap(lon);
  return { key: `${sLat.toFixed(2)},${sLon.toFixed(2)}`, lat: sLat, lon: sLon };
}
