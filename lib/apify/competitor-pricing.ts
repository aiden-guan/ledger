import { fromDecimal } from "@/lib/finance/money";
import type { PriceObservation } from "@/lib/finance/types";
import { logger, withTimeout } from "@/lib/utils/logger";
import { checkPublicUrl } from "@/lib/utils/url-safety";
import {
  abortActorRun,
  createApifyClient,
  fetchActorDataset,
  getActorRun,
  isTerminal,
  runCompetitorPricingActor,
  type ActorRunStatus,
} from "./client";
import { FIXTURE_RUN_PREFIX, fixtureActorItems } from "./fixtures";
import { ActorInputSchema, type ActorInput, type ActorOutputItem } from "./schemas";

export interface ListingRequest {
  productId: string;
  productSku: string;
  competitorId: string;
  competitorName: string;
  url: string;
}

export interface NormalizedObservation extends PriceObservation {
  externalName: string | null;
  sourceUrl: string;
  rawPayload: Record<string, unknown>;
}

export interface CompetitorPricingResult {
  /** The mode that actually produced the observations. */
  mode: "live" | "fixture";
  requestedMode: "live" | "fixture";
  runId: string;
  observations: NormalizedObservation[];
  warnings: string[];
  /** Why live mode fell back to the demo dataset, if it did. */
  fallbackReason: string | null;
  listingsRequested: number;
  durationMs: number;
}

export interface CompetitorPricingOptions {
  mode: "live" | "fixture";
  apifyToken?: string;
  actorId?: string;
  timeoutMs: number;
  pollIntervalMs?: number;
  onProgress?: (update: { status: ActorRunStatus | "FIXTURE"; message: string; runId?: string }) => Promise<void> | void;
}

/**
 * Maps validated Actor records onto LedgerLens price observations, preserving the
 * originating URL, capture timestamp, Actor run id and raw payload for traceability.
 */
export function normalizeExternalPrices(
  items: ActorOutputItem[],
  rawItems: Record<string, unknown>[],
  listings: ListingRequest[],
  context: { runId: string; captureMode: "live" | "fixture" },
): { observations: NormalizedObservation[]; unmatched: number } {
  const observations: NormalizedObservation[] = [];
  let unmatched = 0;
  items.forEach((item, index) => {
    const listing =
      listings.find((l) => l.productId === item.internalProductId && l.competitorName === item.competitor) ??
      listings.find((l) => l.productId === item.internalProductId && l.url === item.url);
    if (!listing) {
      unmatched += 1;
      return;
    }
    observations.push({
      productId: listing.productId,
      competitorId: listing.competitorId,
      competitorName: listing.competitorName,
      priceCents: fromDecimal(item.price),
      currency: item.currency.toUpperCase(),
      productUrl: listing.url,
      sourceUrl: item.url,
      capturedAt: new Date(item.capturedAt),
      availability: item.availability ?? null,
      captureMode: context.captureMode,
      apifyRunId: context.runId,
      externalName: item.productName ?? null,
      rawPayload: rawItems[index] ?? (item as unknown as Record<string, unknown>),
    });
  });
  return { observations, unmatched };
}

export function buildActorInput(listings: ListingRequest[]): ActorInput {
  return ActorInputSchema.parse({
    products: listings.map((l) => ({ internalProductId: l.productId, competitor: l.competitorName, url: l.url })),
  });
}

