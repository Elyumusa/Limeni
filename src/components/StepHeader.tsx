export default function StepHeader({ n, title, lead }: { n: number; title: string; lead?: string }) {
  return (
    <header>
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-leaf">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-leaf text-sm text-white sm:h-8 sm:w-8">
          {n}
        </span>
        Step {n} of 4
      </p>
      <h2 className="mt-2 font-display text-2xl leading-tight sm:text-3xl">{title}</h2>
      {lead && <p className="mt-2 max-w-2xl leading-relaxed text-muted">{lead}</p>}
    </header>
  );
}
