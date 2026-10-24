import { v } from "convex/values";
import { buildExecutionChecklist } from "../lib/investigation/actions";
import type { Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { apiError, currentOrganization } from "./model";

/*
 * Approval never executes anything: no payments, price changes, cancellations or vendor emails.
 * It records the decision and writes the audit trail, all in one transaction.
 */

async function loadProposed(ctx: MutationCtx, id: string) {
  const org = await currentOrganization(ctx);
  const recId = ctx.db.normalizeId("recommendations", id);
  const rec = recId ? await ctx.db.get(recId) : null;
  if (!org || !rec || rec.organizationId !== org._id) throw apiError("NOT_FOUND", "Recommendation not found");
  const finding = await ctx.db.get(rec.findingId);
  if (!finding) throw apiError("NOT_FOUND", "Recommendation not found");
  if (rec.status !== "PROPOSED") throw apiError("CONFLICT", `Recommendation is already ${rec.status.toLowerCase().replace(/_/g, " ")}`);
  return { org, rec, finding };
}

export const approve = mutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const { org, rec, finding } = await loadProposed(ctx, id);
    const now = Date.now();
    await ctx.db.insert("auditLog", {
      organizationId: org._id,
      actorType: "USER",
      action: "recommendation.approved",
      entityType: "recommendation",
      entityId: rec._id,
      metadata: { findingId: finding._id, findingType: finding.findingType, title: rec.title, estimatedAnnualImpactCents: rec.estimatedAnnualImpactCents },
    });
    const checklist = buildExecutionChecklist({ actionType: rec.actionType, metadata: rec.metadata ?? {} });
    await ctx.db.patch(rec._id, {
      status: "READY_FOR_EXECUTION",
      approvedAt: now,
      decidedAt: now,
      metadata: { ...(rec.metadata ?? {}), executionChecklist: checklist },
    });
    await ctx.db.patch(finding._id, { status: "ACTIONED" });
    await ctx.db.insert("auditLog", {
      organizationId: org._id,
      actorType: "SYSTEM",
      action: "recommendation.ready_for_execution",
      entityType: "recommendation",
      entityId: rec._id,
      metadata: { checklistItems: checklist.length, note: "LedgerLens does not execute financial actions." },
    });
    return { id: rec._id as Id<"recommendations">, status: "READY_FOR_EXECUTION" as const };
  },
});

export const reject = mutation({
  args: { id: v.string(), reason: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { id, reason }) => {
    const trimmed = reason?.trim().slice(0, 500) || null;
    const { org, rec, finding } = await loadProposed(ctx, id);
    const now = Date.now();
    await ctx.db.patch(rec._id, { status: "REJECTED", rejectedAt: now, decidedAt: now, metadata: { ...(rec.metadata ?? {}), rejectionReason: trimmed } });
    await ctx.db.patch(finding._id, { status: "DISMISSED" });
    await ctx.db.insert("auditLog", {
      organizationId: org._id,
      actorType: "USER",
      action: "recommendation.rejected",
      entityType: "recommendation",
      entityId: rec._id,
      metadata: { findingId: finding._id, findingType: finding.findingType, title: rec.title, reason: trimmed },
    });
    return { id: rec._id as Id<"recommendations">, status: "REJECTED" as const };
  },
});
