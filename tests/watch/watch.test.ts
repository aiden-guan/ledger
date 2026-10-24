import { describe, expect, it } from "vitest";
import { generateDemoData } from "@/lib/demo/seed";
import { normalizeMerchantName } from "@/lib/finance/merchants";
import { DEFAULT_POLICY, editDistance, findLookalike, foldConfusables, screenPayment, type HistoryEntry, type Payment } from "@/lib/watch/screen";
import { FEED_SCRIPT } from "@/lib/watch/script";

const ANCHOR = new Date("2026-10-24T00:00:00Z");

function demoHistory(): HistoryEntry[] {
  return generateDemoData({ anchorDate: ANCHOR }).transactions.map((t, i) => ({
    id: `tx-${i}`,
    transactionDate: new Date(t.transactionDate),
    merchantName: t.merchantName,
    normalizedMerchantName: t.normalizedMerchantName,
    amountCents: t.amountCents,
    transactionType: t.transactionType,
    category: t.category,
    invoiceReference: t.invoiceReference,
    payeeAccount: (t.metadata.payeeAccount as string | undefined) ?? null,
  }));
}

/** Replays the feed the way convex/watch.ts does: anything that posts joins the history. */
function replay() {
  const history = demoHistory();
  return FEED_SCRIPT.map((item, i) => {
    const payment: Payment = { ...item, id: `feed-${i}`, at: ANCHOR.getTime() + i * 60_000 };
    const result = screenPayment(payment, history, DEFAULT_POLICY);
    if (result.verdict !== "hold" && !result.overLimit) {
      history.push({ ...payment, transactionDate: new Date(payment.at), normalizedMerchantName: normalizeMerchantName(payment.merchantName) });
    }
    return { item, result };
  });
}

describe("string similarity", () => {
  it("counts a transposition as one edit", () => {
    expect(editDistance("summit", "summti")).toBe(1);
    expect(editDistance("packaging", "packagng")).toBe(1);
    expect(editDistance("abc", "abc")).toBe(0);
  });

  it("folds lookalike characters", () => {
    expect(foldConfusables("summ1t")).toBe(foldConfusables("summit"));
    expect(foldConfusables("rnailroom")).toBe(foldConfusables("mailroom"));
  });

  it("matches near names but not unrelated or identical ones", () => {
    const known = [{ key: "summitpackagingsupply" }, { key: "canvasly" }];
    expect(findLookalike("summitpackagngsupply", known)).toEqual({ key: "summitpackagingsupply", distance: 1 });
    expect(findLookalike("summ1tpackagingsupply", known)?.key).toBe("summitpackagingsupply");
    expect(findLookalike("summitpackagingsupply", known)).toBeNull();
    expect(findLookalike("kestrellabel", known)).toBeNull();
  });
});

describe("payment screen", () => {
  const results = replay();
  const verdicts = results.map((r) => r.result.verdict);

  it("clears routine payments and deposits", () => {
    expect(verdicts).toEqual(["clear", "clear", "clear", "hold", "clear", "review", "hold", "clear", "clear", "clear"]);
  });

  it("holds an impersonator with new bank details", () => {
    const { result } = results[3];
    expect(result.signals.map((s) => s.signal)).toEqual(["lookalike_payee", "bank_details_changed", "large_first_payment"]);
    expect(result.score).toBe(1);
    expect(result.payee).toMatchObject({ name: "Summit Packaging Supply", lookalike: true });
    expect(result.signals[1].detail).toContain("••4410");
  });

  it("holds a second payment of an invoice that was already paid", () => {
    const { result } = results[6];
    expect(result.signals.map((s) => s.signal)).toEqual(["invoice_already_paid"]);
    expect(result.signals[0].detail).toBe("INV-20475 was already paid on Sep 26");
    expect(result.signals[0].ref).toMatch(/^tx-/);
  });

  it("flags an ad charge far above the usual amount", () => {
    const { result } = results[5];
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].signal).toBe("amount_outlier");
    expect(result.score).toBe(0.45);
  });

  it("does not hold a small first payment to a new vendor", () => {
    expect(results[8].result).toMatchObject({ verdict: "clear", score: 0.15 });
  });

  it("sends clear payments above the approval limit to a person", () => {
    expect(results[7].result).toMatchObject({ verdict: "clear", overLimit: true });
    expect(results.filter((r) => r.result.overLimit)).toHaveLength(1);
  });

  it("respects a stricter policy", () => {
    const history = demoHistory();
    const ad = { ...FEED_SCRIPT[5], id: "x", at: ANCHOR.getTime() };
    expect(screenPayment(ad, history, { ...DEFAULT_POLICY, holdAt: 0.4 }).verdict).toBe("hold");
    expect(screenPayment(ad, history, { ...DEFAULT_POLICY, reviewAt: 0.5 }).verdict).toBe("clear");
  });
});
