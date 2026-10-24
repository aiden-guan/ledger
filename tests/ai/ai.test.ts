import { describe, expect, it } from "vitest";
import { findUngroundedAmounts, reconcileConfidence, validateExplanation } from "@/lib/ai/grounding";
import { StructuredOutputError } from "@/lib/ai/provider";
import type { FindingCandidate } from "@/lib/ai/types";

const candidate: FindingCandidate = {
  type: "MARGIN_EROSION",
  fingerprint: "margin:ALP-BTL-32",
  subject: "Alpine Insulated Bottle 32oz",
  title: "Margin erosion on Alpine Insulated Bottle 32oz",
  deterministicMetrics: {},
  evidence: [],
  calculatedImpact: { monthlyCents: 15600, annualCents: 187200, recoveryKind: "recurring" },
  deterministicConfidence: 0.92,
  proposedAction: { actionType: "CHANGE_PRICE", title: "Raise price from $49 to $55", description: "Raise the price." },
  allowedActionTypes: ["CHANGE_PRICE", "CONTACT_VENDOR"],
  groundedAmountsCents: [2200, 2900, 4900, 5500, 6200, 15600, 187200],
  deterministicNarrative: { title: "", summary: "", explanation: "", rationale: "", uncertainty: [] },
};

const valid = {
  credible: true,
  title: "Margin erosion on Alpine Insulated Bottle 32oz",
  summary: "Supplier cost rose from $22 to $29 while the price stayed at $49.",
  explanation: "The business absorbs the increase. Raising to $55 recovers about $1,872 a year.",
  recommendation: { actionType: "CHANGE_PRICE", action: "Raise price from $49 to $55", rationale: "Competitors list at a $62 median." },
  uncertainty: ["Price elasticity is unknown."],
  confidence: 0.9,
};

describe("AI output validation", () => {
  it("accepts a schema-valid, grounded explanation", () => {
    expect(validateExplanation(valid, candidate).title).toBe(valid.title);
  });

  it("rejects malformed output", () => {
    expect(() => validateExplanation({ ...valid, confidence: 1.4 }, candidate)).toThrow(StructuredOutputError);
    expect(() => validateExplanation({ title: "x" }, candidate)).toThrow(StructuredOutputError);
  });

  it("rejects action types the finding does not allow", () => {
    const bad = { ...valid, recommendation: { ...valid.recommendation, actionType: "REVIEW_SUBSCRIPTION" } };
    expect(() => validateExplanation(bad, candidate)).toThrow(/not allowed/);
  });

  it("rejects invented dollar amounts", () => {
    const bad = { ...valid, explanation: "Raising the price recovers $9,400 a year." };
    expect(() => validateExplanation(bad, candidate)).toThrow(/not present in the evidence/);
  });

  it("allows rounding to the nearest dollar and k shorthand", () => {
    expect(findUngroundedAmounts("About $1,872.40 or $1.9k a year, $156 a month", candidate.groundedAmountsCents)).toEqual([]);
    expect(findUngroundedAmounts("$300 a month", candidate.groundedAmountsCents)).toEqual(["$300"]);
  });

  it("clamps model confidence around the deterministic value", () => {
    expect(reconcileConfidence(0.92, 0.99)).toBe(0.97);
    expect(reconcileConfidence(0.92, 0.2)).toBe(0.77);
    expect(reconcileConfidence(0.92, 0.9)).toBe(0.9);
  });
});
