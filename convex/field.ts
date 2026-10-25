import { buildField, type FieldData } from "../lib/field/model";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { currentOrganization } from "./model";

/**
 * Every record in the books, and which records each finding of the latest investigation rests
 * on. Reactive: a payment posted by the live feed or a fix approved re-renders the overview.
 */
export const get = query({
  args: {},
  handler: async (ctx): Promise<FieldData | null> => {
    const org = await currentOrganization(ctx);
    if (!org) return null;
    const completed = await ctx.db
      .query("investigations")
      .withIndex("by_org_status", (q) => q.eq("organizationId", org._id).eq("status", "COMPLETED"))
      .collect()
      .then((rows) => rows.filter((inv) => inv.marketProfile !== "retail"));
    const latest = completed.reduce<Doc<"investigations"> | null>((best, inv) => (!best || (inv.completedAt ?? 0) > (best.completedAt ?? 0) ? inv : best), null);

    const [products, sales, costs, transactions] = await Promise.all([
      ctx.db
        .query("products")
        .withIndex("by_org", (q) => q.eq("organizationId", org._id))
        .collect(),
      ctx.db
        .query("sales")
        .withIndex("by_org", (q) => q.eq("organizationId", org._id))
        .collect(),
      ctx.db
        .query("supplierCosts")
        .withIndex("by_org", (q) => q.eq("organizationId", org._id))
        .collect(),
      ctx.db
        .query("transactions")
        .withIndex("by_org", (q) => q.eq("organizationId", org._id))
        .collect(),
    ]);
    const rows = latest
      ? await ctx.db
          .query("findings")
          .withIndex("by_investigation", (q) => q.eq("investigationId", latest._id))
          .collect()
      : [];
    const findings = await Promise.all(
      rows.map(async (f) => {
        const evidence = (await Promise.all(f.evidenceIds.map((id) => ctx.db.get(id)))).filter((e): e is Doc<"evidence"> => e !== null);
        const rec = await ctx.db
          .query("recommendations")
          .withIndex("by_finding", (q) => q.eq("findingId", f._id))
          .first();
        return {
          id: f._id as string,
          findingType: f.findingType,
          fingerprint: f.fingerprint,
          title: f.title,
          confidence: f.confidence,
          monthlyImpactCents: f.monthlyImpactCents,
          annualImpactCents: f.annualImpactCents,
          status: f.status,
          metadata: f.metadata ?? {},
          evidence: evidence.map((e) => ({ evidenceType: e.evidenceType, title: e.title, description: e.description, sourceReference: e.sourceReference, data: e.data ?? {} })),
          recommendation: rec ? { id: rec._id as string, status: rec.status, title: rec.title, metadata: rec.metadata ?? {} } : null,
        };
      }),
    );

    return buildField({
      organizationName: org.name,
      products: products.map((p) => ({ id: p._id, sku: p.sku, name: p.name, sellingPriceCents: p.sellingPriceCents })),
      sales: sales.map((s) => ({ id: s._id, productId: s.productId, orderId: s.orderId, soldAt: s.soldAt, grossRevenueCents: s.grossRevenueCents })),
      costs: costs.map((c) => ({ productId: c.productId, effectiveDate: c.effectiveDate, unitCostCents: c.unitCostCents, supplierName: c.supplierName })),
      transactions: transactions.map((t) => ({
        id: t._id,
        transactionDate: t.transactionDate,
        merchantName: t.merchantName,
        normalizedMerchantName: t.normalizedMerchantName,
        amountCents: t.amountCents,
        transactionType: t.transactionType,
        invoiceReference: t.invoiceReference,
        source: t.source,
      })),
      investigation: latest ? { id: latest._id, completedAt: latest.completedAt, metadata: latest.metadata ?? {} } : null,
      findings,
    });
  },
});
