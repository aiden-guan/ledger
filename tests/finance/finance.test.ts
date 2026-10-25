import { describe, expect, it } from "vitest";
import { money } from "@/lib/finance/money";
import { merchantKey, normalizeMerchantName } from "@/lib/finance/merchants";
import { detectDuplicateTransactions, scoreDuplicatePair } from "@/lib/finance/duplicates";
import { detectRecurringExpenses } from "@/lib/finance/recurring";
import { analyzeSkuMargins, calculateMarginCompression, detectCostInflation, grossMargin } from "@/lib/finance/margins";
import { calculateCompetitorMedian, calculatePricingOpportunity, recommendPrice } from "@/lib/finance/pricing";
import { aggregateImpact, calculateAnnualizedImpact, oneTimeImpact, weightedConfidence } from "@/lib/finance/impact";
import type { LedgerTransaction, PriceObservation, SaleRecord, SupplierCostRecord } from "@/lib/finance/types";

const d = (iso: string) => new Date(`${iso}T12:00:00Z`);

function tx(partial: Partial<LedgerTransaction> & { id: string; date: string; merchant: string; amount: number }): LedgerTransaction {
  return {
    id: partial.id,
    transactionDate: d(partial.date),
    merchantName: partial.merchant,
    normalizedMerchantName: normalizeMerchantName(partial.merchant),
    amountCents: partial.amount,
    transactionType: partial.transactionType ?? "DEBIT",
    category: partial.category ?? null,
    invoiceReference: partial.invoiceReference ?? null,
  };
}

describe("money", () => {
  it("adds and subtracts integer cents", () => {
    expect(money.add(4999, 1, 100)).toBe(5100);
    expect(money.subtract(4900, 2900)).toBe(2000);
  });

  it("rejects floating-point dollars", () => {
    expect(() => money.add(49.99)).toThrow();
  });

  it("multiplies by quantity with explicit rounding", () => {
    expect(money.multiplyQuantity(4999, 3)).toBe(14997);
    expect(money.multiplyQuantity(600, 25.67)).toBe(15402);
  });

  it("computes percentages with half-away-from-zero rounding", () => {
    expect(money.percentage(4900, 15)).toBe(735);
    expect(money.percentage(5, 50)).toBe(3);
    expect(money.percentage(-5, 50)).toBe(-3);
  });

  it("converts scraped decimals without float drift", () => {
    expect(money.fromDecimal(59.99)).toBe(5999);
    expect(money.fromDecimal(0.29)).toBe(29);
  });

  it("formats currency", () => {
    expect(money.format(428600)).toBe("$4,286");
    expect(money.format(118500)).toBe("$1,185");
    expect(money.format(5580)).toBe("$55.80");
    expect(money.format(15333, { signed: true })).toBe("+$153.33");
    expect(money.format(-2500)).toBe("-$25");
  });
});

describe("merchant normalization", () => {
  it("strips processor prefixes, ids, domains and corporate suffixes", () => {
    expect(normalizeMerchantName("SQ *RELAY INBOX 8823")).toBe("relay inbox");
    expect(normalizeMerchantName("Relay Inbox Inc.")).toBe("relay inbox");
    expect(normalizeMerchantName("PAYPAL *SUMMIT PACKAGING SUPPLY LLC")).toBe("summit packaging supply");
    expect(merchantKey("RelayInbox.com")).toBe(merchantKey("Relay Inbox Inc."));
  });
});

