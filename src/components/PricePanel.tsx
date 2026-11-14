"use client";

import { useEffect, useState } from "react";
import { CROPS, PRICE_PERIOD } from "@/data/crops";
import type { PriceOverrides } from "@/lib/rotation";

type Unit = "kg" | "bag";
const BAG_KG = 50;

function monthsSince(isoDate: string): number {
  const then = new Date(isoDate);
  const now = new Date();
  return (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth());
}

const toUnit = (perKg: number, unit: Unit) => (unit === "bag" ? perKg * BAG_KG : perKg);
const fromUnit = (value: number, unit: Unit) => (unit === "bag" ? value / BAG_KG : value);
const show = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/**
 * Lets the farmer replace the official prices with what buyers pay near them
 * now, and what they expect at harvest. Prices are stored per kg.
 */
export default function PricePanel({
  prices,
  onChange,
}: {
  prices: PriceOverrides;
  onChange: (prices: PriceOverrides) => void;
}) {
  const [unit, setUnit] = useState<Unit>("bag");
  // Worked out in the browser after loading, so the page isn't frozen at build time.
  const [age, setAge] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads today's date once, after mount
    setAge(monthsSince(PRICE_PERIOD.end));
  }, []);
  const entered = Object.values(prices).filter((p) => p.now !== undefined || p.harvest !== undefined).length;

  function setPrice(cropId: string, field: "now" | "harvest", raw: string) {
    const next = { ...prices, [cropId]: { ...prices[cropId] } };
    const value = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(value) || value < 0) delete next[cropId][field];
    else next[cropId][field] = fromUnit(value, unit);
    if (next[cropId].now === undefined && next[cropId].harvest === undefined) delete next[cropId];
    onChange(next);
  }

  return (
    <details className="group rounded-2xl border border-line bg-card" open={entered > 0}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4 sm:p-5">
        <span>
          <span className="block font-semibold">Crop prices</span>
          <span className="block text-sm text-muted">
            {entered > 0
              ? `Using your prices for ${entered} crop${entered > 1 ? "s" : ""}.`
              : "Optional. Add what buyers pay near you to get a truer value."}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {age >= 6 && entered === 0 && (
            <span className="rounded-full bg-maize-soft px-3 py-1 text-xs font-semibold text-clay">
              Official prices are {age} months old
            </span>
          )}
          <span className="text-muted transition group-open:rotate-180" aria-hidden="true">
            ▾
          </span>
        </span>
      </summary>

      <div className="border-t border-line p-4 sm:p-5">
        <p className="text-sm leading-relaxed text-muted">
          Prices change every season. The official figures are national market averages from {PRICE_PERIOD.label}.
          Enter what traders, the FRA or your co-operative pay near you <strong>now</strong>, and what you expect{" "}
          <strong>at harvest</strong> if you have an idea. Leave a box empty to use the official price. Your prices stay
          on this device only.
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div role="radiogroup" aria-label="Price unit" className="flex w-full rounded-full bg-background p-1 text-sm sm:w-auto">
            {(["bag", "kg"] as Unit[]).map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={unit === u}
                onClick={() => setUnit(u)}
                className={`flex-1 rounded-full px-3 py-2 font-medium sm:flex-none sm:px-4 ${unit === u ? "bg-leaf text-white" : "text-muted"}`}
              >
                {u === "bag" ? "Per 50 kg bag" : "Per kg"}
              </button>
            ))}
          </div>
          {entered > 0 && (
            <button type="button" onClick={() => onChange({})} className="text-sm font-medium text-clay underline">
              Clear my prices
            </button>
          )}
        </div>

        {/* A list rather than a table, so each crop stacks neatly on a phone. */}
        <div className="mt-4">
          <div className="hidden grid-cols-[1fr_7rem_8rem_8rem] gap-3 pb-2 text-sm font-medium text-muted sm:grid">
            <span>Crop</span>
            <span>Official price</span>
            <span>Price now</span>
            <span>Expected at harvest</span>
          </div>
          <ul className="divide-y divide-line border-y border-line sm:border-t-0">
            {CROPS.map((c) => {
              const own = prices[c.id] ?? {};
              const official = c.priceZmwPerKg === null ? "none found" : `K${show(toUnit(c.priceZmwPerKg, unit))}`;
              return (
                <li key={c.id} className="grid grid-cols-2 gap-x-3 gap-y-2 py-3 sm:grid-cols-[1fr_7rem_8rem_8rem] sm:items-center">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-right text-sm tabular-nums text-muted sm:text-left">
                    <span className="sm:hidden">Official: </span>
                    {official}
                  </span>
                  {(["now", "harvest"] as const).map((field) => (
                    <label key={field} className="flex flex-col gap-1 text-xs text-muted sm:block">
                      <span className="sm:sr-only">{field === "now" ? "Price now" : "At harvest"}</span>
                      <span className="sr-only">
                        {c.name} price {field === "now" ? "now" : "expected at harvest"}, kwacha per{" "}
                        {unit === "bag" ? "50 kg bag" : "kg"}
                      </span>
                      <span className="relative block">
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted">K</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          placeholder={c.priceZmwPerKg === null ? "" : show(toUnit(c.priceZmwPerKg, unit))}
                          value={own[field] === undefined ? "" : show(toUnit(own[field] as number, unit))}
                          onChange={(e) => setPrice(c.id, field, e.target.value)}
                          className="w-full rounded-lg border border-line bg-background py-2.5 pl-6 pr-2 text-base tabular-nums text-foreground"
                        />
                      </span>
                    </label>
                  ))}
                </li>
              );
            })}
          </ul>
        </div>
        <p className="mt-3 text-xs text-muted">
          Prices change the rough value shown on each option. They don&apos;t change the ranking, because we
          don&apos;t yet have yields for every crop.
        </p>
      </div>
    </details>
  );
}
