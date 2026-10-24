import type { CashForecast } from "@/lib/finance/forecast";
import { roundCents } from "@/lib/finance/money";
import { isCredible, isFixed, type FieldLeak } from "@/lib/field/model";

const REFUND_LAG_DAYS = 14;

/**
 * Re-layers the fixes onto a forecast's base line with the decisions as the screen shows them, so
 * approving a fix moves the line at once. Same rule as lib/finance/forecast.ts: recurring fixes
 * accrue daily, a refund lands after two weeks.
 */
export function withDecisions(forecast: CashForecast, leaks: FieldLeak[]): CashForecast {
  const fixes = leaks.filter(isCredible).map((l) => ({ monthly: l.oneTime ? 0 : l.monthlyCents, once: l.oneTime ? l.annualCents : 0, approved: isFixed(l) }));
  const sum = (pick: (f: (typeof fixes)[number]) => number, all: boolean) => fixes.filter((f) => all || f.approved).reduce((s, f) => s + pick(f), 0);
  const [am, ao, pm, po] = [sum((f) => f.monthly, false), sum((f) => f.once, false), sum((f) => f.monthly, true), sum((f) => f.once, true)];
  const points = forecast.points.map((p) => ({
    ...p,
    approved: p.base + roundCents((p.day * am) / 30) + (p.day >= REFUND_LAG_DAYS ? ao : 0),
    potential: p.base + roundCents((p.day * pm) / 30) + (p.day >= REFUND_LAG_DAYS ? po : 0),
  }));
  const last = points[points.length - 1];
  return { ...forecast, points, end: { base: last.base, approved: last.approved, potential: last.potential } };
}
