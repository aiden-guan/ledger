import { v } from "convex/values";
import { getEnv } from "../lib/env";
import { normalizeMerchantName } from "../lib/finance/merchants";
import { DEFAULT_POLICY, screenPayment, type HistoryEntry, type Payment, type Policy } from "../lib/watch/screen";
import { FEED_SCRIPT } from "../lib/watch/script";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { apiError, currentOrganization } from "./model";

/*
 * The live feed. Each payment is screened inside the mutation that receives it, so a payment the
 * policy says to hold never reaches the ledger, and every open tab sees the verdict at once.
 * Autopilot acts only within the policy a person set; everything outside it waits for a person.
 */

async function getWatch(ctx: QueryCtx, organizationId: Id<"organizations">) {
  return ctx.db
    .query("watch")
    .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
    .unique();
}

function toHistory(t: Doc<"transactions">): HistoryEntry {
  return {
    id: t._id,
    transactionDate: new Date(t.transactionDate),
    merchantName: t.merchantName,
    normalizedMerchantName: t.normalizedMerchantName,
    amountCents: t.amountCents,
    transactionType: t.transactionType,
    category: t.category,
    invoiceReference: t.invoiceReference,
    payeeAccount: (t.metadata?.payeeAccount as string | undefined) ?? null,
  };
}

async function post(ctx: MutationCtx, organizationId: Id<"organizations">, payment: Omit<Payment, "id">, seq: number, score: number) {
  return ctx.db.insert("transactions", {
    organizationId,
    transactionDate: payment.at,
    merchantName: payment.merchantName,
    normalizedMerchantName: normalizeMerchantName(payment.merchantName),
    amountCents: payment.amountCents,
    currency: "USD",
    transactionType: payment.transactionType,
    category: payment.category,
    invoiceReference: payment.invoiceReference,
    source: "live_feed",
    externalId: `feed-${seq}`,
    metadata: { payeeAccount: payment.payeeAccount, screeningScore: score },
  });
}

/** Screens one incoming payment and posts, flags, holds or escalates it per the policy. */
export async function receivePayment(ctx: MutationCtx, organizationId: Id<"organizations">, payment: Omit<Payment, "id">, policy: Policy, seq: number) {
  const ledger = await ctx.db
    .query("transactions")
    .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
    .collect();
  const result = screenPayment({ ...payment, id: "incoming" }, ledger.map(toHistory), policy);
  const status = result.verdict === "hold" ? "held" : result.overLimit ? "awaiting" : result.verdict === "review" ? "flagged" : "posted";
  const transactionId = status === "posted" || status === "flagged" ? await post(ctx, organizationId, payment, seq, result.score) : null;
  const id = await ctx.db.insert("screenings", {
    organizationId,
    seq,
    at: payment.at,
    merchantName: payment.merchantName,
    amountCents: payment.amountCents,
    transactionType: payment.transactionType,
    category: payment.category,
    invoiceReference: payment.invoiceReference,
    payeeAccount: payment.payeeAccount,
    verdict: result.verdict,
    score: result.score,
    signals: result.signals,
    payee: result.payee,
    status,
    transactionId,
    decidedAt: status === "held" || status === "awaiting" ? null : payment.at,
  });
  if (status !== "posted") {
    await ctx.db.insert("auditLog", {
      organizationId,
      actorType: "AGENT",
      action: status === "held" ? "payment.held" : status === "awaiting" ? "payment.escalated" : "payment.flagged",
      entityType: "screening",
      entityId: id,
      metadata: {
        merchant: payment.merchantName,
        amountCents: payment.amountCents,
        score: result.score,
        signals: result.signals.map((s) => s.signal),
        policy,
      },
    });
  }
  return { id, status };
}

export const feed = query({
  args: {},
  handler: async (ctx) => {
    const org = await currentOrganization(ctx);
    if (!org) return null;
    const watch = await getWatch(ctx, org._id);
    const rows = await ctx.db
      .query("screenings")
      .withIndex("by_org", (q) => q.eq("organizationId", org._id))
      .order("desc")
      .take(50);
    const stopped = rows.filter((r) => r.status === "held" || r.status === "blocked").reduce((s, r) => s + r.amountCents, 0);
    return {
      running: watch?.running ?? false,
      cursor: watch?.cursor ?? 0,
      total: FEED_SCRIPT.length,
      policy: watch?.policy ?? DEFAULT_POLICY,
      stoppedCents: stopped,
      waiting: rows.filter((r) => r.status === "held" || r.status === "awaiting").length,
      items: rows.map((r) => ({
        id: r._id as string,
        seq: r.seq,
        at: r.at,
        merchantName: r.merchantName,
        amountCents: r.amountCents,
        transactionType: r.transactionType,
        invoiceReference: r.invoiceReference,
        payeeAccount: r.payeeAccount,
        verdict: r.verdict,
        score: r.score,
        signals: r.signals,
        payee: r.payee,
        status: r.status,
      })),
    };
  },
});

