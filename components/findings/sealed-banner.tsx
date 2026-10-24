import { format } from "@/lib/finance/money";

/** Shown once a fix is approved: stamped onto the page like a cleared cheque. */
export function SealedBanner({ annualCents, oneTime }: { annualCents: number; oneTime: boolean }) {
  return (
    <div className="mt-8 flex flex-col gap-4 border-y border-positive/40 py-5 sm:flex-row sm:items-center sm:gap-8">
      <p className="animate-stamp inline-block shrink-0 -rotate-3 self-start border-2 border-positive px-4 py-1.5 font-mono text-[15px] font-semibold uppercase tracking-[0.2em] text-positive outline outline-1 outline-offset-2 outline-positive sm:self-auto">
        Approved
      </p>
      <p className="text-[15px] text-muted-foreground">
        <span className="text-foreground">Leak sealed. </span>
        {oneTime
          ? `${format(annualCents, { compact: true })} comes back once the vendor refunds it.`
          : `+${format(annualCents, { compact: true })} a year flows back to profit once you carry out the steps.`}
      </p>
    </div>
  );
}
