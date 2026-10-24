/**
 * Domain enums and record shapes shared by the Convex backend, the investigation engine and the
 * UI. Money is always integer minor units (cents); timestamps are epoch milliseconds.
 */

export const INVESTIGATION_STATUSES = [
  "CREATED",
  "INGESTING",
  "ANALYZING_INTERNAL_DATA",
  "GENERATING_HYPOTHESES",
  "GATHERING_EXTERNAL_EVIDENCE",
  "VALIDATING_FINDINGS",
  "CALCULATING_IMPACT",
  "GENERATING_RECOMMENDATIONS",
  "COMPLETED",
  "FAILED",
] as const;
export type InvestigationStatus = (typeof INVESTIGATION_STATUSES)[number];

export const ACTIVE_INVESTIGATION_STATUSES = INVESTIGATION_STATUSES.filter((s) => s !== "COMPLETED" && s !== "FAILED");

export const TRIGGER_TYPES = ["MANUAL", "SCHEDULED", "DEMO_SEED"] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const FINDING_TYPES = ["DUPLICATE_PAYMENT", "MARGIN_EROSION", "PRICING_OPPORTUNITY", "SUBSCRIPTION_CREEP"] as const;
export type FindingType = (typeof FINDING_TYPES)[number];

export const FINDING_STATUSES = ["OPEN", "NEEDS_REVIEW", "ACTIONED", "DISMISSED"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const SEVERITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const RECOMMENDATION_STATUSES = ["PROPOSED", "APPROVED", "REJECTED", "READY_FOR_EXECUTION"] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

export const ACTION_TYPES = ["REVIEW_PAYMENT", "CONTACT_VENDOR", "REVIEW_SUBSCRIPTION", "CHANGE_PRICE", "INVESTIGATE"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const ACTOR_TYPES = ["USER", "SYSTEM", "AGENT"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export interface Organization {
  id: string;
  slug: string;
  name: string;
  industry: string;
  currency: string;
  demoMode: boolean;
}

export interface RecommendationRecord {
  actionType: ActionType;
  metadata: Record<string, unknown>;
}

/** Strips values Convex cannot store (undefined, Date, NaN) by round-tripping through JSON. */
export function toStorable<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}
