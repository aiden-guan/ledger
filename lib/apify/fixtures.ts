import { COMPETITORS, MARKET_LISTINGS } from "@/lib/demo/catalog";
import type { ActorInput, ActorOutputItem } from "./schemas";

export const FIXTURE_RUN_PREFIX = "fixture";

/**
 * Seeded demo dataset returned in fixture mode or when live scraping fails. Items have
 * exactly the shape the Actor writes to its dataset, so normalization is identical.
 * They are always stored with capture_mode = "fixture" and labeled "Demo dataset" in the UI.
 */
export function fixtureActorItems(
  input: ActorInput,
  skuByProductId: Map<string, string>,
  capturedAt: Date = new Date(),
): ActorOutputItem[] {
  const items: ActorOutputItem[] = [];
  for (const request of input.products) {
    const sku = skuByProductId.get(request.internalProductId);
    const competitor = COMPETITORS.find((c) => c.name === request.competitor);
    const listing = MARKET_LISTINGS.find((l) => l.sku === sku && l.competitorSlug === competitor?.slug);
    if (!listing) continue;
    items.push({
      internalProductId: request.internalProductId,
      competitor: request.competitor,
      productName: listing.externalName,
      price: listing.priceCents / 100,
      currency: "USD",
      availability: listing.availability,
      url: request.url,
      capturedAt: capturedAt.toISOString(),
      extractionMethod: "fixture",
    });
  }
  return items;
}