/** Replays the demo bank feed from the start. Earlier replays and what they posted are cleared. */
export const start = mutation({
  args: {},
  handler: async (ctx) => {
    if (!getEnv().DEMO_MODE) throw apiError("FORBIDDEN", "The demo feed is only available when DEMO_MODE=true");
    const org = await currentOrganization(ctx);
    if (!org) throw apiError("NOT_FOUND", "Load the demo company first");
    const earlier = await ctx.db
      .query("screenings")
      .withIndex("by_org", (q) => q.eq("organizationId", org._id))
      .collect();
    for (const s of earlier) await ctx.db.delete(s._id);
    const posted = await ctx.db
      .query("transactions")
      .withIndex("by_org", (q) => q.eq("organizationId", org._id))
      .collect();
    for (const t of posted) if (t.source === "live_feed") await ctx.db.delete(t._id);

    const runId = Date.now();
    const watch = await getWatch(ctx, org._id);
    if (watch) await ctx.db.patch(watch._id, { running: true, cursor: 0, runId });
    else await ctx.db.insert("watch", { organizationId: org._id, running: true, cursor: 0, runId, policy: DEFAULT_POLICY });
    await ctx.scheduler.runAfter(FEED_SCRIPT[0].gapMs, internal.watch.tick, { organizationId: org._id, runId });
    await ctx.db.insert("auditLog", { organizationId: org._id, actorType: "USER", action: "feed.started", entityType: "organization", entityId: org._id, metadata: {} });
    return { runId };
  },
});

export const stop = mutation({
  args: {},
  handler: async (ctx) => {
    const org = await currentOrganization(ctx);
    const watch = org ? await getWatch(ctx, org._id) : null;
    if (watch?.running) await ctx.db.patch(watch._id, { running: false });
  },
});

export const tick = internalMutation({
  args: { organizationId: v.id("organizations"), runId: v.number() },
  handler: async (ctx, { organizationId, runId }) => {
    const watch = await getWatch(ctx, organizationId);
    if (!watch || !watch.running || watch.runId !== runId) return;
    const item = FEED_SCRIPT[watch.cursor];
    if (!item) {
      await ctx.db.patch(watch._id, { running: false });
      return;
    }
    const payment = { merchantName: item.merchantName, amountCents: item.amountCents, transactionType: item.transactionType, category: item.category, invoiceReference: item.invoiceReference, payeeAccount: item.payeeAccount };
    await receivePayment(ctx, organizationId, { ...payment, at: Date.now() }, watch.policy, watch.cursor + 1);
    const next = FEED_SCRIPT[watch.cursor + 1];
    await ctx.db.patch(watch._id, { cursor: watch.cursor + 1, running: Boolean(next) });
    if (next) await ctx.scheduler.runAfter(next.gapMs, internal.watch.tick, { organizationId, runId });
  },
});

/** A person's decision on a payment autopilot held or escalated. Releasing posts it to the ledger. */
export const decide = mutation({
  args: { id: v.string(), decision: v.union(v.literal("release"), v.literal("block")) },
  handler: async (ctx, { id, decision }) => {
    const org = await currentOrganization(ctx);
    const sid = ctx.db.normalizeId("screenings", id);
    const s = sid ? await ctx.db.get(sid) : null;
    if (!org || !s || s.organizationId !== org._id) throw apiError("NOT_FOUND", "Payment not found");
    if (s.status !== "held" && s.status !== "awaiting") throw apiError("CONFLICT", `Payment is already ${s.status}`);
    const now = Date.now();
    const transactionId = decision === "release" ? await post(ctx, org._id, s, s.seq, s.score) : null;
    await ctx.db.patch(s._id, { status: decision === "release" ? "released" : "blocked", transactionId, decidedAt: now });
    await ctx.db.insert("auditLog", {
      organizationId: org._id,
      actorType: "USER",
      action: decision === "release" ? "payment.released" : "payment.blocked",
      entityType: "screening",
      entityId: s._id,
      metadata: { merchant: s.merchantName, amountCents: s.amountCents, score: s.score, wasStatus: s.status },
    });
    return { status: decision === "release" ? "released" : "blocked" };
  },
});

/** The limits autopilot works within. Applies to payments that arrive after the change. */
export const setPolicy = mutation({
  args: { holdAt: v.number(), reviewAt: v.number(), approvalLimitCents: v.number() },
  handler: async (ctx, policy) => {
    const org = await currentOrganization(ctx);
    if (!org) throw apiError("NOT_FOUND", "Load the demo company first");
    const ok =
      policy.reviewAt > 0 && policy.reviewAt < policy.holdAt && policy.holdAt <= 1 && Number.isSafeInteger(policy.approvalLimitCents) && policy.approvalLimitCents >= 0;
    if (!ok) throw apiError("INVALID_INPUT", "Flag below hold, both between 0 and 1, and a whole-cent limit");
    const clean = { holdAt: Number(policy.holdAt.toFixed(2)), reviewAt: Number(policy.reviewAt.toFixed(2)), approvalLimitCents: policy.approvalLimitCents };
    const watch = await getWatch(ctx, org._id);
    if (watch) await ctx.db.patch(watch._id, { policy: clean });
    else await ctx.db.insert("watch", { organizationId: org._id, running: false, cursor: 0, runId: 0, policy: clean });
    await ctx.db.insert("auditLog", { organizationId: org._id, actorType: "USER", action: "autopilot.updated", entityType: "organization", entityId: org._id, metadata: { from: watch?.policy ?? DEFAULT_POLICY, to: clean } });
    return clean;
  },
});
