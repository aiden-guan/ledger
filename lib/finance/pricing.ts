import { percentChange, roundCents, type Cents } from "./money";
import type { PriceObservation } from "./types";

export interface CompetitorStats {
  count: number;
  medianCents: Cents;
  minCents: Cents;
  maxCents: Cents;
}

export function calculateCompetitorMedian(pricesCents: Cents[]): Cents {
  if (pricesCents.length === 0) throw new Error("Cannot compute a median of zero prices");
  const sorted = [...pricesCents].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : roundCents((sorted[mid - 1] + sorted[mid]) / 2);
}

export function competitorStats(pricesCents: Cents[]): CompetitorStats {
  return {
    count: pricesCents.length,
    medianCents: calculateCompetitorMedian(pricesCents),
    minCents: Math.min(...pricesCents),
    maxCents: Math.max(...pricesCents),
  };
}

export interface PricingConfig {
  minObservations: number;
  /** Own price must sit at least this far below the median to count as an opportunity. */
  minGapPercent: number;
  medianFactor: number;
  maxIncreaseFactor: number;
}

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  minObservations: 2,
  minGapPercent: 10,
  medianFactor: 0.9,
  maxIncreaseFactor: 1.15,
};

/**
 * Conservative suggested price: min(median * 0.90, current * 1.15), rounded down to a
 * whole dollar so the recommendation never overshoots the formula.
 */
export function recommendPrice(currentCents: Cents, medianCents: Cents, config: PricingConfig = DEFAULT_PRICING_CONFIG): Cents {
  const raw = Math.min(medianCents * config.medianFactor, currentCents * config.maxIncreaseFactor);
  return Math.floor(Math.round(raw) / 100) * 100;
}

export interface PricingOpportunity {
  productId: string;
  currentPriceCents: Cents;
  stats: CompetitorStats;
  priceDeltaCents: Cents;
  /** How far below the median the current price sits, as a positive percent. */
  percentBelowMedian: number;
  recommendedPriceCents: Cents;
  priceIncreaseCents: Cents;
  monthlyUnits: number;
  monthlyUpsideCents: Cents;
  annualUpsideCents: Cents;
  observations: PriceObservation[];
}

export function calculatePricingOpportunity(
  productId: string,
  currentPriceCents: Cents,
  observations: PriceObservation[],
  unitsTrailing90Days: number,
  config: PricingConfig = DEFAULT_PRICING_CONFIG,
): PricingOpportunity | null {
  // Every product in this ledger is denominated in USD. Foreign currency, stale quotes,
  // unavailable listings and duplicate URLs cannot establish a pricing opportunity.
  const latest = new Map<string, PriceObservation>();
  const newestCapture = Math.max(0, ...observations.map((o) => o.capturedAt.getTime()));
  for (const o of observations) {
    if (o.productId !== productId || !Number.isSafeInteger(o.priceCents) || o.priceCents <= 0 || o.currency !== "USD" || o.availability === "out_of_stock") continue;
    if (newestCapture - o.capturedAt.getTime() > 24 * 60 * 60 * 1000) continue;
    const key = o.productUrl;
    if (!latest.has(key) || latest.get(key)!.capturedAt < o.capturedAt) latest.set(key, o);
  }
  const usable = [...latest.values()];
  if (usable.length < config.minObservations) return null;

  const stats = competitorStats(usable.map((o) => o.priceCents));
  const percentBelowMedian = Number((-percentChange(stats.medianCents, currentPriceCents)).toFixed(1));
  if (percentBelowMedian < config.minGapPercent) return null;

  const recommended = recommendPrice(currentPriceCents, stats.medianCents, config);
  const increase = recommended - currentPriceCents;
  if (increase <= 0) return null;

  return {
    productId,
    currentPriceCents,
    stats,
    priceDeltaCents: stats.medianCents - currentPriceCents,
    percentBelowMedian,
    recommendedPriceCents: recommended,
    priceIncreaseCents: increase,
    monthlyUnits: Number((unitsTrailing90Days / 3).toFixed(2)),
    monthlyUpsideCents: roundCents((increase * unitsTrailing90Days) / 3),
    annualUpsideCents: roundCents(increase * unitsTrailing90Days * 4),
    observations: usable,
  };
}
