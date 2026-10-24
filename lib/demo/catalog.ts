/**
 * Static definition of the Acme Outdoor Co. demo company. The seed generator turns
 * this into six months of sales, supplier costs and bank transactions. Values that
 * drive the four intentional findings are fixed (not random) so tests can assert them.
 */

export const DEMO_ORG = {
  slug: "acme-outdoor",
  name: "Acme Outdoor Co.",
  industry: "E-commerce: outdoor gear",
  currency: "USD",
  /** Bank balance before the first seeded transaction. */
  openingBalanceCents: 1_150_000,
} as const;

export interface CatalogProduct {
  sku: string;
  slug: string;
  name: string;
  category: string;
  priceCents: number;
  costCents: number;
  supplier: string;
  /** Units per 30 days. */
  monthlyUnits: number;
  /** Optional mid-period supplier cost change. */
  costChange?: { daysBeforeAnchor: number; newCostCents: number };
}

export const DEMO_DAYS = 182;

export const PRODUCTS: CatalogProduct[] = [
  {
    sku: "ALP-BTL-32",
    slug: "alpine-insulated-bottle",
    name: "Alpine Insulated Bottle 32oz",
    category: "Hydration",
    priceCents: 4900,
    costCents: 2200,
    supplier: "Cascade Drinkware Co.",
    monthlyUnits: 26,
    // Finding B: supplier raised unit cost $22 -> $29 while retail stayed $49.
    costChange: { daysBeforeAnchor: 97, newCostCents: 2900 },
  },
  {
    sku: "TRL-DPK-24",
    slug: "trail-daypack-24l",
    name: "Trail Daypack 24L",
    category: "Packs",
    priceCents: 7900,
    costCents: 3400,
    supplier: "Northwind Textiles",
    monthlyUnits: 9,
  },
  {
    sku: "SUM-HDL-400",
    slug: "summit-headlamp-400",
    name: "Summit Headlamp 400",
    category: "Lighting",
    priceCents: 3900,
    costCents: 1600,
    supplier: "Brightline Electronics",
    monthlyUnits: 9,
  },
  {
    sku: "CMP-MUG-12",
    slug: "camp-mug-12oz",
    name: "Enamel Camp Mug 12oz",
    category: "Camp Kitchen",
    priceCents: 1800,
    costCents: 700,
    supplier: "Cascade Drinkware Co.",
    monthlyUnits: 20,
    // A small (+4%) increase that should NOT be flagged.
    costChange: { daysBeforeAnchor: 97, newCostCents: 730 },
  },
  { sku: "RDG-SHL-M", slug: "ridge-rain-shell", name: "Ridge Rain Shell", category: "Apparel", priceCents: 12900, costCents: 5800, supplier: "Northwind Textiles", monthlyUnits: 5 },
  { sku: "BSE-FLC", slug: "basecamp-fleece", name: "Basecamp Fleece Jacket", category: "Apparel", priceCents: 8900, costCents: 3800, supplier: "Northwind Textiles", monthlyUnits: 7 },
  { sku: "MRN-SCK-3", slug: "merino-trail-socks", name: "Merino Trail Socks (3-pack)", category: "Apparel", priceCents: 2900, costCents: 1100, supplier: "Northwind Textiles", monthlyUnits: 15 },
  { sku: "UL-STV", slug: "ultralight-camp-stove", name: "Ultralight Camp Stove", category: "Camp Kitchen", priceCents: 5900, costCents: 2700, supplier: "Granite Gear Works", monthlyUnits: 6 },
  { sku: "SLP-PAD", slug: "inflatable-sleeping-pad", name: "Inflatable Sleeping Pad", category: "Sleep", priceCents: 9900, costCents: 4400, supplier: "Granite Gear Works", monthlyUnits: 5 },
  { sku: "HMK-1P", slug: "packable-hammock", name: "Packable Hammock", category: "Sleep", priceCents: 6900, costCents: 2600, supplier: "Granite Gear Works", monthlyUnits: 7 },
  { sku: "TRK-PLS", slug: "carbon-trekking-poles", name: "Carbon Trekking Poles", category: "Trail", priceCents: 11900, costCents: 5200, supplier: "Granite Gear Works", monthlyUnits: 4 },
  { sku: "FLD-CHR", slug: "folding-camp-chair", name: "Folding Camp Chair", category: "Camp", priceCents: 6400, costCents: 2900, supplier: "Granite Gear Works", monthlyUnits: 6 },
  { sku: "WTR-FLT", slug: "squeeze-water-filter", name: "Squeeze Water Filter", category: "Hydration", priceCents: 3400, costCents: 1300, supplier: "Cascade Drinkware Co.", monthlyUnits: 10 },
  { sku: "DRY-BAG-20", slug: "roll-top-dry-bag", name: "Roll-top Dry Bag 20L", category: "Packs", priceCents: 3200, costCents: 1200, supplier: "Northwind Textiles", monthlyUnits: 8 },
  { sku: "SUN-HAT", slug: "wide-brim-sun-hat", name: "Wide Brim Sun Hat", category: "Apparel", priceCents: 3600, costCents: 1300, supplier: "Northwind Textiles", monthlyUnits: 7 },
  { sku: "FST-AID", slug: "trail-first-aid-kit", name: "Trail First Aid Kit", category: "Trail", priceCents: 2700, costCents: 1100, supplier: "Brightline Electronics", monthlyUnits: 6 },
  { sku: "CAN-LTN", slug: "rechargeable-lantern", name: "Rechargeable Camp Lantern", category: "Lighting", priceCents: 4500, costCents: 1900, supplier: "Brightline Electronics", monthlyUnits: 6 },
  { sku: "QD-TWL", slug: "quick-dry-towel", name: "Quick-dry Trek Towel", category: "Trail", priceCents: 2400, costCents: 800, supplier: "Northwind Textiles", monthlyUnits: 9 },
];

