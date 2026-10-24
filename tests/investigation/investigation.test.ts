import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { EXPECTED } from "@/lib/demo/catalog";
import { resetDemo } from "@/lib/demo/service";
import { runInvestigation } from "@/lib/investigation/engine";
import type { LLMProvider } from "@/lib/ai/provider";
import { approveRecommendation, rejectRecommendation } from "@/lib/investigation/actions";

const db = () => getDb();
let organizationId: string;

beforeAll(async () => {
  const result = await resetDemo(db(), { anchorDate: new Date("2026-10-18T00:00:00Z") });
  organizationId = result.organizationId;
});

afterAll(async () => {
  await closeDb();
});

async function findingsFor(investigationId: string) {
  return db().select().from(schema.findings).where(eq(schema.findings.investigationId, investigationId));
}

describe("demo seed", () => {
  it("creates the full dataset", async () => {
    const [products, sales, txs, listings] = await Promise.all([
      db().select().from(schema.products).where(eq(schema.products.organizationId, organizationId)),
      db().select().from(schema.sales).where(eq(schema.sales.organizationId, organizationId)),
      db().select().from(schema.transactions).where(eq(schema.transactions.organizationId, organizationId)),
      db().select().from(schema.competitors).where(eq(schema.competitors.organizationId, organizationId)),
    ]);
    expect(products.length).toBeGreaterThanOrEqual(15);
    expect(products.length).toBeLessThanOrEqual(20);
    expect(sales.length).toBeGreaterThanOrEqual(600);
    expect(sales.length).toBeLessThanOrEqual(1000);
    expect(txs.length).toBeGreaterThanOrEqual(200);
    expect(txs.length).toBeLessThanOrEqual(400);
    expect(listings).toHaveLength(4);
    // Money is stored as integer cents.
    expect(sales.every((s) => Number.isInteger(s.grossRevenueCents))).toBe(true);
  });
});

describe("investigation (fixture mode, no AI)", () => {
  let investigationId: string;

  beforeAll(async () => {
    investigationId = await runInvestigation(organizationId, "MANUAL", { stepDelayMs: 0, provider: null, externalIntelMode: "fixture" });
  });

  it("completes and walks every state in order", async () => {
    const [inv] = await db().select().from(schema.investigations).where(eq(schema.investigations.id, investigationId));
    expect(inv.status).toBe("COMPLETED");
    const events = await db()
      .select()
      .from(schema.investigationEvents)
      .where(eq(schema.investigationEvents.investigationId, investigationId))
      .orderBy(asc(schema.investigationEvents.seq));
    const states = events.filter((e) => e.eventType === "STATE_CHANGED").map((e) => e.message);
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
  });

  it("produces the four expected findings with predetermined values", async () => {
    const findings = await findingsFor(investigationId);
    expect(findings.map((f) => f.findingType).sort()).toEqual(["DUPLICATE_PAYMENT", "MARGIN_EROSION", "PRICING_OPPORTUNITY", "SUBSCRIPTION_CREEP"]);

    const dup = findings.find((f) => f.findingType === "DUPLICATE_PAYMENT")!;
    expect(dup.annualImpactCents).toBe(EXPECTED.duplicate.amountCents);
    expect(dup.monthlyImpactCents).toBe(0);
    expect(dup.metadataJson.invoiceReference).toBe(EXPECTED.duplicate.invoice);

    const margin = findings.find((f) => f.findingType === "MARGIN_EROSION")!;
    expect(margin.metadataJson.sku).toBe(EXPECTED.marginErosionSku);
    const metrics = margin.metadataJson.deterministicMetrics as Record<string, number>;
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
    expect(pricing.metadataJson.sku).toBe(EXPECTED.pricingOpportunitySku);
    expect(pricing.monthlyImpactCents).toBe(6300);
    expect(pricing.annualImpactCents).toBe(75600);

    const sub = findings.find((f) => f.findingType === "SUBSCRIPTION_CREEP")!;
    expect(sub.metadataJson.vendor).toBe(EXPECTED.subscription.merchant);
    expect(sub.monthlyImpactCents).toBe(5000);
    expect(sub.annualImpactCents).toBe(60000);
  });

  it("aggregates the expected recoverable value", async () => {
    const [inv] = await db().select().from(schema.investigations).where(eq(schema.investigations.id, investigationId));
    expect(inv.totalRecoveryAnnualCents).toBe(EXPECTED.totals.annualCents);
    expect(inv.totalRecoveryMonthlyCents).toBe(EXPECTED.totals.monthlyCents);
    expect((inv.metadataJson.externalIntel as { mode: string }).mode).toBe("fixture");
  });

  it("attaches evidence and a proposed recommendation to every finding", async () => {
    const findings = await findingsFor(investigationId);
    for (const f of findings) {
      const links = await db().select().from(schema.findingEvidence).where(eq(schema.findingEvidence.findingId, f.id));
      expect(links.length).toBeGreaterThan(0);
      const recs = await db().select().from(schema.recommendations).where(eq(schema.recommendations.findingId, f.id));
      expect(recs).toHaveLength(1);
      expect(recs[0].status).toBe("PROPOSED");
      expect(recs[0].estimatedAnnualImpactCents).toBe(f.annualImpactCents);
    }
    const margin = findings.find((f) => f.findingType === "MARGIN_EROSION")!;
    const [rec] = await db().select().from(schema.recommendations).where(eq(schema.recommendations.findingId, margin.id));
    expect(rec.actionType).toBe("CHANGE_PRICE");
    expect(rec.title).toBe("Raise price from $49 → $55");
  });

  it("stores traceable external price observations", async () => {
    const obs = await db().select().from(schema.externalPriceObservations).where(eq(schema.externalPriceObservations.investigationId, investigationId));
    expect(obs).toHaveLength(8);
    for (const o of obs) {
      expect(o.captureMode).toBe("fixture");
      expect(o.apifyRunId).toMatch(/^fixture:/);
      expect(o.sourceUrl).toMatch(/^http/);
      expect(o.rawPayloadJson).toHaveProperty("price");
    }
  });

  it("approves a recommendation and records the audit trail", async () => {
    const findings = await findingsFor(investigationId);
    const margin = findings.find((f) => f.findingType === "MARGIN_EROSION")!;
    const [rec] = await db().select().from(schema.recommendations).where(eq(schema.recommendations.findingId, margin.id));
    const approved = await approveRecommendation(rec.id, organizationId);
    expect(approved.status).toBe("READY_FOR_EXECUTION");
    expect(approved.approvedAt).toBeInstanceOf(Date);
    expect((approved.metadataJson.executionChecklist as unknown[]).length).toBeGreaterThan(0);

    const audit = await db().select().from(schema.auditLog).where(eq(schema.auditLog.entityId, rec.id));
    expect(audit.map((a) => a.action).sort()).toEqual(["recommendation.approved", "recommendation.ready_for_execution"]);

    await expect(approveRecommendation(rec.id, organizationId)).rejects.toThrow(/already/);
  });

  it("rejects a recommendation", async () => {
    const findings = await findingsFor(investigationId);
    const sub = findings.find((f) => f.findingType === "SUBSCRIPTION_CREEP")!;
    const [rec] = await db().select().from(schema.recommendations).where(eq(schema.recommendations.findingId, sub.id));
    const rejected = await rejectRecommendation(rec.id, organizationId, "Plan upgrade was intentional");
    expect(rejected.status).toBe("REJECTED");
    const [finding] = await db().select().from(schema.findings).where(eq(schema.findings.id, sub.id));
    expect(finding.status).toBe("DISMISSED");
  });

  it("carries decisions forward into the next investigation", async () => {
    const nextId = await runInvestigation(organizationId, "MANUAL", { stepDelayMs: 0, provider: null, externalIntelMode: "fixture" });
    const findings = await findingsFor(nextId);
    const margin = findings.find((f) => f.findingType === "MARGIN_EROSION")!;
    const [rec] = await db().select().from(schema.recommendations).where(eq(schema.recommendations.findingId, margin.id));
    expect(rec.status).toBe("READY_FOR_EXECUTION");
    expect(margin.status).toBe("ACTIONED");
    const sub = findings.find((f) => f.findingType === "SUBSCRIPTION_CREEP")!;
    expect(sub.status).toBe("DISMISSED");
  });
});

