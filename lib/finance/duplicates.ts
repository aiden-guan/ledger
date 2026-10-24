import { merchantKey } from "./merchants";
import type { LedgerTransaction } from "./types";
import { daysBetween } from "./types";

export interface DuplicateConfig {
  /** Maximum days between the two payments. */
  windowDays: number;
  /** Amount tolerance as a fraction (0.01 = 1%). */
  amountTolerance: number;
  /** Flag threshold for the combined score. */
  threshold: number;
}

export const DEFAULT_DUPLICATE_CONFIG: DuplicateConfig = {
  windowDays: 14,
  amountTolerance: 0.01,
  threshold: 0.7,
};

export interface ScoreComponent {
  signal: string;
  weight: number;
  detail: string;
}

export interface DuplicateCandidate {
  original: LedgerTransaction;
  duplicate: LedgerTransaction;
  score: number;
  components: ScoreComponent[];
  daysApart: number;
  amountDifferenceCents: number;
  /** The amount recoverable if the second payment is refunded. */
  recoverableCents: number;
}

/**
 * Scores one pair of debits. Weights follow the product spec:
 *   same merchant +0.30, exact amount +0.35 (within tolerance +0.25),
 *   within 7 days +0.15 (within window +0.05), same invoice reference +0.20.
 * Different explicit invoice references subtract 0.40, since two invoices for
 * the same amount are usually legitimate repeat purchases.
 */
export function scoreDuplicatePair(
  a: LedgerTransaction,
  b: LedgerTransaction,
  config: DuplicateConfig = DEFAULT_DUPLICATE_CONFIG,
): { score: number; components: ScoreComponent[] } | null {
  if (a.transactionType !== "DEBIT" || b.transactionType !== "DEBIT") return null;
  if (merchantKey(a.normalizedMerchantName) !== merchantKey(b.normalizedMerchantName)) return null;

  const days = daysBetween(a.transactionDate, b.transactionDate);
  if (days > config.windowDays) return null;

  const larger = Math.max(a.amountCents, b.amountCents);
  const diff = Math.abs(a.amountCents - b.amountCents);
  const exact = diff === 0;
  const withinTolerance = larger > 0 && diff / larger <= config.amountTolerance;
  if (!exact && !withinTolerance) return null;

  const components: ScoreComponent[] = [
    { signal: "same_merchant", weight: 0.3, detail: `Both paid to "${a.normalizedMerchantName}"` },
  ];
  if (exact) {
    components.push({ signal: "exact_amount", weight: 0.35, detail: "Identical amounts" });
  } else {
    components.push({
      signal: "near_amount",
      weight: 0.25,
      detail: `Amounts within ${(config.amountTolerance * 100).toFixed(0)}%`,
    });
  }
  if (days <= 7) {
    components.push({ signal: "within_7_days", weight: 0.15, detail: `${Math.round(days)} days apart` });
  } else {
    components.push({
      signal: "within_window",
      weight: 0.05,
      detail: `${Math.round(days)} days apart (window ${config.windowDays} days)`,
    });
  }

  const refA = a.invoiceReference?.trim().toUpperCase() || null;
  const refB = b.invoiceReference?.trim().toUpperCase() || null;
  if (refA && refB && refA === refB) {
    components.push({ signal: "same_invoice_reference", weight: 0.2, detail: `Both reference ${refA}` });
  } else if (refA && refB && refA !== refB) {
    components.push({
      signal: "different_invoice_reference",
      weight: -0.4,
      detail: `Different references (${refA} vs ${refB})`,
    });
  }

  const score = Math.max(0, Math.min(1, Number(components.reduce((s, c) => s + c.weight, 0).toFixed(4))));
  return { score, components };
}

export function detectDuplicateTransactions(
  transactions: LedgerTransaction[],
  config: DuplicateConfig = DEFAULT_DUPLICATE_CONFIG,
): DuplicateCandidate[] {
  const byMerchant = new Map<string, LedgerTransaction[]>();
  for (const tx of transactions) {
    if (tx.transactionType !== "DEBIT") continue;
    const key = merchantKey(tx.normalizedMerchantName);
    const list = byMerchant.get(key) ?? [];
    list.push(tx);
    byMerchant.set(key, list);
  }

  const results: DuplicateCandidate[] = [];
  const used = new Set<string>();

  for (const list of byMerchant.values()) {
    list.sort((x, y) => x.transactionDate.getTime() - y.transactionDate.getTime() || x.id.localeCompare(y.id));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (daysBetween(a.transactionDate, b.transactionDate) > config.windowDays) break;
        if (used.has(b.id) || used.has(a.id)) continue;
        const scored = scoreDuplicatePair(a, b, config);
        if (!scored || scored.score < config.threshold) continue;
        used.add(b.id);
        results.push({
          original: a,
          duplicate: b,
          score: scored.score,
          components: scored.components,
          daysApart: Math.round(daysBetween(a.transactionDate, b.transactionDate)),
          amountDifferenceCents: Math.abs(a.amountCents - b.amountCents),
          recoverableCents: Math.min(a.amountCents, b.amountCents),
        });
      }
    }
  }

  return results.sort((x, y) => y.recoverableCents - x.recoverableCents);
}
