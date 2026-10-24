import { z } from "zod";
import { ACTION_TYPES } from "@/lib/domain";

export const ActionTypeSchema = z.enum(ACTION_TYPES);

/**
 * Wire schemas are sent to the model as the structured-output format. They avoid numeric
 * bounds (not all JSON-schema constraints are enforced by structured outputs); the strict
 * schemas below re-validate every response before anything is persisted.
 */
export const FindingExplanationWireSchema = z.object({
  credible: z.boolean(),
  title: z.string(),
  summary: z.string(),
  explanation: z.string(),
  recommendation: z.object({
    actionType: ActionTypeSchema,
    action: z.string(),
    rationale: z.string(),
  }),
  uncertainty: z.array(z.string()),
  confidence: z.number(),
});

export const FindingExplanationSchema = z.object({
  credible: z.boolean(),
  title: z.string().min(3).max(120),
  summary: z.string().min(10).max(400),
  explanation: z.string().min(20).max(2000),
  recommendation: z.object({
    actionType: ActionTypeSchema,
    action: z.string().min(5).max(300),
    rationale: z.string().min(10).max(800),
  }),
  uncertainty: z.array(z.string().min(3).max(300)).max(6),
  confidence: z.number().min(0).max(1),
});
export type FindingExplanation = z.infer<typeof FindingExplanationSchema>;

export const InvestigationDecisionWireSchema = z.object({
  productsToResearch: z.array(z.string()),
  needsExternalEvidence: z.boolean(),
  focusAreas: z.array(
    z.object({
      findingType: z.enum(["DUPLICATE_PAYMENT", "MARGIN_EROSION", "PRICING_OPPORTUNITY", "SUBSCRIPTION_CREEP"]),
      rationale: z.string(),
    }),
  ),
  rationale: z.string(),
});

export const InvestigationDecisionSchema = z.object({
  productsToResearch: z.array(z.string().min(1)).max(50),
  needsExternalEvidence: z.boolean(),
  focusAreas: z
    .array(
      z.object({
        findingType: z.enum(["DUPLICATE_PAYMENT", "MARGIN_EROSION", "PRICING_OPPORTUNITY", "SUBSCRIPTION_CREEP"]),
        rationale: z.string().min(3).max(400),
      }),
    )
    .max(8),
  rationale: z.string().min(3).max(1000),
});
export type InvestigationDecision = z.infer<typeof InvestigationDecisionSchema>;
