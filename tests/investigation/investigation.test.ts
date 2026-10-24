/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { convexStore, resetDemoData, type EngineCtx } from "@/convex/engine";
import schema from "@/convex/schema";
import type { LLMProvider } from "@/lib/ai/provider";
import { EXPECTED } from "@/lib/demo/catalog";
import { executeInvestigation, type ExecuteOptions } from "@/lib/investigation/engine";

/*
 * End-to-end against Convex's in-memory backend (convex-test): the same schema, queries,
 * mutations and engine code that run in the deployment, with fixture market data and no model.
 */

const modules = import.meta.glob("../../convex/**/*.*s");
const t = convexTest(schema, modules);
const ctx = { runQuery: t.query, runMutation: t.mutation } as unknown as EngineCtx;
const deterministic: ExecuteOptions = { stepDelayMs: 0, provider: null, externalIntelMode: "fixture" };
let organizationId: Id<"organizations">;

async function runInvestigation(options: ExecuteOptions = deterministic): Promise<Id<"investigations">> {
  const { id } = await t.mutation(internal.data.createInvestigation, { organizationId, triggerType: "MANUAL" });
  await executeInvestigation(convexStore(ctx), id, options);
  return id;
}

const findingsFor = (investigationId: Id<"investigations">) =>
  t.run((c) =>
    c.db
      .query("findings")
      .withIndex("by_investigation", (q) => q.eq("investigationId", investigationId))
      .collect(),
  );
const recommendationFor = (findingId: Id<"findings">) =>
  t.run((c) =>
    c.db
      .query("recommendations")
      .withIndex("by_finding", (q) => q.eq("findingId", findingId))
      .unique(),
  );
const investigation = (id: Id<"investigations">) => t.run((c) => c.db.get(id));

beforeAll(async () => {
  const result = await resetDemoData(ctx, { anchorDate: Date.parse("2026-10-18T00:00:00Z") });
  organizationId = result.organizationId as Id<"organizations">;
});

describe("demo seed", () => {
  it("creates the full dataset", async () => {
    const counts = await t.run(async (c) => {
      const byOrg = async (table: "products" | "sales" | "transactions" | "competitors") =>
        c.db
          .query(table)
          .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
          .collect();
      return { products: await byOrg("products"), sales: await byOrg("sales"), txs: await byOrg("transactions"), competitors: await byOrg("competitors") };
    });
    expect(counts.products.length).toBeGreaterThanOrEqual(15);
    expect(counts.products.length).toBeLessThanOrEqual(20);
    expect(counts.sales.length).toBeGreaterThanOrEqual(600);
    expect(counts.sales.length).toBeLessThanOrEqual(1000);
    expect(counts.txs.length).toBeGreaterThanOrEqual(200);
    expect(counts.txs.length).toBeLessThanOrEqual(400);
    expect(counts.competitors).toHaveLength(4);
    // Money is stored as integer cents.
    expect(counts.sales.every((s) => "grossRevenueCents" in s && Number.isInteger(s.grossRevenueCents))).toBe(true);
  });

  it("opens the dashboard with the baseline findings", async () => {
    const dashboard = await t.query(api.dashboard.get, {});
    expect(dashboard?.organization.name).toBe("Acme Outdoor Co.");
    expect(dashboard?.latest?.totalRecoveryAnnualCents).toBe(EXPECTED.totals.annualCents);
    expect(dashboard?.findings).toHaveLength(4);
    expect(dashboard?.river.revenueAnnualCents).toBeGreaterThan(0);
  });
});

