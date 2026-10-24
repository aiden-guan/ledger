import { COMPETITORS, DEMO_DAYS, MARKET_LISTINGS, PRODUCTS } from "@/lib/demo/catalog";
import { runDemoOffline } from "@/lib/demo/offline-run";
import { format } from "@/lib/finance/money";

/*
 * Everything the landing page shows about the demo company, computed at build time by running
 * the real engine over the seeded books. Nothing here is typed in by hand.
 */

export interface LandingLeak {
  n: string;
  kind: string;
  subject: string;
  amount: string;
  cents: number;
  once: boolean;
}

export interface LandingData {
  leaks: LandingLeak[];
  totalAnnual: string;
  recurringAnnual: string;
  oneTime: string;
  totalCents: number;
  /** Every sale and bank line as [x, y, leak]: x is time, y is log amount (top is larger), leak is -1 or an index into leaks. */
  points: [number, number, number][];
  /** One short ledger line per point, same order. */
  labels: string[];
  market: { ours: number; competitors: { name: string; price: number }[]; product: string };
  duplicate: { vendor: string; invoice: string; amount: string; cents: number; dates: string[]; gapDays: number; confidence: string };
  /** Axis ticks in the same unit coordinates as points. */
  axes: { x: { at: number; label: string }[]; y: { at: number; label: string }[] };
  fix: { product: string; from: string; to: string; annual: string };
  stats: { days: number; sales: number; transactions: number; records: number };
}

const ANCHOR = new Date("2026-10-24T00:00:00Z");
const DAY = 86_400_000;

const shortDate = (ms: number) => new Date(ms).toISOString().slice(5, 10);
const money2 = (cents: number) => format(cents).replace("$", "");

