/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "@/convex/schema";
import { api } from "@/convex/_generated/api";
import { resetDemoData, type EngineCtx } from "@/convex/engine";
import * as pricing from "@/lib/apify/competitor-pricing";
import { resetEnvCache } from "@/lib/env";
import { resolveCarryForward } from "@/lib/investigation/store";

const modules = import.meta.glob("../../convex/**/*.*s");

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "true");
  vi.stubEnv("APIFY_TOKEN", "test-only-token");
  vi.stubEnv("APIFY_ACTOR_ID", "test/retail-prices");
  resetEnvCache();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  resetEnvCache();
});

describe("real market checks", () => {
  it("feeds live evidence into a price test, retains provenance and preserves the last capture on failure", async () => {
    const t = convexTest(schema, modules);
    await resetDemoData({
      runQuery: t.query,
      runMutation: t.mutation,
    } as unknown as EngineCtx);
    vi.spyOn(pricing, "getCompetitorPricing").mockImplementation(
      async (listings) => ({
        mode: "live",
        requestedMode: "live",
        runId: "LiveRun1234567890",
        datasetId: "Dataset1234567890",
        actorId: "test/retail-prices",
        warnings: [],
        fallbackReason: null,
        durationMs: 2000,
        listingsRequested: listings.length,
        observations: listings.map((l) => ({
          productId: l.productId,
          competitorId: l.competitorId,
          competitorName: l.competitorName,
          priceCents: 9995,
          currency: "USD",
          productUrl: l.url,
          sourceUrl: l.url,
          capturedAt: new Date(),
          availability: "in_stock",
          captureMode: "live",
          apifyRunId: "LiveRun1234567890",
          externalName: "Gregory Nano 24",
          rawPayload: { extractionMethod: "json-ld" },
        })),
      }),
    );
    vi.useFakeTimers();
    const id = await t.mutation(api.market.start, {});
    expect(await t.mutation(api.market.start, {})).toBe(id);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const first = await t.query(api.market.get, {});
    expect(vi.mocked(pricing.getCompetitorPricing).mock.calls[0][0].every((l) => l.expectedNameTokens?.join(" ") === "nano 24")).toBe(true);
    expect(first?.latest?.status).toBe("COMPLETED");
    expect(first?.quotes).toHaveLength(3);
    expect(first?.capture?.runId).toBe("LiveRun1234567890");
    expect(first?.opportunity).toMatchObject({
      medianCents: 9995,
      recommendedCents: 8900,
      annualCents: 108000,
    });
    const finding = await t.query(api.findings.detail, {
      id: first!.opportunity!.findingId,
    });
    expect(finding?.recommendation?.metadata.toPriceCents).toBe(8900);
    expect(
      finding?.evidence.filter((e) => e.sourceType === "apify"),
    ).toHaveLength(3);
    await expect(t.mutation(api.market.start, {})).rejects.toThrow(/minute/);
    vi.advanceTimersByTime(61_000);
    vi.mocked(pricing.getCompetitorPricing).mockRejectedValueOnce(
      new Error("Retailer request failed"),
    );
    await t.mutation(api.market.start, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const failed = await t.query(api.market.get, {});
    expect(failed?.latest?.status).toBe("FAILED");
    expect(failed?.capture?.runId).toBe(first?.capture?.runId);
    expect(failed?.quotes).toEqual(first?.quotes);
  });

  it("fails closed rather than inventing live retail quotes", async () => {
    await expect(
      pricing.getCompetitorPricing(
        [
          {
            productId: "p",
            productSku: "sku",
            competitorId: "c",
            competitorName: "retailer",
            url: "https://example.com/product",
          },
        ],
        { mode: "live", timeoutMs: 100, allowFixtureFallback: false },
      ),
    ).rejects.toThrow(/not configured/);
  });

  it("requires fresh approval when refreshed market evidence changes the proposed price", () => {
    const prior = {
      status: "READY_FOR_EXECUTION" as const,
      approvedAt: 100,
      rejectedAt: null,
      metadata: { fromPriceCents: 7900, toPriceCents: 8600 },
    };
    expect(
      resolveCarryForward(true, prior, {
        fromPriceCents: 7900,
        toPriceCents: 8900,
      }).recommendationStatus,
    ).toBe("PROPOSED");
    expect(
      resolveCarryForward(true, prior, {
        fromPriceCents: 7900,
        toPriceCents: 8600,
      }).recommendationStatus,
    ).toBe("READY_FOR_EXECUTION");
  });
});
