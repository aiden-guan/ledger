import { isSandboxListingUrl } from "@/lib/demo/catalog";
import { streamForCategory } from "@/lib/river/streams";
import { decideInvestigationPlan, explainCandidate, getLLMProvider } from "@/lib/ai/investigator";
import type { LLMProvider } from "@/lib/ai/provider";
import type { InvestigationContext } from "@/lib/ai/types";
import { getCompetitorPricing, type CompetitorPricingResult, type ListingRequest } from "@/lib/apify/competitor-pricing";
import type { InvestigationStatus } from "@/lib/domain";
import { getEnv } from "@/lib/env";
import { detectDuplicateTransactions } from "@/lib/finance/duplicates";
import { aggregateImpact, severityForAnnualImpact } from "@/lib/finance/impact";
import { analyzeSkuMargins, detectCostInflation } from "@/lib/finance/margins";
import { format } from "@/lib/finance/money";
import { calculatePricingOpportunity, type PricingOpportunity } from "@/lib/finance/pricing";
import { detectRecurringExpenses } from "@/lib/finance/recurring";
import { logger } from "@/lib/utils/logger";
import {
  buildDuplicateCandidate,
  buildMarginCandidate,
  buildPricingCandidate,
  buildSubscriptionCandidate,
  type BuiltCandidate,
} from "./candidates";
import { emitStep, transition } from "./events";
import { buildLedger } from "./ledger";
import type { InvestigationStore } from "./store";

export interface ExecuteOptions {
  /** Pause between steps so a person can follow the timeline. 0 in tests and seeding. */
  stepDelayMs?: number;
  /** Override the configured model (null = deterministic only). */
  provider?: LLMProvider | null;
  externalIntelMode?: "live" | "fixture";
}

/** Investigations still "running" after this long are treated as abandoned. */
export const STALE_AFTER_MS = 10 * 60 * 1000;
const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