describe("duplicate detection", () => {
  const original = tx({ id: "a", date: "2026-08-04", merchant: "Summit Packaging Supply", amount: 118500, invoiceReference: "INV-20418" });
  const dup = tx({ id: "b", date: "2026-08-09", merchant: "SUMMIT PACKAGING SUPPLY LLC", amount: 118500, invoiceReference: "inv-20418" });

  it("scores an exact repeat of the same invoice at 1.0", () => {
    const scored = scoreDuplicatePair(original, dup)!;
    expect(scored.score).toBe(1);
    expect(scored.components.map((c) => c.signal)).toEqual([
      "same_merchant",
      "exact_amount",
      "within_7_days",
      "same_invoice_reference",
    ]);
  });

  it("flags duplicates and reports the recoverable amount", () => {
    const results = detectDuplicateTransactions([original, dup]);
    expect(results).toHaveLength(1);
    expect(results[0].recoverableCents).toBe(118500);
    expect(results[0].daysApart).toBe(5);
  });

  it("does not flag different invoices for the same amount", () => {
    const other = { ...dup, invoiceReference: "INV-20502" };
    expect(detectDuplicateTransactions([original, other])).toHaveLength(0);
  });

  it("does not flag monthly rent (outside the window)", () => {
    const rent = [
      tx({ id: "r1", date: "2026-06-01", merchant: "Granite Lane Properties", amount: 240000 }),
      tx({ id: "r2", date: "2026-07-01", merchant: "Granite Lane Properties", amount: 240000 }),
    ];
    expect(detectDuplicateTransactions(rent)).toHaveLength(0);
  });

  it("accepts near-identical amounts within 1% and penalises nothing without refs", () => {
    const a = tx({ id: "n1", date: "2026-08-01", merchant: "Freight Co", amount: 100000 });
    const b = tx({ id: "n2", date: "2026-08-03", merchant: "Freight Co", amount: 100500 });
    const scored = scoreDuplicatePair(a, b)!;
    expect(scored.score).toBeCloseTo(0.7, 5);
  });

  it("ignores credits", () => {
    const credit = { ...dup, transactionType: "CREDIT" as const };
    expect(detectDuplicateTransactions([original, credit])).toHaveLength(0);
  });
});

describe("recurring expense detection", () => {
  const months = ["2026-04-03", "2026-05-03", "2026-06-02", "2026-07-03", "2026-08-02", "2026-09-02"];

  it("detects monthly price creep", () => {
    const charges = months.map((date, i) =>
      tx({ id: `s${i}`, date, merchant: i % 2 ? "RELAYINBOX.COM" : "SQ *RELAY INBOX 8823", amount: i < 3 ? 8900 : 18900 }),
    );
    const { flags, series } = detectRecurringExpenses(charges);
    expect(series).toHaveLength(1);
    expect(series[0].cadence).toBe("monthly");
    expect(flags).toHaveLength(1);
    const s = flags[0].series;
    expect(flags[0].kind).toBe("PRICE_CREEP");
    expect(s.previousAmountCents).toBe(8900);
    expect(s.latestAmountCents).toBe(18900);
    expect(s.percentIncrease).toBeCloseTo(112.36, 2);
    expect(s.annualizedSpendCents).toBe(226800);
    expect(s.annualizedIncreaseCents).toBe(120000);
    expect(s.monthlyIncreaseCents).toBe(10000);
  });

  it("does not flag stable subscriptions", () => {
    const charges = months.map((date, i) => tx({ id: `k${i}`, date, merchant: "Ledgerly Bookkeeping", amount: 4900 }));
    const { flags, series } = detectRecurringExpenses(charges);
    expect(series).toHaveLength(1);
    expect(flags).toHaveLength(0);
  });

  it("tolerates timing jitter within 25-35 days", () => {
    const dates = ["2026-04-01", "2026-04-28", "2026-06-01", "2026-06-29", "2026-08-01"];
    const charges = dates.map((date, i) => tx({ id: `j${i}`, date, merchant: "Pixel Ads", amount: 2000 }));
    expect(detectRecurringExpenses(charges).series[0]?.cadence).toBe("monthly");
  });

  it("detects two interleaved monthly charges from one vendor", () => {
    const a = months.map((date, i) => tx({ id: `a${i}`, date, merchant: "Canvasly", amount: 1500 }));
    const b = months.map((date, i) => tx({ id: `b${i}`, date: date.replace(/-0(\d)$/, "-1$1"), merchant: "Canvasly", amount: 3000 }));
    const { flags } = detectRecurringExpenses([...a, ...b]);
    expect(flags.some((f) => f.kind === "POSSIBLE_DUPLICATE_SUBSCRIPTION")).toBe(true);
  });

  it("ignores irregular one-off spend", () => {
    const charges = ["2026-04-01", "2026-04-09", "2026-06-20", "2026-09-01"].map((date, i) =>
      tx({ id: `o${i}`, date, merchant: "Hardware Store", amount: 1000 + i * 731 }),
    );
    expect(detectRecurringExpenses(charges).series).toHaveLength(0);
  });
});

