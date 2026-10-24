import { ConvexError } from "convex/values";
import type { Organization } from "../lib/domain";
import { getEnv } from "../lib/env";
import type { InvestigationDTO, InvestigationEventDTO } from "../lib/views/findings";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/*
 * Shared helpers for Convex functions. This module defines no functions of its own.
 */

export type ApiErrorCode = "NOT_FOUND" | "CONFLICT" | "FORBIDDEN" | "INVALID_INPUT";

export function apiError(code: ApiErrorCode, message: string): ConvexError<{ code: ApiErrorCode; message: string }> {
  return new ConvexError({ code, message });
}

export function toOrganization(doc: Doc<"organizations">): Organization {
  return { id: doc._id, slug: doc.slug, name: doc.name, industry: doc.industry, currency: doc.currency, demoMode: doc.demoMode };
}

/**
 * Resolves the organization for the current request. Authentication is out of scope for the
 * MVP: with DEMO_MODE=true this is the seeded demo company; otherwise DEFAULT_ORGANIZATION_SLUG.
 */
export async function currentOrganization(ctx: QueryCtx): Promise<Doc<"organizations"> | null> {
  const env = getEnv();
  const slug = env.DEMO_MODE ? "acme-outdoor" : env.DEFAULT_ORGANIZATION_SLUG;
  return ctx.db
    .query("organizations")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
}

export function serializeInvestigation(inv: Doc<"investigations">): InvestigationDTO {
  return {
    id: inv._id,
    status: inv.status,
    triggerType: inv.triggerType,
    startedAt: new Date(inv.startedAt).toISOString(),
    completedAt: inv.completedAt ? new Date(inv.completedAt).toISOString() : null,
    totalRecoveryMonthlyCents: inv.totalRecoveryMonthlyCents,
    totalRecoveryAnnualCents: inv.totalRecoveryAnnualCents,
    errorMessage: inv.errorMessage,
    metadata: inv.metadata ?? {},
  };
}

export function serializeEvent(e: Doc<"investigationEvents">): InvestigationEventDTO {
  return { seq: e.seq, eventType: e.eventType, message: e.message, metadata: e.metadata ?? {}, createdAt: new Date(e._creationTime).toISOString() };
}

/** Appends a timeline event with the next sequence number for its investigation. */
export async function appendEvent(
  ctx: MutationCtx,
  investigationId: Id<"investigations">,
  eventType: string,
  message: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const last = await ctx.db
    .query("investigationEvents")
    .withIndex("by_investigation", (q) => q.eq("investigationId", investigationId))
    .order("desc")
    .first();
  await ctx.db.insert("investigationEvents", { investigationId, seq: (last?.seq ?? 0) + 1, eventType, message, metadata });
}

