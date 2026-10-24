import { roundCents, type Cents } from "./money";
import { DAY_MS } from "./types";

/*
 * Cash forecast. Fixed commitments (subscriptions, insurance, contractors) are scheduled on their
 * own cycle; everything else runs at its trailing average. Fixes are layered on top: approved ones
 * as a solid line, the rest as the money still on the table. Integer cents throughout.
 */

export interface CashFlow {
  at: number;
  /** Signed: deposits positive, payments negative. */
  amountCents: Cents;
  category: string | null;
  merchantKey: string;
  merchantName: string;
}

export interface FixInput {
  monthlyCents: Cents;
  oneTimeCents: Cents;
  approved: boolean;
}

export interface ForecastPoint {
  day: number;
  base: Cents;
  approved: Cents;
  potential: Cents;
}

export interface CashForecast {
  asOf: number;
  balanceCents: Cents;
  horizonDays: number;
  points: ForecastPoint[];
  end: { base: Cents; approved: Cents; potential: Cents };
  low: { day: number; cents: Cents };
  monthly: { inflowCents: Cents; variableOutflowCents: Cents; fixedOutflowCents: Cents };
  scheduled: { name: string; amountCents: Cents; day: number }[];
}

export interface ForecastOptions {
  openingBalanceCents: Cents;
  flows: CashFlow[];
  fixes: FixInput[];
  horizonDays?: number;
  /** Trailing window for run rates. */
  windowDays?: number;
  /** Days until a one-time recovery (a refund) lands. */
  refundLagDays?: number;
}

export const FIXED_CATEGORIES = new Set(["software", "subscriptions", "insurance", "contractors", "utilities", "rent", "payroll"]);

export function forecastCash({ openingBalanceCents, flows, fixes, horizonDays = 90, windowDays = 90, refundLagDays = 14 }: ForecastOptions): CashForecast {
  const asOf = flows.reduce((m, f) => Math.max(m, f.at), 0);
  const balance = flows.reduce((s, f) => s + f.amountCents, openingBalanceCents);
  const from = asOf - windowDays * DAY_MS;

  // Fixed commitments: the latest charge of each series, repeated every 30 days.
  const series = new Map<string, CashFlow[]>();
  for (const f of flows) {
    if (f.amountCents >= 0 || !FIXED_CATEGORIES.has(f.category ?? "")) continue;
    series.set(f.merchantKey, [...(series.get(f.merchantKey) ?? []), f]);
  }
  const scheduled: CashForecast["scheduled"] = [];
  let fixedMonthly = 0;
  for (const charges of series.values()) {
    const recent = charges.filter((c) => c.at > asOf - 120 * DAY_MS).sort((a, b) => a.at - b.at);
    if (recent.length < 2) continue;
    const last = recent.at(-1)!;
    fixedMonthly += -last.amountCents;
    for (let k = 1; ; k++) {
      const day = Math.ceil((last.at + k * 30 * DAY_MS - asOf) / DAY_MS);
      if (day > horizonDays) break;
      if (day >= 1) scheduled.push({ name: last.merchantName, amountCents: -last.amountCents, day });
    }
  }
  const isFixed = (f: CashFlow) => f.amountCents < 0 && FIXED_CATEGORIES.has(f.category ?? "") && series.has(f.merchantKey);

  let inflow = 0;
  let variableOut = 0;
  for (const f of flows) {
    if (f.at <= from || isFixed(f)) continue;
    if (f.amountCents > 0) inflow += f.amountCents;
    else variableOut += -f.amountCents;
  }
  const perDay = (total: number) => total / windowDays;

  const approvedMonthly = fixes.filter((x) => x.approved).reduce((s, x) => s + x.monthlyCents, 0);
  const approvedOnce = fixes.filter((x) => x.approved).reduce((s, x) => s + x.oneTimeCents, 0);
  const allMonthly = fixes.reduce((s, x) => s + x.monthlyCents, 0);
  const allOnce = fixes.reduce((s, x) => s + x.oneTimeCents, 0);

  const points: ForecastPoint[] = [];
  let fixedSoFar = 0;
  for (let day = 0; day <= horizonDays; day++) {
    fixedSoFar += scheduled.filter((s) => s.day === day).reduce((s, x) => s + x.amountCents, 0);
    // Cumulative rounding keeps daily rates from drifting.
    const base = balance + roundCents(day * perDay(inflow)) - roundCents(day * perDay(variableOut)) - fixedSoFar;
    const refund = (once: number) => (day >= refundLagDays ? once : 0);
    points.push({
      day,
      base,
      approved: base + roundCents((day * approvedMonthly) / 30) + refund(approvedOnce),
      potential: base + roundCents((day * allMonthly) / 30) + refund(allOnce),
    });
  }
  const low = points.reduce((m, p) => (p.base < m.cents ? { day: p.day, cents: p.base } : m), { day: 0, cents: balance });
  const last = points[points.length - 1];

  return {
    asOf,
    balanceCents: balance,
    horizonDays,
    points,
    end: { base: last.base, approved: last.approved, potential: last.potential },
    low,
    monthly: {
      inflowCents: roundCents(perDay(inflow) * 30),
      variableOutflowCents: roundCents(perDay(variableOut) * 30),
      fixedOutflowCents: fixedMonthly,
    },
    scheduled: scheduled.sort((a, b) => a.day - b.day),
  };
}