export async function getLandingData(): Promise<LandingData> {
  const { data, findings } = await runDemoOffline(ANCHOR);
  const byType = (type: string) => findings.find((f) => f.finding.findingType === type);
  const m = (f: ReturnType<typeof byType>) => (f?.finding.metadata ?? {}) as Record<string, unknown>;

  const dup = byType("DUPLICATE_PAYMENT");
  const margin = byType("MARGIN_EROSION");
  const pricing = byType("PRICING_OPPORTUNITY");
  const creep = byType("SUBSCRIPTION_CREEP");

  const leaks: LandingLeak[] = [];
  const add = (f: typeof dup, kind: string, subject: string) => {
    if (!f) return -1;
    leaks.push({
      n: String(leaks.length + 1).padStart(2, "0"),
      kind,
      subject,
      amount: format(f.finding.annualImpactCents),
      cents: f.finding.annualImpactCents,
      once: f.finding.metadata.recoveryKind !== "recurring",
    });
    return leaks.length - 1;
  };
  const iDup = add(dup, "Paid twice", String(m(dup).vendor ?? ""));
  const iMargin = add(margin, "Margin slipping", String(m(margin).productName ?? ""));
  const iPricing = add(pricing, "Underpriced", String(m(pricing).productName ?? ""));
  const iCreep = add(creep, "Price creep", String(m(creep).vendor ?? ""));

  const recurring = leaks.filter((l) => !l.once).reduce((s, l) => s + l.cents, 0);
  const once = leaks.filter((l) => l.once).reduce((s, l) => s + l.cents, 0);

  // Which records each finding rests on.
  const dupIds = new Set((m(dup).transactionIds as string[] | undefined) ?? []);
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const supplier = squash(String(m(margin).supplier ?? "").replace(/ co\.?$/i, ""));
  const costRise = data.supplierCosts.filter((c) => c.sku === m(margin).sku).sort((a, b) => b.effectiveDate - a.effectiveDate)[0]?.effectiveDate ?? Infinity;
  const creepVendor = squash(String(m(creep).vendor ?? ""));
  const pricingSku = String(m(pricing).sku ?? "");
  const lastSale = Math.max(...data.sales.map((s) => s.soldAt));

  type Rec = { at: number; cents: number; leak: number; label: string };
  const records: Rec[] = [
    ...data.transactions.map((t, i): Rec => {
      const merchant = squash(t.normalizedMerchantName);
      let leak = -1;
      if (dupIds.has(`tx-${i}`)) leak = iDup;
      else if (supplier && merchant.includes(supplier) && t.transactionDate >= costRise) leak = iMargin;
      else if (creepVendor && merchant.includes(creepVendor) && t.amountCents > 10_000) leak = iCreep;
      return {
        at: t.transactionDate,
        cents: Math.abs(t.amountCents),
        leak,
        label: `${shortDate(t.transactionDate)}  ${t.merchantName.toUpperCase().slice(0, 26)}${t.invoiceReference ? `  ${t.invoiceReference}` : ""}  ${money2(t.amountCents)}`,
      };
    }),
    ...data.sales.map((s): Rec => {
      const product = PRODUCTS.find((p) => p.sku === s.sku);
      return {
        at: s.soldAt,
        cents: s.grossRevenueCents,
        leak: s.sku === pricingSku && s.soldAt > lastSale - 30 * DAY ? iPricing : -1,
        label: `${shortDate(s.soldAt)}  ${s.orderId}  ${(product?.name ?? s.sku).toUpperCase().slice(0, 24)}  ${money2(s.grossRevenueCents)}`,
      };
    }),
  ].sort((a, b) => a.at - b.at);

  const t0 = records[0]?.at ?? 0;
  const t1 = records.at(-1)?.at ?? 1;
  const logs = records.map((r) => Math.log10(Math.max(r.cents, 100)));
  const lo = Math.min(...logs);
  const hi = Math.max(...logs);
  const clamp = (v: number) => Math.min(0.995, Math.max(0.005, v));
  // A small deterministic jitter keeps identical sales from landing on one pixel.
  const jitter = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 0.006;
  const xAt = (ms: number) => +clamp(0.02 + ((ms - t0) / (t1 - t0)) * 0.96).toFixed(4);
  const yAt = (log: number) => +clamp(0.06 + (1 - (log - lo) / (hi - lo)) * 0.88).toFixed(4);
  const months: { at: number; label: string }[] = [];
  for (let d = new Date(t0); d.getTime() <= t1; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    const first = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    if (first >= t0) months.push({ at: xAt(first), label: new Date(first).toLocaleString("en-US", { month: "short", timeZone: "UTC" }) });
  }
  const yTicks = [1_000, 10_000, 100_000]
    .filter((c) => Math.log10(c) >= lo && Math.log10(c) <= hi)
    .map((c) => ({ at: yAt(Math.log10(c)), label: c >= 100_000 ? `$${c / 100_000}k` : `$${c / 100}` }));
  const points = records.map((r, i): [number, number, number] => [
    xAt(r.at),
    +clamp(yAt(logs[i]) + jitter(i)).toFixed(4),
    r.leak,
  ]);

  const alpine = PRODUCTS.find((p) => p.sku === String(m(margin).sku));
  const market = {
    product: alpine?.name ?? "",
    ours: (alpine?.priceCents ?? 0) / 100,
    competitors: MARKET_LISTINGS.filter((l) => l.sku === alpine?.sku).map((l) => ({
      name: (COMPETITORS.find((c) => c.slug === l.competitorSlug)?.name ?? l.competitorSlug).replace(/ (Supply Co\.|Outfitters|Gear|Depot)$/, ""),
      price: l.priceCents / 100,
    })),
  };

  const paid = ((m(dup).paidDates as string[] | undefined) ?? []).map((d) => Date.parse(d));
  const rec = pricing?.recommendation.metadata as { fromPriceCents?: number; toPriceCents?: number } | undefined;

  return {
    leaks,
    totalAnnual: format(recurring + once),
    recurringAnnual: format(recurring),
    oneTime: format(once),
    totalCents: recurring + once,
    points,
    labels: records.map((r) => r.label),
    axes: { x: months, y: yTicks },
    market,
    duplicate: {
      vendor: String(m(dup).vendor ?? ""),
      invoice: String(m(dup).invoiceReference ?? ""),
      amount: money2(dup?.finding.annualImpactCents ?? 0),
      cents: dup?.finding.annualImpactCents ?? 0,
      dates: paid.map((d) => shortDate(d)),
      gapDays: paid.length === 2 ? Math.round(Math.abs(paid[1] - paid[0]) / DAY) : 0,
      confidence: (dup?.finding.confidence ?? 0).toFixed(2),
    },
    fix: {
      product: String(m(pricing).productName ?? ""),
      from: format(rec?.fromPriceCents ?? 0),
      to: format(rec?.toPriceCents ?? 0),
      annual: format(pricing?.finding.annualImpactCents ?? 0),
    },
    stats: { days: DEMO_DAYS, sales: data.sales.length, transactions: data.transactions.length, records: records.length },
  };
}
