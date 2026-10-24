import { describe, expect, it } from "vitest";
import { previewField } from "@/lib/demo/preview";

/*
 * The field must point each finding at exactly the records its numbers were computed from, so
 * what lights up on screen is the evidence, not decoration.
 */

describe("field", async () => {
  const field = await previewField();
  const byType = (type: string) => field.leaks.find((l) => l.type === type)!;
  const record = (id: string) => field.records.find((r) => r.id === id)!;

  it("has one record per sale and bank line, in time order", () => {
    expect(field.records).toHaveLength(field.counts.sales + field.counts.transactions);
    expect(field.records.every((r, i) => i === 0 || field.records[i - 1].at <= r.at)).toBe(true);
    expect(field.start).toBe(field.records[0].at);
    expect(field.asOf).toBeGreaterThanOrEqual(field.records.at(-1)!.at);
  });

  it("points the duplicate payment at the two payments of one invoice", () => {
    const dup = byType("DUPLICATE_PAYMENT");
    expect(dup.records).toHaveLength(2);
    const [a, b] = dup.records.map(record);
    expect(a.kind).toBe("out");
    expect(a.ref).toBe(b.ref);
    expect(a.cents).toBe(b.cents);
    expect(dup.anchor).toBe(dup.records[1]);
    expect(dup.fix?.kind).toBe("email");
  });

  it("points price creep at every charge in the series, labelled at the first raised one", () => {
    const creep = byType("SUBSCRIPTION_CREEP");
    expect(creep.records).toHaveLength(6);
    const charges = creep.records.map(record).sort((x, y) => x.at - y.at);
    expect(new Set(charges.map((c) => c.group)).size).toBe(1);
    expect(record(creep.anchor!).cents).toBeGreaterThan(charges[0].cents);
  });

  it("points margin erosion at every sale since the unit cost rose, and pricing at the trailing 90 days", () => {
    const margin = byType("MARGIN_EROSION");
    const pricing = byType("PRICING_OPPORTUNITY");
    expect(margin.mark?.label).toBe("Unit cost $22 → $29");
    const since = (leak: typeof margin, from: number) => {
      const sales = leak.records.map(record);
      expect(sales.length).toBeGreaterThan(10);
      expect(sales.every((s) => s.kind === "sale" && s.group === leak.subject && s.at >= from)).toBe(true);
      const all = field.records.filter((r) => r.kind === "sale" && r.group === leak.subject && r.at >= from && r.at <= field.asOf);
      expect(sales).toHaveLength(all.length);
    };
    since(margin, margin.mark!.at);
    since(pricing, field.asOf - 90 * 86_400_000);
    for (const leak of [margin, pricing]) {
      expect(leak.prices.length).toBeGreaterThanOrEqual(2);
      expect(leak.prices.every((p) => p.cents > leak.ownPriceCents!)).toBe(true);
    }
  });

  it("drafts a fix for every finding and keeps evidence short", () => {
    expect(field.leaks).toHaveLength(4);
    for (const leak of field.leaks) {
      expect(leak.fix).not.toBeNull();
      expect(leak.evidence.length).toBeGreaterThan(0);
      expect(leak.evidence.length).toBeLessThanOrEqual(3);
    }
  });
});
