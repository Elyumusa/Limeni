const TERMS: { term: string; plain: string }[] = [
  {
    term: "Satellite vs ground measurements",
    plain:
      "A rain gauge measures exactly one spot, but there are few of them. Satellites see everywhere, but estimate rain from clouds and can be off. The rainfall here (CHIRPS) blends both: satellite images corrected with real rain-gauge readings. A soil test from your own field is ground truth that no satellite can give.",
  },
  {
    term: "Vegetation index (NDVI)",
    plain:
      "A number from satellite images showing how green and leafy plants are. Healthy crops reflect lots of near-infrared light, which our eyes can't see. On the map, greener means more plant growth; pale or brown in the rainy season can mean stressed or bare land.",
  },
  {
    term: "Soil moisture and soil moisture anomaly",
    plain:
      "Soil moisture is how much water is held in the soil where roots grow. An anomaly is the difference from what is normal for that place and time of year. A big negative anomaly in January–February means crops are short of water even if some rain fell.",
  },
  {
    term: "Evapotranspiration",
    plain:
      "Water leaving the field as vapour: evaporating from the soil and breathed out through leaves. On hot, sunny days it is high, so crops need more water. It is why a hot season with normal rain can still stress crops.",
  },
  {
    term: "Water balance",
    plain:
      "Rain coming in compared with water going out (evapotranspiration and runoff). LimaShift's simple version compares each season's rain with what each crop needs, from FAO's crop records.",
  },
  {
    term: "Dry spell",
    plain:
      "A run of days with almost no rain (less than 1 mm a day) in the middle of the season. Ten or more days in a row in January or February can ruin maize at flowering.",
  },
  {
    term: "Rain you can rely on",
    plain:
      "The amount of rain reached in 4 seasons out of 5. Planning on this, rather than the average, means a crop that still works in most dry years.",
  },
  {
    term: "Frost",
    plain:
      "Below-freezing nights. Rare in Zambia's rainy season, so LimaShift does not score it; it matters for winter crops grown with irrigation.",
  },
];

export default function Glossary() {
  return (
    <details className="group rounded-2xl border border-line bg-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 p-4 font-semibold sm:p-5">
        Words explained
        <span className="text-muted transition group-open:rotate-180" aria-hidden="true">
          ▾
        </span>
      </summary>
      <dl className="grid gap-4 border-t border-line p-4 sm:grid-cols-2 sm:p-5">
        {TERMS.map((t) => (
          <div key={t.term}>
            <dt className="font-medium">{t.term}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-muted">{t.plain}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
