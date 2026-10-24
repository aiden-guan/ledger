import { format } from "@/lib/finance/money";

/** Shown once a fix is approved: an inverted ink block, stamped in like a receipt. */
export function SealedBanner({ annualCents, oneTime }: { annualCents: number; oneTime: boolean }) {
  return (
    <div className="animate-stamp mt-8 flex flex-col gap-1 bg-foreground px-5 py-4 font-mono text-background sm:flex-row sm:items-center sm:gap-6">
      <p className="text-[13px] uppercase tracking-[0.08em]">
        <span className="text-positive">■</span> leak sealed
      </p>
      <p className="text-[13px] opacity-75">
        {oneTime
          ? `${format(annualCents, { compact: true })} comes back once the vendor refunds it.`
          : `+${format(annualCents, { compact: true })}/yr flows back to profit once you carry out the steps.`}
      </p>
    </div>
  );
}
