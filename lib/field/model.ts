import type { FindingType, RecommendationStatus } from "@/lib/domain";
import { merchantKey } from "@/lib/finance/merchants";
import { format } from "@/lib/finance/money";
import { buildFixDraft, type FixDraft } from "@/lib/investigation/drafts";

/*
 * The field: every record in the books as one square, and for each finding the exact records it
 * rests on. The overview draws it; the Convex query and the offline preview both build it here.
 */

const DAY = 86_400_000;

export type RecordKind = "sale" | "in" | "out";

export interface FieldRecord {
  /** `tx:<id>` or `sale:<id>`, the same refs Ask cites. */
  id: string;
  kind: RecordKind;
  at: number;
  cents: number;
  /** Bank descriptor or product name. */
  label: string;
  /** Invoice or order reference. */
  ref: string | null;
  /** What the engine groups it by: the merchant key, or the product name for a sale. */
  group: string;
  /** Posted by the live feed. */
  live: boolean;
}

export interface FieldPrice {
  competitor: string;
  cents: number;
  mode: "live" | "fixture";
  sandbox: boolean;
  runId: string | null;
}

export interface FieldLeak {
  findingId: string;
  fingerprint: string;
  type: FindingType;
  title: string;
  /** Short name for what went wrong, e.g. "Paid twice". */
  kind: string;
  /** The vendor or product it concerns. */
  subject: string;
  annualCents: number;
  monthlyCents: number;
  oneTime: boolean;
  confidence: number;
  status: string;
  recommendationId: string | null;
  recommendationStatus: RecommendationStatus | null;
  recommendationTitle: string | null;
  fix: FixDraft | null;
  /** Records the finding rests on. */
  records: string[];
  /** The record its label points at. */
  anchor: string | null;
  /** A dated event that is not a record: a supplier unit cost change, before and after. */
  mark: { at: number; label: string; cents: [number, number] } | null;
  /** Competitor prices behind a pricing finding, and our own price. */
  prices: FieldPrice[];
  ownPriceCents: number | null;
  /** Up to three lines of evidence, most telling first. */
  evidence: string[];
  narrativeSource: string | null;
}

export interface FieldData {
  organizationName: string;
  start: number;
  asOf: number;
  records: FieldRecord[];
  counts: { sales: number; transactions: number; costs: number; prices: number };
  leaks: FieldLeak[];
  investigation: {
    id: string;
    completedAt: number | null;
    marketMode: string | null;
    sandbox: boolean;
    runId: string | null;
    model: string | null;
  } | null;
}

export interface FieldInput {
  organizationName: string;
  products: { id: string; sku: string; name: string; sellingPriceCents: number }[];
  sales: { id: string; productId: string; orderId: string; soldAt: number; grossRevenueCents: number }[];
  costs: { productId: string; effectiveDate: number; unitCostCents: number; supplierName: string }[];
  transactions: {
    id: string;
    transactionDate: number;
    merchantName: string;
    normalizedMerchantName: string;
    amountCents: number;
    transactionType: "DEBIT" | "CREDIT";
    invoiceReference: string | null;
    source: string;
  }[];
  investigation: { id: string; completedAt: number | null; metadata: Record<string, unknown> } | null;
  findings: {
    id: string;
    findingType: FindingType;
    fingerprint: string;
    title: string;
    confidence: number;
    monthlyImpactCents: number;
    annualImpactCents: number;
    status: string;
    metadata: Record<string, unknown>;
    evidence: { evidenceType: string; title: string; description: string; sourceReference: string | null; data: Record<string, unknown> }[];
    recommendation: { id: string; status: RecommendationStatus; title: string; metadata: Record<string, unknown> } | null;
  }[];
}

export const KIND: Record<FindingType, string> = {
  DUPLICATE_PAYMENT: "Paid twice",
  MARGIN_EROSION: "Margin slipping",
  PRICING_OPPORTUNITY: "Underpriced",
  SUBSCRIPTION_CREEP: "Price creep",
};

