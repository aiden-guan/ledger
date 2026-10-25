# LedgerLens Competitor Pricing

A reusable Apify Actor that turns public product pages into source-linked price observations. LedgerLens uses the dataset to compare a sample business's prices with real retailer benchmarks and prepare price tests for owner approval.

**Actor ID:** `aidengrails/ledgerlens-competitor-pricing` (`r1XmOWedMNF9AKMbr`). The Actor is private; public Store publication is not required for the Cal Hacks submission.

## Input

```json
{
  "products": [
    {
      "internalProductId": "daypack-24",
      "competitor": "Quest Outdoors",
      "url": "https://www.questoutdoors.com/products/gregory-nano-24",
      "expectedNameTokens": ["nano", "24"]
    },
    {
      "internalProductId": "daypack-24",
      "competitor": "Al's Sporting Goods",
      "url": "https://www.als.com/gregory-nano-24-l-backpack-10605061/p",
      "expectedNameTokens": ["nano", "24"]
    }
  ],
  "maxConcurrency": 3
}
```

Supply 1–200 pages. `internalProductId` joins observations to your own catalog; `competitor` identifies the retailer. Optional `expectedNameTokens` must all occur in the extracted product name, which rejects mismatched products and irrelevant redirects. This is a name check, not proof of SKU equivalence. URLs are validated; only public HTTP(S) pages are accepted on the platform.

## Output

The default dataset contains `internalProductId`, `competitor`, `productName`, `price` (decimal amount), `currency`, `availability`, `url`, `capturedAt` (UTC) and `extractionMethod`. Read the dataset through the Apify API/client or export JSON/CSV from the Console. Prices are observations at capture time, not guaranteed current prices.

The Actor reads schema.org Product/ProductGroup JSON-LD, then product meta tags, microdata and individual price selectors. It understands ProductGroup variants, rejects ambiguous concatenated prices and requires a price and identifiable currency. Pages without usable data do not produce guessed dataset rows.

The default key-value store contains:

- `FAILURES`: source URLs and reasons for rejected or failed pages.
- `SUMMARY`: requested, extracted and failed page counts plus completion time.

## Run and reuse

```sh
apify actors call aidengrails/ledgerlens-competitor-pricing --input-file input.json
```

The Actor can also run as an Apify task, on a schedule, or through the Apify API. It is independent of LedgerLens: replace the URLs and internal IDs to use the dataset in another application. JavaScript-only storefronts, blocked requests, unstructured prices and site changes can fail extraction; the Actor does not bypass access controls. Respect the source site's terms and access restrictions.

## How LedgerLens uses it

The `/market-check` flow runs this Actor against three curated Gregory Nano 24 listings. Observations retain their source URL, timestamp and run ID, and are stored in Convex. The finance engine excludes foreign-currency, unavailable and duplicate quotes, requires at least two usable prices, and proposes a conservative price test capped at 90% of the median and a 15% increase. The money river previews the projected profit effect at unchanged unit sales. Owner approval prepares a change; it does not execute a storefront update.

Acme Outdoor Co. and its books are synthetic. Its Trail Daypack is comparable to the benchmark, not the same SKU; brand, specifications, variants, tax and shipping differ. The retail check never falls back to invented prices. An unsuccessful refresh leaves the previous capture available with its original timestamp.
