import { FindingExplanationSchema, type FindingExplanation } from "./schemas";
import { StructuredOutputError } from "./provider";
import type { FindingCandidate } from "./types";

const DOLLAR_PATTERN = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(k)?/gi;

/** Dollar amounts mentioned in model text that do not match any supplied evidence amount. */
export function findUngroundedAmounts(text: string, groundedCents: number[]): string[] {
  const ungrounded: string[] = [];
  for (const match of text.matchAll(DOLLAR_PATTERN)) {
    const value = Number(match[1].replace(/,/g, "")) * (match[2] ? 1000 : 1);
    const cents = Math.round(value * 100);
    // Allow rounding to the nearest dollar (or nearest $100 for "k" shorthand).
    const tolerance = match[2] ? 5000 : 100;
    if (!groundedCents.some((g) => Math.abs(Math.abs(g) - cents) <= tolerance)) ungrounded.push(match[0]);
  }
  return ungrounded;
}

/**
 * Validates a raw model response: schema, allowed action type, and that every dollar
 * figure in the narrative traces back to the deterministic evidence.
 */
export function validateExplanation(raw: unknown, candidate: FindingCandidate): FindingExplanation {
  const parsed = FindingExplanationSchema.safeParse(raw);
  if (!parsed.success) {
    throw new StructuredOutputError(
      "Model output failed schema validation",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }
  const explanation = parsed.data;
  if (!candidate.allowedActionTypes.includes(explanation.recommendation.actionType)) {
    throw new StructuredOutputError(`Action type ${explanation.recommendation.actionType} is not allowed for ${candidate.type}`);
  }
  const text = [explanation.title, explanation.summary, explanation.explanation, explanation.recommendation.action, explanation.recommendation.rationale].join(" ");
  const ungrounded = findUngroundedAmounts(text, candidate.groundedAmountsCents);
  if (ungrounded.length > 0) {
    throw new StructuredOutputError("Model mentioned amounts not present in the evidence", ungrounded);
  }
  return explanation;
}

/** The model's confidence may adjust, but not override, the deterministic confidence. */
export function reconcileConfidence(deterministic: number, model: number): number {
  const clamped = Math.min(deterministic + 0.05, Math.max(deterministic - 0.15, model));
  return Math.round(Math.min(0.99, Math.max(0, clamped)) * 100) / 100;
}
