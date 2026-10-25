import { v } from "convex/values";
import { getEnv } from "../lib/env";
import {
  RETAIL_PRODUCT_SKU,
  RETAIL_SOURCES,
} from "../lib/apify/retail-sources";
import type { ListingRequest } from "../lib/apify/competitor-pricing";
import type { MarketCheckData, MarketQuote } from "../lib/views/market";
import { createInvestigationRecord } from "./data";
import { apiError, currentOrganization } from "./model";
import { internal } from "./_generated/api";
import { internalQuery, mutation, query } from "./_generated/server";

const running = (status: string) =>
  status !== "COMPLETED" && status !== "FAILED";
const maybeString = v.union(v.string(), v.null());

/** Fixed, bounded demo research. Clients cannot supply arbitrary URLs or Actor input. */
export const start = mutation({
  args: {},
  returns: v.id("investigations"),
  handler: async (ctx) => {
    const env = getEnv();
    const org = await currentOrganization(ctx);
    if (!org || !org.demoMode || !env.DEMO_MODE)
      throw apiError(
        "FORBIDDEN",
        "Market check is available for the sample business only.",
      );
    if (!env.APIFY_TOKEN || !env.APIFY_ACTOR_ID)
      throw apiError(
        "CONFLICT",
        "Connect the Apify Actor before checking retailer prices.",
      );
    const last = await ctx.db
      .query("investigations")
      .withIndex("by_org_market", (q) =>
        q.eq("organizationId", org._id).eq("marketProfile", "retail"),
      )
      .order("desc")
      .first();
    if (
      last &&
      running(last.status) &&
      Date.now() - last.startedAt < 10 * 60_000
    )
      return last._id;
    if (last && Date.now() - last.startedAt < 60_000)
      throw apiError("CONFLICT", "Wait a minute between market checks.");
    const product = (
      await ctx.db
        .query("products")
        .withIndex("by_org", (q) => q.eq("organizationId", org._id))
        .take(50)
    ).find((p) => p.sku === RETAIL_PRODUCT_SKU);
    if (!product)
      throw apiError(
        "NOT_FOUND",
        "Load the sample company before checking prices.",
      );
    const created = await createInvestigationRecord(ctx, org._id, "MANUAL");
    if (created.alreadyRunning)
      throw apiError(
        "CONFLICT",
        "An investigation is running. Let it finish before checking the market.",
      );
    const competitors = await ctx.db
      .query("competitors")
      .withIndex("by_org", (q) => q.eq("organizationId", org._id))
      .take(50);
    const listings: ListingRequest[] = [];
    for (const source of RETAIL_SOURCES) {
      const competitorId =
        competitors.find((c) => c.name === source.competitor)?._id ??
        (await ctx.db.insert("competitors", {
          organizationId: org._id,
          name: source.competitor,
          domain: new URL(source.url).hostname,
        }));
      listings.push({
        productId: product._id,
        productSku: product.sku,
        competitorId,
        competitorName: source.competitor,
        url: source.url,
        expectedNameTokens: ["nano", "24"],
      });
    }
    await ctx.db.patch(created.id, {
      marketProfile: "retail",
      metadata: { marketListings: listings },
    });
    await ctx.scheduler.runAfter(0, internal.engine.runMarketCheck, {
      investigationId: created.id,
    });
    return created.id;
  },
});

export const researchInput = internalQuery({
  args: { investigationId: v.id("investigations") },
  returns: v.array(
    v.object({
      productId: v.string(),
      productSku: v.string(),
      competitorId: v.string(),
      competitorName: v.string(),
      url: v.string(),
      expectedNameTokens: v.optional(v.array(v.string())),
    }),
  ),
  handler: async (ctx, { investigationId }): Promise<ListingRequest[]> => {
    const inv = await ctx.db.get(investigationId);
    if (!inv || inv.marketProfile !== "retail")
      throw new Error("Not a retail market check");
    const listings = inv.metadata?.marketListings;
    if (!Array.isArray(listings) || listings.length !== RETAIL_SOURCES.length)
      throw new Error("Missing curated retailer inputs");
    return listings;
  },
});

