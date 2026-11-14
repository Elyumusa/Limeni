"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const SLIDES = [
  {
    src: "/hero/farmer-phone.jpg",
    alt: "A smiling farmer on a phone call, standing between tall rows of climbing bean plants",
    position: "68% 30%",
    caption: "Check your area's weather history from your phone",
  },
  {
    src: "/hero/farmer-hoe.jpg",
    alt: "A farmer carrying a hoe on one shoulder, standing in a green field of maize and banana plants",
    position: "55% 25%",
    caption: "Plan your next three seasons before you buy seed",
  },
];

const INTERVAL_MS = 7000;

export default function Hero() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (paused || reduce) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [paused]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Farmers using LimaShift"
      className="relative isolate overflow-hidden bg-leaf-dark"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {SLIDES.map((slide, i) => (
        <div
          key={slide.src}
          aria-hidden={i !== index}
          className={`absolute inset-0 -z-10 transition-opacity duration-1000 motion-reduce:transition-none ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
        >
          <Image
            src={slide.src}
            alt={slide.alt}
            fill
            loading="eager"
            fetchPriority={i === 0 ? "high" : "low"}
            sizes="100vw"
            className="object-cover"
            style={{ objectPosition: slide.position }}
          />
        </div>
      ))}
      {/* Darkens the side the text sits on so it stays readable over any photo. */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/45 to-black/10 md:bg-gradient-to-r md:from-black/75 md:via-black/40 md:to-transparent" />

      <div className="mx-auto flex min-h-[580px] max-w-6xl flex-col justify-end px-4 pb-14 pt-24 md:min-h-[640px] md:justify-center md:pb-20">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-maize">
          For farmers in Zambia
        </p>
        <h1 className="mt-3 max-w-xl font-display text-4xl leading-[1.08] text-white sm:text-5xl md:text-6xl">
          Know what to plant next season
        </h1>
        <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/90">
          LimaShift checks 45 years of satellite weather records for your area and suggests crop
          rotations that suit your land, your goals and the rain you can count on.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="#plan"
            className="rounded-full bg-maize px-6 py-3 font-semibold text-foreground shadow-sm transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Plan my farm
          </a>
          <a
            href="#why"
            className="rounded-full border border-white/60 px-6 py-3 font-semibold text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            What is crop rotation?
          </a>
        </div>

        <div className="mt-8 flex items-center gap-3">
          <div className="flex">
            {SLIDES.map((slide, i) => (
              <button
                key={slide.src}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show photo ${i + 1} of ${SLIDES.length}`}
                aria-current={i === index}
                className="group flex h-11 items-center px-1"
              >
                <span
                  className={`block h-2.5 rounded-full transition-all ${
                    i === index ? "w-8 bg-maize" : "w-2.5 bg-white/60 group-hover:bg-white"
                  }`}
                />
              </button>
            ))}
          </div>
          <p className="text-sm text-white/80" aria-live="polite">
            {SLIDES[index].caption}
          </p>
        </div>
      </div>
    </section>
  );
}
