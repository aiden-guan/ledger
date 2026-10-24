import { percentChange, roundCents, type Cents } from "./money";
import type { ProductRecord, SaleRecord, SupplierCostRecord } from "./types";
import { DAY_MS } from "./types";

/** Gross margin as a decimal fraction: (sellingPrice - unitCost) / sellingPrice. */
export function grossMargin(sellingPriceCents: Cents, unitCostCents: Cents): number {
  if (sellingPriceCents <= 0) return 0;
  return (sellingPriceCents - unitCostCents) / sellingPriceCents;
}

/** Round a decimal fraction to a percentage with one decimal place (0.55102 -> 55.1). */
export function toPercent(fraction: number, digits = 1): number {
  return Number((fraction * 100).toFixed(digits));
}

export interface MarginCompression {
  historicalMarginPct: number;
  currentMarginPct: number;
  /** Negative when margin shrank, in percentage points. */
  deltaPoints: number;
}

export function calculateMarginCompression(
  historicalPriceCents: Cents,
  historicalCostCents: Cents,
  currentPriceCents: Cents,
  currentCostCents: Cents,
): MarginCompression {
  const historical = grossMargin(historicalPriceCents, historicalCostCents);
  const current = grossMargin(currentPriceCents, currentCostCents);
  return {
    historicalMarginPct: toPercent(historical),
    currentMarginPct: toPercent(current),
    deltaPoints: Number(((current - historical) * 100).toFixed(1)),
  };
}

export interface SkuMarginAnalysis {
  productId: string;
  sku: string;
  name: string;
  revenueCents: Cents;
  unitsSold: number;
  averageSellingPriceCents: Cents;
  currentSellingPriceCents: Cents;
  latestUnitCostCents: Cents | null;
  previousUnitCostCents: Cents | null;
  costChangeDate: Date | null;
  costChangePercent: number;
  supplierName: string | null;
  costSource: string | null;
  grossProfitCents: Cents;
  grossMarginPct: number;
  historicalMarginPct: number;
  currentMarginPct: number;
  marginDeltaPoints: number;
  /** Average unit price of sales before / after the cost change. */
  priceBeforeChangeCents: Cents | null;
  priceAfterChangeCents: Cents | null;
  retailPriceChanged: boolean;
  unitsTrailing90Days: number;
  monthlyUnitVelocity: number;
  /** Extra cost absorbed per month at historical velocity because of the cost change. */
  monthlyAbsorbedCostCents: Cents;
  annualAbsorbedCostCents: Cents;
}

function averageUnitPrice(sales: SaleRecord[]): Cents | null {
  const units = sales.reduce((s, x) => s + x.quantity, 0);
  if (units === 0) return null;
  const revenue = sales.reduce((s, x) => s + x.grossRevenueCents, 0);
  return roundCents(revenue / units);
}

