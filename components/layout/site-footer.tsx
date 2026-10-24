/** Oversized wordmark footer with the product's three guarantees. */
export function SiteFooter() {
  return (
    <footer className="mt-24 overflow-hidden border-t">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 pt-8 font-mono text-[11px] text-muted-foreground sm:grid-cols-3 sm:px-6">
        <p>
          <span className="text-foreground">exact cents.</span> every figure comes from a deterministic engine with unit tests; the model never does arithmetic.
        </p>
        <p>
          <span className="text-foreground">real evidence.</span> competitor prices are collected by an apify actor and labeled with how they were captured.
        </p>
        <p>
          <span className="text-foreground">your call.</span> ledgerlens prepares fixes and records decisions. it never moves money, changes prices or emails anyone.
        </p>
      </div>
      <p
        aria-hidden
        className="mx-auto mt-6 max-w-6xl select-none whitespace-nowrap px-2 font-mono text-[18.5vw] font-medium leading-[0.78] tracking-[-0.08em] text-foreground/[0.06] lg:text-[208px]"
      >
        ledgerlens
      </p>
    </footer>
  );
}
