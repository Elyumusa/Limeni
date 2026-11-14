/** Prints crop suitability and the compared rotations for each demo location. Run: npm run check */
import { CLIMATE } from "../src/data/climate";
import { LOCATIONS } from "../src/data/locations";
import { compareRotations, type Priorities } from "../src/lib/rotation";

const cases: [string, Priorities][] = [
  ["balanced", { water: 3, soil: 3, market: 3 }],
  ["soil first", { water: 1, soil: 5, market: 1 }],
  ["market first", { water: 1, soil: 1, market: 5 }],
];

for (const loc of LOCATIONS) {
  console.log(`\n=== ${loc.name} (Region ${loc.region}) ===`);
  const first = compareRotations(["maize", "maize", "maize"], CLIMATE[loc.id], cases[0][1]);
  console.log("Suitability: " + first.fits.map((f) => `${f.crop.name} ${f.score}`).join(", "));
  for (const [label, p] of cases) {
    const { results } = compareRotations(["maize", "maize", "maize"], CLIMATE[loc.id], p);
    console.log(`  [${label}]`);
    for (const r of results) {
      const s = r.scores;
      console.log(
        `    ${r.kind.padEnd(11)} ${r.crops.map((c) => c.name).join(" → ").padEnd(42)} overall ${s.overall}  water ${s.water} soil ${s.soil} pest ${s.pest} market ${s.market} fit ${s.fit}`,
      );
    }
  }
}
const sample = compareRotations(["maize", "maize", "maize"], CLIMATE.sinazongwe, cases[0][1]).results[1];
console.log("\nSample explanation (Sinazongwe, best):");
for (const k of ["why", "evidence", "benefits", "risks", "gaps"] as const) console.log(` ${k}:\n   - ` + sample[k].join("\n   - "));

console.log("\nStarting out (Mkushi, balanced):");
for (const r of compareRotations(null, CLIMATE.mkushi, cases[0][1]).results)
  console.log(`  ${r.kind.padEnd(11)} ${r.crops.map((c) => c.name).join(" → ")}  overall ${r.scores.overall}`);
console.log("\nMaize → rest → maize (Kasama, balanced):");
for (const r of compareRotations(["maize", "fallow", "maize"], CLIMATE.kasama, cases[0][1]).results)
  console.log(`  ${r.kind.padEnd(11)} ${r.crops.map((c) => c.name).join(" → ")}  overall ${r.scores.overall}  soil ${r.scores.soil} pest ${r.scores.pest}\n    benefits: ${r.benefits.join(" | ")}`);

console.log("\nKasama, acidic sandy low-fertility soil (pH 4.6 CaCl2, OC 0.8%):");
const acid = { ph: 4.6, phMethod: "CaCl2" as const, texture: "light" as const, organicCarbonPct: 0.8 };
const withSoil = compareRotations(null, CLIMATE.kasama, cases[0][1], {}, acid);
console.log("  Suitability: " + withSoil.fits.map((f) => `${f.crop.name} ${f.score}`).join(", "));
for (const r of withSoil.results) console.log(`  ${r.kind.padEnd(11)} ${r.crops.map((c) => c.name).join(" → ")}  overall ${r.scores.overall}`);
console.log("  risks (best): " + withSoil.results[1].risks.join(" | "));

console.log("\nMkushi, steep land (10% slope), balanced:");
const steep = compareRotations(null, CLIMATE.mkushi, cases[0][1], {}, {}, { elevationM: 1300, slopePct: 10, erosionRisk: "high" });
for (const r of steep.results) console.log(`  ${r.kind.padEnd(11)} ${r.crops.map((c) => c.name).join(" → ")}  overall ${r.scores.overall} soil ${r.scores.soil}`);

import { applyScenario } from "../src/lib/scenario";
console.log("\nSinazongwe, 20% less rain and 15 more hot days:");
const dry = compareRotations(null, applyScenario(CLIMATE.sinazongwe, { rainPct: -20, extraHotDays: 15 }), cases[0][1]);
for (const r of dry.results) console.log(`  ${r.kind.padEnd(11)} ${r.crops.map((c) => c.name).join(" → ")}  overall ${r.scores.overall} water ${r.scores.water} fit ${r.scores.fit}`);
