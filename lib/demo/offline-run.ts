import type { InvestigationStatus, Organization } from "@/lib/domain";
import { executeInvestigation } from "@/lib/investigation/engine";
import type { RawLedger } from "@/lib/investigation/ledger";
import type { FindingBundle, InvestigationPatch, InvestigationStore } from "@/lib/investigation/store";
import { generateDemoData, type DemoData } from "./seed";

/** Converts generated demo records into the stored-ledger shape, using SKUs and slugs as ids. */
export function demoLedger(data: DemoData): RawLedger {
  const organization: Organization = { id: "demo", slug: data.organization.slug, name: data.organization.name, industry: data.organization.industry, currency: data.organization.currency, demoMode: true };
  const competitorName = new Map(data.competitors.map((c) => [c.slug, c.name]));
  return {
    organization,
    products: data.products.map((p) => ({ id: p.sku, sku: p.sku, name: p.name, sellingPriceCents: p.sellingPriceCents, active: p.active })),
    sales: data.sales.map((s) => ({ productId: s.sku, soldAt: s.soldAt, quantity: s.quantity, unitPriceCents: s.unitPriceCents, grossRevenueCents: s.grossRevenueCents })),
    supplierCosts: data.supplierCosts.map((c) => ({ productId: c.sku, supplierName: c.supplierName, effectiveDate: c.effectiveDate, unitCostCents: c.unitCostCents, source: c.source })),
    transactions: data.transactions.map((t, i) => ({
      id: `tx-${i}`,
      transactionDate: t.transactionDate,
      merchantName: t.merchantName,
      normalizedMerchantName: t.normalizedMerchantName,
      amountCents: t.amountCents,
      transactionType: t.transactionType,
      category: t.category,
      invoiceReference: t.invoiceReference,
    })),
    listings: data.listings.map((l, i) => ({
      competitorProductId: `listing-${i}`,
      productId: l.sku,
      competitorId: l.competitorSlug,
      competitorName: competitorName.get(l.competitorSlug) ?? "",
      url: l.productUrl,
      externalName: l.externalName,
    })),
  };
}

/**
 * Runs the real investigation engine over the demo books entirely in memory (fixture market
 * data, rules-based narratives). The landing page uses it at build time so every figure it
 * shows is computed, never typed in.
 */
export interface OfflineRun {
  data: DemoData;
  ledger: RawLedger;
  /** Credible findings only. */
  findings: FindingBundle[];
  investigation: InvestigationPatch & { startedAt: number };
  events: { seq: number; eventType: string; message: string; createdAt: number; metadata: Record<string, unknown> }[];
  audit: { action: string; actorType: string; entityType: string; entityId: string | null; createdAt: number; metadata: Record<string, unknown> }[];
}

export async function runDemoOffline(anchorDate: Date): Promise<OfflineRun> {
  const data = generateDemoData({ anchorDate });
  const ledger = demoLedger(data);
  const findings: FindingBundle[] = [];
  let status: InvestigationStatus = "CREATED";
  const startedAt = anchorDate.getTime();
  let clock = startedAt;
  const tick = () => (clock += 410);
  const investigation: OfflineRun["investigation"] = { startedAt };
  const events: OfflineRun["events"] = [];
  const audit: OfflineRun["audit"] = [];
  const store: InvestigationStore = {
    getInvestigation: async (id) => ({ id, organizationId: "demo", status }),
    patchInvestigation: async (_id, patch) => {
      if (patch.status) status = patch.status;
      Object.assign(investigation, patch);
    },
    emitEvent: async (_id, eventType, message, metadata) => {
      events.push({ seq: events.length + 1, eventType, message, createdAt: tick(), metadata });
    },
    loadLedger: async () => ledger,
    savePriceObservations: async () => undefined,
    saveFinding: async (bundle) => {
      findings.push(bundle);
    },
    audit: async (entry) => {
      audit.push({ ...entry, metadata: entry.metadata ?? {}, createdAt: tick() });
    },
  };
  await executeInvestigation(store, "offline", { stepDelayMs: 0, provider: null, externalIntelMode: "fixture" });
  investigation.completedAt = clock;
  return { data, ledger, findings: findings.filter((f) => f.credible), investigation, events, audit };
}
