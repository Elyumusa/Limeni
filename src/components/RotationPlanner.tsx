"use client";

import { useEffect, useMemo, useState } from "react";
import PricePanel from "@/components/PricePanel";
import SoilPanel from "@/components/SoilPanel";
import type { SoilInfo } from "@/lib/soil";
import StepHeader from "@/components/StepHeader";
import { CROPS, FALLOW } from "@/data/crops";
import type { DemoLocation } from "@/data/locations";
import type { ClimateProfile } from "@/lib/climate";
import { compareRotations, type PriceOverrides, type Priorities, type RotationResult } from "@/lib/rotation";
import { buildFacts, templateSummary, type SummaryFacts, type SummaryResponse } from "@/lib/summary";

const KIND_LABEL: Record<RotationResult["kind"], string> = {
  current: "What you grow now",
  common: "What most farmers here do",
  best: "Best match for you",
  alternative: "Another good option",
};

const PRIORITIES: { key: keyof Priorities; label: string; hint: string }[] = [
  { key: "water", label: "A harvest even in a dry year", hint: "Favour crops that cope with little rain" },
  { key: "soil", label: "Healthier soil", hint: "Favour crops that feed the soil and break pest cycles" },
  { key: "market", label: "Crops that are easy to sell", hint: "Favour crops with established buyers" },
];

const LEVELS = [
  { value: 1, label: "Little" },
  { value: 3, label: "Some" },
  { value: 5, label: "A lot" },
];

const SCORE_HELP: Record<string, string> = {
  "Fits the weather": "How well these crops suit the rain, season length and heat in this area",
  "Rain safety": "How often past seasons gave these crops the rain they need",
  "Soil health": "Crops that add nitrogen and have deep roots score higher",
  "Pest break": "Higher when the crop changes every season",
  "Easy to sell": "How established the market is for these crops",
};

function rating(score: number): { word: string; color: string } {
  if (score >= 75) return { word: "Strong fit", color: "var(--leaf)" };
  if (score >= 55) return { word: "Fair fit", color: "var(--maize)" };
  return { word: "Weak fit", color: "var(--clay)" };
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="grid grid-cols-[7rem_1fr_2rem] items-center gap-2 text-sm" title={SCORE_HELP[label]}>
      <span className="text-muted">{label}</span>
      <div className="h-2 rounded-full bg-line">
        <div className="h-2 rounded-full" style={{ width: `${score}%`, background: rating(score).color }} />
      </div>
      <span className="text-right tabular-nums">{score}</span>
    </div>
  );
}

function Section({ title, items, open = false }: { title: string; items: string[]; open?: boolean }) {
  if (!items.length) return null;
  return (
    <details open={open} className="group border-t border-line pt-1">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold">
        {title}
        <span className="text-muted transition group-open:rotate-180" aria-hidden="true">
          ▾
        </span>
      </summary>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </details>
  );
}

const PRICES_KEY = "limashift.prices.v1";
const SOIL_KEY = "limashift.soil.v1";
const kwacha = (n: number) => `K${n.toLocaleString("en-US")}`;

function ValueLine({ value }: { value: RotationResult["value"] }) {
  if (value.covered.length === 0) return <>no price data for these crops yet.</>;
  const partial = value.missing.length ? `, counting only ${value.covered.join(" and ").toLowerCase()}` : "";
  return (
    <>
      about <strong>{kwacha(value.zmwPerHa)}</strong> per hectare over three seasons at{" "}
      {value.usesOwnPrices ? "your prices now" : "official market prices"}
      {value.zmwPerHaAtHarvest !== null && (
        <>
          , or <strong>{kwacha(value.zmwPerHaAtHarvest)}</strong> at the harvest prices you expect
        </>
      )}
      {partial}. Before costs.
    </>
  );
}

