import Explorer from "@/components/Explorer";
import Hero from "@/components/Hero";
import WhyRotate from "@/components/WhyRotate";
import { DATA_SOURCES } from "@/data/crops";

export default function Home() {
  return (
    <>
      <header className="absolute inset-x-0 top-0 z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
          <a href="#" className="font-display text-2xl text-white">
            Limeni
          </a>
          <nav className="flex gap-5 text-sm font-medium text-white/90">
            <a href="#why" className="hidden hover:text-white sm:inline">
              How it works
            </a>
            <a href="#plan" className="hover:text-white">
              Plan my farm
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Hero />
        <WhyRotate />
        <div className="mx-auto w-full max-w-6xl px-4 py-16 md:py-20">
          <Explorer />
        </div>
      </main>

      <footer className="border-t border-line bg-card">
        <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted">
          <p className="font-display text-xl text-foreground">Limeni</p>
          <p className="mt-1">Built for the NASA Space Apps Challenge 2026 · Field Shift: Adapting Farms with NASA Data</p>
          <h2 className="mt-6 font-semibold text-foreground">Where the numbers come from</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {DATA_SOURCES.map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
          <p className="mt-6 text-xs">Photos: stock photography, used for illustration.</p>
        </div>
      </footer>
    </>
  );
}
