/** Curated 24L daypack benchmarks. No scraped prices are stored in this catalog. */
export const RETAIL_PRODUCT_SKU = "TRL-DPK-24";
export const RETAIL_SOURCES = [
  {
    competitor: "Quest Outdoors",
    name: "Gregory Nano 24",
    url: "https://www.questoutdoors.com/products/gregory-nano-24",
  },
  {
    competitor: "Al's Sporting Goods",
    name: "Gregory Nano 24 L Backpack",
    url: "https://www.als.com/gregory-nano-24-l-backpack-10605061/p",
  },
  {
    competitor: "Gregory",
    name: "Nano 24",
    url: "https://www.gregory.com/best-sellers/nano-24/153059XXXX.html?dwvar_153059XXXX_color=1530599974",
  },
] as const;

export function apifyRunUrl(id: string): string | null {
  return /^[A-Za-z0-9]{10,40}$/.test(id)
    ? `https://console.apify.com/actors/runs/${id}`
    : null;
}

export function apifyDatasetUrl(id: string): string | null {
  return /^[A-Za-z0-9]{10,40}$/.test(id)
    ? `https://console.apify.com/storage/datasets/${id}`
    : null;
}
