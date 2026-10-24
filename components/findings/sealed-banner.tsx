import { format } from "@/lib/finance/money";

/** Shown once a fix is approved. */
export function SealedBanner({ annualCents, oneTime }: { annualCents: number; oneTime: boolean }) {
  return (
    <div className="animate-fade-up mt-8 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-[var(--radius)] border border-signal/40 bg-signal-soft px-4 py-3 font-mono text-[13px]">
      <span className="text-signal">● approved</span>
      <span className="text-muted-foreground">
        {oneTime ? `${format(annualCents, { compact: true })} back once refunded` : `+${format(annualCents, { compact: true })}/yr once you apply it`}
      </span>
    </div>
  );
}