describe("margins", () => {
  it("computes gross margin", () => {
    expect(grossMargin(4900, 2200)).toBeCloseTo(0.55102, 4);
    expect(grossMargin(0, 100)).toBe(0);
  });

  it("computes margin compression in percentage points", () => {
    expect(calculateMarginCompression(4900, 2200, 4900, 2900)).toEqual({
      historicalMarginPct: 55.1,
      currentMarginPct: 40.8,
      deltaPoints: -14.3,
    });
  });

  it("analyzes SKU margins and detects absorbed cost inflation", () => {
    const asOf = d("2026-09-30");
    const product = { id: "p1", sku: "ALP-BTL", name: "Alpine Bottle", sellingPriceCents: 4900 };
    const stable = { id: "p2", sku: "MUG", name: "Camp Mug", sellingPriceCents: 1800 };
    const sales: SaleRecord[] = [];
    // 30 units/month for 6 months for the bottle, 10 for the mug.
    for (let m = 0; m < 6; m++) {
      for (let u = 0; u < 30; u++) {
        const soldAt = new Date(Date.UTC(2026, 3 + m, 15, 10));
        sales.push({ productId: "p1", soldAt, quantity: 1, unitPriceCents: 4900, grossRevenueCents: 4900 });
      }
      for (let u = 0; u < 10; u++) {
        const soldAt = new Date(Date.UTC(2026, 3 + m, 1 + u, 10));
        sales.push({ productId: "p2", soldAt, quantity: 1, unitPriceCents: 1800, grossRevenueCents: 1800 });
      }
    }
    const costs: SupplierCostRecord[] = [
      { productId: "p1", supplierName: "Cascade Drinkware", effectiveDate: d("2026-04-01"), unitCostCents: 2200, source: "invoice" },
      { productId: "p1", supplierName: "Cascade Drinkware", effectiveDate: d("2026-07-01"), unitCostCents: 2900, source: "invoice" },
      { productId: "p2", supplierName: "Mugworks", effectiveDate: d("2026-04-01"), unitCostCents: 700, source: "invoice" },
      { productId: "p2", supplierName: "Mugworks", effectiveDate: d("2026-07-01"), unitCostCents: 720, source: "invoice" },
    ];
    const analyses = analyzeSkuMargins([product, stable], sales, costs, asOf);
    const bottle = analyses.find((a) => a.productId === "p1")!;
    expect(bottle.historicalMarginPct).toBe(55.1);
    expect(bottle.currentMarginPct).toBe(40.8);
    expect(bottle.marginDeltaPoints).toBe(-14.3);
    expect(bottle.costChangePercent).toBe(31.8);
    expect(bottle.retailPriceChanged).toBe(false);
    expect(bottle.unitsSold).toBe(180);
    expect(bottle.revenueCents).toBe(180 * 4900);
    // 90 trailing units -> 30/month -> $7 * 30 = $210/month absorbed.
    expect(bottle.unitsTrailing90Days).toBe(90);
    expect(bottle.monthlyAbsorbedCostCents).toBe(21000);
    expect(bottle.annualAbsorbedCostCents).toBe(252000);
    const flagged = detectCostInflation(analyses);
    expect(flagged.map((f) => f.productId)).toEqual(["p1"]);
  });
});

