import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { normalizeMerchantName } from "@/lib/finance/merchants";
import { COMPETITORS, DEMO_DAYS, DEMO_ORG, EXPECTED, MARKET_LISTINGS, PRODUCTS, marketPath } from "./catalog";

/** Deterministic PRNG (mulberry32) so every seed produces identical data. */
export function createRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 24 * 60 * 60 * 1000;

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export interface SeedOptions {
  /** Seeded "today". Data covers the 182 days before it. Defaults to the current UTC day. */
  anchorDate?: Date;
  /** Base URL used for the sandbox competitor storefront pages. */
  appUrl?: string;
  seed?: number;
}

export interface SeedResult {
  organizationId: string;
  counts: { products: number; sales: number; transactions: number; supplierCosts: number; competitorListings: number };
}

/** Units sold on day i for a product with `monthlyUnits` per 30 days (exact, evenly spread). */
function unitsOnDay(i: number, monthlyUnits: number): number {
  return Math.floor(((i + 1) * monthlyUnits) / 30) - Math.floor((i * monthlyUnits) / 30);
}

export async function deleteDemoOrganization(db: Database, slug: string = DEMO_ORG.slug): Promise<void> {
  await db.delete(schema.organizations).where(eq(schema.organizations.slug, slug));
}

export async function seedDemoCompany(db: Database, options: SeedOptions = {}): Promise<SeedResult> {
  const anchor = startOfUtcDay(options.anchorDate ?? new Date());
  const appUrl = (options.appUrl ?? "http://localhost:3000").replace(/\/$/, "");
  const rng = createRng(options.seed ?? 20261018);
  const start = new Date(anchor.getTime() - DEMO_DAYS * DAY);
  const dayAt = (i: number, hour = 12, minute = 0) => new Date(start.getTime() + i * DAY + (hour * 60 + minute) * 60 * 1000);

  return db.transaction(async (tx) => {
    const [org] = await tx
      .insert(schema.organizations)
      .values({ ...DEMO_ORG, demoMode: true })
      .returning({ id: schema.organizations.id });
    const organizationId = org.id;

    // Products
    const productRows = await tx
      .insert(schema.products)
      .values(
        PRODUCTS.map((p) => ({
          organizationId,
          sku: p.sku,
          name: p.name,
          category: p.category,
          sellingPriceCents: p.priceCents,
        })),
      )
      .returning({ id: schema.products.id, sku: schema.products.sku });
    const productIdBySku = new Map(productRows.map((r) => [r.sku, r.id]));

    // Supplier cost history
    const costRows: (typeof schema.supplierCosts.$inferInsert)[] = [];
    for (const p of PRODUCTS) {
      const productId = productIdBySku.get(p.sku)!;
      costRows.push({
        organizationId,
        productId,
        supplierName: p.supplier,
        effectiveDate: new Date(start.getTime() - 45 * DAY),
        unitCostCents: p.costCents,
        source: "supplier_price_list",
      });
      if (p.costChange) {
        costRows.push({
          organizationId,
          productId,
          supplierName: p.supplier,
          effectiveDate: new Date(anchor.getTime() - p.costChange.daysBeforeAnchor * DAY),
          unitCostCents: p.costChange.newCostCents,
          source: "supplier_invoice",
        });
      }
    }
    await tx.insert(schema.supplierCosts).values(costRows);

    // Sales: exact daily units per product, occasionally grouped into 2-unit order lines.
    const salesRows: (typeof schema.sales.$inferInsert)[] = [];
    const revenueByDay: number[] = Array(DEMO_DAYS).fill(0);
    const unitsBySupplierMonth = new Map<string, number>();
    let orderNumber = 10_400;
    // Seasonality for the rest of the catalog (spring ramp, summer peak, early-fall taper).
    const SEASON = [0.8, 0.92, 1.1, 1.14, 0.98, 1.0];
    const cumulative = PRODUCTS.map(() => 0);
    for (let i = 0; i < DEMO_DAYS; i++) {
      PRODUCTS.forEach((p, productIndex) => {
        const before = cumulative[productIndex];
        const season = SEASON[Math.min(SEASON.length - 1, Math.floor(i / 30.4))] * (1 + 0.04 * Math.sin((i + productIndex * 11) / 9));
        cumulative[productIndex] += (p.monthlyUnits * season) / 30;
        let units = Math.floor(cumulative[productIndex]) - Math.floor(before);
        // Keep the two anomaly products exactly on schedule so tests can assert velocity.
        if (p.sku === EXPECTED.marginErosionSku || p.sku === EXPECTED.pricingOpportunitySku) {
          units = unitsOnDay(i, p.monthlyUnits);
        }
        const costCents =
          p.costChange && dayAt(i) >= new Date(anchor.getTime() - p.costChange.daysBeforeAnchor * DAY)
            ? p.costChange.newCostCents
            : p.costCents;
        const monthKey = `${p.supplier}|${Math.floor(i / 30)}`;
        unitsBySupplierMonth.set(monthKey, (unitsBySupplierMonth.get(monthKey) ?? 0) + units * costCents);

        while (units > 0) {
          const quantity = units >= 2 && rng() < 0.3 ? 2 : 1;
          units -= quantity;
          orderNumber += 1;
          const soldAt = dayAt(i, 8 + Math.floor(rng() * 14), Math.floor(rng() * 60));
          salesRows.push({
            organizationId,
            productId: productIdBySku.get(p.sku)!,
            orderId: `AC-${orderNumber}`,
            soldAt,
            quantity,
            unitPriceCents: p.priceCents,
            grossRevenueCents: p.priceCents * quantity,
          });
          revenueByDay[i] += p.priceCents * quantity;
        }
      });
    }
    for (let k = 0; k < salesRows.length; k += 500) {
      await tx.insert(schema.sales).values(salesRows.slice(k, k + 500));
    }

    // Bank transactions
    const txRows: (typeof schema.transactions.$inferInsert)[] = [];
    let externalSeq = 1;
    const addTx = (
      day: number,
      merchantName: string,
      amountCents: number,
      type: "DEBIT" | "CREDIT",
      category: string,
      invoiceReference: string | null = null,
      metadata: Record<string, unknown> = {},
    ) => {
      txRows.push({
        organizationId,
        transactionDate: dayAt(day, 9 + Math.floor(rng() * 8), Math.floor(rng() * 60)),
        merchantName,
        normalizedMerchantName: normalizeMerchantName(merchantName),
        amountCents,
        currency: "USD",
        transactionType: type,
        category,
        invoiceReference,
        source: "bank_feed",
        externalId: `bank-${String(externalSeq++).padStart(5, "0")}`,
        metadataJson: metadata,
      });
    };

    // Store payouts every 3-4 days, net of ~2.9% + 30c processing.
    let lastPayout = 0;
    for (let i = 3; i < DEMO_DAYS; i += i % 2 ? 3 : 4) {
      const gross = revenueByDay.slice(lastPayout, i).reduce((s, v) => s + v, 0);
      lastPayout = i;
      if (gross === 0) continue;
      const net = Math.round(gross * 0.971) - 30 * Math.max(1, Math.round(gross / 5200));
      addTx(i, "SHOPWISE PAYMENTS PAYOUT", net, "CREDIT", "revenue", null, { kind: "payout" });
    }

    // Inventory replenishment: one invoice per supplier per 30-day block.
    const supplierPrefixes: Record<string, string> = {
      "Cascade Drinkware Co.": "CDW",
      "Northwind Textiles": "NWT",
      "Brightline Electronics": "BLE",
      "Granite Gear Works": "GGW",
    };
    Object.entries(supplierPrefixes).forEach(([supplier, prefix], s) => {
      for (let m = 0; m < 6; m++) {
        const amount = unitsBySupplierMonth.get(`${supplier}|${m}`) ?? 0;
        if (amount === 0) continue;
        addTx(m * 30 + 6 + s * 4, `ACH DEBIT ${supplier.toUpperCase()}`, amount, "DEBIT", "inventory", `${prefix}-${4100 + m * 7 + s}`);
      }
    });

    // Packaging supplier, monthly with varying amounts. Finding A: INV-20418 paid twice.
    const packagingAmounts = [74250, 81900, 69875, 88340, EXPECTED.duplicate.amountCents, 92610];
    packagingAmounts.forEach((amount, m) => {
      const day = m * 30 + 4 + (m === 4 ? 6 : 0);
      const invoice = m === 4 ? EXPECTED.duplicate.invoice : `INV-${20180 + m * 59}`;
      addTx(day, "Summit Packaging Supply", amount, "DEBIT", "packaging", invoice);
      if (m === 4) {
        // Accidental second payment of the same invoice five days later via a different rail.
        addTx(day + 5, "PAYPAL *SUMMIT PACKAGING SUPPLY LLC", amount, "DEBIT", "packaging", invoice, {
          note: "Paid from vendor portal",
        });
      }
    });

    // 3PL fulfillment weekly (variable, invoiced) and ads weekly (variable, card).
    let lastAd = 0;
    for (let w = 0; w < 26; w++) {
      const day = w * 7 + 2;
      const weekRevenue = revenueByDay.slice(Math.max(0, day - 7), day).reduce((s, v) => s + v, 0);
      addTx(day, "Trailpost Fulfillment", 18000 + Math.round(weekRevenue * 0.06) + Math.round(rng() * 2500), "DEBIT", "fulfillment", `TPF-${70210 + w}`);
      let ad = 9000 + Math.round(rng() * 9000);
      // Variable ad spend: keep consecutive charges more than 1% apart so they are never duplicates.
      if (lastAd && Math.abs(ad - lastAd) / Math.max(ad, lastAd) <= 0.02) ad += 700;
      lastAd = ad;
      addTx(day + 1, "PIXELGRID ADS", ad, "DEBIT", "marketing");
    }

    // Recurring SaaS and services (stable), with descriptor variations.
    const recurring: { names: string[]; amount: number | ((m: number) => number); dayOffset: number; category: string; refPrefix?: string }[] = [
      { names: ["SHOPWISE COMMERCE", "Shopwise Commerce Inc."], amount: 10500, dayOffset: 1, category: "software" },
      { names: ["LEDGERLY BOOKKEEPING", "Ledgerly Bookkeeping LLC"], amount: 4900, dayOffset: 5, category: "software" },
      { names: ["MAILROOM EMAIL MKTG", "Mailroom Email Mktg"], amount: 6000, dayOffset: 8, category: "software" },
      { names: ["CANVASLY", "Canvasly Inc."], amount: 1500, dayOffset: 11, category: "software" },
      { names: ["PARCELPATH LABELS", "ParcelPath Labels"], amount: 2900, dayOffset: 14, category: "software" },
      { names: ["CLOUDVAULT STORAGE"], amount: 1200, dayOffset: 17, category: "software" },
      { names: ["HARBORLINE INSURANCE AUTOPAY"], amount: 8600, dayOffset: 20, category: "insurance" },
      { names: ["BRIGHTDESK VIRTUAL ASSIST"], amount: 45000, dayOffset: 25, category: "contractors", refPrefix: "BD" },
      // Finding D: helpdesk plan rose from $69 to $119 three cycles ago.
      {
        names: ["RELAY INBOX *SUBSCR 8823", "RelayInbox.com", "SQ *RELAY INBOX"],
        amount: (m) => (m < 3 ? EXPECTED.subscription.previousCents : EXPECTED.subscription.latestCents),
        dayOffset: 3,
        category: "software",
      },
    ];
    for (const r of recurring) {
      for (let m = 0; m < 6; m++) {
        const day = m * 30 + r.dayOffset;
        if (day >= DEMO_DAYS) continue;
        const amount = typeof r.amount === "function" ? r.amount(m) : r.amount;
        addTx(day, r.names[m % r.names.length], amount, "DEBIT", r.category, r.refPrefix ? `${r.refPrefix}-${2210 + m}` : null);
      }
    }

    // Irregular card purchases.
    const misc = ["PAPER & POST SUPPLY", "STAMP AND SHIP POST", "TRAILHEAD HARDWARE", "CITY PRINT SHOP"];
    for (let k = 0; k < 20; k++) {
      const day = Math.floor((k * DEMO_DAYS) / 20) + Math.floor(rng() * 5);
      addTx(Math.min(day, DEMO_DAYS - 1), misc[k % misc.length], 1800 + Math.round(rng() * 14000), "DEBIT", "office");
    }

    await tx.insert(schema.transactions).values(txRows);

    // Competitors and listings (sandbox storefront URLs on this app).
    const appHost = new URL(appUrl).host;
    const competitorRows = await tx
      .insert(schema.competitors)
      .values(COMPETITORS.map((c) => ({ organizationId, name: c.name, domain: `${appHost}/market/${c.slug}` })))
      .returning({ id: schema.competitors.id, name: schema.competitors.name });
    const competitorIdBySlug = new Map(COMPETITORS.map((c) => [c.slug, competitorRows.find((r) => r.name === c.name)!.id]));
    await tx.insert(schema.competitorProducts).values(
      MARKET_LISTINGS.map((l) => {
        const product = PRODUCTS.find((p) => p.sku === l.sku)!;
        return {
          productId: productIdBySku.get(l.sku)!,
          competitorId: competitorIdBySlug.get(l.competitorSlug)!,
          productUrl: `${appUrl}${marketPath(l.competitorSlug, product.slug)}`,
          externalName: l.externalName,
        };
      }),
    );

    return {
      organizationId,
      counts: {
        products: productRows.length,
        sales: salesRows.length,
        transactions: txRows.length,
        supplierCosts: costRows.length,
        competitorListings: MARKET_LISTINGS.length,
      },
    };
  });
}
