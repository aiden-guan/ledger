import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { FindingListItem } from "@/lib/db/queries/dashboard";
import { format } from "@/lib/finance/money";
import { FINDING_TYPE_LABELS, percent, RECOMMENDATION_STATUS_LABELS } from "@/lib/ui/labels";
import { cn } from "@/lib/utils/cn";

export function FindingStatusBadge({ status, recommendationStatus }: { status: string; recommendationStatus: string | null }) {
  if (status === "NEEDS_REVIEW") return <Badge variant="warning">needs review</Badge>;
  if (!recommendationStatus) return null;
  const variant = recommendationStatus === "READY_FOR_EXECUTION" || recommendationStatus === "APPROVED" ? "positive" : recommendationStatus === "REJECTED" ? "default" : "negative";
  return <Badge variant={variant}>{RECOMMENDATION_STATUS_LABELS[recommendationStatus].toLowerCase()}</Badge>;
}

/** What the agent has already prepared for each kind of leak. */
export const PREPARED_FIX: Record<string, string> = {
  DUPLICATE_PAYMENT: "refund email drafted",
  SUBSCRIPTION_CREEP: "plan review email drafted",
  MARGIN_EROSION: "price change prepared",
  PRICING_OPPORTUNITY: "price change prepared",
};

export function FindingCard({ finding, index }: { finding: FindingListItem; index: number }) {
  const sealed = finding.recommendationStatus === "READY_FOR_EXECUTION" || finding.recommendationStatus === "APPROVED";
  const dimmed = finding.status === "DISMISSED" || finding.recommendationStatus === "REJECTED";
  return (
    <Link
      href={`/findings/${finding.id}`}
      className={cn("animate-fade-up group relative grid grid-cols-[2.25rem_1fr] gap-x-3 border-b py-5 transition-colors sm:grid-cols-[3rem_1fr_auto] sm:gap-x-6", dimmed && "opacity-50")}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <span aria-hidden className="absolute inset-0 -mx-3 origin-left scale-x-0 bg-foreground/[0.035] transition-transform duration-300 ease-out group-hover:scale-x-100" />
      <span className="relative font-mono text-[12px] text-faint">{String(index + 1).padStart(2, "0")}</span>
      <div className="relative min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="label">{FINDING_TYPE_LABELS[finding.findingType]}</span>
          <FindingStatusBadge status={finding.status} recommendationStatus={finding.recommendationStatus} />
        </div>
        <p className="mt-1.5 text-[17px] font-medium leading-snug tracking-[-0.01em]">{finding.title}</p>
        <p className="mt-1 line-clamp-2 max-w-2xl text-[14px] text-muted-foreground">{finding.summary}</p>
        <p className="mt-3 font-mono text-[12px] text-muted-foreground">
          {sealed ? <span className="text-positive">■ approved, ready to execute</span> : <>→ {PREPARED_FIX[finding.findingType] ?? "action prepared"}</>}
          <span className="text-faint"> · confidence {percent(finding.confidence)}</span>
        </p>
      </div>
      <div className="relative col-start-2 mt-3 flex items-baseline gap-3 sm:col-start-3 sm:mt-0 sm:flex-col sm:items-end sm:gap-1">
        <p className={cn("tabular font-mono text-[22px] tracking-[-0.04em]", sealed ? "text-positive" : dimmed ? "text-muted-foreground" : "text-signal")}>
          {sealed ? "+" : "−"}
          {format(finding.annualImpactCents)}
        </p>
        <p className="font-mono text-[11px] text-muted-foreground">
          {finding.recoveryKind === "one_time" ? "one-time" : `per year · ${format(finding.monthlyImpactCents)}/mo`}
          <span className="ml-2 inline-block transition-transform group-hover:translate-x-0.5">↗</span>
        </p>
      </div>
    </Link>
  );
}
