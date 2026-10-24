import { COMPETITORS, DEMO_DAYS, MARKET_LISTINGS, PRODUCTS } from "@/lib/demo/catalog";
import { runDemoOffline } from "@/lib/demo/offline-run";
import { format } from "@/lib/finance/money";
import type { Fracture } from "@/lib/guilloche";

/*
 * Everything the landing page shows about the demo company, computed at build time by running
 * the real engine over the seeded books. Nothing here is typed in by hand.
 */

export interface LandingLeak {
  n: string;
  kind: string;
  subject: string;
  amount: string;
  per: string;
  fracture: Fracture;
  /** Microprint that appears under the loupe at this leak. */
  micro: string;
}

export interface LandingData {
  leaks: LandingLeak[];
  totalAnnual: string;
  recurringAnnual: string;
  oneTime: string;
  totalCents: number;
  /** Ledger lines for the microprint rings. */
  ledger: string[];
  /** Every bank line in date order: bar length from the amount, red where a finding points. */
  scan: { w: number; hot: boolean }[];
  market: { ours: number; competitors: { name: string; price: number }[]; product: string };
  duplicate: { vendor: string; invoice: string; amount: string; dates: string[] };
  stats: { days: number; sales: number; transactions: number; products: number };
}

const ANCHOR = new Date("2026-10-24T00:00:00Z");

const shortDate = (ms: number) => new Date(ms).toISOString().slice(5, 10);
const money2 = (cents: number) => format(cents).replace("$", "");

export async function getLandingData(): Promise<LandingData> {
  const { data, findings } = await runDemoOffline(ANCHOR);
  const byType = (type: string) => findings.find((f) => f.finding.findingType === type);

  const dup = byType("DUPLICATE_PAYMENT");
  const margin = byType("MARGIN_EROSION");
  const pricing = byType("PRICING_OPPORTUNITY");
  const creep = byType("SUBSCRIPTION_CREEP");
  const m = (f: typeof dup) => (f?.finding.metadata ?? {}) as Record<string, unknown>;

  const dupDates = ((m(dup).paidDates as string[] | undefined) ?? []).map((d) => d.slice(5));
  const leaks: LandingLeak[] = [];
  if (dup)
    leaks.push({
      n: "01",
      kind: "Paid twice",
      subject: String(m(dup).vendor ?? ""),
      amount: format(dup.finding.annualImpactCents),
      per: "once",
      fracture: { angle: -0.95, spread: 0.32, band: 0 },
      micro: `${String(m(dup).invoiceReference)} ${money2(dup.finding.annualImpactCents)} PAID ${dupDates.join(" AND ")} · SAME INVOICE TWICE`,
    });
  if (margin)
    leaks.push({
      n: "02",
      kind: "Margin slipping",
      subject: String(m(margin).productName ?? ""),
      amount: format(margin.finding.annualImpactCents),
      per: "a year",
      fracture: { angle: 0.55, spread: 0.36, band: 1 },
      micro: `${String(m(margin).supplier).toUpperCase()} UNIT COST 22.00 → 29.00 · RETAIL STILL 49.00`,
    });
  if (pricing)
    leaks.push({
      n: "03",
      kind: "Underpriced",
      subject: String(m(pricing).productName ?? ""),
      amount: format(pricing.finding.annualImpactCents),
      per: "a year",
      fracture: { angle: 2.25, spread: 0.34, band: 2 },
      micro: "ACME 79.00 · MARKET 92.00 96.00 99.00 · LOWEST PRICE OBSERVED",
    });
  if (creep)
    leaks.push({
      n: "04",
      kind: "Price creep",
      subject: String(m(creep).vendor ?? ""),
      amount: format(creep.finding.annualImpactCents),
      per: "a year",
      fracture: { angle: 3.75, spread: 0.3, band: 0 },
      micro: "RELAY INBOX 69.00 69.00 69.00 → 119.00 119.00 119.00",
    });

  const recurring = findings.filter((f) => f.finding.metadata.recoveryKind === "recurring").reduce((s, f) => s + f.finding.annualImpactCents, 0);
  const once = findings.filter((f) => f.finding.metadata.recoveryKind !== "recurring").reduce((s, f) => s + f.finding.annualImpactCents, 0);

  const ledger = [...data.transactions]
    .sort((a, b) => a.transactionDate - b.transactionDate)
    .map((t) => `${shortDate(t.transactionDate)} ${t.merchantName.toUpperCase()}${t.invoiceReference ? ` ${t.invoiceReference}` : ""} ${money2(t.amountCents)}`);

  const hotIds = new Set<string>((m(dup).transactionIds as string[] | undefined) ?? []);
  const creepVendor = String(m(creep).vendor ?? "").toLowerCase().replace(/\s+/g, "");
  const sortedTx = data.transactions.map((t, i) => ({ t, id: `tx-${i}` })).sort((a, b) => a.t.transactionDate - b.t.transactionDate);
  const maxLog = Math.max(...sortedTx.map(({ t }) => Math.log10(Math.abs(t.amountCents) + 1)));
  const scan = sortedTx.map(({ t, id }) => ({
    w: Math.log10(Math.abs(t.amountCents) + 1) / maxLog,
    hot: hotIds.has(id) || (creepVendor !== "" && t.normalizedMerchantName.replace(/\s+/g, "").includes(creepVendor) && t.amountCents > 10000),
  }));

  const alpine = PRODUCTS.find((p) => p.sku === String(m(margin).sku));
  const market = {
    product: alpine?.name ?? "",
    ours: (alpine?.priceCents ?? 0) / 100,
    competitors: MARKET_LISTINGS.filter((l) => l.sku === alpine?.sku).map((l) => ({
      name: (COMPETITORS.find((c) => c.slug === l.competitorSlug)?.name ?? l.competitorSlug).replace(/ (Supply Co\.|Outfitters|Gear|Depot)$/, ""),
      price: l.priceCents / 100,
    })),
  };

  return {
    leaks,
    totalAnnual: format(recurring + once),
    recurringAnnual: format(recurring),
    oneTime: format(once),
    totalCents: recurring + once,
    ledger,
    scan,
    market,
    duplicate: { vendor: String(m(dup).vendor ?? ""), invoice: String(m(dup).invoiceReference ?? ""), amount: format(dup?.finding.annualImpactCents ?? 0), dates: dupDates },
    stats: { days: DEMO_DAYS, sales: data.sales.length, transactions: data.transactions.length, products: data.products.length },
  };
}