describe("degraded modes", () => {
  it("still completes when live Apify has no credentials (falls back to the labeled demo dataset)", async () => {
    const id = await runInvestigation(organizationId, "MANUAL", { stepDelayMs: 0, provider: null, externalIntelMode: "live" });
    const [inv] = await db().select().from(schema.investigations).where(eq(schema.investigations.id, id));
    expect(inv.status).toBe("COMPLETED");
    const intel = inv.metadataJson.externalIntel as { mode: string; fallbackReason: string };
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
    const id = await runInvestigation(organizationId, "MANUAL", { stepDelayMs: 0, provider: broken, externalIntelMode: "fixture" });
    const [inv] = await db().select().from(schema.investigations).where(eq(schema.investigations.id, id));
    expect(inv.status).toBe("COMPLETED");
    expect(inv.totalRecoveryAnnualCents).toBe(EXPECTED.totals.annualCents);
    const findings = await findingsFor(id);
    expect(findings).toHaveLength(4);
    expect(findings.every((f) => f.metadataJson.narrativeSource === "deterministic")).toBe(true);
  });

  it("uses a valid model narrative but keeps deterministic numbers authoritative", async () => {
    const calls: string[] = [];
    const fake: LLMProvider = {
      name: "fake",
      model: "fake-1",
      investigate: async (ctx) => ({
        productsToResearch: [...ctx.researchCandidates.map((c) => c.productId), "not-a-real-product"],
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
    const id = await runInvestigation(organizationId, "MANUAL", { stepDelayMs: 0, provider: fake, externalIntelMode: "fixture" });
    const findings = await findingsFor(id);
    expect(calls).toHaveLength(4);
    expect(findings.every((f) => f.metadataJson.narrativeSource === "model")).toBe(true);
    const margin = findings.find((f) => f.findingType === "MARGIN_EROSION")!;
    // Model confidence (0.99) is clamped to deterministic + 0.05.
    expect(margin.confidence).toBe(0.97);
    expect(margin.annualImpactCents).toBe(187200);
  });
});
