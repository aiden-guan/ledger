import { merchantKey } from "./merchants";
import { percentChange, roundCents, type Cents } from "./money";
import type { LedgerTransaction } from "./types";
import { daysBetween } from "./types";

export type Cadence = "weekly" | "monthly" | "annual";

const CADENCE_WINDOWS: Record<Cadence, { min: number; max: number; perYear: number }> = {
  weekly: { min: 5, max: 9, perYear: 52 },
  monthly: { min: 25, max: 35, perYear: 12 },
  annual: { min: 350, max: 380, perYear: 1 },
};

export interface RecurringConfig {
  /** Minimum charges required to call something a recurring series. */
  minOccurrences: number;
  /** Share of intervals that must fall inside the cadence window. */
  minIntervalMatchRatio: number;
  /** Price creep threshold as a percentage increase over the prior baseline. */
  creepThresholdPercent: number;
  /** Ignore creep smaller than this absolute monthly amount. */
  creepMinimumCents: Cents;
  /** Charges within this fraction of each other are treated as the same plan price. */
  amountStabilityTolerance: number;
  /**
   * Categories that can be subscriptions. Inventory, payroll and revenue are excluded:
   * supplier cost changes are handled by SKU margin analysis instead.
   */
  subscriptionCategories: string[] | null;
}

export const DEFAULT_RECURRING_CONFIG: RecurringConfig = {
  minOccurrences: 3,
  minIntervalMatchRatio: 0.75,
  creepThresholdPercent: 20,
  creepMinimumCents: 1000,
  amountStabilityTolerance: 0.05,
  subscriptionCategories: ["software", "subscriptions", "saas", "insurance", "services", "contractors", "utilities"],
};

export interface RecurringSeries {
  merchantKey: string;
  merchantName: string;
  normalizedMerchantName: string;
  cadence: Cadence;
  charges: LedgerTransaction[];
  latestAmountCents: Cents;
  /** Median of charges before the most recent price change (or of all charges if none). */
  previousAmountCents: Cents;
  percentIncrease: number;
  annualizedSpendCents: Cents;
  /** Annualized cost of the increase over the prior baseline. */
  annualizedIncreaseCents: Cents;
  monthlyIncreaseCents: Cents;
  priceChangeDate: Date | null;
  chargesAtLatestPrice: number;
  chargesAtPreviousPrice: number;
  /** True when charges before the change were a fixed plan price (not variable spend). */
  baselineStable: boolean;
  intervalsDays: number[];
}

export interface RecurringFlag {
  kind: "PRICE_CREEP" | "POSSIBLE_DUPLICATE_SUBSCRIPTION";
  series: RecurringSeries;
  /** Second series for duplicate-subscription flags. */
  relatedSeries?: RecurringSeries;
  reason: string;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function classifyCadence(intervals: number[], config: RecurringConfig): Cadence | null {
  if (intervals.length === 0) return null;
  for (const cadence of ["monthly", "weekly", "annual"] as Cadence[]) {
    const { min, max } = CADENCE_WINDOWS[cadence];
    const matches = intervals.filter((d) => d >= min && d <= max).length;
    if (matches / intervals.length >= config.minIntervalMatchRatio) return cadence;
  }
  return null;
}

function sameish(a: Cents, b: Cents, tolerance: number): boolean {
  const larger = Math.max(Math.abs(a), Math.abs(b));
  return larger === 0 || Math.abs(a - b) / larger <= tolerance;
}

function buildSeries(charges: LedgerTransaction[], cadence: Cadence, config: RecurringConfig): RecurringSeries {
  const sorted = [...charges].sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime());
  const intervals = sorted.slice(1).map((c, i) => Math.round(daysBetween(sorted[i].transactionDate, c.transactionDate)));
  const latest = sorted[sorted.length - 1];

  // Walk back from the latest charge while the amount stays at the latest plan price.
  let changeIndex = sorted.length - 1;
  while (changeIndex > 0 && sameish(sorted[changeIndex - 1].amountCents, latest.amountCents, config.amountStabilityTolerance)) {
    changeIndex--;
  }
  const earlier = sorted.slice(0, changeIndex);
  const atLatest = sorted.slice(changeIndex);
  const previousAmount = earlier.length > 0 ? roundCents(median(earlier.map((c) => c.amountCents))) : latest.amountCents;
  const perYear = CADENCE_WINDOWS[cadence].perYear;
  const increasePerCharge = Math.max(0, latest.amountCents - previousAmount);
  const monthlyIncrease = roundCents((increasePerCharge * perYear) / 12);

