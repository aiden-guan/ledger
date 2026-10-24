const PROMISES = [
  { title: "Exact to the cent.", body: "A deterministic engine does every calculation in whole cents. The model only explains the result." },
  { title: "Evidence attached.", body: "Competitor prices come from an Apify Actor, and each one says how and when it was captured." },
  { title: "You decide.", body: "LedgerLens prepares fixes and logs decisions. It never moves money, changes prices or emails anyone." },
];

/** The app footer: the three guarantees and an engraved wordmark. */
export function SiteFooter() {
  return (
    <footer className="mt-24 overflow-hidden border-t border-border-strong">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 pt-10 sm:grid-cols-3 sm:px-6">
        {PROMISES.map((p) => (
          <p key={p.title} className="text-[13px] leading-relaxed text-muted-foreground">
            <span className="display mb-1 block text-[18px] text-foreground">{p.title}</span>
            {p.body}
          </p>
        ))}
      </div>
      <p aria-hidden className="display hatched mx-auto mt-10 max-w-6xl select-none whitespace-nowrap px-2 text-[18vw] font-medium leading-[0.74] tracking-[-0.04em] lg:text-[200px]">
        LedgerLens
      </p>
    </footer>
  );
}
