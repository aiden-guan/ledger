import { v } from "convex/values";
import { toFindingListItem } from "../lib/views/dashboard";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { createInvestigationRecord } from "./data";
import { apiError, currentOrganization, serializeEvent, serializeInvestigation } from "./model";

/** Starts an investigation (or returns the one already running) and schedules the engine. */
export const start = mutation({
  args: {},
  handler: async (ctx) => {
    const org = await currentOrganization(ctx);
    if (!org) throw apiError("NOT_FOUND", "No organization found. Load the demo company first.");
    const { id, alreadyRunning } = await createInvestigationRecord(ctx, org._id, "MANUAL");
    if (!alreadyRunning) await ctx.scheduler.runAfter(0, internal.engine.run, { investigationId: id });
    const inv = await ctx.db.get(id);
    return { investigation: serializeInvestigation(inv!), alreadyRunning };
  },
});

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const org = await currentOrganization(ctx);
    const invId = ctx.db.normalizeId("investigations", id);
    const inv = invId ? await ctx.db.get(invId) : null;
    if (!org || !inv || inv.organizationId !== org._id) return null;
    return serializeInvestigation(inv);
  },
});

/** The live timeline. Browsers subscribe to this; every committed step re-renders instantly. */
export const timeline = query({
  args: { id: v.string(), afterSeq: v.optional(v.number()) },
  handler: async (ctx, { id, afterSeq }) => {
    const org = await currentOrganization(ctx);
    const invId = ctx.db.normalizeId("investigations", id);
    const inv = invId ? await ctx.db.get(invId) : null;
    if (!org || !inv || inv.organizationId !== org._id) return null;
    const events = await ctx.db
      .query("investigationEvents")
      .withIndex("by_investigation", (q) => q.eq("investigationId", inv._id).gt("seq", afterSeq ?? 0))
      .collect();
    return { investigation: serializeInvestigation(inv), events: events.map(serializeEvent) };
  },
});

export const findings = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const org = await currentOrganization(ctx);
    const invId = ctx.db.normalizeId("investigations", id);
    const inv = invId ? await ctx.db.get(invId) : null;
    if (!org || !inv || inv.organizationId !== org._id) return null;
    const rows = await ctx.db
      .query("findings")
      .withIndex("by_investigation", (q) => q.eq("investigationId", inv._id))
      .order("desc")
      .collect();
    return Promise.all(
      rows.map(async (f) => {
        const rec = await ctx.db
          .query("recommendations")
          .withIndex("by_finding", (q) => q.eq("findingId", f._id))
          .first();
        return toFindingListItem({ ...f, id: f._id, metadata: f.metadata ?? {} }, rec);
      }),
    );
  },
});
