import { merchantKey, normalizeMerchantName } from "@/lib/finance/merchants";
import { DEFAULT_POLICY, screenPayment, type HistoryEntry } from "@/lib/watch/screen";
import { FEED_SCRIPT } from "@/lib/watch/script";
import { buildExecutionChecklist } from "@/lib/investigation/actions";
import { buildDashboard, toFindingListItem, type DashboardData } from "@/lib/views/dashboard";
import { buildFindingDetail, type AuditEntryDTO, type FindingDetail } from "@/lib/views/findings";
import { runDemoOffline, type OfflineRun } from "./offline-run";

/*
 * Development preview: the dashboard, finding and audit views filled from an in-memory run of
 * the engine, for checking layouts without a Convex deployment. Never served in production.
 */

const ANCHOR = new Date("2026-10-24T00:00:00Z");
let cached: Promise<OfflineRun> | null = null;
const run = () => (cached ??= runDemoOffline(ANCHOR));

export async function previewDashboard(approved: number[] = []): Promise<DashboardData> {
  const r = await run();
  const findings = r.findings.map((b, i) => {
    const decided = approved.includes(i);
    return toFindingListItem(
      { ...b.finding, id: String(i), status: decided ? "ACTIONED" : "OPEN" },
      { status: decided ? "READY_FOR_EXECUTION" : "PROPOSED", title: b.recommendation.title },
    );
  });
  return buildDashboard({
    organization: r.ledger.organization,
    latest: {
      id: "offline",
      completedAt: r.investigation.completedAt ?? null,
      totalRecoveryMonthlyCents: r.investigation.totalRecoveryMonthlyCents ?? 0,
      totalRecoveryAnnualCents: r.investigation.totalRecoveryAnnualCents ?? 0,
      triggerType: "DEMO_SEED",
      metadata: r.investigation.metadata ?? {},
    },
    activeInvestigationId: null,
    lastFailure: null,
    findings,
    overview: {
      sales: r.data.sales.map((s) => ({ productId: s.sku, soldAt: s.soldAt, quantity: s.quantity, revenue: s.grossRevenueCents, orderId: s.orderId })),
      costs: [...r.data.supplierCosts].sort((a, b) => a.effectiveDate - b.effectiveDate).map((c) => ({ productId: c.sku, effectiveDate: c.effectiveDate, unitCostCents: c.unitCostCents })),
      debits: r.data.transactions.filter((t) => t.transactionType === "DEBIT").map((t) => ({ date: t.transactionDate, amount: t.amountCents, category: t.category })),
    },
    cash: {
      openingBalanceCents: r.data.organization.openingBalanceCents,
      flows: r.data.transactions.map((t) => ({
        at: t.transactionDate,
        amountCents: t.transactionType === "CREDIT" ? t.amountCents : -t.amountCents,
        category: t.category,
        merchantKey: merchantKey(t.normalizedMerchantName),
        merchantName: t.merchantName,
      })),
    },
  });
}

export async function previewFinding(index: number, approved = false): Promise<FindingDetail | null> {
  const r = await run();
  const b = r.findings[index];
  if (!b) return null;
  const decidedAt = r.investigation.completedAt ?? ANCHOR.getTime();
  const recMeta = approved ? { ...b.recommendation.metadata, executionChecklist: buildExecutionChecklist({ actionType: b.recommendation.actionType, metadata: b.recommendation.metadata }) } : b.recommendation.metadata;
  return buildFindingDetail({
    organization: { name: r.ledger.organization.name, demoMode: true },
    finding: { ...b.finding, id: String(index), investigationId: "offline", status: approved ? "ACTIONED" : "OPEN", createdAt: decidedAt },
    evidence: b.evidence.map((e, k) => ({ ...e, id: `${index}-${k}`, sourceReference: e.sourceReference ?? null, data: e.data })),
    recommendation: {
      id: `rec-${index}`,
      ...b.recommendation,
      status: approved ? "READY_FOR_EXECUTION" : "PROPOSED",
      approvedAt: approved ? decidedAt + 60_000 : null,
      rejectedAt: null,
      metadata: recMeta,
    },
    audit: approved
      ? [
          { id: "a2", action: "recommendation.ready_for_execution", actorType: "SYSTEM", createdAt: decidedAt + 60_100, metadata: {} },
          { id: "a1", action: "recommendation.approved", actorType: "USER", createdAt: decidedAt + 60_000, metadata: { title: b.recommendation.title } },
        ]
      : [],
    investigation: { id: "offline", completedAt: r.investigation.completedAt ?? null, startedAt: r.investigation.startedAt },
    events: r.events,
  });
}

export async function previewAudit(): Promise<AuditEntryDTO[]> {
  const r = await run();
  return r.audit
    .map((a, i) => ({ id: String(i), action: a.action, actorType: a.actorType, entityType: a.entityType, entityId: a.entityId, createdAt: new Date(a.createdAt).toISOString(), metadata: a.metadata }))
    .reverse();
}

/** The live feed after a full replay, screened offline exactly as convex/watch.ts does. */
export async function previewFeed() {
  const r = await run();
  const history: HistoryEntry[] = r.data.transactions.map((t, i) => ({
    id: `tx-${i}`,
    transactionDate: new Date(t.transactionDate),
    merchantName: t.merchantName,
    normalizedMerchantName: t.normalizedMerchantName,
    amountCents: t.amountCents,
    transactionType: t.transactionType,
    category: t.category,
    invoiceReference: t.invoiceReference,
    payeeAccount: (t.metadata.payeeAccount as string | undefined) ?? null,
  }));
  let at = ANCHOR.getTime() + 9 * 3_600_000;
  const items = FEED_SCRIPT.map(({ gapMs, ...p }, i) => {
    at += gapMs;
    const result = screenPayment({ ...p, id: `feed-${i}`, at }, history, DEFAULT_POLICY);
    const status = result.verdict === "hold" ? ("held" as const) : result.overLimit ? ("awaiting" as const) : result.verdict === "review" ? ("flagged" as const) : ("posted" as const);
    if (status === "posted" || status === "flagged") history.push({ ...p, id: `feed-${i}`, transactionDate: new Date(at), normalizedMerchantName: normalizeMerchantName(p.merchantName) });
    return { id: `feed-${i}`, seq: i + 1, at, ...p, verdict: result.verdict, score: result.score, signals: result.signals, payee: result.payee, status };
  }).reverse();
  return {
    running: false,
    cursor: FEED_SCRIPT.length,
    total: FEED_SCRIPT.length,
    policy: DEFAULT_POLICY,
    stoppedCents: items.filter((x) => x.status === "held").reduce((s, x) => s + x.amountCents, 0),
    waiting: items.filter((x) => x.status === "held" || x.status === "awaiting").length,
    items,
  };
}
