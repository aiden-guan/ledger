import "server-only";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/utils/logger";
import { AnthropicProvider } from "./anthropic";
import { DeterministicProvider } from "./deterministic";
import { reconcileConfidence } from "./grounding";
import { StructuredOutputError, type LLMProvider } from "./provider";
import type { FindingExplanation, InvestigationDecision } from "./schemas";
import type { FindingCandidate, InvestigationContext } from "./types";

export function getLLMProvider(): LLMProvider | null {
  const env = getEnv();
  if (env.LLM_PROVIDER === "none" || !env.LLM_API_KEY) return null;
  return new AnthropicProvider({ apiKey: env.LLM_API_KEY, model: env.LLM_MODEL, timeoutMs: env.LLM_TIMEOUT_MS });
}

export interface AiOutcome<T> {
  value: T;
  source: "model" | "deterministic";
  provider: string;
  model: string;
  attempts: number;
  error?: string;
}

const deterministic = new DeterministicProvider();

/** Calls the model, retries once on malformed output, then falls back to deterministic rules. */
async function withRetry<T>(
  provider: LLMProvider | null,
  run: (p: LLMProvider) => Promise<T>,
  label: string,
): Promise<AiOutcome<T>> {
  if (!provider) {
    return { value: await run(deterministic), source: "deterministic", provider: deterministic.name, model: deterministic.model, attempts: 0 };
  }
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return { value: await run(provider), source: "model", provider: provider.name, model: provider.model, attempts: attempt };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      const retryable = error instanceof StructuredOutputError;
      logger.warn("ai_attempt_failed", { label, attempt, retryable, error: lastError, issues: error instanceof StructuredOutputError ? error.issues : undefined });
      if (!retryable) break;
    }
  }
  return {
    value: await run(deterministic),
    source: "deterministic",
    provider: deterministic.name,
    model: deterministic.model,
    attempts: 2,
    error: lastError,
  };
}

export async function decideInvestigationPlan(provider: LLMProvider | null, context: InvestigationContext): Promise<AiOutcome<InvestigationDecision>> {
  const outcome = await withRetry(provider, (p) => p.investigate(context), "investigate");
  // The model may only choose among the offered candidates.
  const allowed = new Set(context.researchCandidates.map((c) => c.productId));
  const chosen = outcome.value.productsToResearch.filter((id) => allowed.has(id));
  // Products with compressed margins are always researched: the price recommendation depends on it.
  for (const m of context.internalSignals.marginErosionProducts) if (allowed.has(m.productId) && !chosen.includes(m.productId)) chosen.push(m.productId);
  return { ...outcome, value: { ...outcome.value, productsToResearch: chosen } };
}

export async function explainCandidate(
  provider: LLMProvider | null,
  candidate: FindingCandidate,
): Promise<AiOutcome<FindingExplanation> & { confidence: number }> {
  const outcome = await withRetry(provider, (p) => p.explainFinding(candidate), `explain:${candidate.type}`);
  const confidence =
    outcome.source === "model"
      ? reconcileConfidence(candidate.deterministicConfidence, outcome.value.confidence)
      : candidate.deterministicConfidence;
  return { ...outcome, confidence };
}
