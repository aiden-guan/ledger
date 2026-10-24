import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { Badge } from "@/components/ui/badge";
import { SiteFooter } from "@/components/layout/site-footer";
import { getAuditTrail } from "@/lib/db/queries/findings";
import { getCurrentOrganization } from "@/lib/db/queries/organization";
import { getEnv } from "@/lib/env";
import { format } from "@/lib/finance/money";
import { AUDIT_ACTION_LABELS, formatDateTime } from "@/lib/ui/labels";

export const dynamic = "force-dynamic";

function describe(entry: Awaited<ReturnType<typeof getAuditTrail>>[number]): string | null {
  const m = entry.metadata as Record<string, unknown>;
  if (entry.action === "investigation.completed" && typeof m.annualRecoveryCents === "number") {
    return `${m.findings} findings · ${format(m.annualRecoveryCents, { compact: true })} potential annual recovery`;
  }
  if (typeof m.title === "string") return m.reason ? `${m.title} · "${m.reason}"` : m.title;
  if (typeof m.note === "string") return m.note;
  if (entry.action === "investigation.started") return `Trigger: ${String(m.triggerType ?? "manual").toLowerCase().replace(/_/g, " ")}`;
  return null;
}

export default async function ActivityPage() {
  const org = await getCurrentOrganization();
  const entries = org ? await getAuditTrail(org.id) : [];
  return (
    <>
      <AppHeader organizationName={org?.name} demoMode={getEnv().DEMO_MODE} />
      <main className="mx-auto max-w-4xl px-4 pb-20 pt-12 sm:px-6">
        <p className="label">audit.log</p>
        <h1 className="mt-3 text-[34px] font-medium tracking-[-0.035em] sm:text-[44px]">Every decision, on the record.</h1>
        <p className="mt-3 max-w-xl text-[15px] text-muted-foreground">Every investigation and every decision on a recommendation, newest first. Nothing here can be edited.</p>
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