function RotationCard({ result }: { result: RotationResult }) {
  const s = result.scores;
  const best = result.kind === "best";
  const baseline = result.kind === "current" || result.kind === "common";
  const r = rating(s.overall);
  return (
    <article
      className={`flex flex-col gap-4 rounded-2xl border p-4 sm:p-5 ${
        best ? "border-leaf bg-card shadow-md ring-1 ring-leaf" : baseline ? "border-line bg-background" : "border-line bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${
            best ? "bg-leaf text-white" : baseline ? "bg-line text-foreground" : "bg-leaf-soft text-leaf-dark"
          }`}
        >
          {KIND_LABEL[result.kind]}
        </p>
        <div className="text-right">
          <p className="text-3xl font-semibold leading-none tabular-nums" style={{ color: r.color }}>
            {s.overall}
          </p>
          <p className="mt-1 whitespace-nowrap text-xs text-muted">{r.word}</p>
        </div>
      </div>

      <ol className="grid grid-cols-3 gap-2" aria-label="Crop for each season">
        {result.crops.map((c, i) => (
          <li
            key={`${c.id}-${i}`}
            className={`rounded-xl px-2 py-3 text-center ${c.family === "fallow" ? "bg-line/60" : "bg-leaf-soft"}`}
          >
            <span className="block text-[11px] uppercase tracking-wide text-muted">Season {i + 1}</span>
            <span className="mt-0.5 block text-sm font-semibold leading-tight">
              {c.family === "fallow" ? "Rest" : c.name}
            </span>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-1.5">
        <ScoreBar label="Fits the weather" score={s.fit} />
        <ScoreBar label="Rain safety" score={s.water} />
        <ScoreBar label="Soil health" score={s.soil} />
        <ScoreBar label="Pest break" score={s.pest} />
        <ScoreBar label="Easy to sell" score={s.market} />
      </div>

      <p className="rounded-xl bg-maize-soft px-3 py-2 text-sm">
        <span className="font-semibold">Rough value: </span>
        <ValueLine value={result.value} />
      </p>

      <Section title="Why this rotation" items={result.why} open />
      <Section title="Good things about it" items={result.benefits} open={!baseline} />
      <Section title="Risks to check" items={result.risks} open={!baseline} />
      <Section title="The evidence" items={result.evidence} />
      <Section title="What we don't know" items={result.gaps} />
    </article>
  );
}

type SummaryState = { key: string; status: "idle" | "loading" | "done"; res?: SummaryResponse };

function Summary({ factsKey, facts }: { factsKey: string; facts: SummaryFacts }) {
  const [state, setState] = useState<SummaryState>({ key: factsKey, status: "idle" });
  // When the inputs change, go back to the standard text until the farmer asks again.
  const current: SummaryState = state.key === factsKey ? state : { key: factsKey, status: "idle" };

  async function askAI() {
    setState({ key: factsKey, status: "loading" });
    try {
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(facts),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState({ key: factsKey, status: "done", res: (await res.json()) as SummaryResponse });
    } catch {
      setState({ key: factsKey, status: "done", res: { text: templateSummary(facts), source: "template" } });
    }
  }

  const text = current.status === "done" && current.res ? current.res.text : templateSummary(facts);
  const source = current.status === "done" ? current.res?.source : undefined;

  return (
    <div className="rounded-2xl bg-leaf-dark p-6 text-white md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-2xl">In plain words</h3>
        {current.status !== "done" && (
          <button
            type="button"
            onClick={askAI}
            disabled={current.status === "loading"}
            className="rounded-full bg-maize px-4 py-2 text-sm font-semibold text-foreground transition hover:brightness-105 disabled:opacity-70"
          >
            {current.status === "loading" ? "Writing…" : "Explain it with AI"}
          </button>
        )}
      </div>
      <p className="mt-4 max-w-3xl text-lg leading-relaxed text-white/95" aria-live="polite">
        {text}
      </p>
      <p className="mt-4 text-xs text-white/70">
        {source === "ai"
          ? "Written by AI (DeepSeek) from the numbers on this page. Check anything important with your extension officer."
          : source === "template"
            ? "The AI explanation isn't available right now, so this is the standard summary."
            : "Standard summary, built from the numbers on this page."}
      </p>
    </div>
  );
}

export default function RotationPlanner({
  location,
  climate,
}: {
  location: DemoLocation;
  climate: ClimateProfile;
}) {
  const [startingOut, setStartingOut] = useState(true);
  const [current, setCurrent] = useState(["maize", "maize", "maize"]);
  const [priorities, setPriorities] = useState<Priorities>({ water: 3, soil: 3, market: 3 });
  const [prices, setPrices] = useState<PriceOverrides>({});
  const [soil, setSoil] = useState<SoilInfo>({});
  const [soilLoaded, setSoilLoaded] = useState(false);

  // Remember the farmer's prices on this device between visits.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PRICES_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time load from storage after mount
      if (saved) setPrices(JSON.parse(saved) as PriceOverrides);
      const savedSoil = window.localStorage.getItem(SOIL_KEY);
      if (savedSoil) setSoil(JSON.parse(savedSoil) as SoilInfo);
    } catch {
      /* storage unavailable: start with official prices and no soil */
    }
    setSoilLoaded(true);
  }, []);
  function updateSoil(next: SoilInfo) {
    setSoil(next);
    try {
      window.localStorage.setItem(SOIL_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: soil still applies for this visit */
    }
  }
  function updatePrices(next: PriceOverrides) {
    setPrices(next);
    try {
      window.localStorage.setItem(PRICES_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: prices still apply for this visit */
    }
  }

  const allResting = current.every((id) => id === FALLOW.id);
  const treatAsNew = startingOut || allResting;

  const { results } = useMemo(
    () => compareRotations(treatAsNew ? null : current, climate, priorities, prices, soil),
    [treatAsNew, current, climate, priorities, prices, soil],
  );
  const facts = useMemo(
    () => buildFacts(location.name, climate, results, treatAsNew, soil),
    [location, climate, results, treatAsNew, soil],
  );
  const factsKey = JSON.stringify([location.id, treatAsNew, current, priorities, prices, soil]);

  // Suggestions first; what the farmer grows now (or the usual practice) last, for comparison.
  const ordered = [...results.slice(1), results[0]];

  return (
    <>
      <section className="flex flex-col gap-6">
        <StepHeader
          n={3}
          title="Tell us about your farm"
          lead="There are no wrong answers. You can change these at any time and your options update straight away."
        />

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">Are you already farming?</legend>
          {[
            { value: true, title: "I'm just starting out", body: "Not growing anything yet. Show me where to begin." },
            { value: false, title: "I already grow crops", body: "Compare what I grow now with other options." },
          ].map((o) => (
            <label
              key={o.title}
              className={`cursor-pointer rounded-2xl border-2 p-5 transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-leaf ${
                startingOut === o.value ? "border-leaf bg-leaf-soft" : "border-line bg-card hover:border-muted"
              }`}
            >
              <input
                type="radio"
                name="farm-status"
                className="sr-only"
                checked={startingOut === o.value}
                onChange={() => setStartingOut(o.value)}
              />
              <span className="block font-semibold">{o.title}</span>
              <span className="mt-1 block text-sm text-muted">{o.body}</span>
            </label>
          ))}
        </fieldset>

        {!startingOut && (
          <fieldset className="rounded-2xl border border-line bg-card p-5">
            <legend className="px-1 font-semibold">What did you plant in your last three seasons?</legend>
            <p className="mt-1 text-sm text-muted">Choose &ldquo;Nothing&rdquo; for a season when the land rested.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {current.map((id, i) => (
                <label key={i} className="flex flex-col gap-1 text-sm text-muted">
                  Season {i + 1}
                  <select
                    value={id}
                    onChange={(e) => setCurrent(current.map((c, j) => (j === i ? e.target.value : c)))}
                    className="rounded-lg border border-line bg-background px-3 py-2.5 text-base text-foreground"
                  >
                    <option value={FALLOW.id}>Nothing (land rested)</option>
                    {CROPS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">
              Crop not listed, like cassava or tobacco? We only include crops whose rainfall needs and Zambian prices we
              could check. Pick the closest one, or &ldquo;Nothing&rdquo;.
            </p>
            {allResting && (
              <p className="mt-3 rounded-lg bg-maize-soft px-3 py-2 text-sm">
                Nothing planted in all three seasons, so we&apos;ll show you options as for a new farm.
              </p>
            )}
          </fieldset>
        )}

        <fieldset className="rounded-2xl border border-line bg-card p-5">
          <legend className="px-1 font-semibold">What matters most to you?</legend>
          <div className="mt-3 flex flex-col divide-y divide-line">
            {PRIORITIES.map((p) => (
              <div key={p.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{p.label}</p>
                  <p className="text-sm text-muted">{p.hint}</p>
                </div>
                <div role="radiogroup" aria-label={p.label} className="flex rounded-full bg-background p-1">
                  {LEVELS.map((l) => {
                    const on = priorities[p.key] === l.value;
                    return (
                      <button
                        key={l.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setPriorities({ ...priorities, [p.key]: l.value })}
                        className={`flex-1 rounded-full px-4 py-1.5 text-sm font-medium transition sm:flex-none ${
                          on ? "bg-leaf text-white shadow-sm" : "text-muted hover:text-foreground"
                        }`}
                      >
                        {l.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        {/* Mounted after saved soil is loaded, so its text boxes start with the saved values. */}
        {soilLoaded && <SoilPanel soil={soil} onChange={updateSoil} />}
        <PricePanel prices={prices} onChange={updatePrices} />
      </section>

      <section className="flex flex-col gap-6">
        <StepHeader
          n={4}
          title={`Your options for ${location.name}`}
          lead="Each option is three seasons, one crop per season, and then it repeats. The score shows how well it fits this area and what you said matters to you."
        />
        <Summary factsKey={factsKey} facts={facts} />
        <div className="grid gap-5 lg:grid-cols-3">
          {ordered.map((r) => (
            <RotationCard key={r.kind} result={r} />
          ))}
        </div>
        <aside className="rounded-2xl border border-line bg-card p-5 text-sm leading-relaxed text-muted">
          <h3 className="font-semibold text-foreground">What this tool can&apos;t tell you</h3>
          <p className="mt-1">
            These suggestions come from satellite weather records and general crop needs. They don&apos;t know your
            soil, your seed, your tools, your labour or this year&apos;s prices. Use them to start a conversation with
            your agricultural extension officer or a lead farmer near you. The decision is always yours.
          </p>
        </aside>
      </section>
    </>
  );
}
