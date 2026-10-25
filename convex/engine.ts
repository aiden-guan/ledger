"use node";

import { v } from "convex/values";
import { DEMO_ORG } from "../lib/demo/catalog";
import { countDemoData, generateDemoData, type SeedCounts } from "../lib/demo/seed";
import { getEnv } from "../lib/env";
import { executeInvestigation, type ExecuteOptions } from "../lib/investigation/engine";
import type { InvestigationStore } from "../lib/investigation/store";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { apiError } from "./model";

/*
 * The investigation engine runs as a Convex action in the Node runtime: it reads the ledger,
 * calls Apify and the model, and writes every step through mutations, so each timeline event
 * reaches subscribed browsers the moment it is committed.
 */

/** The parts of an action context the engine needs (also satisfied by convex-test in tests). */
export type EngineCtx = Pick<ActionCtx, "runQuery" | "runMutation">;

export function convexStore(ctx: EngineCtx): InvestigationStore {
  return {
    getInvestigation: (id) => ctx.runQuery(internal.data.getInvestigation, { id: id as Id<"investigations"> }),
    patchInvestigation: (id, patch) => ctx.runMutation(internal.data.patchInvestigation, { id: id as Id<"investigations">, patch }),
    emitEvent: (investigationId, eventType, message, metadata) =>
      ctx.runMutation(internal.data.emitEvent, { investigationId: investigationId as Id<"investigations">, eventType, message, metadata }),
    loadLedger: (organizationId) => ctx.runQuery(internal.data.loadLedger, { organizationId: organizationId as Id<"organizations"> }),
    savePriceObservations: (rows) => ctx.runMutation(internal.data.savePriceObservations, { rows }),
    saveFinding: (bundle) => ctx.runMutation(internal.data.saveFinding, { bundle }),
    audit: (entry) =>
      ctx.runMutation(internal.data.audit, { ...entry, organizationId: entry.organizationId as Id<"organizations"> }),
  };
}

export const run = internalAction({
  args: { investigationId: v.id("investigations") },
  handler: async (ctx, { investigationId }) => {
    await executeInvestigation(convexStore(ctx), investigationId);
  },
});

export const runMarketCheck = internalAction({
  args: { investigationId: v.id("investigations") },
  returns: v.null(),
  handler: async (ctx, { investigationId }) => {
    const marketListings = await ctx.runQuery(internal.market.researchInput, { investigationId });
    await executeInvestigation(convexStore(ctx), investigationId, { marketListings, externalIntelMode: "live", provider: null, stepDelayMs: 0 });
    return null;
  },
});

const BATCH = 400;

/** Deletes and reseeds the demo company, then runs a baseline investigation without pacing. */
export interface DemoResetResult {
  organizationId: string;
  counts: SeedCounts;
  baselineInvestigationId: string;
}

export async function resetDemoData(ctx: EngineCtx, options: { anchorDate?: number; execute?: ExecuteOptions } = {}): Promise<DemoResetResult> {
  const env = getEnv();
  for (let i = 0; i < 100; i++) {
    const { done } = await ctx.runMutation(internal.data.purgeOrganizationBatch, { slug: DEMO_ORG.slug });
    if (done) break;
  }
  const data = generateDemoData({ anchorDate: options.anchorDate ? new Date(options.anchorDate) : undefined, appUrl: env.APP_URL });
  const { organizationId, productIds }: { organizationId: Id<"organizations">; productIds: Record<string, Id<"products">> } = await ctx.runMutation(internal.data.insertDemoCatalog, { data: { ...data, sales: [], transactions: [] } });
  for (let k = 0; k < data.sales.length; k += BATCH) {
    await ctx.runMutation(internal.data.insertDemoSales, { organizationId, productIds, rows: data.sales.slice(k, k + BATCH) });
  }
  for (let k = 0; k < data.transactions.length; k += BATCH) {
    await ctx.runMutation(internal.data.insertDemoTransactions, { organizationId, rows: data.transactions.slice(k, k + BATCH) });
  }
  const counts: SeedCounts = countDemoData(data);
  const { id }: { id: Id<"investigations"> } = await ctx.runMutation(internal.data.createInvestigation, { organizationId, triggerType: "DEMO_SEED" });
  await executeInvestigation(convexStore(ctx), id, { stepDelayMs: 0, provider: null, externalIntelMode: "fixture", ...options.execute });
  await ctx.runMutation(internal.data.audit, {
    organizationId,
    actorType: "SYSTEM",
    action: "demo.reset",
    entityType: "organization",
    entityId: organizationId,
    metadata: { counts },
  });
  return { organizationId: organizationId as string, counts, baselineInvestigationId: id as string };
}

/** Reset Demo: restores the seeded company and its baseline findings. Demo mode only. */
export const resetDemo = action({
  args: {},
  handler: async (ctx): Promise<DemoResetResult> => {
    if (!getEnv().DEMO_MODE) throw apiError("FORBIDDEN", "Demo reset is only available when DEMO_MODE=true");
    return resetDemoData(ctx);
  },
});

/** Seeds the demo company only when it does not exist yet. */
export const seedDemo = action({
  args: {},
  handler: async (ctx): Promise<{ created: boolean; organizationId: string }> => {
    if (!getEnv().DEMO_MODE) throw apiError("FORBIDDEN", "Demo seeding is only available when DEMO_MODE=true");
    const existing = await ctx.runQuery(internal.data.findOrganizationBySlug, { slug: DEMO_ORG.slug });
    if (existing) return { created: false, organizationId: existing };
    const result = await resetDemoData(ctx);
    return { created: true, organizationId: result.organizationId };
  },
});
