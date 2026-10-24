import "server-only";
import { and, asc, desc, eq, inArray, notInArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { weightedConfidence } from "@/lib/finance/impact";
import { STREAMS, streamForCategory, streamForFinding, type LeakStream, type StreamKey } from "@/lib/river/streams";

export interface FindingListItem {
  id: string;
  findingType: schema.FindingType;
  title: string;
  summary: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  confidence: number;
  monthlyImpactCents: number;
  annualImpactCents: number;
  status: string;
  recoveryKind: string;
  recommendationStatus: schema.RecommendationStatus | null;
  recommendationTitle: string | null;
  narrativeSource: string | null;
  fingerprint: string;
  stream: LeakStream;
}

export interface MonthlyOverview {
  label: string;
  revenueCents: number;
  grossProfitCents: number;
}

export interface RiverData {
  /** Trailing 90 days ending at the latest sale, annualized (x4) to match finding impact. */
  windowDays: number;
  revenueAnnualCents: number;
  streams: { key: StreamKey; label: string; annualCents: number }[];
}

export interface InvestigationStats {
  transactions: number;
  sales: number;
  products: number;
  competitorListings: number;
}

export interface DashboardData {
  organization: { id: string; name: string; industry: string; currency: string; demoMode: boolean };
  latest: {
    id: string;
    completedAt: string | null;
    totalRecoveryMonthlyCents: number;
    totalRecoveryAnnualCents: number;
    stats: InvestigationStats | null;
    externalIntelMode: string | null;
    externalIntelSandbox: boolean;
    aiModel: string | null;
    modelExplanations: number;
    warnings: string[];
    triggerType: string;
  } | null;
  activeInvestigationId: string | null;
  lastFailure: { id: string; message: string | null } | null;
  findings: FindingListItem[];
  overallConfidence: number;
  overview: {
    revenue30Cents: number;
    revenuePrior30Cents: number;
    grossMargin30Pct: number;
    orders30: number;
    months: MonthlyOverview[];
  };
  river: RiverData;
}

const ACTIVE: schema.InvestigationStatus[] = ["COMPLETED", "FAILED"];

export async function listFindings(investigationId: string): Promise<FindingListItem[]> {
  const db = getDb();
  const rows = await db
    .select({ finding: schema.findings, rec: schema.recommendations })
    .from(schema.findings)
    .leftJoin(schema.recommendations, eq(schema.recommendations.findingId, schema.findings.id))
    .where(eq(schema.findings.investigationId, investigationId))
    .orderBy(desc(schema.findings.annualImpactCents));
  return rows.map(({ finding: f, rec }) => ({
    id: f.id,
    findingType: f.findingType,
    title: f.title,
    summary: f.summary,
    severity: f.severity,
    confidence: f.confidence,
    monthlyImpactCents: f.monthlyImpactCents,
    annualImpactCents: f.annualImpactCents,
    status: f.status,
    recoveryKind: String(f.metadataJson.recoveryKind ?? "recurring"),
    recommendationStatus: rec?.status ?? null,
    recommendationTitle: rec?.title ?? null,
    narrativeSource: (f.metadataJson.narrativeSource as string) ?? null,
    fingerprint: f.fingerprint,
    stream: streamForFinding(f.findingType, f.metadataJson),
  }));
}

async function businessOverview(organizationId: string): Promise<{ overview: DashboardData["overview"]; river: RiverData }> {
  const db = getDb();
  const [sales, costs, debits] = await Promise.all([
    db
      .select({ productId: schema.sales.productId, soldAt: schema.sales.soldAt, quantity: schema.sales.quantity, revenue: schema.sales.grossRevenueCents, orderId: schema.sales.orderId })
      .from(schema.sales)
      .where(eq(schema.sales.organizationId, organizationId)),
    db
      .select({ productId: schema.supplierCosts.productId, effectiveDate: schema.supplierCosts.effectiveDate, unitCostCents: schema.supplierCosts.unitCostCents })
      .from(schema.supplierCosts)
      .where(eq(schema.supplierCosts.organizationId, organizationId))
      .orderBy(asc(schema.supplierCosts.effectiveDate)),
    db
      .select({ date: schema.transactions.transactionDate, amount: schema.transactions.amountCents, category: schema.transactions.category })
      .from(schema.transactions)
      .where(and(eq(schema.transactions.organizationId, organizationId), eq(schema.transactions.transactionType, "DEBIT"))),
  ]);
  const costsByProduct = new Map<string, typeof costs>();
  for (const c of costs) costsByProduct.set(c.productId, [...(costsByProduct.get(c.productId) ?? []), c]);
  const costAt = (productId: string, at: Date) => {
    const list = costsByProduct.get(productId) ?? [];
    let cost = list[0]?.unitCostCents ?? 0;
    for (const c of list) if (c.effectiveDate <= at) cost = c.unitCostCents;
    return cost;
  };

  const latest = sales.reduce((m, s) => Math.max(m, s.soldAt.getTime()), 0);
  const DAY = 86_400_000;
  const end = latest ? new Date(new Date(latest).setUTCHours(23, 59, 59, 999)).getTime() : Date.now();
  const months: MonthlyOverview[] = [];
  for (let k = 5; k >= 0; k--) {
    const from = end - (k + 1) * 30 * DAY;
    const to = end - k * 30 * DAY;
    const bucket = sales.filter((s) => s.soldAt.getTime() > from && s.soldAt.getTime() <= to);
    const revenue = bucket.reduce((sum, s) => sum + s.revenue, 0);
    const cogs = bucket.reduce((sum, s) => sum + costAt(s.productId, s.soldAt) * s.quantity, 0);
    const labelDate = new Date(to);
    months.push({
      label: labelDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      revenueCents: revenue,
      grossProfitCents: revenue - cogs,
    });
  }
  const last = months[5];
  const prior = months[4];
  const orders30 = new Set(sales.filter((s) => s.soldAt.getTime() > end - 30 * DAY).map((s) => s.orderId)).size;
  const overview = {
    revenue30Cents: last?.revenueCents ?? 0,
    revenuePrior30Cents: prior?.revenueCents ?? 0,
    grossMargin30Pct: last && last.revenueCents ? Math.round((last.grossProfitCents / last.revenueCents) * 1000) / 10 : 0,
    orders30,
    months,
  };

  // Money river: trailing 90 days. Inventory purchases are excluded from operating spend
  // because product cost is already counted as COGS at the time of sale.
  const WINDOW = 90;
  const from = end - WINDOW * DAY;
  const inWindow = sales.filter((s) => s.soldAt.getTime() > from && s.soldAt.getTime() <= end);
  const revenue = inWindow.reduce((sum, s) => sum + s.revenue, 0);
  const totals = new Map<StreamKey, number>(STREAMS.map((s) => [s.key, 0]));
  totals.set("cogs", inWindow.reduce((sum, s) => sum + costAt(s.productId, s.soldAt) * s.quantity, 0));
  for (const t of debits) {
    const at = t.date.getTime();
    if (at <= from || at > end || t.category === "inventory") continue;
    const key = streamForCategory(t.category);
    totals.set(key, (totals.get(key) ?? 0) + t.amount);
  }
  const spent = [...totals.entries()].filter(([k]) => k !== "profit").reduce((sum, [, v]) => sum + v, 0);
  totals.set("profit", revenue - spent);
  const river: RiverData = {
    windowDays: WINDOW,
    revenueAnnualCents: revenue * 4,
    streams: STREAMS.map((s) => ({ key: s.key, label: s.label, annualCents: (totals.get(s.key) ?? 0) * 4 })),
  };
  return { overview, river };
}

export async function getDashboardData(organization: schema.Organization): Promise<DashboardData> {
  const db = getDb();
  const [latestRows, activeRows, failedRows, overview] = await Promise.all([
    db
      .select()
      .from(schema.investigations)
      .where(and(eq(schema.investigations.organizationId, organization.id), eq(schema.investigations.status, "COMPLETED")))
      .orderBy(desc(schema.investigations.completedAt))
      .limit(1),
    db
      .select({ id: schema.investigations.id })
      .from(schema.investigations)
      .where(and(eq(schema.investigations.organizationId, organization.id), notInArray(schema.investigations.status, ACTIVE)))
      .limit(1),
    db
      .select({ id: schema.investigations.id, message: schema.investigations.errorMessage, startedAt: schema.investigations.startedAt })
      .from(schema.investigations)
      .where(and(eq(schema.investigations.organizationId, organization.id), inArray(schema.investigations.status, ["FAILED"])))
      .orderBy(desc(schema.investigations.startedAt))
      .limit(1),
    businessOverview(organization.id),
  ]);
  const { overview: businessStats, river } = overview;

  const latest = latestRows[0] ?? null;
  const findings = latest ? await listFindings(latest.id) : [];
  const meta = (latest?.metadataJson ?? {}) as Record<string, unknown>;
  const credible = findings.filter((f) => f.status !== "NEEDS_REVIEW");
  const failure = failedRows[0];

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      industry: organization.industry,
      currency: organization.currency,
      demoMode: organization.demoMode,
    },
    latest: latest
      ? {
          id: latest.id,
          completedAt: latest.completedAt?.toISOString() ?? null,
          totalRecoveryMonthlyCents: latest.totalRecoveryMonthlyCents,
          totalRecoveryAnnualCents: latest.totalRecoveryAnnualCents,
          stats: (meta.stats as InvestigationStats | undefined) ?? null,
          externalIntelMode: ((meta.externalIntel as Record<string, unknown> | null)?.mode as string) ?? null,
          externalIntelSandbox: Boolean((meta.externalIntel as Record<string, unknown> | null)?.sandbox),
          aiModel: ((meta.ai as Record<string, unknown> | null)?.model as string) ?? null,
          modelExplanations: Number((meta.ai as Record<string, unknown> | null)?.modelExplanations ?? 0),
          warnings: (meta.warnings as string[]) ?? [],
          triggerType: latest.triggerType,
        }
      : null,
    activeInvestigationId: activeRows[0]?.id ?? null,
    lastFailure: failure && (!latest?.completedAt || failure.startedAt > latest.completedAt) ? { id: failure.id, message: failure.message } : null,
    findings,
    overallConfidence: weightedConfidence(credible.map((f) => ({ confidence: f.confidence, annualCents: f.annualImpactCents }))),
    overview: businessStats,
    river,
  };
}
