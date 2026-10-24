"use client";

import { usePreloadedQuery, type Preloaded } from "convex/react";
import type { api } from "@/convex/_generated/api";
import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { Badge } from "@/components/ui/badge";
import { SiteFooter } from "@/components/layout/site-footer";
import type { AuditEntryDTO } from "@/lib/views/findings";
import { format } from "@/lib/finance/money";
import { AUDIT_ACTION_LABELS, formatDateTime } from "@/lib/ui/labels";

function describe(entry: AuditEntryDTO): string | null {
  const m = entry.metadata as Record<string, unknown>;
  if (entry.action === "investigation.completed" && typeof m.annualRecoveryCents === "number") {
    return `${m.findings} findings · ${format(m.annualRecoveryCents, { compact: true })} potential annual recovery`;
  }
  if (entry.action.startsWith("payment.") && typeof m.merchant === "string" && typeof m.amountCents === "number") {
    return `${m.merchant} · ${format(m.amountCents)} · risk ${Number(m.score ?? 0).toFixed(2)}`;
  }
  if (entry.action.startsWith("ask.") && typeof m.question === "string") return `"${m.question}"`;
  if (entry.action === "autopilot.updated") {
    const to = m.to as { holdAt: number; reviewAt: number; approvalLimitCents: number } | undefined;
    if (to) return `hold at ${to.holdAt.toFixed(2)} · flag at ${to.reviewAt.toFixed(2)} · ask above ${format(to.approvalLimitCents, { compact: true })}`;
  }
  if (typeof m.title === "string") return m.reason ? `${m.title} · "${m.reason}"` : m.title;
  if (typeof m.note === "string") return m.note;
  if (entry.action === "investigation.started") return `Trigger: ${String(m.triggerType ?? "manual").toLowerCase().replace(/_/g, " ")}`;
  return null;
}

/** The audit log, live: new decisions appear as they are recorded. */
export function ActivityView({ organization, trail }: { organization: Preloaded<typeof api.dashboard.organization>; trail: Preloaded<typeof api.findings.auditTrail> }) {
  return <ActivityContent org={usePreloadedQuery(organization)} entries={usePreloadedQuery(trail)} />;
}

export function ActivityContent({ org, entries }: { org: { name: string; demoMode: boolean } | null; entries: AuditEntryDTO[] }) {
  return (
    <>
      <AppHeader organizationName={org?.name} demoMode={org?.demoMode ?? false} />
      <main className="mx-auto max-w-4xl px-4 pb-20 pt-12 sm:px-6">
        <p className="label">audit.log</p>
        <h1 className="display mt-3 text-[38px] font-medium sm:text-[52px]">Every decision, on the record.</h1>
        <ol className="mt-10 border-t border-border-strong font-mono text-[12px]">
          {entries.length === 0 && <li className="py-6 text-muted-foreground">no activity yet.</li>}
          {entries.map((e, i) => {
            const findingId = (e.metadata as Record<string, unknown>).findingId as string | undefined;
            const detail = describe(e);
            const label = (AUDIT_ACTION_LABELS[e.action] ?? e.action).toLowerCase();
            return (
              <li key={e.id} className="grid grid-cols-[2.5rem_1fr] gap-x-4 gap-y-1 border-b border-border py-3.5 sm:grid-cols-[2.5rem_10rem_1fr_auto] sm:items-baseline">
                <span className="tabular text-faint">{String(entries.length - i).padStart(3, "0")}</span>
                <span className="tabular text-muted-foreground">{formatDateTime(e.createdAt)}</span>
                <div className="col-start-2 min-w-0 sm:col-start-auto">
                  <p className="text-foreground">
                    {findingId ? (
                      <Link href={`/findings/${findingId}`} className="underline decoration-border-strong underline-offset-4 hover:decoration-foreground">
                        {label}
                      </Link>
                    ) : (
                      label
                    )}
                  </p>
                  {detail && <p className="truncate font-sans text-[13px] text-muted-foreground">{detail}</p>}
                </div>
                <span className="col-start-2 sm:col-start-auto">
                  <Badge variant={e.actorType === "USER" ? "positive" : "outline"}>{e.actorType.toLowerCase()}</Badge>
                </span>
              </li>
            );
          })}
        </ol>
      </main>
      <SiteFooter />
    </>
  );
}