describe("investigation (fixture mode, no AI)", () => {
  let investigationId: Id<"investigations">;

  beforeAll(async () => {
    investigationId = await runInvestigation();
  });

  it("completes and walks every state in order", async () => {
    expect((await investigation(investigationId))?.status).toBe("COMPLETED");
    const timeline = await t.query(api.investigations.timeline, { id: investigationId });
    const states = timeline!.events.filter((e) => e.eventType === "STATE_CHANGED").map((e) => e.message);
    expect(states).toEqual([
      "CREATED",
      "INGESTING",
      "ANALYZING_INTERNAL_DATA",
      "GENERATING_HYPOTHESES",
      "GATHERING_EXTERNAL_EVIDENCE",
      "VALIDATING_FINDINGS",
      "CALCULATING_IMPACT",
      "GENERATING_RECOMMENDATIONS",
      "COMPLETED",
    ]);
    // Sequence numbers are gapless, so clients can diff the timeline.
    expect(timeline!.events.map((e) => e.seq)).toEqual(timeline!.events.map((_, i) => i + 1));
  });

  it("produces the four expected findings with predetermined values", async () => {
    const findings = await findingsFor(investigationId);
    expect(findings.map((f) => f.findingType).sort()).toEqual(["DUPLICATE_PAYMENT", "MARGIN_EROSION", "PRICING_OPPORTUNITY", "SUBSCRIPTION_CREEP"]);

    const dup = findings.find((f) => f.findingType === "DUPLICATE_PAYMENT")!;
    expect(dup.annualImpactCents).toBe(EXPECTED.duplicate.amountCents);
    expect(dup.monthlyImpactCents).toBe(0);
    expect(dup.metadata.invoiceReference).toBe(EXPECTED.duplicate.invoice);

    const margin = findings.find((f) => f.findingType === "MARGIN_EROSION")!;
    expect(margin.metadata.sku).toBe(EXPECTED.marginErosionSku);
    const metrics = margin.metadata.deterministicMetrics as Record<string, number>;
    expect(metrics.historicalMarginPct).toBe(55.1);
    expect(metrics.currentMarginPct).toBe(40.8);
    expect(metrics.marginDeltaPoints).toBe(-14.3);
    expect(metrics.costChangePercent).toBe(31.8);
    expect(metrics.competitorMedianCents).toBe(6200);
    expect(metrics.recommendedPriceCents).toBe(5500);
    // $6 x 78 trailing-90-day units: $156/month, $1,872/year.
    expect(margin.monthlyImpactCents).toBe(15600);
    expect(margin.annualImpactCents).toBe(187200);
    expect(margin.confidence).toBe(0.92);

    const pricing = findings.find((f) => f.findingType === "PRICING_OPPORTUNITY")!;
    expect(pricing.metadata.sku).toBe(EXPECTED.pricingOpportunitySku);
    expect(pricing.monthlyImpactCents).toBe(6300);
    expect(pricing.annualImpactCents).toBe(75600);

    const sub = findings.find((f) => f.findingType === "SUBSCRIPTION_CREEP")!;
    expect(sub.metadata.vendor).toBe(EXPECTED.subscription.merchant);
    expect(sub.monthlyImpactCents).toBe(5000);
    expect(sub.annualImpactCents).toBe(60000);
  });

  it("aggregates the expected recoverable value", async () => {
    const inv = await investigation(investigationId);
    expect(inv?.totalRecoveryAnnualCents).toBe(EXPECTED.totals.annualCents);
    expect(inv?.totalRecoveryMonthlyCents).toBe(EXPECTED.totals.monthlyCents);
    expect((inv?.metadata.externalIntel as { mode: string }).mode).toBe("fixture");
  });

  it("attaches evidence and a proposed recommendation to every finding", async () => {
    const findings = await findingsFor(investigationId);
    for (const f of findings) {
      expect(f.evidenceIds.length).toBeGreaterThan(0);
      const rec = await recommendationFor(f._id);
      expect(rec?.status).toBe("PROPOSED");
      expect(rec?.estimatedAnnualImpactCents).toBe(f.annualImpactCents);
    }
    const margin = findings.find((f) => f.findingType === "MARGIN_EROSION")!;
    const rec = await recommendationFor(margin._id);
    expect(rec?.actionType).toBe("CHANGE_PRICE");
    expect(rec?.title).toBe("Raise price from $49 → $55");

    const detail = await t.query(api.findings.detail, { id: margin._id });
    expect(detail?.evidence.length).toBe(margin.evidenceIds.length);
    expect(detail?.recommendation?.status).toBe("PROPOSED");
    expect(detail?.finding.calculations.length).toBeGreaterThan(0);
  });

  it("stores traceable external price observations", async () => {
    const obs = await t.run(async (c) =>
      (
        await c.db
          .query("externalPriceObservations")
          .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
          .collect()
      ).filter((o) => o.investigationId === investigationId),
    );
    expect(obs).toHaveLength(8);
    for (const o of obs) {
      expect(o.captureMode).toBe("fixture");
      expect(o.apifyRunId).toMatch(/^fixture:/);
      expect(o.sourceUrl).toMatch(/^http/);
      expect(o.rawPayload).toHaveProperty("price");
    }
  });

  it("approves a recommendation and records the audit trail", async () => {
    const margin = (await findingsFor(investigationId)).find((f) => f.findingType === "MARGIN_EROSION")!;
    const rec = (await recommendationFor(margin._id))!;
    const result = await t.mutation(api.recommendations.approve, { id: rec._id });
    expect(result.status).toBe("READY_FOR_EXECUTION");
    const approved = (await recommendationFor(margin._id))!;
    expect(typeof approved.approvedAt).toBe("number");
    expect((approved.metadata.executionChecklist as unknown[]).length).toBeGreaterThan(0);

    const audit = await t.run((c) =>
      c.db
        .query("auditLog")
        .withIndex("by_entity", (q) => q.eq("entityId", rec._id))
        .collect(),
    );
    expect(audit.map((a) => a.action).sort()).toEqual(["recommendation.approved", "recommendation.ready_for_execution"]);

    await expect(t.mutation(api.recommendations.approve, { id: rec._id })).rejects.toThrow(/already/);
  });

  it("rejects a recommendation", async () => {
    const sub = (await findingsFor(investigationId)).find((f) => f.findingType === "SUBSCRIPTION_CREEP")!;
    const rec = (await recommendationFor(sub._id))!;
    const result = await t.mutation(api.recommendations.reject, { id: rec._id, reason: "Plan upgrade was intentional" });
    expect(result.status).toBe("REJECTED");
    expect((await t.run((c) => c.db.get(sub._id)))?.status).toBe("DISMISSED");
  });

  it("returns not found for unknown or malformed ids", async () => {
    expect(await t.query(api.findings.detail, { id: "not-an-id" })).toBeNull();
    await expect(t.mutation(api.recommendations.approve, { id: "not-an-id" })).rejects.toThrow(/not found/i);
  });

  it("carries decisions forward into the next investigation", async () => {
    const nextId = await runInvestigation();
    const findings = await findingsFor(nextId);
    const margin = findings.find((f) => f.findingType === "MARGIN_EROSION")!;
    expect((await recommendationFor(margin._id))?.status).toBe("READY_FOR_EXECUTION");
    expect(margin.status).toBe("ACTIONED");
    expect(findings.find((f) => f.findingType === "SUBSCRIPTION_CREEP")!.status).toBe("DISMISSED");
  });
});