describe("competitor pricing", () => {
  it("computes medians for odd and even counts", () => {
    expect(calculateCompetitorMedian([6400, 5900, 6200])).toBe(6200);
    expect(calculateCompetitorMedian([5900, 6200, 6400, 6500])).toBe(6300);
    expect(() => calculateCompetitorMedian([])).toThrow();
  });

  it("recommends a conservative price", () => {
    // min(6200 * 0.9 = 5580, 4900 * 1.15 = 5635) = 5580 -> rounded down to $55.
    expect(recommendPrice(4900, 6200)).toBe(5500);
    // Cap at +15%: min(10000 * 0.9, 5000 * 1.15 = 5750) -> $57.
    expect(recommendPrice(5000, 10000)).toBe(5700);
    // Exact float edge: 6000 * 0.9 = 5400 must not round down to $53.
    expect(recommendPrice(5000, 6000)).toBe(5400);
  });

  const obs = (price: number, competitor: string): PriceObservation => ({
    productId: "p1",
    competitorId: competitor,
    competitorName: competitor,
    priceCents: price,
    currency: "USD",
    productUrl: `https://${competitor}.example.com/product`,
    capturedAt: d("2026-09-30"),
    availability: "in_stock",
    captureMode: "fixture",
    apifyRunId: null,
  });

  it("calculates the pricing opportunity from historical velocity", () => {
    const opp = calculatePricingOpportunity("p1", 4900, [obs(5900, "a"), obs(6200, "b"), obs(6400, "c")], 77)!;
    expect(opp.stats).toEqual({ count: 3, medianCents: 6200, minCents: 5900, maxCents: 6400 });
    expect(opp.priceDeltaCents).toBe(1300);
    expect(opp.percentBelowMedian).toBe(21);
    expect(opp.recommendedPriceCents).toBe(5500);
    expect(opp.monthlyUpsideCents).toBe(15400); // $6 * 77 / 3
    expect(opp.annualUpsideCents).toBe(184800); // $6 * 77 * 4
  });

  it("does not establish an opportunity from duplicate, foreign or sold-out quotes", () => {
    const quote = obs(9900, "a");
    expect(calculatePricingOpportunity("p1", 4900, [quote, { ...quote }, { ...obs(9900, "b"), currency: "EUR" }, { ...obs(9900, "c"), availability: "out_of_stock" }], 77)).toBeNull();
  });

  it("requires at least two observations and a real gap", () => {
    expect(calculatePricingOpportunity("p1", 4900, [obs(6200, "a")], 77)).toBeNull();
    expect(calculatePricingOpportunity("p1", 6000, [obs(6100, "a"), obs(6300, "b")], 77)).toBeNull();
  });
});

describe("impact", () => {
  it("annualizes recurring impact and counts one-time recoveries once", () => {
    expect(calculateAnnualizedImpact(15400)).toEqual({ monthlyCents: 15400, annualCents: 184800, recoveryKind: "recurring" });
    expect(oneTimeImpact(118500)).toEqual({ monthlyCents: 0, annualCents: 118500, recoveryKind: "one_time" });
    expect(aggregateImpact([calculateAnnualizedImpact(15400), oneTimeImpact(118500)])).toEqual({
      monthlyCents: 15400,
      annualCents: 303300,
    });
  });

  it("weights confidence by impact", () => {
    expect(weightedConfidence([{ confidence: 0.9, annualCents: 300 }, { confidence: 0.5, annualCents: 100 }])).toBe(0.8);
  });
});

describe("recurring detection on variable spend", () => {
  it("does not flag price creep on variable weekly spend like shipping", () => {
    const amounts = [41200, 38800, 45100, 36900, 43300, 39900, 52100];
    const charges = amounts.map((amount, i) =>
      tx({ id: `w${i}`, date: new Date(Date.UTC(2026, 6, 1 + i * 7)).toISOString().slice(0, 10), merchant: "Trailpost Freight", amount }),
    );
    const { flags, series } = detectRecurringExpenses(charges);
    expect(series[0]?.cadence).toBe("weekly");
    expect(flags).toHaveLength(0);
  });
});
