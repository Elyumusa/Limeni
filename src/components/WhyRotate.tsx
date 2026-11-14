import { CLIMATE } from "@/data/climate";
import { compareRotations } from "@/lib/rotation";

const REASONS = [
  {
    title: "Feeds your soil",
    body: "Beans, soybeans, groundnuts and cowpeas add natural fertiliser (nitrogen) to the soil. The maize you plant after them can use it, so you may need to buy less fertiliser.",
    icon: (
      <path d="M12 21c0-6 0-9 5-13M12 21c0-5-1-8-6-10M12 13c2-1 3.5-1 5 0" />
    ),
  },
  {
    title: "Breaks pest cycles",
    body: "Pests and diseases that live on one crop, like fall armyworm on maize, build up when that crop is planted every year. Changing the crop takes away their food.",
    icon: <path d="M5 12h14M12 5v14M7.5 7.5l9 9M16.5 7.5l-9 9" />,
  },
  {
    title: "Spreads your risk",
    body: "Different crops cope with dry spells and heat in different ways. If one season goes badly, it is less likely to hurt every crop you grow.",
    icon: <path d="M4 18l5-6 4 3 7-9M15 6h5v5" />,
  },
];

const STEPS = [
  ["Pick your area", "Choose the place closest to your farm on the map."],
  ["See your weather", "When the rains start, how much you can count on, and how often dry spells come."],
  ["Tell us about your farm", "What you grow now, or that you are just starting, and what matters most to you."],
  ["Compare your options", "Three rotations side by side, with the reasons, the risks and a rough value."],
];

const kwacha = (n: number) => `K${n.toLocaleString("en-US")}`;

export default function WhyRotate() {
  // A live example from the same engine the planner uses, so the numbers always match.
  const { results } = compareRotations(null, CLIMATE.mkushi, { water: 3, soil: 3, market: 3 });
  const [usual, best] = results;
  const names = (r: typeof best) => r.crops.map((c) => c.name.toLowerCase()).join(" → ");

  return (
    <section id="why" className="scroll-mt-20 border-b border-line bg-card">
      <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-leaf">New to farming?</p>
          <h2 className="mt-2 font-display text-3xl leading-tight md:text-4xl">What is crop rotation?</h2>
          <p className="mt-4 text-lg leading-relaxed text-muted">
            Crop rotation means planting a <strong className="text-foreground">different crop on the same field each season</strong>,
            instead of the same crop every year. Many farmers in Zambia plant maize season after season. Rotating
            helps in three ways:
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {REASONS.map((r) => (
            <div key={r.title} className="rounded-2xl border border-line bg-background p-6">
              <svg
                viewBox="0 0 24 24"
                className="h-10 w-10 rounded-full bg-leaf-soft p-2 text-leaf"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {r.icon}
              </svg>
              <h3 className="mt-4 text-lg font-semibold">{r.title}</h3>
              <p className="mt-2 leading-relaxed text-muted">{r.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-6 rounded-2xl bg-maize-soft p-6 md:grid-cols-[1fr_1.2fr] md:p-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-clay">An example</p>
            <h3 className="mt-2 font-display text-2xl leading-snug">A new farm near Mkushi</h3>
            <p className="mt-3 leading-relaxed text-muted">
              Choosing a crop is a gamble: will there be enough rain, and will it sell? LimaShift checks each
              option against every rainy season since 1981 in your area, so you can see the risk before you
              spend money on seed.
            </p>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-card p-5">
              <dt className="text-sm text-muted">Maize every season</dt>
              <dd className="mt-1 text-3xl font-semibold text-clay">{usual.scores.overall}<span className="text-base font-normal text-muted"> / 100</span></dd>
              <dd className="mt-2 text-sm text-muted">
                Soil health {usual.scores.soil}/100. Pests have the same food every year.
                {usual.value.covered.length > 0 && <> Worth about {kwacha(usual.value.zmwPerHa)} per hectare over three seasons.</>}
              </dd>
            </div>
            <div className="rounded-xl bg-card p-5 ring-2 ring-leaf">
              <dt className="text-sm text-muted capitalize">{names(best)}</dt>
              <dd className="mt-1 text-3xl font-semibold text-leaf">{best.scores.overall}<span className="text-base font-normal text-muted"> / 100</span></dd>
              <dd className="mt-2 text-sm text-muted">
                Soil health {best.scores.soil}/100. Its legumes add natural fertiliser for the next crop.
                {best.value.covered.length > 0 && <> Worth about {kwacha(best.value.zmwPerHa)} per hectare over three seasons.</>}
              </dd>
            </div>
            <p className="text-xs text-muted sm:col-span-2">
              Scores combine rainfall safety, soil health, pest break and ease of selling. Values use national market
              prices and average yields, before costs.
            </p>
          </dl>
        </div>

        <ol className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="flex gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-leaf font-semibold text-white">
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>
        <a
          href="#plan"
          className="mt-10 inline-block rounded-full bg-leaf px-6 py-3 font-semibold text-white transition hover:bg-leaf-dark"
        >
          Start planning
        </a>
      </div>
    </section>
  );
}
