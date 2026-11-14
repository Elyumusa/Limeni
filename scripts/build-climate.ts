/**
 * Builds the saved climate profile for each demo location
 * (rainfall from CHIRPS, temperature and soil wetness from NASA POWER).
 * Output: src/data/climate/<id>.json
 *
 * Run with: npm run data   (takes a few minutes; ClimateSERV works in a queue)
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { LOCATIONS } from "../src/data/locations";
import { buildClimateProfile } from "../src/lib/climate";
import { SOURCES, fetchChirps, fetchPower } from "../src/lib/sources";

async function main() {
  const outDir = path.join(process.cwd(), "src", "data", "climate");
  await mkdir(outDir, { recursive: true });

  for (const loc of LOCATIONS) {
    process.stdout.write(`${loc.name}: fetching CHIRPS and NASA POWER… `);
    const [rain, power] = await Promise.all([fetchChirps(loc.lat, loc.lon), fetchPower(loc.lat, loc.lon)]);
    const profile = buildClimateProfile({
      rain,
      tmax: power.T2M_MAX,
      tmin: power.T2M_MIN,
      wetness: power.GWETROOT,
    });
    const out = {
      locationId: loc.id,
      sources: SOURCES,
      fetchedAt: new Date().toISOString().slice(0, 10),
      ...profile,
    };
    await writeFile(path.join(outDir, `${loc.id}.json`), JSON.stringify(out, null, 1));
    const s = profile.summary;
    console.log(
      `${s.seasons} seasons, median rain ${s.medianRainMm} mm, reliable ${s.reliableRainMm} mm, ` +
        `onset ${s.medianOnsetDate}, droughts: ${s.droughtSeasons.join(", ") || "none"}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