// Evidence that only repeats what the others say goes last.
const SECONDARY = new Set(["COMPETITOR_PRICE", "RETAIL_PRICE_HISTORY", "SALES_VELOCITY"]);

export function pickEvidence(evidence: { evidenceType: string; title: string; description: string }[]) {
  const ranked = [...evidence.filter((e) => !SECONDARY.has(e.evidenceType)), ...evidence.filter((e) => SECONDARY.has(e.evidenceType))];
  // A competitor price's description is a capture note; its title carries the price.
  return ranked.slice(0, 3).map((e) => (e.evidenceType === "COMPETITOR_PRICE" ? e.title : e.description).replace(/\.$/, ""));
}

const ids = (ref: string | null | undefined) =>
  ref
    ? ref
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

export function buildField(input: FieldInput): FieldData {
  const products = new Map(input.products.map((p) => [p.id, p]));
  const bySku = new Map(input.products.map((p) => [p.sku, p]));

  const records: FieldRecord[] = [
    ...input.sales.map((s): FieldRecord => ({
      id: `sale:${s.id}`,
      kind: "sale",
      at: s.soldAt,
      cents: s.grossRevenueCents,
      label: products.get(s.productId)?.name ?? "Order",
      ref: s.orderId,
      group: products.get(s.productId)?.name ?? s.productId,
      live: false,
    })),
    ...input.transactions.map((t): FieldRecord => ({
      id: `tx:${t.id}`,
      kind: t.transactionType === "CREDIT" ? "in" : "out",
      at: t.transactionDate,
      cents: t.amountCents,
      label: t.merchantName,
      ref: t.invoiceReference,
      group: merchantKey(t.normalizedMerchantName),
      live: t.source === "live_feed",
    })),
  ].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));

  const booked = records.filter((r) => !r.live);
  const start = booked.length ? booked[0].at : Date.now();
  const stats = (input.investigation?.metadata.stats ?? null) as { asOf?: string } | null;
  const lastSale = input.sales.reduce((m, s) => Math.max(m, s.soldAt), 0);
  const asOf = stats?.asOf ? Date.parse(stats.asOf) : lastSale ? new Date(lastSale).setUTCHours(23, 59, 59, 999) : Date.now();

  const salesOf = (productId: string | undefined, from: number) =>
    productId ? input.sales.filter((s) => s.productId === productId && s.soldAt > from && s.soldAt <= asOf).map((s) => `sale:${s.id}`) : [];

  const leaks = input.findings.map((f): FieldLeak => {
    const m = f.metadata;
    const ev = f.evidence;
    let records: string[] = [];
    let anchor: string | null = null;
    let mark: FieldLeak["mark"] = null;
    let ownPriceCents: number | null = null;
    const product = typeof m.sku === "string" ? bySku.get(m.sku) : undefined;

    if (f.findingType === "DUPLICATE_PAYMENT") {
      records = ((m.transactionIds as string[] | undefined) ?? ids(ev.find((e) => e.evidenceType === "DUPLICATE_PAIR")?.sourceReference)).map((id) => `tx:${id}`);
      anchor = records.at(-1) ?? null;
    } else if (f.findingType === "SUBSCRIPTION_CREEP") {
      const series = ev.filter((e) => e.evidenceType === "RECURRING_CHARGE_SERIES" || e.evidenceType === "PARALLEL_SUBSCRIPTION").flatMap((e) => ids(e.sourceReference));
      records = [...new Set(series)].map((id) => `tx:${id}`);
      const inSeries = new Set(series);
      const charges = input.transactions.filter((t) => inSeries.has(t.id)).sort((a, b) => a.transactionDate - b.transactionDate);
      // Point at the first charge above the original price.
      const raised = charges.find((t) => t.amountCents > charges[0].amountCents);
      anchor = raised ? `tx:${raised.id}` : (records.at(-1) ?? null);
    } else if (f.findingType === "MARGIN_EROSION" || f.findingType === "PRICING_OPPORTUNITY") {
      if (f.findingType === "MARGIN_EROSION") {
        const change = ev.find((e) => e.evidenceType === "SUPPLIER_COST_CHANGE")?.data;
        const at = typeof change?.effectiveDate === "string" ? Date.parse(`${change.effectiveDate}T00:00:00Z`) : null;
        if (at && change) {
          const cents: [number, number] = [Number(change.previousUnitCostCents), Number(change.latestUnitCostCents)];
          mark = { at, label: `Unit cost ${format(cents[0])} → ${format(cents[1])}`, cents };
        }
      }
      // Margin: every sale since the unit cost rose. Pricing: the trailing 90 days the upside is
      // computed from.
      records = salesOf(product?.id, mark ? mark.at - 1 : asOf - 90 * DAY);
      anchor = records.at(-1) ?? null;
      ownPriceCents = product?.sellingPriceCents ?? null;
    }

    const prices: FieldPrice[] = ev
      .filter((e) => e.evidenceType === "COMPETITOR_PRICE")
      .map((e) => ({
        competitor: String(e.data.competitorName ?? ""),
        cents: Number(e.data.priceCents ?? 0),
        mode: e.data.captureMode === "live" ? "live" : "fixture",
        sandbox: Boolean(e.data.sandbox),
        runId: (e.data.apifyRunId as string | null) ?? null,
      }));

    const rec = f.recommendation;
    return {
      findingId: f.id,
      fingerprint: f.fingerprint,
      type: f.findingType,
      title: f.title,
      kind: KIND[f.findingType],
      subject: String(m.vendor ?? m.productName ?? product?.name ?? ""),
      annualCents: f.annualImpactCents,
      monthlyCents: f.monthlyImpactCents,
      oneTime: m.recoveryKind === "one_time",
      confidence: f.confidence,
      status: f.status,
      recommendationId: rec?.id ?? null,
      recommendationStatus: rec?.status ?? null,
      recommendationTitle: rec?.title ?? null,
      fix: rec ? buildFixDraft(f.findingType, m, rec.metadata, input.organizationName) : null,
      records,
      anchor,
      mark,
      prices,
      ownPriceCents,
      evidence: pickEvidence(ev),
      narrativeSource: (m.narrativeSource as string | undefined) ?? null,
    };
  });

  const meta = input.investigation?.metadata ?? {};
  const intel = (meta.externalIntel ?? null) as Record<string, unknown> | null;
  const ai = (meta.ai ?? null) as Record<string, unknown> | null;

  return {
    organizationName: input.organizationName,
    start,
    asOf,
    records,
    counts: {
      sales: input.sales.length,
      transactions: input.transactions.filter((t) => t.source !== "live_feed").length,
      costs: input.costs.length,
      prices: Number(intel?.observations ?? leaks.reduce((n, l) => n + l.prices.length, 0)),
    },
    leaks: leaks.sort((a, b) => b.annualCents - a.annualCents),
    investigation: input.investigation
      ? {
          id: input.investigation.id,
          completedAt: input.investigation.completedAt,
          marketMode: (intel?.mode as string | undefined) ?? null,
          sandbox: Boolean(intel?.sandbox),
          runId: (intel?.runId as string | undefined) ?? null,
          model: Number(ai?.modelExplanations ?? 0) > 0 ? ((ai?.model as string | undefined) ?? null) : null,
        }
      : null,
  };
}

/** Whether a finding still needs a decision. */
export const isOpen = (l: FieldLeak) => l.recommendationStatus === "PROPOSED" && l.status !== "NEEDS_REVIEW";
export const isFixed = (l: FieldLeak) => l.recommendationStatus === "APPROVED" || l.recommendationStatus === "READY_FOR_EXECUTION";
export const isCredible = (l: FieldLeak) => l.status !== "NEEDS_REVIEW" && l.status !== "DISMISSED" && l.recommendationStatus !== "REJECTED";
