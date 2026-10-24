import { scoreDuplicatePair } from "@/lib/finance/duplicates";
import { format, type Cents } from "@/lib/finance/money";
import { merchantKey, normalizeMerchantName } from "@/lib/finance/merchants";
import type { LedgerTransaction } from "@/lib/finance/types";

/*
 * The fast loop. Every payment that arrives from the bank feed is screened here before it posts,
 * in the same Convex mutation that receives it, so a suspicious payment is held in milliseconds.
 * Pure and deterministic: the same payment against the same history always gets the same verdict.
 */

export interface Payment {
  id: string;
  at: number;
  merchantName: string;
  amountCents: Cents;
  transactionType: "DEBIT" | "CREDIT";
  category: string | null;
  invoiceReference: string | null;
  /** Last four digits of the receiving account, when the rail exposes it (ACH, wire). */
  payeeAccount: string | null;
}

export type SignalKey =
  | "lookalike_payee"
  | "bank_details_changed"
  | "invoice_already_paid"
  | "duplicate_payment"
  | "amount_outlier"
  | "new_payee"
  | "large_first_payment";

export interface Signal {
  signal: SignalKey;
  weight: number;
  detail: string;
  /** The earlier payment this signal rests on, when there is one. */
  ref: string | null;
}

export type Verdict = "clear" | "review" | "hold";

export interface Policy {
  /** Risk score at which a payment is held before it posts. */
  holdAt: number;
  /** Risk score at which a payment posts but is flagged. */
  reviewAt: number;
  /** Clear payments above this amount still wait for a person. */
  approvalLimitCents: Cents;
}

export const DEFAULT_POLICY: Policy = { holdAt: 0.7, reviewAt: 0.4, approvalLimitCents: 100_000 };

export interface Screening {
  verdict: Verdict;
  score: number;
  signals: Signal[];
  /** The known payee this payment was matched to (exactly or as a lookalike). */
  payee: { name: string; payments: number; lookalike: boolean } | null;
  /** True when the verdict is clear but the amount is above the approval limit. */
  overLimit: boolean;
}

export interface HistoryEntry extends LedgerTransaction {
  payeeAccount: string | null;
}

interface KnownPayee {
  key: string;
  name: string;
  payments: HistoryEntry[];
  accounts: Map<string, number>;
}

/** Restricted Damerau-Levenshtein (optimal string alignment) distance. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Folds characters fraudsters swap for lookalikes (0 for o, 1 for l, rn for m). */
export function foldConfusables(key: string): string {
  return key.replace(/rn/g, "m").replace(/0/g, "o").replace(/[1i|]/g, "l").replace(/5/g, "s").replace(/vv/g, "w");
}

