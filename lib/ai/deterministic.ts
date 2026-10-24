import type { LLMProvider } from "./provider";
import type { FindingExplanation, InvestigationDecision } from "./schemas";
import type { FindingCandidate, InvestigationContext } from "./types";

/**
 * No-AI fallback. Produces the same structured output from deterministic templates so the
 * product keeps working (findings, impact, recommendations) when no model is configured
 * or the model fails.
 */
export class DeterministicProvider implements LLMProvider {
  readonly name = "deterministic";
  readonly model = "rules-v1";

  async investigate(input: InvestigationContext): Promise<InvestigationDecision> {
    const focusAreas: InvestigationDecision["focusAreas"] = [];
    if (input.internalSignals.duplicatePaymentCandidates > 0) {
      focusAreas.push({ findingType: "DUPLICATE_PAYMENT", rationale: "Duplicate payment candidates scored above threshold." });
    }
    if (input.internalSignals.marginErosionProducts.length > 0) {
      focusAreas.push({ findingType: "MARGIN_EROSION", rationale: "Supplier costs rose while retail prices stayed flat." });
    }
    if (input.internalSignals.recurringFlags > 0) {
      focusAreas.push({ findingType: "SUBSCRIPTION_CREEP", rationale: "Recurring charges increased over their baseline." });
    }
    if (input.researchCandidates.length > 0) {
      focusAreas.push({ findingType: "PRICING_OPPORTUNITY", rationale: "Competitor listings are available for comparison." });
    }
    return {
      productsToResearch: input.researchCandidates.map((c) => c.productId),
      needsExternalEvidence: input.researchCandidates.length > 0,
      focusAreas,
      rationale: "Rules-based plan: research every product with competitor listings.",
    };
  }

  async explainFinding(input: FindingCandidate): Promise<FindingExplanation> {
    const n = input.deterministicNarrative;
    return {
      credible: true,
      title: n.title,
      summary: n.summary,
      explanation: n.explanation,
      recommendation: {
        actionType: input.proposedAction.actionType,
        action: input.proposedAction.title,
        rationale: n.rationale,
      },
      uncertainty: n.uncertainty,
      confidence: input.deterministicConfidence,
    };
  }
}
