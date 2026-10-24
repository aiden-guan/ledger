import { v } from "convex/values";
import type { BooksContext } from "../lib/ask/tools";
import { forecastCash } from "../lib/finance/forecast";
import { merchantKey } from "../lib/finance/merchants";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { apiError, currentOrganization } from "./model";

/*
 * Ask your books. A question is stored, then answered by an agent action (convex/agent.ts) that
 * writes each tool call back here as it happens, so the browser watches the answer being built.
 */

const DAY = 86_400_000;

export const ask = mutation({
  args: { question: v.string() },
  handler: async (ctx, { question }) => {
    const q = question.trim().replace(/\s+/g, " ");
    if (q.length < 3 || q.length > 300) throw apiError("INVALID_INPUT", "Ask in 3 to 300 characters");
    const org = await currentOrganization(ctx);
    if (!org) throw apiError("NOT_FOUND", "Load the demo company first");
    const recent = await ctx.db
      .query("asks")
      .withIndex("by_org", (x) => x.eq("organizationId", org._id))
      .order("desc")
      .take(10);
    if (recent.filter((a) => a.status === "thinking" && a._creationTime > Date.now() - 2 * 60_000).length >= 2) {
      throw apiError("CONFLICT", "Two questions are already being answered");
    }
    const id = await ctx.db.insert("asks", { organizationId: org._id, question: q, status: "thinking", steps: [], answer: null, citations: [], figures: null, model: null, error: null });
    await ctx.scheduler.runAfter(0, internal.agent.answer, { askId: id });
    return id;
  },
});

export const recent = query({
  args: {},
  handler: async (ctx) => {
    const org = await currentOrganization(ctx);
    if (!org) return [];
    const rows = await ctx.db
      .query("asks")
      .withIndex("by_org", (x) => x.eq("organizationId", org._id))
      .order("desc")
      .take(4);
    return rows.map((a) => ({ id: a._id as string, question: a.question, status: a.status, steps: a.steps, answer: a.answer, citations: a.citations, figures: a.figures, model: a.model, error: a.error, at: a._creationTime }));
  },
});

