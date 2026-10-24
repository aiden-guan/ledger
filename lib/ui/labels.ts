/** Display helpers shared by server and client components (no secrets, no DB). */

export const FINDING_TYPE_LABELS: Record<string, string> = {
  DUPLICATE_PAYMENT: "Duplicate payment",
  MARGIN_EROSION: "Margin erosion",
  PRICING_OPPORTUNITY: "Pricing opportunity",
  SUBSCRIPTION_CREEP: "Subscription creep",
};

export const ACTION_TYPE_LABELS: Record<string, string> = {
  REVIEW_PAYMENT: "Review payment",
  CONTACT_VENDOR: "Contact vendor",
  REVIEW_SUBSCRIPTION: "Review subscription",
  CHANGE_PRICE: "Change price",
  INVESTIGATE: "Investigate",
};

export const RECOMMENDATION_STATUS_LABELS: Record<string, string> = {
  PROPOSED: "Awaiting approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  READY_FOR_EXECUTION: "Ready for execution",
};

export function confidenceLabel(confidence: number): "High" | "Medium" | "Low" {
  if (confidence >= 0.85) return "High";
  if (confidence >= 0.65) return "Medium";
  return "Low";
}

export function percent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

export function countWord(n: number): string {
  return WORDS[n] ?? String(n);
}

export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return n === 1 ? singular : pluralForm;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "investigation.started": "Investigation started",
  "investigation.completed": "Investigation completed",
  "recommendation.approved": "Recommendation approved",
  "recommendation.rejected": "Recommendation rejected",
  "recommendation.ready_for_execution": "Marked ready for execution",
  "demo.reset": "Demo data restored",
};
