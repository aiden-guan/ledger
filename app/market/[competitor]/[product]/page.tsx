import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { COMPETITORS, MARKET_LISTINGS, PRODUCTS } from "@/lib/demo/catalog";

/**
 * Sandbox competitor storefront for the demo. These pages exist so the live Apify Actor has
 * real, public HTML to scrape once LedgerLens is deployed; the prices match the demo dataset.
 * They are clearly labeled and are not real retailers.
 */

function lookup(competitorSlug: string, productSlug: string) {
  const competitor = COMPETITORS.find((c) => c.slug === competitorSlug);
  const product = PRODUCTS.find((p) => p.slug === productSlug);
  const listing = MARKET_LISTINGS.find((l) => l.competitorSlug === competitorSlug && l.sku === product?.sku);
  return competitor && product && listing ? { competitor, product, listing } : null;
}

export function generateStaticParams() {
  return MARKET_LISTINGS.map((l) => ({
    competitor: l.competitorSlug,
    product: PRODUCTS.find((p) => p.sku === l.sku)!.slug,
  }));
}

export async function generateMetadata({ params }: { params: Promise<{ competitor: string; product: string }> }): Promise<Metadata> {
  const { competitor, product } = await params;
  const found = lookup(competitor, product);
  return { title: found ? `${found.listing.externalName} · ${found.competitor.name} (sandbox)` : "Not found", robots: { index: false } };
}

export default async function SandboxStorefront({ params }: { params: Promise<{ competitor: string; product: string }> }) {
  const { competitor, product } = await params;
  const found = lookup(competitor, product);
  if (!found) notFound();
  const { listing } = found;
  const price = (listing.priceCents / 100).toFixed(2);
  const availability = { in_stock: "https://schema.org/InStock", out_of_stock: "https://schema.org/OutOfStock", limited: "https://schema.org/LimitedAvailability" }[listing.availability];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: listing.externalName,
    sku: `${competitor}-${product}`,
    brand: { "@type": "Brand", name: found.competitor.name },
    offers: { "@type": "Offer", price, priceCurrency: "USD", availability },
  };
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <p className="rounded-md border border-dashed px-3 py-2 text-[12px] text-muted-foreground">
        Sandbox storefront for the LedgerLens demo. {found.competitor.name} is a fictional retailer; this page exists so the Apify Actor has a public page to scrape.
      </p>
      <p className="mt-10 text-sm text-muted-foreground">{found.competitor.name}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{listing.externalName}</h1>
      <p className="tabular mt-4 text-3xl font-semibold" data-price={price}>
        ${price}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{listing.availability.replace(/_/g, " ")}</p>
    </main>
  );
}