export const get = internalQuery({
  args: { id: v.id("asks") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const step = internalMutation({
  args: { id: v.id("asks"), tool: v.string(), summary: v.string() },
  handler: async (ctx, { id, tool, summary }) => {
    const a = await ctx.db.get(id);
    if (a) await ctx.db.patch(id, { steps: [...a.steps, { tool, summary }] });
  },
});

export const finish = internalMutation({
  args: {
    id: v.id("asks"),
    status: v.union(v.literal("done"), v.literal("failed")),
    answer: v.union(v.string(), v.null()),
    citations: v.array(v.object({ ref: v.string(), label: v.string(), href: v.union(v.string(), v.null()) })),
    figures: v.union(v.null(), v.object({ total: v.number(), traced: v.number() })),
    model: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { id, ...rest }) => {
    const a = await ctx.db.get(id);
    if (!a) return;
    await ctx.db.patch(id, rest);
    await ctx.db.insert("auditLog", {
      organizationId: a.organizationId,
      actorType: "AGENT",
      action: rest.status === "done" ? "ask.answered" : "ask.failed",
      entityType: "ask",
      entityId: id,
      metadata: { question: a.question, tools: a.steps.map((s) => s.tool), citations: rest.citations.length, figures: rest.figures, model: rest.model, error: rest.error },
    });
  },
});

async function latestFindings(ctx: QueryCtx, organizationId: Id<"organizations">) {
  const completed = await ctx.db
    .query("investigations")
    .withIndex("by_org_status", (q) => q.eq("organizationId", organizationId).eq("status", "COMPLETED"))
    .collect();
  const latest = completed.reduce<Doc<"investigations"> | null>((best, inv) => (!best || (inv.completedAt ?? 0) > (best.completedAt ?? 0) ? inv : best), null);
  if (!latest) return [];
  const findings = await ctx.db
    .query("findings")
    .withIndex("by_investigation", (q) => q.eq("investigationId", latest._id))
    .order("desc")
    .collect();
  return Promise.all(
    findings
      .filter((f) => f.status !== "NEEDS_REVIEW")
      .map(async (f) => ({
        finding: f,
        rec: await ctx.db
          .query("recommendations")
          .withIndex("by_finding", (q) => q.eq("findingId", f._id))
          .first(),
      })),
  );
}

/** The organization's books in the shape the agent's tools read. */
export const books = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }): Promise<BooksContext> => {
    const org = await ctx.db.get(organizationId);
    if (!org) throw new Error("Organization not found");
    const [transactions, products, sales, costs, observations, findings, screenings] = await Promise.all([
      ctx.db.query("transactions").withIndex("by_org", (q) => q.eq("organizationId", organizationId)).collect(),
      ctx.db.query("products").withIndex("by_org", (q) => q.eq("organizationId", organizationId)).collect(),
      ctx.db.query("sales").withIndex("by_org", (q) => q.eq("organizationId", organizationId)).collect(),
      ctx.db.query("supplierCosts").withIndex("by_org", (q) => q.eq("organizationId", organizationId)).collect(),
      ctx.db.query("externalPriceObservations").withIndex("by_org", (q) => q.eq("organizationId", organizationId)).collect(),
      latestFindings(ctx, organizationId),
      ctx.db
        .query("screenings")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .order("desc")
        .take(50),
    ]);

    const lastSale = sales.reduce((m, s) => Math.max(m, s.soldAt), 0);
    const productRows = products.map((p) => {
      const recent = sales.filter((s) => s.productId === p._id && s.soldAt > lastSale - 30 * DAY);
      const cost = costs.filter((c) => c.productId === p._id).sort((a, b) => a.effectiveDate - b.effectiveDate).at(-1);
      const latestByCompetitor = new Map<string, Doc<"externalPriceObservations">>();
      for (const o of observations) {
        if (o.productId !== p._id) continue;
        const prev = latestByCompetitor.get(o.competitorId);
        if (!prev || o.capturedAt > prev.capturedAt) latestByCompetitor.set(o.competitorId, o);
      }
      const prices = [...latestByCompetitor.values()].map((o) => o.priceCents).sort((a, b) => a - b);
      const mid = Math.floor(prices.length / 2);
      return {
        sku: p.sku,
        name: p.name,
        priceCents: p.sellingPriceCents,
        unitCostCents: cost?.unitCostCents ?? 0,
        units30: recent.reduce((s, x) => s + x.quantity, 0),
        revenue30Cents: recent.reduce((s, x) => s + x.grossRevenueCents, 0),
        competitorMedianCents: prices.length ? (prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2)) : null,
      };
    });

    const findingRows = findings.map(({ finding: f, rec }) => ({
      id: f._id as string,
      findingType: f.findingType,
      title: f.title,
      summary: f.summary,
      monthlyImpactCents: f.monthlyImpactCents,
      annualImpactCents: f.annualImpactCents,
      confidence: f.confidence,
      status: f.status,
      recoveryKind: String(f.metadata?.recoveryKind ?? "recurring"),
      recommendation: rec ? { title: rec.title, status: rec.status } : null,
    }));

    const forecast = transactions.length
      ? forecastCash({
          openingBalanceCents: org.openingBalanceCents ?? 0,
          flows: transactions.map((t) => ({
            at: t.transactionDate,
            amountCents: t.transactionType === "CREDIT" ? t.amountCents : -t.amountCents,
            category: t.category,
            merchantKey: merchantKey(t.normalizedMerchantName),
            merchantName: t.merchantName,
          })),
          fixes: findingRows
            .filter((f) => f.recommendation?.status !== "REJECTED")
            .map((f) => ({
              monthlyCents: f.recoveryKind === "one_time" ? 0 : f.monthlyImpactCents,
              oneTimeCents: f.recoveryKind === "one_time" ? f.annualImpactCents : 0,
              approved: f.recommendation?.status === "APPROVED" || f.recommendation?.status === "READY_FOR_EXECUTION",
            })),
        })
      : null;

    return {
      organizationName: org.name,
      transactions: transactions.map((t) => ({
        id: t._id as string,
        at: t.transactionDate,
        merchantName: t.merchantName,
        normalizedMerchantName: t.normalizedMerchantName,
        amountCents: t.amountCents,
        type: t.transactionType,
        category: t.category,
        invoiceReference: t.invoiceReference,
        payeeAccount: (t.metadata?.payeeAccount as string | undefined) ?? null,
        source: t.source,
      })),
      findings: findingRows,
      screenings: screenings.map((s) => ({
        id: s._id as string,
        at: s.at,
        merchantName: s.merchantName,
        amountCents: s.amountCents,
        verdict: s.verdict,
        score: s.score,
        status: s.status,
        signals: s.signals.map((x) => ({ signal: x.signal, detail: x.detail })),
      })),
      products: productRows,
      forecast,
    };
  },
});
