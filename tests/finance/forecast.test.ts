import { describe, expect, it } from "vitest";
import { EXPECTED } from "@/lib/demo/catalog";
import { generateDemoData } from "@/lib/demo/seed";
import { forecastCash, type CashFlow } from "@/lib/finance/forecast";
import { merchantKey } from "@/lib/finance/merchants";

const DAY = 86_400_000;
const T0 = Date.parse("2026-01-01T00:00:00Z");

describe("cash forecast", () => {
  const flows: CashFlow[] = [];
  // $100 in every day for 90 days, a $300 subscription every 30 days, $20 of variable spend a day.
  for (let d = 1; d <= 90; d++) {
    flows.push({ at: T0 + d * DAY, amountCents: 10_000, category: "revenue", merchantKey: "store", merchantName: "STORE" });
    flows.push({ at: T0 + d * DAY, amountCents: -2_000, category: "marketing", merchantKey: "ads", merchantName: "ADS" });
    if (d % 30 === 0) flows.push({ at: T0 + d * DAY, amountCents: -30_000, category: "software", merchantKey: "saas", merchantName: "SAAS" });
  }
  const opening = 500_000;

  it("starts from the current balance and runs flows at their trailing rate", () => {
    const f = forecastCash({ openingBalanceCents: opening, flows, fixes: [] });
    expect(f.balanceCents).toBe(opening + 90 * 8_000 - 3 * 30_000);
    expect(f.monthly).toEqual({ inflowCents: 300_000, variableOutflowCents: 60_000, fixedOutflowCents: 30_000 });
    expect(f.scheduled.map((s) => s.day)).toEqual([30, 60, 90]);
    expect(f.end.base).toBe(f.balanceCents + 90 * 8_000 - 3 * 30_000);
    expect(f.points).toHaveLength(91);
  });

  it("layers approved fixes and the rest separately", () => {
    const f = forecastCash({
      openingBalanceCents: opening,
      flows,
      fixes: [
        { monthlyCents: 3_000, oneTimeCents: 0, approved: true },
        { monthlyCents: 0, oneTimeCents: 50_000, approved: false },
      ],
    });
    expect(f.end.approved - f.end.base).toBe(9_000);
    expect(f.end.potential - f.end.base).toBe(9_000 + 50_000);
    // The refund lands after the lag, not before.
    expect(f.points[13].potential - f.points[13].approved).toBe(0);
    expect(f.points[14].potential - f.points[14].approved).toBe(50_000);
  });

  it("uses integer cents everywhere", () => {
    const f = forecastCash({ openingBalanceCents: opening, flows: flows.map((x) => ({ ...x, amountCents: x.amountCents + 7 })), fixes: [{ monthlyCents: 1_001, oneTimeCents: 0, approved: true }] });
    expect(f.points.every((p) => Number.isInteger(p.base) && Number.isInteger(p.approved) && Number.isInteger(p.potential))).toBe(true);
  });

  it("forecasts the demo company", () => {
    const data = generateDemoData({ anchorDate: new Date("2026-10-24T00:00:00Z") });
    const demoFlows = data.transactions.map((t) => ({
      at: t.transactionDate,
      amountCents: t.transactionType === "CREDIT" ? t.amountCents : -t.amountCents,
      category: t.category,
      merchantKey: merchantKey(t.normalizedMerchantName),
      merchantName: t.merchantName,
    }));
    const oneTime = EXPECTED.totals.annualCents - EXPECTED.totals.monthlyCents * 12;
    const f = forecastCash({
      openingBalanceCents: data.organization.openingBalanceCents,
      flows: demoFlows,
      fixes: [{ monthlyCents: EXPECTED.totals.monthlyCents, oneTimeCents: oneTime, approved: false }],
    });
    expect(f.balanceCents).toBe(1_196_715);
    expect(f.end.potential - f.end.base).toBe(EXPECTED.totals.monthlyCents * 3 + oneTime);
    expect(f.scheduled.some((s) => s.name.includes("RELAY") || s.name.toLowerCase().includes("relay"))).toBe(true);
  });
});
