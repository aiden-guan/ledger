import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractProduct, parsePrice } from "../../apify/ledgerlens-competitor-pricing/src/extract.js";
import { checkPublicUrl } from "@/lib/utils/url-safety";
import { validateDatasetItems } from "@/lib/apify/client";
import { getCompetitorPricing, normalizeExternalPrices, type ListingRequest } from "@/lib/apify/competitor-pricing";

const listings: ListingRequest[] = [
  { productId: "p-alpine", productSku: "ALP-BTL-32", competitorId: "c1", competitorName: "Ridgeline Supply Co.", url: "https://shop.example.com/ridgeline/bottle" },
  { productId: "p-alpine", productSku: "ALP-BTL-32", competitorId: "c2", competitorName: "Northbound Outfitters", url: "https://shop.example.com/northbound/bottle" },
  { productId: "p-alpine", productSku: "ALP-BTL-32", competitorId: "c3", competitorName: "Granite Peak Gear", url: "https://shop.example.com/granite/bottle" },
];

describe("Actor price extraction", () => {
  it("reads schema.org JSON-LD offers", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "BreadcrumbList" },
        { "@type": "Product", name: "Ridgeline 32oz Bottle", offers: { "@type": "Offer", price: "59.00", priceCurrency: "USD", availability: "https://schema.org/InStock" } },
      ],
    })}</script></head><body><h1>Bottle</h1></body></html>`;
    expect(extractProduct(html)).toEqual({
      price: 59,
      currency: "USD",
      availability: "in_stock",
      productName: "Ridgeline 32oz Bottle",
      method: "json-ld",
    });
  });

  it("falls back to meta tags, microdata and selectors", () => {
    expect(extractProduct(`<meta property="product:price:amount" content="62.00"><meta property="product:price:currency" content="usd">`).price).toBe(62);
    expect(extractProduct(`<div itemscope itemtype="https://schema.org/Product"><span itemprop="name">Pack</span><span itemprop="price" content="96.00"></span></div>`)).toMatchObject({ price: 96, method: "microdata", productName: "Pack" });
    expect(extractProduct(`<h1>Thing</h1><span class="price">$1,059.99</span>`)).toMatchObject({ price: 1059.99, currency: "USD", method: "selector" });
  });

  it("returns no price rather than guessing", () => {
    expect(extractProduct("<html><h1>Sold out</h1></html>").price).toBeNull();
  });

  it("parses localized price strings", () => {
    expect(parsePrice("1.299,00 €")).toBe(1299);
    expect(parsePrice("59,95")).toBe(59.95);
    expect(parsePrice("$64")).toBe(64);
    expect(parsePrice("free")).toBeNull();
  });
});

describe("URL safety", () => {
  it.each([
    "http://localhost:3000/market/x",
    "http://127.0.0.1/admin",
    "http://10.0.0.5/",
    "http://172.16.4.1/",
    "http://192.168.1.10/",
    "http://169.254.169.254/latest/meta-data/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://[::1]/",
    "http://[fd00::1]/",
    "http://2130706433/",
    "file:///etc/passwd",
    "http://user:pass@example.com/",
    "http://printer.local/",
  ])("rejects %s", (url) => {
    expect(checkPublicUrl(url).ok).toBe(false);
  });

  it("accepts public https URLs", () => {
    expect(checkPublicUrl("https://www.example.com/products/bottle").ok).toBe(true);
  });
});

describe("Apify normalization", () => {
  it("validates dataset records and rejects malformed ones", () => {
    const result = validateDatasetItems([
      { internalProductId: "p-alpine", competitor: "Ridgeline Supply Co.", productName: "Bottle", price: 59, currency: "USD", availability: "in_stock", url: listings[0].url, capturedAt: "2026-10-18T10:00:00.000Z" },
      { internalProductId: "p-alpine", competitor: "Northbound Outfitters", price: "62", currency: "USD", url: listings[1].url, capturedAt: "2026-10-18T10:00:00.000Z" },
      { internalProductId: "p-alpine", competitor: "Granite Peak Gear", price: -1, currency: "USD", url: "not a url", capturedAt: "yesterday" },
    ]);
    expect(result.items).toHaveLength(1);
    expect(result.rejected.map((r) => r.index)).toEqual([1, 2]);
  });

  it("preserves source URL, capture time, run id and raw payload", () => {
    const raw = { internalProductId: "p-alpine", competitor: "Ridgeline Supply Co.", productName: "Bottle", price: 59.99, currency: "usd", availability: "in_stock" as const, url: listings[0].url, capturedAt: "2026-10-18T10:00:00.000Z" };
    const { observations, unmatched } = normalizeExternalPrices([raw], [raw], listings, { runId: "run-123", captureMode: "live" });
    expect(unmatched).toBe(0);
    expect(observations[0]).toMatchObject({
      productId: "p-alpine",
      competitorId: "c1",
      priceCents: 5999,
      currency: "USD",
      sourceUrl: listings[0].url,
      apifyRunId: "run-123",
      captureMode: "live",
      rawPayload: raw,
    });
    expect(observations[0].capturedAt.toISOString()).toBe("2026-10-18T10:00:00.000Z");
  });
});

const apifyMock = vi.hoisted(() => ({
  start: vi.fn(),
  get: vi.fn(),
  abort: vi.fn(),
  listItems: vi.fn(),
}));

vi.mock("apify-client", () => ({
  ApifyClient: class {
    actor() {
      return { start: apifyMock.start };
    }
    run() {
      return { get: apifyMock.get, abort: apifyMock.abort };
    }
    dataset() {
      return { listItems: apifyMock.listItems };
    }
  },
}));

describe("competitor pricing modes", () => {
  beforeEach(() => {
    Object.values(apifyMock).forEach((m) => m.mockReset());
  });

  it("fixture mode returns the labeled demo dataset", async () => {
    const result = await getCompetitorPricing(listings, { mode: "fixture", timeoutMs: 1000 });
    expect(result.mode).toBe("fixture");
    expect(result.observations.map((o) => o.priceCents)).toEqual([5900, 6200, 6400]);
    expect(result.observations.every((o) => o.captureMode === "fixture" && o.apifyRunId?.startsWith("fixture:"))).toBe(true);
  });

  it("live mode starts the Actor, polls the run and validates the dataset", async () => {
    apifyMock.start.mockResolvedValue({ id: "run-1", status: "RUNNING", defaultDatasetId: "ds-1" });
    apifyMock.get.mockResolvedValueOnce({ id: "run-1", status: "RUNNING", defaultDatasetId: "ds-1" });
    apifyMock.get.mockResolvedValueOnce({ id: "run-1", status: "SUCCEEDED", defaultDatasetId: "ds-1" });
    apifyMock.listItems.mockResolvedValue({
      items: listings.map((l, i) => ({
        internalProductId: l.productId,
        competitor: l.competitorName,
        productName: `Item ${i}`,
        price: [59, 62, 64][i],
        currency: "USD",
        availability: "in_stock",
        url: l.url,
        capturedAt: "2026-10-18T10:00:00.000Z",
      })),
    });
    const progress: string[] = [];
    const result = await getCompetitorPricing(listings, {
      mode: "live",
      apifyToken: "test-token",
      actorId: "user/ledgerlens-competitor-pricing",
      timeoutMs: 10_000,
      pollIntervalMs: 1,
      onProgress: (u) => {
        progress.push(u.status);
      },
    });
    expect(result.mode).toBe("live");
    expect(result.runId).toBe("run-1");
    expect(result.observations.map((o) => o.priceCents)).toEqual([5900, 6200, 6400]);
    expect(result.observations.every((o) => o.captureMode === "live" && o.apifyRunId === "run-1")).toBe(true);
    expect(progress).toContain("SUCCEEDED");

    // Live and fixture observations have the same shape.
    const fixture = await getCompetitorPricing(listings, { mode: "fixture", timeoutMs: 1000 });
    expect(Object.keys(result.observations[0]).sort()).toEqual(Object.keys(fixture.observations[0]).sort());
  });

  it("falls back to fixtures when the token is missing", async () => {
    const result = await getCompetitorPricing(listings, { mode: "live", timeoutMs: 1000 });
    expect(result.mode).toBe("fixture");
    expect(result.fallbackReason).toMatch(/APIFY_TOKEN/);
    expect(apifyMock.start).not.toHaveBeenCalled();
  });

  it("falls back when the Actor fails", async () => {
    apifyMock.start.mockResolvedValue({ id: "run-2", status: "RUNNING", defaultDatasetId: "ds-2" });
    apifyMock.get.mockResolvedValue({ id: "run-2", status: "FAILED", defaultDatasetId: "ds-2" });
    const result = await getCompetitorPricing(listings, { mode: "live", apifyToken: "t", actorId: "a", timeoutMs: 5000, pollIntervalMs: 1 });
    expect(result.mode).toBe("fixture");
    expect(result.fallbackReason).toMatch(/failed/);
  });

  it("falls back when extraction returns nothing", async () => {
    apifyMock.start.mockResolvedValue({ id: "run-3", status: "SUCCEEDED", defaultDatasetId: "ds-3" });
    apifyMock.listItems.mockResolvedValue({ items: [] });
    const result = await getCompetitorPricing(listings, { mode: "live", apifyToken: "t", actorId: "a", timeoutMs: 5000, pollIntervalMs: 1 });
    expect(result.mode).toBe("fixture");
    expect(result.fallbackReason).toMatch(/no prices/);
  });

  it("aborts and falls back when the run exceeds the timeout", async () => {
    apifyMock.start.mockResolvedValue({ id: "run-4", status: "RUNNING", defaultDatasetId: "ds-4" });
    apifyMock.get.mockResolvedValue({ id: "run-4", status: "RUNNING", defaultDatasetId: "ds-4" });
    apifyMock.abort.mockResolvedValue({});
    const result = await getCompetitorPricing(listings, { mode: "live", apifyToken: "t", actorId: "a", timeoutMs: 30, pollIntervalMs: 10 });
    expect(result.mode).toBe("fixture");
    expect(result.fallbackReason).toMatch(/exceeded/);
    expect(apifyMock.abort).toHaveBeenCalled();
  });

  it("never sends private URLs to the Actor", async () => {
    const unsafe = listings.map((l) => ({ ...l, url: l.url.replace("https://shop.example.com", "http://localhost:3000") }));
    const result = await getCompetitorPricing(unsafe, { mode: "live", apifyToken: "t", actorId: "a", timeoutMs: 1000 });
    expect(apifyMock.start).not.toHaveBeenCalled();
    expect(result.mode).toBe("fixture");
    expect(result.warnings.length).toBe(3);
  });
});

describe("sandbox storefront detection", () => {
  it("identifies the demo's own storefront pages so they are never labeled as market data", async () => {
    const { isSandboxListingUrl } = await import("@/lib/demo/catalog");
    expect(isSandboxListingUrl("https://ledgerlens.example/market/ridgeline-supply/alpine-insulated-bottle")).toBe(true);
    expect(isSandboxListingUrl("https://ledgerlens.example/market/ridgeline-supply/unknown-product")).toBe(false);
    expect(isSandboxListingUrl("https://shop.example/products/alpine-bottle")).toBe(false);
    expect(isSandboxListingUrl("not a url")).toBe(false);
  });
});
