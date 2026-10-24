import type { ActionType, FindingType } from "@/lib/domain";
import type { RecoveryKind } from "@/lib/finance/impact";

export interface EvidenceSummary {
  type: string;
  title: string;
  description: string;
  data: Record<string, unknown>;
}

/** A deterministic candidate finding plus only the evidence relevant to it. */
export interface FindingCandidate {
  type: FindingType;
  fingerprint: string;
  subject: string;
  title: string;
  deterministicMetrics: Record<string, number | string>;
  evidence: EvidenceSummary[];
  calculatedImpact: { monthlyCents: number; annualCents: number; recoveryKind: RecoveryKind };
  deterministicConfidence: number;
  proposedAction: { actionType: ActionType; title: string; description: string };
  allowedActionTypes: ActionType[];
  /** Every money amount (cents) the narrative may legitimately mention. */
  groundedAmountsCents: number[];
  /** Template narrative used when no model is available. Built from the same metrics. */
  deterministicNarrative: {
    title: string;
    summary: string;
    explanation: string;
    rationale: string;
    uncertainty: string[];
  };
}

export interface HypothesisCandidate {
  productId: string;
  sku: string;
  name: string;
  currentPriceCents: number;
  competitorListings: number;
  signal: string;
}

export interface InvestigationContext {
  organizationName: string;
  asOf: string;
  internalSignals: {
    transactionsAnalyzed: number;
    productsAnalyzed: number;
    duplicatePaymentCandidates: number;
    recurringFlags: number;
    marginErosionProducts: { productId: string; sku: string; name: string; marginDeltaPoints: number; costChangePercent: number }[];
  };
  researchCandidates: HypothesisCandidate[];
}