/** Last completed real crawl stays visible while a new attempt runs or fails. */
export const get = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      organization: v.object({ name: v.string(), demoMode: v.boolean() }),
      actorId: maybeString,
      configured: v.boolean(),
      latest: v.union(
        v.null(),
        v.object({
          id: v.string(),
          status: v.string(),
          startedAt: v.string(),
          error: maybeString,
        }),
      ),
      progress: v.array(
        v.object({
          message: v.string(),
          status: v.string(),
          runId: maybeString,
        }),
      ),
      capture: v.union(
        v.null(),
        v.object({
          at: v.string(),
          runId: v.string(),
          datasetId: maybeString,
          durationMs: v.number(),
          requested: v.number(),
          warnings: v.array(v.string()),
        }),
      ),
      quotes: v.array(
        v.object({
          retailer: v.string(),
          name: maybeString,
          url: v.string(),
          priceCents: v.number(),
          currency: v.string(),
          availability: maybeString,
          capturedAt: v.string(),
          method: maybeString,
          previousPriceCents: v.union(v.number(), v.null()),
          eligible: v.boolean(),
        }),
      ),
      product: v.union(
        v.null(),
        v.object({ name: v.string(), sku: v.string(), priceCents: v.number() }),
      ),
      opportunity: v.union(
        v.null(),
        v.object({
          findingId: v.string(),
          medianCents: v.number(),
          recommendedCents: v.number(),
          monthlyCents: v.number(),
          annualCents: v.number(),
          monthlyUnits: v.number(),
          eligibleQuotes: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx): Promise<MarketCheckData | null> => {
    const org = await currentOrganization(ctx);
    if (!org) return null;
    const env = getEnv();
    const [latest, completed, products] = await Promise.all([
      ctx.db
        .query("investigations")
        .withIndex("by_org_market", (q) =>
          q.eq("organizationId", org._id).eq("marketProfile", "retail"),
        )
        .order("desc")
        .first(),
      ctx.db
        .query("investigations")
        .withIndex("by_org_market_status", (q) =>
          q
            .eq("organizationId", org._id)
            .eq("marketProfile", "retail")
            .eq("status", "COMPLETED"),
        )
        .order("desc")
        .take(2),
      ctx.db
        .query("products")
        .withIndex("by_org", (q) => q.eq("organizationId", org._id))
        .take(50),
    ]);
    const product = products.find((p) => p.sku === RETAIL_PRODUCT_SKU);
    const result: MarketCheckData = {
      organization: { name: org.name, demoMode: org.demoMode },
      actorId: env.APIFY_ACTOR_ID ?? null,
      configured: Boolean(env.APIFY_TOKEN && env.APIFY_ACTOR_ID),
      latest: latest
        ? {
            id: latest._id,
            status: latest.status,
            startedAt: new Date(latest.startedAt).toISOString(),
            error: latest.errorMessage,
          }
        : null,
      progress: [],
      capture: null,
      quotes: [],
      product: product
        ? {
            name: product.name,
            sku: product.sku,
            priceCents: product.sellingPriceCents,
          }
        : null,
      opportunity: null,
    };
    if (latest) {
      const events = await ctx.db
        .query("investigationEvents")
        .withIndex("by_investigation", (q) =>
          q.eq("investigationId", latest._id),
        )
        .take(150);
      result.progress = events
        .filter((e) => e.metadata?.step === "market")
        .map((e) => ({
          message: e.message,
          status: String(e.metadata.status),
          runId: typeof e.metadata.runId === "string" ? e.metadata.runId : null,
        }));
    }
    const successful = completed[0];
    if (!successful) return result;
    const [observations, previous, findings] = await Promise.all([
      ctx.db
        .query("externalPriceObservations")
        .withIndex("by_investigation", (q) =>
          q.eq("investigationId", successful._id),
        )
        .take(200),
      completed[1]
        ? ctx.db
            .query("externalPriceObservations")
            .withIndex("by_investigation", (q) =>
              q.eq("investigationId", completed[1]._id),
            )
            .take(200)
        : Promise.resolve([]),
      ctx.db
        .query("findings")
        .withIndex("by_investigation", (q) =>
          q.eq("investigationId", successful._id),
        )
        .take(30),
    ]);
    const intel = successful.metadata?.externalIntel;
    if (!intel || intel.mode !== "live" || intel.sandbox || !intel.runId)
      return result;
    result.capture = {
      at: new Date(
        successful.completedAt ?? successful.startedAt,
      ).toISOString(),
      runId: intel.runId,
      datasetId: intel.datasetId ?? null,
      durationMs: intel.durationMs ?? 0,
      requested: intel.listingsRequested ?? RETAIL_SOURCES.length,
      warnings: successful.metadata?.warnings ?? [],
    };
    result.quotes = observations
      .filter((o) => o.captureMode === "live")
      .map(
        (o): MarketQuote => ({
          retailer:
            RETAIL_SOURCES.find((s) => s.url === o.productUrl)?.competitor ??
            new URL(o.sourceUrl).hostname,
          name: o.externalName,
          url: o.sourceUrl,
          priceCents: o.priceCents,
          currency: o.currency,
          availability: o.availability,
          capturedAt: new Date(o.capturedAt).toISOString(),
          method:
            typeof o.rawPayload?.extractionMethod === "string"
              ? o.rawPayload.extractionMethod
              : null,
          previousPriceCents:
            previous.find(
              (p) =>
                p.productUrl === o.productUrl &&
                p.currency === o.currency &&
                p.captureMode === "live",
            )?.priceCents ?? null,
          eligible: o.currency === "USD" && o.availability !== "out_of_stock",
        }),
      );
    const finding = findings.find(
      (f) =>
        f.findingType === "PRICING_OPPORTUNITY" &&
        f.metadata?.sku === RETAIL_PRODUCT_SKU &&
        f.status !== "NEEDS_REVIEW",
    );
    if (finding) {
      const m = finding.metadata.deterministicMetrics;
      result.opportunity = {
        findingId: finding._id,
        medianCents: m.competitorMedianCents,
        recommendedCents: m.recommendedPriceCents,
        monthlyCents: finding.monthlyImpactCents,
        annualCents: finding.annualImpactCents,
        monthlyUnits: m.monthlyUnits,
        eligibleQuotes: m.competitorCount,
      };
    }
    return result;
  },
});
