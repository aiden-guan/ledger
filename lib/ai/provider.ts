import type { FindingExplanation, InvestigationDecision } from "./schemas";
import type { FindingCandidate, InvestigationContext } from "./types";

/**
 * Model-agnostic interface. Business logic depends only on this, never on a vendor SDK.
 * Every implementation must return output that validates against the Zod schemas.
 */
export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  investigate(input: InvestigationContext): Promise<InvestigationDecision>;
  explainFinding(input: FindingCandidate): Promise<FindingExplanation>;
}

export class StructuredOutputError extends Error {
  constructor(message: string, readonly issues: string[] = []) {
    super(message);
    this.name = "StructuredOutputError";
  }
}
