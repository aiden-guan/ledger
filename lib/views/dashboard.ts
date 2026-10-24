import type { FindingType, InvestigationStatus, Organization, RecommendationStatus } from "@/lib/domain";
import { forecastCash, type CashFlow, type CashForecast } from "@/lib/finance/forecast";
import { weightedConfidence } from "@/lib/finance/impact";
import { STREAMS, streamForCategory, streamForFinding, type LeakStream, type StreamKey } from "@/lib/river/streams";

/*
 * Pure view builders: turn stored records into the shapes the UI renders. Convex queries call
 * these, so the same logic runs whether data comes from a live subscription or a server render.
 */

export interface FindingListItem {
  id: string;
  findingType: FindingType;
  title: string;
  summary: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  confidence: number;
  monthlyImpactCents: number;
  annualImpactCents: number;
  status: string;
  recoveryKind: string;
  recommendationStatus: RecommendationStatus | null;
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
  forecast: CashForecast | null;
}

export interface FindingRow {
  id: string;
  findingType: FindingType;
  title: string;
  summary: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  confidence: number;
  monthlyImpactCents: number;
  annualImpactCents: number;
  status: string;
  fingerprint: string;
  metadata: Record<string, unknown>;
}

export function toFindingListItem(f: FindingRow, rec: { status: RecommendationStatus; title: string } | null): FindingListItem {
  return {
    id: f.id,
    findingType: f.findingType,
    title: f.title,
    summary: f.summary,
    severity: f.severity,
    confidence: f.confidence,
    monthlyImpactCents: f.monthlyImpactCents,
    annualImpactCents: f.annualImpactCents,
    status: f.status,
    recoveryKind: String(f.metadata.recoveryKind ?? "recurring"),
    recommendationStatus: rec?.status ?? null,
    recommendationTitle: rec?.title ?? null,
    narrativeSource: (f.metadata.narrativeSource as string) ?? null,
    fingerprint: f.fingerprint,
    stream: streamForFinding(f.findingType, f.metadata),
  };
}

export interface OverviewInput {
  sales: { productId: string; soldAt: number; quantity: number; revenue: number; orderId: string }[];
  /** Sorted by effectiveDate ascending. */
  costs: { productId: string; effectiveDate: number; unitCostCents: number }[];
  debits: { date: number; amount: number; category: string | null }[];
}

export function businessOverview({ sales, costs, debits }: OverviewInput): { overview: DashboardData["overview"]; river: RiverData } {
  const costsByProduct = new Map<string, OverviewInput["costs"]>();
  for (const c of costs) costsByProduct.set(c.productId, [...(costsByProduct.get(c.productId) ?? []), c]);
  const costAt = (productId: string, at: number) => {
    const list = costsByProduct.get(productId) ?? [];
    let cost = list[0]?.unitCostCents ?? 0;
    for (const c of list) if (c.effectiveDate <= at) cost = c.unitCostCents;
    return cost;
  };
  const latest = sales.reduce((m, s) => Math.max(m, s.soldAt), 0);
  const DAY = 86_400_000;
  const end = latest ? new Date(new Date(latest).setUTCHours(23, 59, 59, 999)).getTime() : Date.now();
  const months: MonthlyOverview[] = [];
  for (let k = 5; k >= 0; k--) {
    const from = end - (k + 1) * 30 * DAY;
    const to = end - k * 30 * DAY;
    const bucket = sales.filter((s) => s.soldAt > from && s.soldAt <= to);
    const revenue = bucket.reduce((sum, s) => sum + s.revenue, 0);
    const cogs = bucket.reduce((sum, s) => sum + costAt(s.productId, s.soldAt) * s.quantity, 0);
    const labelDate = new Date(to);
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    months.push({
      label: `${MONTHS[labelDate.getUTCMonth()]} ${labelDate.getUTCDate()}`,
      revenueCents: revenue,
      grossProfitCents: revenue - cogs,
    });
  }
  const last = months[5];
  const prior = months[4];
  const orders30 = new Set(sales.filter((s) => s.soldAt > end - 30 * DAY).map((s) => s.orderId)).size;
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
  const inWindow = sales.filter((s) => s.soldAt > from && s.soldAt <= end);
  const revenue = inWindow.reduce((sum, s) => sum + s.revenue, 0);
  const totals = new Map<StreamKey, number>(STREAMS.map((s) => [s.key, 0]));
  totals.set("cogs", inWindow.reduce((sum, s) => sum + costAt(s.productId, s.soldAt) * s.quantity, 0));
  for (const t of debits) {
    const at = t.date;
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

export interface DashboardInput {
  organization: Organization;
  latest: {
    id: string;
    completedAt: number | null;
    totalRecoveryMonthlyCents: number;
    totalRecoveryAnnualCents: number;
    triggerType: string;
    metadata: Record<string, unknown>;
  } | null;
  activeInvestigationId: string | null;
  lastFailure: { id: string; message: string | null; startedAt: number } | null;
  findings: FindingListItem[];
  overview: OverviewInput;
  cash: { openingBalanceCents: number; flows: CashFlow[] };
}

/** Fixes that count toward the forecast: credible ones nobody rejected. */
export function forecastFixes(findings: FindingListItem[]) {
  return findings
    .filter((f) => f.status !== "NEEDS_REVIEW" && f.recommendationStatus !== "REJECTED")
    .map((f) => ({
      monthlyCents: f.recoveryKind === "one_time" ? 0 : f.monthlyImpactCents,
      oneTimeCents: f.recoveryKind === "one_time" ? f.annualImpactCents : 0,
      approved: f.recommendationStatus === "APPROVED" || f.recommendationStatus === "READY_FOR_EXECUTION",
    }));
}

export function buildDashboard(input: DashboardInput): DashboardData {
  const { organization, latest, findings } = input;
  const { overview, river } = businessOverview(input.overview);
  const meta = latest?.metadata ?? {};
  const credible = findings.filter((f) => f.status !== "NEEDS_REVIEW");
  const failure = input.lastFailure;
  const intel = (meta.externalIntel as Record<string, unknown> | null) ?? null;
  const ai = (meta.ai as Record<string, unknown> | null) ?? null;

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
          completedAt: latest.completedAt ? new Date(latest.completedAt).toISOString() : null,
          totalRecoveryMonthlyCents: latest.totalRecoveryMonthlyCents,
          totalRecoveryAnnualCents: latest.totalRecoveryAnnualCents,
          stats: (meta.stats as InvestigationStats | undefined) ?? null,
          externalIntelMode: (intel?.mode as string) ?? null,
          externalIntelSandbox: Boolean(intel?.sandbox),
          aiModel: (ai?.model as string) ?? null,
          modelExplanations: Number(ai?.modelExplanations ?? 0),
          warnings: (meta.warnings as string[]) ?? [],
          triggerType: latest.triggerType,
        }
      : null,
    activeInvestigationId: input.activeInvestigationId,
    lastFailure: failure && (!latest?.completedAt || failure.startedAt > latest.completedAt) ? { id: failure.id, message: failure.message } : null,
    findings,
    overallConfidence: weightedConfidence(credible.map((f) => ({ confidence: f.confidence, annualCents: f.annualImpactCents }))),
    overview,
    river,
    forecast: input.cash.flows.length ? forecastCash({ openingBalanceCents: input.cash.openingBalanceCents, flows: input.cash.flows, fixes: forecastFixes(findings) }) : null,
  };
}

export type { InvestigationStatus };
