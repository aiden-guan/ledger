import { v } from "convex/values";
import { toStorable } from "../lib/domain";
import type { RawLedger } from "../lib/investigation/ledger";
import { resolveCarryForward, type PriorDecision } from "../lib/investigation/store";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { appendEvent, toOrganization } from "./model";

/*
 * Internal reads and writes used by the investigation engine (convex/engine.ts) and the demo
 * reset. None of these are reachable from the browser.
 */

const investigationPatch = v.object({
  status: v.optional(v.string()),
  totalRecoveryMonthlyCents: v.optional(v.number()),
  totalRecoveryAnnualCents: v.optional(v.number()),
  completedAt: v.optional(v.union(v.number(), v.null())),
  errorMessage: v.optional(v.union(v.string(), v.null())),
  metadata: v.optional(v.any()),
});

export const getInvestigation = internalQuery({
  args: { id: v.id("investigations") },
  handler: async (ctx, { id }) => {
    const inv = await ctx.db.get(id);
    return inv ? { id: inv._id, organizationId: inv.organizationId, status: inv.status } : null;
  },
});

export const patchInvestigation = internalMutation({
  args: { id: v.id("investigations"), patch: investigationPatch },
  handler: async (ctx, { id, patch }) => {
    await ctx.db.patch(id, toStorable(patch) as Partial<Doc<"investigations">>);
  },
});

export const emitEvent = internalMutation({
  args: { investigationId: v.id("investigations"), eventType: v.string(), message: v.string(), metadata: v.any() },
  handler: async (ctx, { investigationId, eventType, message, metadata }) => {
    await appendEvent(ctx, investigationId, eventType, message, toStorable(metadata ?? {}));
  },
});

export const loadLedger = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }): Promise<RawLedger> => {
    const org = await ctx.db.get(organizationId);
    if (!org) throw new Error(`Organization ${organizationId} not found`);
    const [products, sales, costs, transactions, competitors, listings] = await Promise.all([
      ctx.db.query("products").withIndex("by_org", (q) => q.eq("organizationId", organizationId)).collect(),
      ctx.db.query("sales").withIndex("by_org", (q) => q.eq("organizationId", organizationId)).collect(),
      ctx.db.query("supplierCosts").withIndex("by_org", (q) => q.eq("organizationId", organizationId)).collect(),
      ctx.db.query("transactions").withIndex("by_org", (q) => q.eq("organizationId", organizationId)).collect(),
      ctx.db.query("competitors").withIndex("by_org", (q) => q.eq("organizationId", organizationId)).collect(),
      ctx.db.query("competitorProducts").withIndex("by_org", (q) => q.eq("organizationId", organizationId)).collect(),
    ]);
    const competitorName = new Map(competitors.map((c) => [c._id as string, c.name]));
    return {
      organization: toOrganization(org),
      products: products.map((p) => ({ id: p._id, sku: p.sku, name: p.name, sellingPriceCents: p.sellingPriceCents, active: p.active })),
      sales: sales.map((s) => ({ productId: s.productId, soldAt: s.soldAt, quantity: s.quantity, unitPriceCents: s.unitPriceCents, grossRevenueCents: s.grossRevenueCents })),
      supplierCosts: costs.map((c) => ({ productId: c.productId, supplierName: c.supplierName, effectiveDate: c.effectiveDate, unitCostCents: c.unitCostCents, source: c.source })),
      transactions: transactions.map((t) => ({
        id: t._id,
        transactionDate: t.transactionDate,
        merchantName: t.merchantName,
        normalizedMerchantName: t.normalizedMerchantName,
        amountCents: t.amountCents,
        transactionType: t.transactionType,
        category: t.category,
        invoiceReference: t.invoiceReference,
      })),
      listings: listings.map((l) => ({
        competitorProductId: l._id,
        productId: l.productId,
        competitorId: l.competitorId,
        competitorName: competitorName.get(l.competitorId) ?? "",
        url: l.productUrl,
        externalName: l.externalName,
      })),
    };
  },
});

export const savePriceObservations = internalMutation({
  args: { rows: v.array(v.any()) },
  handler: async (ctx, { rows }) => {
    for (const row of rows) {
      const r = toStorable(row) as Doc<"externalPriceObservations">;
      await ctx.db.insert("externalPriceObservations", {
        organizationId: r.organizationId,
        investigationId: r.investigationId,
        productId: r.productId,
        competitorId: r.competitorId,
        priceCents: r.priceCents,
        currency: r.currency,
        availability: r.availability ?? null,
        externalName: r.externalName ?? null,
        productUrl: r.productUrl,
        sourceUrl: r.sourceUrl,
        capturedAt: r.capturedAt,
        captureMode: r.captureMode,
        apifyRunId: r.apifyRunId ?? null,
        rawPayload: r.rawPayload ?? {},
      });
    }
  },
});