/** A known payee whose name is one or two keystrokes away, or identical once lookalike characters are folded. */
export function findLookalike(key: string, known: Iterable<{ key: string }>): { key: string; distance: number } | null {
  if (key.length < 6) return null;
  let best: { key: string; distance: number } | null = null;
  const folded = foldConfusables(key);
  for (const k of known) {
    if (k.key === key) return null;
    const distance = foldConfusables(k.key) === folded ? 1 : editDistance(key, k.key);
    const allowed = Math.max(1, Math.floor(Math.min(key.length, k.key.length) * 0.12));
    if (distance <= allowed && (!best || distance < best.distance)) best = { key: k.key, distance };
  }
  return best;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

const day = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function knownPayees(history: HistoryEntry[]): Map<string, KnownPayee> {
  const payees = new Map<string, KnownPayee>();
  for (const t of history) {
    if (t.transactionType !== "DEBIT") continue;
    const key = merchantKey(t.normalizedMerchantName);
    const p: KnownPayee = payees.get(key) ?? { key, name: t.merchantName, payments: [], accounts: new Map() };
    p.payments.push(t);
    if (t.payeeAccount) p.accounts.set(t.payeeAccount, (p.accounts.get(t.payeeAccount) ?? 0) + 1);
    // Prefer the plainest descriptor as the display name.
    if (!/[*]|^ach /i.test(t.merchantName) && /[*]|^ach /i.test(p.name)) p.name = t.merchantName;
    payees.set(key, p);
  }
  return payees;
}

export function verdictFor(score: number, policy: Policy): Verdict {
  if (score >= policy.holdAt) return "hold";
  if (score >= policy.reviewAt) return "review";
  return "clear";
}

export function screenPayment(payment: Payment, history: HistoryEntry[], policy: Policy = DEFAULT_POLICY): Screening {
  if (payment.transactionType === "CREDIT") return { verdict: "clear", score: 0, signals: [], payee: null, overLimit: false };

  const payees = knownPayees(history);
  const normalized = normalizeMerchantName(payment.merchantName);
  const key = merchantKey(normalized);
  const exact = payees.get(key) ?? null;
  const look = exact ? null : findLookalike(key, payees.values());
  const target = exact ?? (look ? payees.get(look.key)! : null);
  const signals: Signal[] = [];
  const add = (signal: SignalKey, weight: number, detail: string, ref: string | null = null) => signals.push({ signal, weight, detail, ref });

  if (look && target) {
    add(
      "lookalike_payee",
      0.5,
      `${look.distance === 1 ? "One character" : `${look.distance} characters`} off ${target.name} (paid ${target.payments.length} times)`,
      target.payments.at(-1)?.id ?? null,
    );
  } else if (!exact) {
    add("new_payee", 0.15, "First payment to this payee");
  }

  if (target && payment.payeeAccount && target.accounts.size > 0 && !target.accounts.has(payment.payeeAccount)) {
    const [usual] = [...target.accounts.entries()].sort((a, b) => b[1] - a[1]);
    add("bank_details_changed", 0.35, `Pays account ••${payment.payeeAccount}; every earlier payment went to ••${usual[0]}`);
  }

  const invoice = payment.invoiceReference?.trim().toUpperCase() || null;
  const paidInvoice = invoice && target ? target.payments.find((t) => t.invoiceReference?.trim().toUpperCase() === invoice) : undefined;
  if (paidInvoice) {
    add("invoice_already_paid", 0.7, `${invoice} was already paid on ${day(paidInvoice.transactionDate.getTime())}`, paidInvoice.id);
  } else if (exact) {
    const asTx: LedgerTransaction = { ...payment, transactionDate: new Date(payment.at), normalizedMerchantName: normalized };
    const dup = exact.payments
      .map((t) => ({ t, s: scoreDuplicatePair(t, asTx) }))
      .filter((x) => x.s && x.s.score >= 0.7)
      .sort((x, y) => y.s!.score - x.s!.score)[0];
    if (dup) add("duplicate_payment", 0.5, `Same amount to the same payee on ${day(dup.t.transactionDate.getTime())}`, dup.t.id);
  }

  if (exact && exact.payments.length >= 3) {
    const usual = median(exact.payments.map((t) => t.amountCents));
    const multiple = payment.amountCents / usual;
    if (multiple >= 3) add("amount_outlier", 0.45, `${multiple.toFixed(1)}× the usual ${format(usual)}`);
    else if (multiple >= 1.75) add("amount_outlier", 0.25, `${multiple.toFixed(1)}× the usual ${format(usual)}`);
  }

  if (!exact && payment.amountCents >= 50_000) add("large_first_payment", 0.15, `${format(payment.amountCents)} on a first payment`);

  const score = Math.min(1, Number(signals.reduce((s, x) => s + x.weight, 0).toFixed(2)));
  const verdict = verdictFor(score, policy);
  return {
    verdict,
    score,
    signals,
    payee: target ? { name: target.name, payments: target.payments.length, lookalike: Boolean(look) } : null,
    overLimit: verdict === "clear" && payment.amountCents > policy.approvalLimitCents,
  };
}
