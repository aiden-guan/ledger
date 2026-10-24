import { roundCents, type Cents } from "./money";

export type RecoveryKind = "recurring" | "one_time";

export interface Impact {
  monthlyCents: Cents;
  annualCents: Cents;
  recoveryKind: RecoveryKind;
}

/** Recurring monthly amount annualized as monthly * 12. */
export function calculateAnnualizedImpact(monthlyCents: Cents): Impact {
  return { monthlyCents: roundCents(monthlyCents), annualCents: roundCents(monthlyCents * 12), recoveryKind: "recurring" };
}

/** A one-time recovery (e.g. a refunded duplicate payment) counts once toward the annual total. */
export function oneTimeImpact(amountCents: Cents): Impact {
  return { monthlyCents: 0, annualCents: amountCents, recoveryKind: "one_time" };
}

export function aggregateImpact(impacts: Impact[]): { monthlyCents: Cents; annualCents: Cents } {
  return impacts.reduce(
    (acc, i) => ({ monthlyCents: acc.monthlyCents + i.monthlyCents, annualCents: acc.annualCents + i.annualCents }),
    { monthlyCents: 0, annualCents: 0 },
  );
}

export type Severity = "HIGH" | "MEDIUM" | "LOW";

export function severityForAnnualImpact(annualCents: Cents): Severity {
  if (annualCents >= 150_000) return "HIGH";
  if (annualCents >= 50_000) return "MEDIUM";
  return "LOW";
}

/** Impact-weighted average confidence across findings. */
export function weightedConfidence(items: { confidence: number; annualCents: Cents }[]): number {
  const total = items.reduce((s, i) => s + i.annualCents, 0);
  if (total === 0) return 0;
  return Number((items.reduce((s, i) => s + i.confidence * i.annualCents, 0) / total).toFixed(2));
}