function fixtureResult(
  listings: ListingRequest[],
  requestedMode: "live" | "fixture",
  warnings: string[],
  fallbackReason: string | null,
  started: number,
): CompetitorPricingResult {
  const input = buildActorInput(listings);
  const skuByProductId = new Map(listings.map((l) => [l.productId, l.productSku]));
  const runId = `${FIXTURE_RUN_PREFIX}:${new Date().toISOString().slice(0, 10)}`;
  const items = fixtureActorItems(input, skuByProductId);
  const { observations } = normalizeExternalPrices(items, items as unknown as Record<string, unknown>[], listings, {
    runId,
    captureMode: "fixture",
  });
  return {
    mode: "fixture",
    requestedMode,
    runId,
    observations,
    warnings,
    fallbackReason,
    listingsRequested: listings.length,
    durationMs: Date.now() - started,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getCompetitorPricing(
  listings: ListingRequest[],
  options: CompetitorPricingOptions,
): Promise<CompetitorPricingResult> {
  const started = Date.now();
  const warnings: string[] = [];
  if (listings.length === 0) {
    return { mode: options.mode, requestedMode: options.mode, runId: "none", observations: [], warnings, fallbackReason: null, listingsRequested: 0, durationMs: 0 };
  }

  if (options.mode === "fixture") {
    await options.onProgress?.({ status: "FIXTURE", message: `Loading demo dataset for ${listings.length} competitor listings` });
    return fixtureResult(listings, "fixture", warnings, null, started);
  }

  const fallback = async (reason: string) => {
    logger.warn("apify_fallback", { reason });
    await options.onProgress?.({ status: "FIXTURE", message: `Live market data unavailable (${reason}). Using labeled demo dataset.` });
    return fixtureResult(listings, "live", warnings, reason, started);
  };

  if (!options.apifyToken) return fallback("APIFY_TOKEN is not configured");
  if (!options.actorId) return fallback("APIFY_ACTOR_ID is not configured");

  // SSRF guard: only public http(s) URLs are handed to scraping infrastructure.
  const safe = listings.filter((l) => {
    const check = checkPublicUrl(l.url);
    if (!check.ok) warnings.push(`Skipped ${l.competitorName} listing: ${check.reason}`);
    return check.ok;
  });
  if (safe.length === 0) return fallback("no listing URLs passed the URL safety policy");

  const client = createApifyClient(options.apifyToken);
  let runId: string | null = null;
  try {
    const timeoutSecs = Math.max(30, Math.round(options.timeoutMs / 1000));
    const run = await withTimeout(
      runCompetitorPricingActor(client, options.actorId, buildActorInput(safe), { timeoutSecs }),
      15_000,
      "Starting the Apify Actor",
    );
    runId = run.id;
    await options.onProgress?.({ status: run.status, runId, message: `Apify run ${run.id} started for ${safe.length} pages` });

    let current = run;
    let lastStatus = run.status;
    while (!isTerminal(current.status)) {
      if (Date.now() - started > options.timeoutMs) {
        await abortActorRun(client, current.id).catch(() => {});
        return fallback(`Actor run exceeded ${Math.round(options.timeoutMs / 1000)}s`);
      }
      await sleep(options.pollIntervalMs ?? 2000);
      current = await getActorRun(client, current.id);
      if (current.status !== lastStatus) {
        lastStatus = current.status;
        await options.onProgress?.({ status: current.status, runId, message: `Apify run ${current.status.toLowerCase()}` });
      }
    }
    if (current.status !== "SUCCEEDED") return fallback(`Actor run ${current.status.toLowerCase()}`);

    const dataset = await fetchActorDataset(client, current.defaultDatasetId);
    for (const r of dataset.rejected) warnings.push(`Rejected malformed Actor record #${r.index}: ${r.reason}`);
    const { observations, unmatched } = normalizeExternalPrices(dataset.items, dataset.raw, safe, {
      runId: current.id,
      captureMode: "live",
    });
    if (unmatched) warnings.push(`${unmatched} Actor records did not match a requested listing`);
    if (observations.length === 0) return fallback("extraction returned no prices");
    if (observations.length < safe.length) {
      warnings.push(`Extracted prices for ${observations.length} of ${safe.length} listings`);
    }
    return {
      mode: "live",
      requestedMode: "live",
      runId: current.id,
      observations,
      warnings,
      fallbackReason: null,
      listingsRequested: listings.length,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    if (runId) await abortActorRun(client, runId).catch(() => {});
    return fallback(error instanceof Error ? error.message : "unknown Apify error");
  }
}
