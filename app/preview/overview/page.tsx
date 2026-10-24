import { ReplayOverview } from "@/components/overview/overview";
import type { ReplaySnapshot } from "@/components/overview/source";
import { format } from "@/lib/finance/money";
import { previewAudit, previewDashboard, previewFeed, previewField, previewRun } from "@/lib/demo/preview";
import { DEFAULT_POLICY } from "@/lib/watch/screen";
import { FEED_SCRIPT } from "@/lib/watch/script";

export const dynamic = "force-dynamic";

/** The overview over an in-memory engine run, replayed with pacing. Development only. */
export default async function PreviewOverview() {
  const [run, dashboard, field, feed, audit] = await Promise.all([previewRun(), previewDashboard(), previewField(), previewFeed(), previewAudit()]);
  const arrivals = [...feed.items].reverse();
  const held = arrivals.find((i) => i.payee?.lookalike)!;
  const paid = run.data.transactions.findIndex((t) => t.invoiceReference === "INV-20475");
  const snapshot: ReplaySnapshot = {
    dashboard,
    field,
    events: run.events.map((e) => ({ seq: e.seq, eventType: e.eventType, message: e.message, at: e.createdAt, metadata: e.metadata })),
    runMetadata: run.investigation.metadata ?? {},
    feed: arrivals.map((item, i) => ({ gapMs: FEED_SCRIPT[i].gapMs, item })),
    policy: DEFAULT_POLICY,
    // Layout sample only: production answers come from convex/agent.ts.
    answer: {
      id: "preview-ask",
      question: "",
      status: "done",
      steps: [
        { tool: "live_feed", summary: `checked ${arrivals.length} payments from the live feed` },
        { tool: "vendor_profile", summary: 'pulled the payment history for "summit packaging"' },
      ],
      answer: `${held.merchantName} asked for ${format(held.amountCents)}, but the name is one character off Summit Packaging Supply and it pays account ••${held.payeeAccount}, while all ${held.payee?.payments} earlier payments went to ••4410 [1] [2].`,
      citations: [
        { ref: `screening:${held.id}`, label: `${held.merchantName} · ${format(held.amountCents)} · held`, href: null },
        { ref: `tx:tx-${paid}`, label: `Summit Packaging Supply · ${format(run.data.transactions[paid].amountCents)} · INV-20475`, href: null },
      ],
      figures: { total: 1, traced: 1 },
      model: "preview",
      error: null,
      at: 0,
    },
    audit,
  };
  return <ReplayOverview snapshot={snapshot} />;
}
