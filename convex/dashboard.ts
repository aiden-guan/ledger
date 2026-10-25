import { merchantKey } from "../lib/finance/merchants";
import { buildDashboard, toFindingListItem, type DashboardData } from "../lib/views/dashboard";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { currentOrganization, toOrganization } from "./model";

const ACTIVE = [
  "CREATED",
  "INGESTING",
  "ANALYZING_INTERNAL_DATA",
  "GENERATING_HYPOTHESES",
  "GATHERING_EXTERNAL_EVIDENCE",
  "VALIDATING_FINDINGS",
  "CALCULATING_IMPACT",
  "GENERATING_RECOMMENDATIONS",
] as const;

/** Everything the overview page shows. Reactive: approving a fix re-renders every open tab. */
export const get = query({
  args: {},
  handler: async (ctx): Promise<DashboardData | null> => {
    const org = await currentOrganization(ctx);
    if (!org) return null;
    const byStatus = (status: Doc<"investigations">["status"]) =>
      ctx.db
        .query("investigations")
        .withIndex("by_org_status", (q) => q.eq("organizationId", org._id).eq("status", status))
        .collect()
        // The market page's retail checks have their own view; the overview shows full investigations.
        .then((rows) => rows.filter((inv) => inv.marketProfile !== "retail"));

    const completed = await byStatus("COMPLETED");
    const latest = completed.reduce<Doc<"investigations"> | null>((best, inv) => (!best || (inv.completedAt ?? 0) > (best.completedAt ?? 0) ? inv : best), null);
    let activeInvestigationId: string | null = null;
    for (const status of ACTIVE) {
      const running = await byStatus(status);
      if (running.length) {
        activeInvestigationId = running[0]._id;
        break;
      }
    }
    const failed = (await byStatus("FAILED")).reduce<Doc<"investigations"> | null>((best, inv) => (!best || inv.startedAt > best.startedAt ? inv : best), null);

    const findings = latest
      ? await Promise.all(
          (
            await ctx.db
              .query("findings")
              .withIndex("by_investigation", (q) => q.eq("investigationId", latest._id))
              .order("desc")
              .collect()
          ).map(async (f) => {
            const rec = await ctx.db
              .query("recommendations")
              .withIndex("by_finding", (q) => q.eq("findingId", f._id))
              .first();
            return toFindingListItem({ ...f, id: f._id, metadata: f.metadata ?? {} }, rec);
          }),
        )
      : [];

    const [sales, costs, transactions] = await Promise.all([
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

    return buildDashboard({
      organization: toOrganization(org),
      latest: latest
        ? {
            id: latest._id,
            completedAt: latest.completedAt,
            totalRecoveryMonthlyCents: latest.totalRecoveryMonthlyCents,
            totalRecoveryAnnualCents: latest.totalRecoveryAnnualCents,
            triggerType: latest.triggerType,
            metadata: latest.metadata ?? {},
          }
        : null,
      activeInvestigationId,
      lastFailure: failed ? { id: failed._id, message: failed.errorMessage, startedAt: failed.startedAt } : null,
      findings,
      overview: {
        sales: sales.map((s) => ({ productId: s.productId, soldAt: s.soldAt, quantity: s.quantity, revenue: s.grossRevenueCents, orderId: s.orderId })),
        costs: costs.map((c) => ({ productId: c.productId, effectiveDate: c.effectiveDate, unitCostCents: c.unitCostCents })),
        debits: transactions.filter((t) => t.transactionType === "DEBIT").map((t) => ({ date: t.transactionDate, amount: t.amountCents, category: t.category })),
      },
      cash: {
        openingBalanceCents: org.openingBalanceCents ?? 0,
        flows: transactions.map((t) => ({
          at: t.transactionDate,
          amountCents: t.transactionType === "CREDIT" ? t.amountCents : -t.amountCents,
          category: t.category,
          merchantKey: merchantKey(t.normalizedMerchantName),
          merchantName: t.merchantName,
        })),
      },
    });
  },
});

/** The current organization, or null before the demo company is seeded. */
export const organization = query({
  args: {},
  handler: async (ctx) => {
    const org = await currentOrganization(ctx);
    return org ? toOrganization(org) : null;
  },
});
