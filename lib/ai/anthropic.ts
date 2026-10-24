import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { timedExternalCall } from "@/lib/utils/logger";
import { decisionPrompt, explainFindingPrompt, SYSTEM_PROMPT } from "./prompts";
import { StructuredOutputError, type LLMProvider } from "./provider";
import { validateExplanation } from "./grounding";
import {
  FindingExplanationWireSchema,
  InvestigationDecisionSchema,
  InvestigationDecisionWireSchema,
  type FindingExplanation,
  type InvestigationDecision,
} from "./schemas";
import type { FindingCandidate, InvestigationContext } from "./types";

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
}

/**
 * Claude via the Anthropic SDK with structured outputs. Responses are constrained to a
 * JSON schema and then re-validated with strict Zod schemas; nothing parses free prose.
 * Server-side fallbacks are enabled so a policy decline is retried on the platform's
 * default fallback model instead of failing the finding.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  readonly model: string;
  private client: Anthropic;

  constructor(options: AnthropicProviderOptions) {
    this.model = options.model;
    this.client = new Anthropic({ apiKey: options.apiKey, timeout: options.timeoutMs, maxRetries: 1 });
  }

  private async call<T extends z.ZodType>(operation: string, schema: T, prompt: string): Promise<unknown> {
    const response = await timedExternalCall("anthropic", operation, () =>
      this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM_PROMPT,
        output_config: { format: betaZodOutputFormat(schema), effort: "low" },
        messages: [{ role: "user", content: prompt }],
      }),
    );
    if (response.stop_reason === "refusal") throw new StructuredOutputError("Model declined the request");
    if (response.stop_reason === "max_tokens") throw new StructuredOutputError("Model output was truncated");
    if (response.parsed_output == null) throw new StructuredOutputError("Model returned no structured output");
    return response.parsed_output;
  }

  async investigate(input: InvestigationContext): Promise<InvestigationDecision> {
    const raw = await this.call("investigate", InvestigationDecisionWireSchema, decisionPrompt(input));
    const parsed = InvestigationDecisionSchema.safeParse(raw);
    if (!parsed.success) throw new StructuredOutputError("Decision failed validation", parsed.error.issues.map((i) => i.message));
    return parsed.data;
  }

  async explainFinding(input: FindingCandidate): Promise<FindingExplanation> {
    const raw = await this.call("explainFinding", FindingExplanationWireSchema, explainFindingPrompt(input));
    return validateExplanation(raw, input);
  }
}