export function analyzeSkuMargins(
  products: ProductRecord[],
  sales: SaleRecord[],
  costs: SupplierCostRecord[],
  asOf: Date,
): SkuMarginAnalysis[] {
  const salesByProduct = new Map<string, SaleRecord[]>();
  for (const s of sales) {
    const list = salesByProduct.get(s.productId) ?? [];
    list.push(s);
    salesByProduct.set(s.productId, list);
  }
  const costsByProduct = new Map<string, SupplierCostRecord[]>();
  for (const c of costs) {
    const list = costsByProduct.get(c.productId) ?? [];
    list.push(c);
    costsByProduct.set(c.productId, list);
  }

  const trailingStart = asOf.getTime() - 90 * DAY_MS;

  return products.map((product) => {
    const productSales = salesByProduct.get(product.id) ?? [];
    const productCosts = (costsByProduct.get(product.id) ?? [])
      .filter((c) => c.effectiveDate.getTime() <= asOf.getTime())
      .sort((a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime());

    const unitsSold = productSales.reduce((s, x) => s + x.quantity, 0);
    const revenueCents = productSales.reduce((s, x) => s + x.grossRevenueCents, 0);
    const averageSellingPriceCents = unitsSold ? roundCents(revenueCents / unitsSold) : product.sellingPriceCents;

    const latest = productCosts[productCosts.length - 1] ?? null;
    const previous = productCosts.length > 1 ? productCosts[productCosts.length - 2] : null;
    const costChangeDate = previous && latest ? latest.effectiveDate : null;

    // Cost of goods: apply the supplier cost effective at the time of each sale.
    let cogsCents = 0;
    for (const sale of productSales) {
      const effective = [...productCosts].reverse().find((c) => c.effectiveDate.getTime() <= sale.soldAt.getTime()) ?? productCosts[0];
      cogsCents += (effective?.unitCostCents ?? 0) * sale.quantity;
    }
    const grossProfitCents = revenueCents - cogsCents;

    const before = costChangeDate ? productSales.filter((s) => s.soldAt < costChangeDate) : productSales;
    const after = costChangeDate ? productSales.filter((s) => s.soldAt >= costChangeDate) : [];
    const priceBefore = averageUnitPrice(before);
    const priceAfter = averageUnitPrice(after);
    const retailPriceChanged =
      priceBefore !== null && priceAfter !== null && Math.abs(priceAfter - priceBefore) > Math.max(1, priceBefore * 0.01);

    const historicalCost = previous?.unitCostCents ?? latest?.unitCostCents ?? 0;
    const currentCost = latest?.unitCostCents ?? 0;
    const compression = calculateMarginCompression(
      priceBefore ?? product.sellingPriceCents,
      historicalCost,
      product.sellingPriceCents,
      currentCost,
    );

    const unitsTrailing90Days = productSales
      .filter((s) => s.soldAt.getTime() > trailingStart && s.soldAt.getTime() <= asOf.getTime())
      .reduce((s, x) => s + x.quantity, 0);
    const monthlyUnitVelocity = Number((unitsTrailing90Days / 3).toFixed(2));
    const costDelta = previous && latest ? latest.unitCostCents - previous.unitCostCents : 0;

    return {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      revenueCents,
      unitsSold,
      averageSellingPriceCents,
      currentSellingPriceCents: product.sellingPriceCents,
      latestUnitCostCents: latest?.unitCostCents ?? null,
      previousUnitCostCents: previous?.unitCostCents ?? null,
      costChangeDate,
      costChangePercent: previous && latest ? Number(percentChange(previous.unitCostCents, latest.unitCostCents).toFixed(1)) : 0,
      supplierName: latest?.supplierName ?? null,
      costSource: latest?.source ?? null,
      grossProfitCents,
      grossMarginPct: revenueCents ? toPercent(grossProfitCents / revenueCents) : 0,
      historicalMarginPct: compression.historicalMarginPct,
      currentMarginPct: compression.currentMarginPct,
      marginDeltaPoints: compression.deltaPoints,
      priceBeforeChangeCents: priceBefore,
      priceAfterChangeCents: priceAfter,
      retailPriceChanged,
      unitsTrailing90Days,
      monthlyUnitVelocity,
      monthlyAbsorbedCostCents: roundCents((costDelta * unitsTrailing90Days) / 3),
      annualAbsorbedCostCents: roundCents(costDelta * unitsTrailing90Days * 4),
    };
  });
}

export interface CostInflationConfig {
  minCostIncreasePercent: number;
  minMarginCompressionPoints: number;
  minMonthlyUnits: number;
}

export const DEFAULT_COST_INFLATION_CONFIG: CostInflationConfig = {
  minCostIncreasePercent: 10,
  minMarginCompressionPoints: 5,
  minMonthlyUnits: 5,
};

/** Products whose supplier cost rose materially while the retail price stayed flat. */
export function detectCostInflation(
  analyses: SkuMarginAnalysis[],
  config: CostInflationConfig = DEFAULT_COST_INFLATION_CONFIG,
): SkuMarginAnalysis[] {
  return analyses
    .filter(
      (a) =>
        a.previousUnitCostCents !== null &&
        a.costChangePercent >= config.minCostIncreasePercent &&
        -a.marginDeltaPoints >= config.minMarginCompressionPoints &&
        !a.retailPriceChanged &&
        a.monthlyUnitVelocity >= config.minMonthlyUnits,
    )
    .sort((a, b) => b.annualAbsorbedCostCents - a.annualAbsorbedCostCents);
}
