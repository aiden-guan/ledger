import { DashboardContent } from "@/components/dashboard/dashboard-view";
import { format } from "@/lib/finance/money";
import { previewDashboard, previewFeed } from "@/lib/demo/preview";

export const dynamic = "force-dynamic";

export default async function PreviewOverview({ searchParams }: { searchParams: Promise<{ approved?: string }> }) {
  const { approved } = await searchParams;
  const ids = (approved ?? "").split(",").filter(Boolean).map(Number);
  const feed = await previewFeed();
  const held = feed.items.find((i) => i.payee?.lookalike)!;
  // Layout sample only: production answers come from convex/agent.ts.
  const asks = [
    {
      id: "preview-ask",
      question: "Why was a Summit payment held?",
      status: "done" as const,
      steps: [
        { tool: "live_feed", summary: `checked ${feed.items.length} payments from the live feed` },
        { tool: "vendor_profile", summary: 'pulled the payment history for "summit packaging"' },
      ],
      answer: `${held.merchantName} asked for ${format(held.amountCents)}, but the name is one character off Summit Packaging Supply and it pays account ••${held.payeeAccount}, while all ${held.payee?.payments} earlier payments went to ••4410 [1] [2].`,
      citations: [
        { ref: `screening:${held.id}`, label: `${held.merchantName} · ${format(held.amountCents)} · held`, href: null },
        { ref: "tx:preview", label: "Sep 26 · Summit Packaging Supply · $926.10 · INV-20475", href: null },
      ],
      figures: { total: 1, traced: 1 },
      model: "preview",
      error: null,
      at: Date.now(),
    },
  ];
  return <DashboardContent data={await previewDashboard(ids)} preview={{ feed, asks }} />;
}