export interface CatalogCompetitor {
  slug: string;
  name: string;
}

export const COMPETITORS: CatalogCompetitor[] = [
  { slug: "ridgeline-supply", name: "Ridgeline Supply Co." },
  { slug: "northbound-outfitters", name: "Northbound Outfitters" },
  { slug: "granite-peak-gear", name: "Granite Peak Gear" },
  { slug: "basecamp-depot", name: "Basecamp Depot" },
];

export interface MarketListing {
  sku: string;
  competitorSlug: string;
  externalName: string;
  priceCents: number;
  availability: "in_stock" | "out_of_stock" | "limited";
}

/**
 * Competitor listings. These prices are the "demo dataset" used in fixture mode and are
 * also rendered by the sandbox storefront pages (/market/...) that the Apify Actor can
 * scrape in live mode once the app is deployed at a public URL.
 */
export const MARKET_LISTINGS: MarketListing[] = [
  // Finding C evidence for the Alpine bottle: $59 / $62 / $64 vs Acme's $49.
  { sku: "ALP-BTL-32", competitorSlug: "ridgeline-supply", externalName: "Ridgeline 32oz Vacuum Insulated Bottle", priceCents: 5900, availability: "in_stock" },
  { sku: "ALP-BTL-32", competitorSlug: "northbound-outfitters", externalName: "Northbound Summit Bottle 32oz", priceCents: 6200, availability: "in_stock" },
  { sku: "ALP-BTL-32", competitorSlug: "granite-peak-gear", externalName: "Granite Peak Insulated Water Bottle (32 oz)", priceCents: 6400, availability: "in_stock" },
  // Pricing opportunity on the daypack: $92 / $96 / $99 vs Acme's $79.
  { sku: "TRL-DPK-24", competitorSlug: "northbound-outfitters", externalName: "Northbound Ridge Daypack 24L", priceCents: 9200, availability: "in_stock" },
  { sku: "TRL-DPK-24", competitorSlug: "granite-peak-gear", externalName: "Granite Peak Trail Pack 24", priceCents: 9600, availability: "in_stock" },
  { sku: "TRL-DPK-24", competitorSlug: "basecamp-depot", externalName: "Basecamp Depot Hiker 24L Daypack", priceCents: 9900, availability: "limited" },
  // Headlamp is priced at market: no opportunity should be reported.
  { sku: "SUM-HDL-400", competitorSlug: "ridgeline-supply", externalName: "Ridgeline Beam 400 Headlamp", priceCents: 3800, availability: "in_stock" },
  { sku: "SUM-HDL-400", competitorSlug: "basecamp-depot", externalName: "Basecamp Depot 400-Lumen Headlamp", priceCents: 4100, availability: "in_stock" },
];

/** Fixed values for the intentional anomalies, asserted by tests. */
export const EXPECTED = {
  duplicate: { merchant: "Summit Packaging Supply", invoice: "INV-20418", amountCents: 105800 },
  marginErosionSku: "ALP-BTL-32",
  pricingOpportunitySku: "TRL-DPK-24",
  subscription: { merchant: "Relay Inbox", previousCents: 6900, latestCents: 11900 },
  totals: { annualCents: 428600, monthlyCents: 26900 },
} as const;

export function marketPath(competitorSlug: string, productSlug: string): string {
  return `/market/${competitorSlug}/${productSlug}`;
}

/**
 * True when a URL points at one of LedgerLens's own sandbox storefront pages. A live Apify
 * crawl of these pages is real scraping, but the prices were set by the demo, so they must
 * never be presented as market data.
 */
export function isSandboxListingUrl(url: string): boolean {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    if (parts.length !== 3 || parts[0] !== "market") return false;
    return MARKET_LISTINGS.some((l) => l.competitorSlug === parts[1] && PRODUCTS.find((p) => p.sku === l.sku)?.slug === parts[2]);
  } catch {
    return false;
  }
}