/** Runs the full constrained state machine for an existing investigation. */
export async function executeInvestigation(store: InvestigationStore, investigationId: string, options: ExecuteOptions = {}): Promise<void> {
  const env = getEnv();
  const stepDelay = options.stepDelayMs ?? env.INVESTIGATION_STEP_DELAY_MS;
  const provider = options.provider !== undefined ? options.provider : getLLMProvider();
  const intelMode = options.externalIntelMode ?? env.EXTERNAL_INTEL_MODE;
  const started = Date.now();

  const record = await store.getInvestigation(investigationId);
  if (!record) throw new Error(`Investigation ${investigationId} not found`);
  if (record.status !== "CREATED") return; // already executed or executing
  const inv = { id: record.id, organizationId: record.organizationId, status: record.status as InvestigationStatus };
  const warnings: string[] = [];
  const step = (key: Parameters<typeof emitStep>[2], status: Parameters<typeof emitStep>[3], message: string, extra: Record<string, unknown> = {}) =>
    emitStep(store, inv.id, key, status, message, extra);

  try {
    // ---- INGESTING -------------------------------------------------------
    await transition(store, inv, "INGESTING", started);
    await step("ingest", "started", "Loading ledger");
    const ledger = buildLedger(await store.loadLedger(inv.organizationId));
    const stats = {
      transactions: ledger.transactions.length,
      sales: ledger.sales.length,
      products: ledger.products.length,
      competitorListings: ledger.listings.length,
      asOf: ledger.asOf.toISOString(),
    };
    await step("ingest", "completed", `Ledger loaded: ${stats.transactions} transactions, ${stats.sales} orders, ${stats.products} products`, { stats });
    await sleep(stepDelay);

    // ---- ANALYZING_INTERNAL_DATA ----------------------------------------
    await transition(store, inv, "ANALYZING_INTERNAL_DATA", started);
    await step("duplicates", "started", "Detecting duplicate transactions");
    const duplicates = detectDuplicateTransactions(ledger.transactions);
    await step("duplicates", "completed", `${stats.transactions} transactions analyzed; ${duplicates.length} likely duplicate payment${duplicates.length === 1 ? "" : "s"}`, {
      suspects: duplicates.map((d) => ({ type: "DUPLICATE_PAYMENT", stream: streamForCategory(d.original.category), label: d.original.normalizedMerchantName })),
    });
    await sleep(stepDelay);

    await step("recurring", "started", "Analyzing recurring expenses");
    const recurring = detectRecurringExpenses(ledger.transactions);
    await step("recurring", "completed", `${recurring.series.length} recurring charges found; ${recurring.flags.length} merit review`, {
      suspects: recurring.flags.map((f) => ({ type: "SUBSCRIPTION_CREEP", stream: streamForCategory(f.series.charges[0]?.category), label: f.series.normalizedMerchantName })),
    });
    await sleep(stepDelay);

    await step("margins", "started", "Comparing historical vendor costs and SKU margins");
    const analyses = analyzeSkuMargins(ledger.products, ledger.sales, ledger.supplierCosts, ledger.asOf);
    const eroded = detectCostInflation(analyses);
    await step("margins", "completed", `${stats.products} products analyzed; ${eroded.length} with margin compression`, {
      suspects: eroded.map((e) => ({ type: "MARGIN_EROSION", stream: "cogs", label: e.name })),
    });
    await sleep(stepDelay);

    // ---- GENERATING_HYPOTHESES ------------------------------------------
    await transition(store, inv, "GENERATING_HYPOTHESES", started);
    await step("hypotheses", "started", "Deciding what needs external evidence");
    const analysisById = new Map(analyses.map((a) => [a.productId, a]));
    const listingsByProduct = new Map<string, typeof ledger.listings>();
    for (const l of ledger.listings) listingsByProduct.set(l.productId, [...(listingsByProduct.get(l.productId) ?? []), l]);
    const context: InvestigationContext = {
      organizationName: ledger.organization.name,
      asOf: ledger.asOf.toISOString().slice(0, 10),
      internalSignals: {
        transactionsAnalyzed: stats.transactions,
        productsAnalyzed: stats.products,
        duplicatePaymentCandidates: duplicates.length,
        recurringFlags: recurring.flags.length,
        marginErosionProducts: eroded.map((e) => ({
          productId: e.productId,
          sku: e.sku,
          name: e.name,
          marginDeltaPoints: e.marginDeltaPoints,
          costChangePercent: e.costChangePercent,
        })),
      },
      researchCandidates: Array.from(listingsByProduct.entries()).map(([productId, listings]) => {
        const a = analysisById.get(productId);
        return {
          productId,
          sku: a?.sku ?? listings[0].productSku,
          name: a?.name ?? listings[0].productSku,
          currentPriceCents: a?.currentSellingPriceCents ?? 0,
          competitorListings: listings.length,
          signal: eroded.some((e) => e.productId === productId) ? "margin compression" : "competitor listings available",
        };
      }),
    };
    const plan = await decideInvestigationPlan(provider, context);
    await step(
      "hypotheses",
      "completed",
      `Selected ${plan.value.productsToResearch.length} product${plan.value.productsToResearch.length === 1 ? "" : "s"} for market research`,
      { rationale: plan.value.rationale, source: plan.source, model: plan.model, focusAreas: plan.value.focusAreas },
    );
    if (plan.error) warnings.push(`AI planning unavailable: ${plan.error}`);
    await sleep(stepDelay);

    // ---- GATHERING_EXTERNAL_EVIDENCE ------------------------------------
    await transition(store, inv, "GATHERING_EXTERNAL_EVIDENCE", started);
    const requests: ListingRequest[] = plan.value.productsToResearch.flatMap((pid) =>
      (listingsByProduct.get(pid) ?? []).map((l) => ({
        productId: l.productId,
        productSku: l.productSku,
        competitorId: l.competitorId,
        competitorName: l.competitorName,
        url: l.url,
      })),
    );
    await step("market", "started", `Apify agent analyzing ${requests.length} competitor pages`, { listings: requests.length, mode: intelMode });
    let market: CompetitorPricingResult | null = null;
    try {
      market = await getCompetitorPricing(requests, {
        mode: intelMode,
        apifyToken: env.APIFY_TOKEN,
        actorId: env.APIFY_ACTOR_ID,
        timeoutMs: env.APIFY_TIMEOUT_MS,
        onProgress: (u) => step("market", "info", u.message, { apifyStatus: u.status, runId: u.runId }),
      });
      if (market.observations.length) {
        await store.savePriceObservations(
          market.observations.map((o) => ({
            organizationId: inv.organizationId,
            investigationId: inv.id,
            productId: o.productId,
            competitorId: o.competitorId,
            priceCents: o.priceCents,
            currency: o.currency,
            availability: o.availability,
            externalName: o.externalName,
            productUrl: o.productUrl,
            sourceUrl: o.sourceUrl,
            capturedAt: o.capturedAt.getTime(),
            captureMode: o.captureMode,
            apifyRunId: o.apifyRunId,
            rawPayload: o.rawPayload,
          })),
        );
      }
      warnings.push(...market.warnings);
      const sandboxOnly = market.mode === "live" && market.observations.length > 0 && market.observations.every((o) => isSandboxListingUrl(o.productUrl));
      const label = market.mode === "fixture" ? "Demo dataset" : sandboxOnly ? `Apify run ${market.runId} on demo storefront pages` : `Live, Apify run ${market.runId}`;
      if (market.fallbackReason) {
        await step("market", "warning", `Collected ${market.observations.length} competitor prices from the demo dataset (${market.fallbackReason})`, {
          mode: market.mode,
          runId: market.runId,
          fallbackReason: market.fallbackReason,
        });
      } else {
        await step("market", "completed", `Collected ${market.observations.length} competitor prices (${label})`, { mode: market.mode, runId: market.runId });
      }
    } catch (error) {
      // Partial completion: internal findings still complete without market evidence.
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Market research failed: ${message}`);
      await step("market", "failed", `Market research unavailable: ${message}. Continuing with internal findings.`);
    }
    await sleep(stepDelay);

    await step("correlate", "started", "Correlating external pricing evidence");
    const opportunities = new Map<string, PricingOpportunity>();
    for (const pid of plan.value.productsToResearch) {
      const a = analysisById.get(pid);
      if (!a || !market) continue;
      const opp = calculatePricingOpportunity(pid, a.currentSellingPriceCents, market.observations, a.unitsTrailing90Days);
      if (opp) opportunities.set(pid, opp);
    }
    const corroborated = eroded.filter((e) => opportunities.has(e.productId)).length;
    await step("correlate", "completed", `${opportunities.size} pricing opportunit${opportunities.size === 1 ? "y" : "ies"}; ${corroborated} corroborate margin erosion`, {
      suspects: [...opportunities.keys()]
        .filter((pid) => !eroded.some((e) => e.productId === pid))
        .map((pid) => ({ type: "PRICING_OPPORTUNITY", stream: "uncaptured", label: analysisById.get(pid)?.name ?? "Product" })),
    });
    await sleep(stepDelay);

    // ---- VALIDATING_FINDINGS --------------------------------------------
    await transition(store, inv, "VALIDATING_FINDINGS", started);
    const built: BuiltCandidate[] = [];
    const tryBuild = (label: string, fn: () => BuiltCandidate) => {
      try {
        built.push(fn());
      } catch (error) {
        // One failing finding must not destroy the investigation.
        warnings.push(`Could not evaluate ${label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    for (const d of duplicates) tryBuild("duplicate payment", () => buildDuplicateCandidate(d));
    for (const e of eroded) tryBuild(`margin on ${e.sku}`, () => buildMarginCandidate(e, opportunities.get(e.productId) ?? null));
    for (const [pid, opp] of opportunities) {
      if (eroded.some((e) => e.productId === pid)) continue; // already part of the margin finding
      const product = ledger.products.find((p) => p.id === pid)!;
      tryBuild(`pricing on ${product.sku}`, () => buildPricingCandidate(product, opp));
    }
    for (const f of recurring.flags) tryBuild(`recurring charge ${f.series.normalizedMerchantName}`, () => buildSubscriptionCandidate(f));

    await step("validate", "started", provider ? `Validating ${built.length} findings with ${provider.model}` : `Validating ${built.length} findings (rules-based narrative)`);
    const explained = await Promise.all(
      built.map(async (c) => {
        try {
          return { candidate: c, result: await explainCandidate(provider, c.ai) };
        } catch (error) {
          warnings.push(`Explanation failed for ${c.ai.title}: ${error instanceof Error ? error.message : String(error)}`);
          return null;
        }
      }),
    );
    const validated = explained.filter((e): e is NonNullable<typeof e> => e !== null);
    const modelCount = validated.filter((v) => v.result.source === "model").length;
    const fallbackCount = validated.length - modelCount;
    if (provider && fallbackCount > 0) warnings.push(`${fallbackCount} finding${fallbackCount === 1 ? "" : "s"} used the rules-based narrative after model output failed validation.`);
    const credibleCount = validated.filter((v) => v.result.value.credible).length;
    await step(
      "validate",
      fallbackCount > 0 && provider ? "warning" : "completed",
      `${credibleCount} of ${validated.length} findings supported by evidence`,
      { modelExplanations: modelCount, deterministicExplanations: fallbackCount, model: provider?.model ?? null },
    );
    await sleep(stepDelay);

    // ---- CALCULATING_IMPACT ---------------------------------------------
    await transition(store, inv, "CALCULATING_IMPACT", started);
    await step("impact", "started", "Calculating recoverable value");
    const credible = validated.filter((v) => v.result.value.credible);
    const totals = aggregateImpact(credible.map((v) => v.candidate.impact));
    // One event per quantified leak, so the money river can show each one as it is measured.
    for (const { candidate } of credible) {
      await step("impact", "info", `${candidate.ai.title}: ${format(candidate.impact.annualCents)}${candidate.impact.recoveryKind === "one_time" ? " one-time" : " a year"}`, {
        leak: {
          fingerprint: candidate.ai.fingerprint,
          type: candidate.ai.type,
          stream: candidate.metadata.stream ?? null,
          title: candidate.ai.title,
          annualCents: candidate.impact.annualCents,
          monthlyCents: candidate.impact.monthlyCents,
          recoveryKind: candidate.impact.recoveryKind,
        },
      });
      await sleep(Math.round(stepDelay / 2));
    }
    await step("impact", "completed", `${format(totals.annualCents)} in potential annual profit recovery`, totals);
    await sleep(stepDelay);

    // ---- GENERATING_RECOMMENDATIONS -------------------------------------
    await transition(store, inv, "GENERATING_RECOMMENDATIONS", started);
    await step("recommend", "started", "Generating recommendations");
    let recCount = 0;
    for (const { candidate, result } of validated) {
      try {
        const explanation = result.value;
        // The deterministic engine owns the action and its numbers; the model's wording is used
        // only when it agrees on the action type.
        const useModelAction = result.source === "model" && explanation.recommendation.actionType === candidate.ai.proposedAction.actionType;
        await store.saveFinding({
          investigationId: inv.id,
          organizationId: inv.organizationId,
          evidence: candidate.evidence,
          credible: explanation.credible,
          finding: {
            findingType: candidate.ai.type,
            fingerprint: candidate.ai.fingerprint,
            title: explanation.title,
            summary: explanation.summary,
            severity: severityForAnnualImpact(candidate.impact.annualCents),
            confidence: result.confidence,
            monthlyImpactCents: candidate.impact.monthlyCents,
            annualImpactCents: candidate.impact.annualCents,
            metadata: {
              ...candidate.metadata,
              productId: candidate.productId,
              explanation: explanation.explanation,
              uncertainty: explanation.uncertainty,
              calculations: candidate.calculations,
              deterministicMetrics: candidate.ai.deterministicMetrics,
              deterministicConfidence: candidate.ai.deterministicConfidence,
              modelConfidence: result.source === "model" ? explanation.confidence : null,
              narrativeSource: result.source,
              narrativeProvider: result.provider,
              narrativeModel: result.model,
              narrativeError: result.error ?? null,
              externalIntelMode: market?.mode ?? null,
            },
          },
          recommendation: {
            actionType: candidate.ai.proposedAction.actionType,
            title: candidate.ai.proposedAction.title,
            description: useModelAction ? explanation.recommendation.action : candidate.ai.proposedAction.description,
            estimatedMonthlyImpactCents: candidate.impact.monthlyCents,
            estimatedAnnualImpactCents: candidate.impact.annualCents,
            reasoning: explanation.recommendation.rationale,
            metadata: candidate.recommendationMetadata,
          },
        });
        recCount += 1;
      } catch (error) {
        warnings.push(`Could not save ${candidate.ai.title}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    await step("recommend", "completed", `${recCount} recommendation${recCount === 1 ? "" : "s"} ready for review`);

    // ---- COMPLETED --------------------------------------------------------
    await store.patchInvestigation(inv.id, {
        totalRecoveryMonthlyCents: totals.monthlyCents,
        totalRecoveryAnnualCents: totals.annualCents,
        completedAt: Date.now(),
        metadata: {
          stats,
          warnings,
          partial: warnings.length > 0,
          externalIntel: market
            ? { mode: market.mode, sandbox: market.mode === "live" && market.observations.length > 0 && market.observations.every((o) => isSandboxListingUrl(o.productUrl)), requestedMode: market.requestedMode, runId: market.runId, fallbackReason: market.fallbackReason, observations: market.observations.length, durationMs: market.durationMs }
            : null,
          ai: { provider: provider?.name ?? "deterministic", model: provider?.model ?? null, planSource: plan.source, modelExplanations: modelCount },
          durationMs: Date.now() - started,
        },
      });
    await transition(store, inv, "COMPLETED", started);
    await store.emitEvent(inv.id, "COMPLETED", `Investigation complete. ${format(totals.annualCents)} may be recoverable per year.`, totals);
    await store.audit({
      organizationId: inv.organizationId,
      actorType: "AGENT",
      action: "investigation.completed",
      entityType: "investigation",
      entityId: inv.id,
      metadata: { findings: recCount, annualRecoveryCents: totals.annualCents, durationMs: Date.now() - started },
    });
    logger.info("investigation_completed", {
      investigationId: inv.id,
      organizationId: inv.organizationId,
      step: "COMPLETED",
      durationMs: Date.now() - started,
      status: warnings.length ? "partial" : "ok",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("investigation_failed", {
      investigationId: inv.id,
      organizationId: inv.organizationId,
      step: inv.status,
      durationMs: Date.now() - started,
      status: "failed",
      error: message,
    });
    await store.patchInvestigation(inv.id, { status: "FAILED", errorMessage: message, completedAt: Date.now() }).catch(() => {});
    await store.emitEvent(inv.id, "STATE_CHANGED", "FAILED", { state: "FAILED", error: message }).catch(() => {});
  }
}