  return {
    merchantKey: merchantKey(latest.normalizedMerchantName),
    merchantName: latest.merchantName,
    normalizedMerchantName: latest.normalizedMerchantName,
    cadence,
    charges: sorted,
    latestAmountCents: latest.amountCents,
    previousAmountCents: previousAmount,
    percentIncrease: Number(percentChange(previousAmount, latest.amountCents).toFixed(2)),
    annualizedSpendCents: latest.amountCents * perYear,
    annualizedIncreaseCents: increasePerCharge * perYear,
    monthlyIncreaseCents: monthlyIncrease,
    priceChangeDate: earlier.length > 0 ? atLatest[0].transactionDate : null,
    chargesAtLatestPrice: atLatest.length,
    chargesAtPreviousPrice: earlier.length,
    baselineStable: earlier.length > 0 && earlier.every((c) => sameish(c.amountCents, previousAmount, config.amountStabilityTolerance)),
    intervalsDays: intervals,
  };
}

/**
 * Splits one merchant's debits into interleaved series when it bills twice per cycle
 * (e.g. two separate accounts with the same vendor). Charges are clustered by amount.
 */
function clusterByAmount(charges: LedgerTransaction[], tolerance: number): LedgerTransaction[][] {
  const clusters: LedgerTransaction[][] = [];
  for (const charge of [...charges].sort((a, b) => a.amountCents - b.amountCents)) {
    const cluster = clusters.find((c) => sameish(c[0].amountCents, charge.amountCents, tolerance));
    if (cluster) cluster.push(charge);
    else clusters.push([charge]);
  }
  return clusters;
}

export function detectRecurringExpenses(
  transactions: LedgerTransaction[],
  config: RecurringConfig = DEFAULT_RECURRING_CONFIG,
): { series: RecurringSeries[]; flags: RecurringFlag[] } {
  const groups = new Map<string, LedgerTransaction[]>();
  for (const tx of transactions) {
    if (tx.transactionType !== "DEBIT") continue;
    if (config.subscriptionCategories && tx.category && !config.subscriptionCategories.includes(tx.category)) continue;
    const key = merchantKey(tx.normalizedMerchantName);
    const list = groups.get(key) ?? [];
    list.push(tx);
    groups.set(key, list);
  }

  const series: RecurringSeries[] = [];
  const flags: RecurringFlag[] = [];

  for (const charges of groups.values()) {
    if (charges.length < config.minOccurrences) continue;
    const sorted = [...charges].sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime());
    const intervals = sorted.slice(1).map((c, i) => daysBetween(sorted[i].transactionDate, c.transactionDate));
    const cadence = classifyCadence(intervals, config);

    if (cadence) {
      const s = buildSeries(sorted, cadence, config);
      series.push(s);
      const increase = s.latestAmountCents - s.previousAmountCents;
      if (
        s.chargesAtPreviousPrice >= 2 &&
        s.baselineStable &&
        s.percentIncrease >= config.creepThresholdPercent &&
        increase >= config.creepMinimumCents
      ) {
        flags.push({
          kind: "PRICE_CREEP",
          series: s,
          reason: `Recurring charge rose ${s.percentIncrease.toFixed(1)}% after ${s.chargesAtPreviousPrice} charges at the prior price.`,
        });
      }
      continue;
    }

    // No single cadence: check for two interleaved monthly series from the same vendor.
    const clusters = clusterByAmount(sorted, config.amountStabilityTolerance).filter(
      (c) => c.length >= config.minOccurrences,
    );
    const monthlyClusters = clusters
      .map((c) => {
        const cs = [...c].sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime());
        const iv = cs.slice(1).map((x, i) => daysBetween(cs[i].transactionDate, x.transactionDate));
        const cad = classifyCadence(iv, config);
        return cad === "monthly" ? buildSeries(cs, "monthly", config) : null;
      })
      .filter((s): s is RecurringSeries => s !== null);

    series.push(...monthlyClusters);
    if (monthlyClusters.length >= 2) {
      const [primary, secondary] = monthlyClusters.sort((a, b) => b.latestAmountCents - a.latestAmountCents);
      flags.push({
        kind: "POSSIBLE_DUPLICATE_SUBSCRIPTION",
        series: secondary,
        relatedSeries: primary,
        reason: `Two separate monthly charges are billed by the same vendor.`,
      });
    }
  }

  return { series, flags };
}