describe("live start through the public API", () => {
  it("schedules the engine and reports an investigation that is already running", async () => {
    vi.useFakeTimers();
    try {
      const first = await t.mutation(api.investigations.start, {});
      expect(first.alreadyRunning).toBe(false);
      const second = await t.mutation(api.investigations.start, {});
      expect(second.alreadyRunning).toBe(true);
      expect(second.investigation.id).toBe(first.investigation.id);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const done = await t.query(api.investigations.get, { id: first.investigation.id });
      expect(done?.status).toBe("COMPLETED");
      expect(done?.totalRecoveryAnnualCents).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("degraded modes", () => {
  it("still completes when live Apify has no credentials (falls back to the labeled demo dataset)", async () => {
    const id = await runInvestigation({ ...deterministic, externalIntelMode: "live" });
    const inv = await investigation(id);
    expect(inv?.status).toBe("COMPLETED");
    const intel = inv?.metadata.externalIntel as { mode: string; fallbackReason: string };
    expect(intel.mode).toBe("fixture");
    expect(intel.fallbackReason).toBeTruthy();
    expect(await findingsFor(id)).toHaveLength(4);
  });

  it("falls back to deterministic narratives when the model fails", async () => {
    const broken: LLMProvider = {
      name: "broken",
      model: "broken-1",
      investigate: async () => {
        throw new Error("network down");
      },
      explainFinding: async () => {
        throw new Error("network down");
      },
    };
    const id = await runInvestigation({ ...deterministic, provider: broken });
    const inv = await investigation(id);
    expect(inv?.status).toBe("COMPLETED");
    expect(inv?.totalRecoveryAnnualCents).toBe(EXPECTED.totals.annualCents);
    const findings = await findingsFor(id);
    expect(findings).toHaveLength(4);
    expect(findings.every((f) => f.metadata.narrativeSource === "deterministic")).toBe(true);
  });

  it("uses a valid model narrative but keeps deterministic numbers authoritative", async () => {
    const calls: string[] = [];
    const fake: LLMProvider = {
      name: "fake",
      model: "fake-1",
      investigate: async (c) => ({
        productsToResearch: [...c.researchCandidates.map((r) => r.productId), "not-a-real-product"],
        needsExternalEvidence: true,
        focusAreas: [],
        rationale: "Research everything with listings.",
      }),
      explainFinding: async (c) => {
        calls.push(c.type);
        return {
          credible: true,
          title: `${c.title} (reviewed)`,
          summary: `Model summary for ${c.subject} based on the supplied evidence.`,
          explanation: "The evidence supports the deterministic finding. Amounts are as calculated by the engine.",
          recommendation: { actionType: c.proposedAction.actionType, action: c.proposedAction.description, rationale: "Grounded in the supplied evidence." },
          uncertainty: ["Elasticity unknown."],
          confidence: 0.99,
        };
      },
    };
    const id = await runInvestigation({ ...deterministic, provider: fake });
    const findings = await findingsFor(id);
    expect(calls).toHaveLength(4);
    expect(findings.every((f) => f.metadata.narrativeSource === "model")).toBe(true);
    const margin = findings.find((f) => f.findingType === "MARGIN_EROSION")!;
    // Model confidence (0.99) is clamped to deterministic + 0.05.
    expect(margin.confidence).toBe(0.97);
    expect(margin.annualImpactCents).toBe(187200);
  });
});

describe("demo reset", () => {
  it("restores the original state through the public action", async () => {
    const result = await t.action(api.engine.resetDemo, {});
    expect(result.counts.sales).toBeGreaterThan(600);
    const trail = await t.query(api.findings.auditTrail, {});
    expect(trail.map((a) => a.action)).toEqual(["demo.reset", "investigation.completed", "investigation.started"]);
    const dashboard = await t.query(api.dashboard.get, {});
    expect(dashboard?.findings.every((f) => f.recommendationStatus === "PROPOSED")).toBe(true);
  });
});
