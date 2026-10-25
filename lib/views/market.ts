export interface MarketQuote {
  retailer: string;
  name: string | null;
  url: string;
  priceCents: number;
  currency: string;
  availability: string | null;
  capturedAt: string;
  method: string | null;
  previousPriceCents: number | null;
  eligible: boolean;
}

export interface MarketCheckData {
  organization: { name: string; demoMode: boolean };
  actorId: string | null;
  configured: boolean;
  latest: {
    id: string;
    status: string;
    startedAt: string;
    error: string | null;
  } | null;
  progress: { message: string; status: string; runId: string | null }[];
  capture: {
    at: string;
    runId: string;
    datasetId: string | null;
    durationMs: number;
    requested: number;
    warnings: string[];
  } | null;
  quotes: MarketQuote[];
  product: { name: string; sku: string; priceCents: number } | null;
  opportunity: {
    findingId: string;
    medianCents: number;
    recommendedCents: number;
    monthlyCents: number;
    annualCents: number;
    monthlyUnits: number;
    eligibleQuotes: number;
  } | null;
}
