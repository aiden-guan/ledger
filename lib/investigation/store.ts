import type { ActionType, ActorType, FindingType, InvestigationStatus, RecommendationStatus, Severity } from "@/lib/domain";
import type { EvidenceInput } from "./candidates";
import type { RawLedger } from "./ledger";

/** One quantified finding with its evidence and recommendation, saved atomically. */
export interface FindingBundle {
  investigationId: string;
  organizationId: string;
  evidence: EvidenceInput[];
  /** Whether the evidence supported the finding; non-credible findings are kept for review. */
  credible: boolean;
  finding: {
    findingType: FindingType;
    fingerprint: string;
    title: string;
    summary: string;
    severity: Severity;
    confidence: number;
    monthlyImpactCents: number;
    annualImpactCents: number;
    metadata: Record<string, unknown>;
  };
  recommendation: {
    actionType: ActionType;
    title: string;
    description: string;
    estimatedMonthlyImpactCents: number;
    estimatedAnnualImpactCents: number;
    reasoning: string;
    metadata: Record<string, unknown>;
  };
}

export interface PriceObservationRow {
  organizationId: string;
  investigationId: string;
  productId: string;
  competitorId: string;
  priceCents: number;
  currency: string;
  availability: string | null;
  externalName: string | null;
  productUrl: string;
  sourceUrl: string;
  capturedAt: number;
  captureMode: "live" | "fixture";
  apifyRunId: string | null;
  rawPayload: Record<string, unknown>;
}

export interface InvestigationPatch {
  status?: InvestigationStatus;
  totalRecoveryMonthlyCents?: number;
  totalRecoveryAnnualCents?: number;
  completedAt?: number | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Everything the investigation engine reads or writes. The engine stays storage-agnostic; the
 * Convex implementation lives in convex/engine.ts and runs each call as a query or mutation.
 */
export interface InvestigationStore {
  getInvestigation(id: string): Promise<{ id: string; organizationId: string; status: InvestigationStatus } | null>;
  patchInvestigation(id: string, patch: InvestigationPatch): Promise<unknown>;
  emitEvent(investigationId: string, eventType: string, message: string, metadata: Record<string, unknown>): Promise<unknown>;
  loadLedger(organizationId: string): Promise<RawLedger>;
  savePriceObservations(rows: PriceObservationRow[]): Promise<unknown>;
  saveFinding(bundle: FindingBundle): Promise<unknown>;
  audit(entry: { organizationId: string; actorType: ActorType; action: string; entityType: string; entityId: string | null; metadata: Record<string, unknown> }): Promise<unknown>;
}

export type PriorDecision = { status: RecommendationStatus; approvedAt: number | null; rejectedAt: number | null; metadata: Record<string, unknown> };

/**
 * A decision made on the same issue in an earlier investigation carries forward: re-running an
 * investigation must not silently reopen an approved or rejected action.
 */
export function resolveCarryForward(credible: boolean, prior: PriorDecision | null, currentPrice?: { fromPriceCents: unknown; toPriceCents: unknown }) {
  // A changed market quote can produce a different price test. Approval of the old
  // price is not approval of the new one, even when the product fingerprint matches.
  if (prior && currentPrice && (prior.metadata.fromPriceCents !== currentPrice.fromPriceCents || prior.metadata.toPriceCents !== currentPrice.toPriceCents)) prior = null;
  const findingStatus = !credible ? "NEEDS_REVIEW" : prior?.status === "REJECTED" ? "DISMISSED" : prior ? "ACTIONED" : "OPEN";
  return {
    findingStatus: findingStatus as "NEEDS_REVIEW" | "DISMISSED" | "ACTIONED" | "OPEN",
    recommendationStatus: prior?.status ?? ("PROPOSED" as RecommendationStatus),
    approvedAt: prior?.approvedAt ?? null,
    rejectedAt: prior?.rejectedAt ?? null,
    carriedMetadata: prior ? { carriedForward: true, ...prior.metadata } : {},
  };
}