/** The latest decision on the same issue (fingerprint) from an earlier investigation. */
async function findPriorDecision(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  fingerprint: string,
  excludeInvestigationId: Id<"investigations">,
): Promise<PriorDecision | null> {
  const earlier = await ctx.db
    .query("findings")
    .withIndex("by_org_fingerprint", (q) => q.eq("organizationId", organizationId).eq("fingerprint", fingerprint))
    .collect();
  let best: Doc<"recommendations"> | null = null;
  for (const f of earlier) {
    if (f.investigationId === excludeInvestigationId) continue;
    const rec = await ctx.db
      .query("recommendations")
      .withIndex("by_finding", (q) => q.eq("findingId", f._id))
      .first();
    if (!rec || rec.status === "PROPOSED") continue;
    const at = rec.decidedAt ?? rec._creationTime;
    if (!best || at > (best.decidedAt ?? best._creationTime)) best = rec;
  }
  return best ? { status: best.status, approvedAt: best.approvedAt, rejectedAt: best.rejectedAt, metadata: best.metadata ?? {} } : null;
}

/** Saves evidence, the finding and its recommendation in one transaction. */
export const saveFinding = internalMutation({
  args: { bundle: v.any() },
  handler: async (ctx, { bundle: raw }) => {
    const bundle = toStorable(raw) as import("../lib/investigation/store").FindingBundle;
    const investigationId = bundle.investigationId as Id<"investigations">;
    const organizationId = bundle.organizationId as Id<"organizations">;

    const evidenceIds: Id<"evidence">[] = [];
    for (const e of bundle.evidence) {
      evidenceIds.push(
        await ctx.db.insert("evidence", {
          investigationId,
          evidenceType: e.evidenceType,
          title: e.title,
          description: e.description,
          sourceType: e.sourceType,
          sourceReference: e.sourceReference ?? null,
          data: e.data,
          confidence: e.confidence,
        }),
      );
    }

    const prior = await findPriorDecision(ctx, organizationId, bundle.finding.fingerprint, investigationId);
    const carry = resolveCarryForward(bundle.credible, prior);
    const findingId = await ctx.db.insert("findings", {
      ...bundle.finding,
      investigationId,
      organizationId,
      status: carry.findingStatus,
      evidenceIds,
    });
    await ctx.db.insert("recommendations", {
      ...bundle.recommendation,
      findingId,
      organizationId,
      metadata: { ...bundle.recommendation.metadata, ...carry.carriedMetadata },
      status: carry.recommendationStatus,
      approvedAt: carry.approvedAt,
      rejectedAt: carry.rejectedAt,
      decidedAt: prior ? (carry.approvedAt ?? carry.rejectedAt) : null,
    });
  },
});

export const audit = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    actorType: v.union(v.literal("USER"), v.literal("SYSTEM"), v.literal("AGENT")),
    action: v.string(),
    entityType: v.string(),
    entityId: v.union(v.string(), v.null()),
    metadata: v.any(),
  },
  handler: async (ctx, entry) => {
    await ctx.db.insert("auditLog", { ...entry, metadata: toStorable(entry.metadata ?? {}) });
  },
});

// ---- Demo data -------------------------------------------------------------

export const findOrganizationBySlug = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    return org?._id ?? null;
  },
});

const ORG_TABLES = ["sales", "transactions", "supplierCosts", "competitorProducts", "externalPriceObservations", "products", "competitors", "auditLog"] as const;

/**
 * Deletes up to `budget` documents belonging to an organization. Called repeatedly by the demo
 * reset until it reports done, so no single transaction grows too large.
 */
export const purgeOrganizationBatch = internalMutation({
  args: { slug: v.string(), budget: v.optional(v.number()) },
  handler: async (ctx, { slug, budget: max }) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!org) return { done: true, deleted: 0 };
    let budget = max ?? 2000;
    let deleted = 0;
    const remove = async (id: Id<TableNames>) => {
      await ctx.db.delete(id);
      budget -= 1;
      deleted += 1;
    };

    const investigations = await ctx.db
      .query("investigations")
      .withIndex("by_org", (q) => q.eq("organizationId", org._id))
      .take(50);
    for (const inv of investigations) {
      if (budget <= 0) break;
      const events = await ctx.db
        .query("investigationEvents")
        .withIndex("by_investigation", (q) => q.eq("investigationId", inv._id))
        .take(budget);
      for (const e of events) await remove(e._id);
      const evidence = await ctx.db
        .query("evidence")
        .withIndex("by_investigation", (q) => q.eq("investigationId", inv._id))
        .take(Math.max(0, budget));
      for (const e of evidence) await remove(e._id);
      const findings = await ctx.db
        .query("findings")
        .withIndex("by_investigation", (q) => q.eq("investigationId", inv._id))
        .take(Math.max(0, budget));
      for (const f of findings) {
        const recs = await ctx.db
          .query("recommendations")
          .withIndex("by_finding", (q) => q.eq("findingId", f._id))
          .collect();
        for (const r of recs) await remove(r._id);
        await remove(f._id);
      }
      if (budget > 0) await remove(inv._id);
    }
    if (budget > 0 && investigations.length < 50) {
      for (const table of ORG_TABLES) {
        if (budget <= 0) break;
        const rows = await ctx.db
          .query(table)
          .withIndex("by_org", (q) => q.eq("organizationId", org._id))
          .take(budget);
        for (const row of rows) await remove(row._id);
      }
    }
    if (budget > 0) {
      await ctx.db.delete(org._id);
      return { done: true, deleted: deleted + 1 };
    }
    return { done: false, deleted };
  },
});

