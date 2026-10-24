import type { InvestigationStatus } from "@/lib/domain";

/** Constrained investigation workflow: each state may only advance to the next (or fail). */
export const STATE_ORDER: InvestigationStatus[] = [
  "CREATED",
  "INGESTING",
  "ANALYZING_INTERNAL_DATA",
  "GENERATING_HYPOTHESES",
  "GATHERING_EXTERNAL_EVIDENCE",
  "VALIDATING_FINDINGS",
  "CALCULATING_IMPACT",
  "GENERATING_RECOMMENDATIONS",
  "COMPLETED",
];

export const TERMINAL_STATES: InvestigationStatus[] = ["COMPLETED", "FAILED"];

export function canTransition(from: InvestigationStatus, to: InvestigationStatus): boolean {
  if (TERMINAL_STATES.includes(from)) return false;
  if (to === "FAILED") return true;
  const i = STATE_ORDER.indexOf(from);
  return i >= 0 && STATE_ORDER[i + 1] === to;
}

export function assertTransition(from: InvestigationStatus, to: InvestigationStatus): void {
  if (!canTransition(from, to)) throw new Error(`Illegal investigation transition ${from} -> ${to}`);
}

export function isTerminal(status: InvestigationStatus): boolean {
  return TERMINAL_STATES.includes(status);
}

/** Timeline steps shown in the UI, keyed to the state they run in. */
export const INVESTIGATION_STEPS = [
  { key: "ingest", label: "Loading ledger", state: "INGESTING" },
  { key: "duplicates", label: "Detecting duplicate transactions", state: "ANALYZING_INTERNAL_DATA" },
  { key: "recurring", label: "Analyzing recurring expenses", state: "ANALYZING_INTERNAL_DATA" },
  { key: "margins", label: "Comparing historical vendor costs and SKU margins", state: "ANALYZING_INTERNAL_DATA" },
  { key: "hypotheses", label: "Deciding what needs external evidence", state: "GENERATING_HYPOTHESES" },
  { key: "market", label: "Running Apify market intelligence agent", state: "GATHERING_EXTERNAL_EVIDENCE" },
  { key: "correlate", label: "Correlating external pricing evidence", state: "GATHERING_EXTERNAL_EVIDENCE" },
  { key: "validate", label: "Validating findings", state: "VALIDATING_FINDINGS" },
  { key: "impact", label: "Calculating recoverable value", state: "CALCULATING_IMPACT" },
  { key: "recommend", label: "Generating recommendations", state: "GENERATING_RECOMMENDATIONS" },
] as const;

export type StepKey = (typeof INVESTIGATION_STEPS)[number]["key"];
