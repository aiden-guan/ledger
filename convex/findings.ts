import { v } from "convex/values";
import { buildFindingDetail, type AuditEntryDTO, type FindingDetail } from "../lib/views/findings";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { currentOrganization } from "./model";

export const detail = query({
  args: { id: v.string() },
  handler: async (ctx, { id }): Promise<FindingDetail | null> => {
    const org = await currentOrganization(ctx);
    const findingId = ctx.db.normalizeId("findings", id);
    const f = findingId ? await ctx.db.get(findingId) : null;
    if (!org || !f || f.organizationId !== org._id) return null;

    const evidence = (await Promise.all(f.evidenceIds.map((eid) => ctx.db.get(eid)))).filter((e): e is Doc<"evidence"> => e !== null);
    const rec = await ctx.db
      .query("recommendations")
      .withIndex("by_finding", (q) => q.eq("findingId", f._id))
      .first();
    const inv = await ctx.db.get(f.investigationId);
    if (!inv) return null;
    const events = await ctx.db
      .query("investigationEvents")
      .withIndex("by_investigation", (q) => q.eq("investigationId", inv._id))
      .collect();
    const audit = rec
      ? (
          await Promise.all(
            [rec._id, f._id].map((entityId) =>
              ctx.db
                .query("auditLog")
                .withIndex("by_entity", (q) => q.eq("entityId", entityId))
                .collect(),
            ),
          )
        )
          .flat()
          .filter((a) => a.organizationId === org._id)
          .sort((a, b) => b._creationTime - a._creationTime)
      : [];

    return buildFindingDetail({
      organization: { name: org.name, demoMode: org.demoMode },
      finding: { ...f, id: f._id, createdAt: f._creationTime, metadata: f.metadata ?? {} },
      evidence: evidence.map((e) => ({ ...e, id: e._id, data: e.data ?? {} })),
      recommendation: rec ? { ...rec, id: rec._id, metadata: rec.metadata ?? {} } : null,
      audit: audit.map((a) => ({ id: a._id, action: a.action, actorType: a.actorType, createdAt: a._creationTime, metadata: a.metadata ?? {} })),
      investigation: { id: inv._id, completedAt: inv.completedAt, startedAt: inv.startedAt },
      events: events.map((e) => ({ seq: e.seq, eventType: e.eventType, message: e.message, createdAt: e._creationTime, metadata: e.metadata ?? {} })),
    });
  },
});

/** Every investigation and decision, newest first. */
export const auditTrail = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<AuditEntryDTO[]> => {
    const org = await currentOrganization(ctx);
    if (!org) return [];
    const rows = await ctx.db
      .query("auditLog")
      .withIndex("by_org", (q) => q.eq("organizationId", org._id))
      .order("desc")
      .take(Math.min(Math.max(1, limit ?? 100), 500));
    return rows.map((a) => ({
      id: a._id,
      action: a.action,
      actorType: a.actorType,
      entityType: a.entityType,
      entityId: a.entityId,
      createdAt: new Date(a._creationTime).toISOString(),
      metadata: a.metadata ?? {},
    }));
  },
});