/** Creates the demo organization with its products, competitors, listings and cost history. */
export const insertDemoCatalog = internalMutation({
  args: { data: v.any() },
  handler: async (ctx, { data: raw }) => {
    const data = raw as import("../lib/demo/seed").DemoData;
    const organizationId = await ctx.db.insert("organizations", { ...data.organization });
    const productIds: Record<string, Id<"products">> = {};
    for (const p of data.products) productIds[p.sku] = await ctx.db.insert("products", { ...p, organizationId });
    const competitorIds: Record<string, Id<"competitors">> = {};
    for (const c of data.competitors) competitorIds[c.slug] = await ctx.db.insert("competitors", { organizationId, name: c.name, domain: c.domain });
    for (const l of data.listings) {
      await ctx.db.insert("competitorProducts", {
        organizationId,
        productId: productIds[l.sku],
        competitorId: competitorIds[l.competitorSlug],
        productUrl: l.productUrl,
        externalName: l.externalName,
      });
    }
    for (const c of data.supplierCosts) {
      await ctx.db.insert("supplierCosts", {
        organizationId,
        productId: productIds[c.sku],
        supplierName: c.supplierName,
        effectiveDate: c.effectiveDate,
        unitCostCents: c.unitCostCents,
        source: c.source,
      });
    }
    return { organizationId, productIds };
  },
});

export const insertDemoSales = internalMutation({
  args: { organizationId: v.id("organizations"), productIds: v.record(v.string(), v.id("products")), rows: v.array(v.any()) },
  handler: async (ctx, { organizationId, productIds, rows }) => {
    for (const s of rows as import("../lib/demo/seed").DemoData["sales"]) {
      await ctx.db.insert("sales", {
        organizationId,
        productId: productIds[s.sku],
        orderId: s.orderId,
        soldAt: s.soldAt,
        quantity: s.quantity,
        unitPriceCents: s.unitPriceCents,
        grossRevenueCents: s.grossRevenueCents,
      });
    }
  },
});

export const insertDemoTransactions = internalMutation({
  args: { organizationId: v.id("organizations"), rows: v.array(v.any()) },
  handler: async (ctx, { organizationId, rows }) => {
    for (const t of rows as import("../lib/demo/seed").DemoData["transactions"]) {
      await ctx.db.insert("transactions", { ...t, organizationId, metadata: toStorable(t.metadata ?? {}) });
    }
  },
});

/** Creates an investigation record, or returns the one already running for this organization. */
export const createInvestigation = internalMutation({
  args: { organizationId: v.id("organizations"), triggerType: v.union(v.literal("MANUAL"), v.literal("SCHEDULED"), v.literal("DEMO_SEED")) },
  handler: async (ctx, args) => createInvestigationRecord(ctx, args.organizationId, args.triggerType),
});

export async function createInvestigationRecord(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  triggerType: Doc<"investigations">["triggerType"],
  staleAfterMs = 10 * 60 * 1000,
): Promise<{ id: Id<"investigations">; alreadyRunning: boolean }> {
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
  const now = Date.now();
  for (const status of ACTIVE) {
    const running = await ctx.db
      .query("investigations")
      .withIndex("by_org_status", (q) => q.eq("organizationId", organizationId).eq("status", status))
      .collect();
    for (const inv of running) {
      // Investigations abandoned mid-run (e.g. a crashed action) are marked failed.
      if (inv.startedAt < now - staleAfterMs) {
        await ctx.db.patch(inv._id, { status: "FAILED", errorMessage: "Investigation stopped responding and was abandoned.", completedAt: now });
        continue;
      }
      return { id: inv._id, alreadyRunning: true };
    }
  }
  const id = await ctx.db.insert("investigations", {
    organizationId,
    status: "CREATED",
    triggerType,
    startedAt: now,
    completedAt: null,
    totalRecoveryMonthlyCents: 0,
    totalRecoveryAnnualCents: 0,
    errorMessage: null,
    metadata: {},
  });
  await appendEvent(ctx, id, "STATE_CHANGED", "CREATED", { state: "CREATED" });
  await ctx.db.insert("auditLog", {
    organizationId,
    actorType: triggerType === "MANUAL" ? "USER" : "SYSTEM",
    action: "investigation.started",
    entityType: "investigation",
    entityId: id,
    metadata: { triggerType },
  });
  return { id, alreadyRunning: false };
}
