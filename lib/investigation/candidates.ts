import type { FindingCandidate } from "@/lib/ai/types";
import { isSandboxListingUrl } from "@/lib/demo/catalog";
import { streamForCategory } from "@/lib/river/streams";
import type { ActionType, FindingType } from "@/lib/db/schema";
import type { DuplicateCandidate } from "@/lib/finance/duplicates";
import { calculateAnnualizedImpact, oneTimeImpact, type Impact } from "@/lib/finance/impact";
import type { SkuMarginAnalysis } from "@/lib/finance/margins";
import { merchantKey } from "@/lib/finance/merchants";
import { format } from "@/lib/finance/money";
import type { PricingOpportunity } from "@/lib/finance/pricing";
import type { RecurringFlag } from "@/lib/finance/recurring";
import type { PriceObservation } from "@/lib/finance/types";

/** Evidence as it will be persisted. `display` drives the evidence cards in the UI. */
export interface EvidenceInput {
  evidenceType: string;
  title: string;
  description: string;
  sourceType: "ledger" | "sales" | "supplier_costs" | "apify" | "calculation";
  sourceReference: string | null;
  confidence: number;
  data: Record<string, unknown> & { display: EvidenceDisplay };
}

export type EvidenceDisplay =
  | { kind: "change"; label: string; before: string; after: string; delta: string; tone: "negative" | "neutral" | "positive" }
  | { kind: "metric"; label: string; value: string; note?: string }
  | {
      kind: "competitor";
      competitorName: string;
      externalName: string | null;
      price: string;
      url: string;
      availability: string | null;
      captureMode: "live" | "fixture";
      /** Live crawl of LedgerLens's own demo storefront pages (prices set by the demo). */
      sandbox?: boolean;
      capturedAt: string;
      runId: string | null;
    }
  | { kind: "transactions"; rows: { date: string; merchant: string; amount: string; reference: string | null }[] }
  | { kind: "series"; label: string; rows: { date: string; amount: string }[] }
  | { kind: "score"; label: string; components: { signal: string; weight: number; detail: string }[]; total: number };

export interface Calculation {
  label: string;
  formula: string;
  result: string;
}

export interface BuiltCandidate {
  ai: FindingCandidate;
  impact: Impact;
  evidence: EvidenceInput[];
  calculations: Calculation[];
  productId: string | null;
  metadata: Record<string, unknown>;
  recommendationMetadata: Record<string, unknown>;
}

const fmtPrice = (cents: number) => format(cents, { compact: false });
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const pct = (n: number, digits = 1) => `${n.toFixed(digits)}%`;
const round2 = (n: number) => Math.round(n * 100) / 100;

function evidenceSummaries(evidence: EvidenceInput[]): FindingCandidate["evidence"] {
  return evidence.map((e) => {
    // Strip UI-only display fields before the evidence reaches the model.
    const rest = Object.fromEntries(Object.entries(e.data).filter(([key]) => key !== "display"));
    return { type: e.evidenceType, title: e.title, description: e.description, data: rest };
  });
}

function base(
  type: FindingType,
  fingerprint: string,
  subject: string,
  title: string,
  impact: Impact,
  confidence: number,
  action: { actionType: ActionType; title: string; description: string },
  allowed: ActionType[],
  metrics: Record<string, number | string>,
  evidence: EvidenceInput[],
  grounded: number[],
  narrative: FindingCandidate["deterministicNarrative"],
): FindingCandidate {
  return {
    type,
    fingerprint,
    subject,
    title,
    deterministicMetrics: metrics,
    evidence: evidenceSummaries(evidence),
    calculatedImpact: { monthlyCents: impact.monthlyCents, annualCents: impact.annualCents, recoveryKind: impact.recoveryKind },
    deterministicConfidence: round2(confidence),
    proposedAction: action,
    allowedActionTypes: allowed,
    groundedAmountsCents: Array.from(new Set([...grounded, impact.monthlyCents, impact.annualCents].filter((n) => Number.isFinite(n)))),
    deterministicNarrative: narrative,
  };
}

// ---------------------------------------------------------------------------
// Finding A: duplicate payment
// ---------------------------------------------------------------------------

export function buildDuplicateCandidate(dup: DuplicateCandidate): BuiltCandidate {
  const { original, duplicate } = dup;
  const amount = dup.recoverableCents;
  const vendor = original.merchantName;
  const invoice = original.invoiceReference ?? duplicate.invoiceReference;
  const impact = oneTimeImpact(amount);
  const confidence = Math.min(0.97, dup.score);

  const evidence: EvidenceInput[] = [
    {
      evidenceType: "DUPLICATE_PAIR",
      title: "Two payments for the same bill",
      description: `${fmtPrice(original.amountCents)} paid on ${isoDate(original.transactionDate)} and ${fmtPrice(duplicate.amountCents)} on ${isoDate(duplicate.transactionDate)}.`,
      sourceType: "ledger",
      sourceReference: `${original.id},${duplicate.id}`,
      confidence,
      data: {
        transactionIds: [original.id, duplicate.id],
        amountsCents: [original.amountCents, duplicate.amountCents],
        dates: [isoDate(original.transactionDate), isoDate(duplicate.transactionDate)],
        merchantDescriptors: [original.merchantName, duplicate.merchantName],
        invoiceReferences: [original.invoiceReference, duplicate.invoiceReference],
        daysApart: dup.daysApart,
        display: {
          kind: "transactions",
          rows: [original, duplicate].map((t) => ({
            date: isoDate(t.transactionDate),
            merchant: t.merchantName,
            amount: fmtPrice(t.amountCents),
            reference: t.invoiceReference,
          })),
        },
      },
    },
    {
      evidenceType: "DUPLICATE_SCORE",
      title: "Duplicate score",
      description: `Scored ${dup.score.toFixed(2)} against a 0.70 threshold.`,
      sourceType: "calculation",
      sourceReference: null,
      confidence,
      data: {
        score: dup.score,
        threshold: 0.7,
        components: dup.components,
        display: { kind: "score", label: "Duplicate score", components: dup.components, total: dup.score },
      },
    },
  ];

  const calculations: Calculation[] = [
    ...dup.components.map((c) => ({ label: c.detail, formula: c.signal.replace(/_/g, " "), result: `${c.weight > 0 ? "+" : ""}${c.weight.toFixed(2)}` })),
    { label: "Duplicate score", formula: "sum of signals (flag at 0.70 or above)", result: dup.score.toFixed(2) },
    { label: "Recoverable amount", formula: "min(first payment, second payment)", result: fmtPrice(amount) },
  ];

  const action = {
    actionType: "REVIEW_PAYMENT" as const,
    title: `Request a refund of the duplicate ${fmtPrice(amount)} payment${invoice ? ` for ${invoice}` : ""}`,
    description: `Confirm with ${vendor} that ${invoice ?? "the bill"} was paid twice, then request a refund or a credit against the next invoice.`,
  };

  return {
    ai: base(
      "DUPLICATE_PAYMENT",
      `DUPLICATE_PAYMENT:${merchantKey(vendor)}:${invoice ?? amount}`,
      vendor,
      `Duplicate payment to ${vendor}`,
      impact,
      confidence,
      action,
      ["REVIEW_PAYMENT", "CONTACT_VENDOR"],
      {
        vendor,
        invoiceReference: invoice ?? "none",
        amountCents: amount,
        firstPaymentDate: isoDate(original.transactionDate),
        secondPaymentDate: isoDate(duplicate.transactionDate),
        daysApart: dup.daysApart,
        duplicateScore: dup.score,
      },
      evidence,
      [amount, original.amountCents, duplicate.amountCents, original.amountCents + duplicate.amountCents],
      {
        title: `Duplicate payment to ${vendor}`,
        summary: `${invoice ? `Invoice ${invoice}` : "A bill"} from ${vendor} was paid twice, ${dup.daysApart} days apart. ${fmtPrice(amount)} is likely recoverable.`,
        explanation: `The ledger shows two ${fmtPrice(amount)} payments to ${vendor}${invoice ? ` that both reference ${invoice}` : ""}, made ${dup.daysApart} days apart${original.merchantName !== duplicate.merchantName ? " through different payment rails" : ""}. Same vendor, identical amount, close timing${invoice ? " and the same invoice number" : ""} together score ${dup.score.toFixed(2)}, well above the 0.70 duplicate threshold.`,
        rationale: "A refund or vendor credit returns cash that was paid by mistake; nothing about the vendor relationship needs to change.",
        uncertainty: [
          "The vendor may have already issued a credit that is not yet visible in the bank feed.",
          "Confirm the second payment was not a deposit for a new order.",
        ],
      },
    ),
    impact,
    evidence,
    calculations,
    productId: null,
    metadata: {
      vendor,
      invoiceReference: invoice,
      transactionIds: [original.id, duplicate.id],
      recoveryKind: "one_time",
      stream: streamForCategory(original.category),
      paidDates: [isoDate(original.transactionDate), isoDate(duplicate.transactionDate)],
    },
    recommendationMetadata: { refundAmountCents: amount, vendor, invoiceReference: invoice, paidDates: [isoDate(original.transactionDate), isoDate(duplicate.transactionDate)] },
  };
}

// ---------------------------------------------------------------------------
// Competitor evidence (shared by margin erosion and pricing opportunity)
// ---------------------------------------------------------------------------

function competitorEvidence(observations: (PriceObservation & { externalName?: string | null })[]): EvidenceInput[] {
  return observations.map((obs) => {
    const sandbox = obs.captureMode === "live" && isSandboxListingUrl(obs.productUrl);
    return {
      evidenceType: "COMPETITOR_PRICE",
      title: `${obs.competitorName} lists a comparable product at ${fmtPrice(obs.priceCents)}`,
      description: `${obs.externalName ?? "Comparable product"} captured ${obs.capturedAt.toISOString()}${obs.captureMode === "fixture" ? " (demo dataset)" : sandbox ? ` from a demo storefront page via Apify run ${obs.apifyRunId}` : ` via Apify run ${obs.apifyRunId}`}.`,
      sourceType: "apify" as const,
      sourceReference: obs.productUrl,
      confidence: obs.captureMode === "live" && !sandbox ? 0.9 : 0.8,
      data: {
        competitorName: obs.competitorName,
        priceCents: obs.priceCents,
        currency: obs.currency,
        availability: obs.availability,
        captureMode: obs.captureMode,
        sandbox,
        apifyRunId: obs.apifyRunId,
        capturedAt: obs.capturedAt.toISOString(),
        display: {
          kind: "competitor" as const,
          competitorName: obs.competitorName,
          externalName: obs.externalName ?? null,
          price: fmtPrice(obs.priceCents),
          url: obs.productUrl,
          availability: obs.availability,
          captureMode: obs.captureMode,
          sandbox,
          capturedAt: obs.capturedAt.toISOString(),
          runId: obs.apifyRunId,
        },
      },
    };
  });
}

function marketSummaryEvidence(opp: PricingOpportunity): EvidenceInput {
  return {
    evidenceType: "MARKET_SUMMARY",
    title: "Market price range",
    description: `${opp.stats.count} competitors list between ${fmtPrice(opp.stats.minCents)} and ${fmtPrice(opp.stats.maxCents)} (median ${fmtPrice(opp.stats.medianCents)}).`,
    sourceType: "calculation",
    sourceReference: null,
    confidence: 0.85,
    data: {
      ...opp.stats,
      currentPriceCents: opp.currentPriceCents,
      percentBelowMedian: opp.percentBelowMedian,
      display: {
        kind: "change",
        label: "Your price vs market median",
        before: fmtPrice(opp.currentPriceCents),
        after: fmtPrice(opp.stats.medianCents),
        delta: `${pct(opp.percentBelowMedian)} below median`,
        tone: "neutral",
      },
    },
  };
}

function pricingCalculations(opp: PricingOpportunity): Calculation[] {
  const prices = opp.observations.map((o) => fmtPrice(o.priceCents)).join(", ");
  return [
    { label: "Competitor median", formula: `median(${prices})`, result: fmtPrice(opp.stats.medianCents) },
    {
      label: "Gap to median",
      formula: `(${fmtPrice(opp.stats.medianCents)} − ${fmtPrice(opp.currentPriceCents)}) / ${fmtPrice(opp.stats.medianCents)}`,
      result: `${pct(opp.percentBelowMedian)} below`,
    },
    {
      label: "Conservative price",
      formula: `min(${fmtPrice(opp.stats.medianCents)} × 0.90, ${fmtPrice(opp.currentPriceCents)} × 1.15), rounded down to a whole dollar`,
      result: fmtPrice(opp.recommendedPriceCents),
    },
    {
      label: "Monthly upside",
      formula: `${fmtPrice(opp.priceIncreaseCents)} × ${opp.monthlyUnits} units/month (trailing 90-day velocity)`,
      result: fmtPrice(opp.monthlyUpsideCents),
    },
    { label: "Annual upside", formula: `${fmtPrice(opp.monthlyUpsideCents)} × 12 (unrounded)`, result: fmtPrice(opp.annualUpsideCents) },
  ];
}

// ---------------------------------------------------------------------------
// Finding B: margin erosion (optionally corroborated by market pricing)
// ---------------------------------------------------------------------------

export function buildMarginCandidate(a: SkuMarginAnalysis, opp: PricingOpportunity | null): BuiltCandidate {
  const prev = a.previousUnitCostCents!;
  const latest = a.latestUnitCostCents!;
  const costDelta = latest - prev;
  const supplier = a.supplierName ?? "the supplier";

  let impact: Impact;
  let action: { actionType: ActionType; title: string; description: string };
  if (opp) {
    // Recover via a market-supported price increase, capped at the cost being absorbed.
    impact = {
      monthlyCents: Math.min(opp.monthlyUpsideCents, a.monthlyAbsorbedCostCents),
      annualCents: Math.min(opp.annualUpsideCents, a.annualAbsorbedCostCents),
      recoveryKind: "recurring",
    };
    action = {
      actionType: "CHANGE_PRICE",
      title: `Raise price from ${fmtPrice(a.currentSellingPriceCents)} → ${fmtPrice(opp.recommendedPriceCents)}`,
      description: `Increase the ${a.name} retail price to ${fmtPrice(opp.recommendedPriceCents)}, still ${pct(((opp.stats.medianCents - opp.recommendedPriceCents) / opp.stats.medianCents) * 100)} below the competitor median, to recover most of the supplier increase.`,
    };
  } else {
    impact = { monthlyCents: a.monthlyAbsorbedCostCents, annualCents: a.annualAbsorbedCostCents, recoveryKind: "recurring" };
    action = {
      actionType: "CONTACT_VENDOR",
      title: `Negotiate the ${a.name} unit cost with ${supplier}`,
      description: `Ask ${supplier} to justify or roll back the ${fmtPrice(prev)} → ${fmtPrice(latest)} unit cost change, or source quotes from alternative suppliers.`,
    };
  }

  let confidence = 0.55;
  if (a.costSource === "supplier_invoice") confidence += 0.15;
  else confidence += 0.08;
  if (!a.retailPriceChanged) confidence += 0.1;
  if (a.unitsTrailing90Days >= 60) confidence += 0.07;
  else if (a.unitsTrailing90Days >= 20) confidence += 0.03;
  if (opp && opp.stats.count >= 2) confidence += 0.05;

  const evidence: EvidenceInput[] = [
    {
      evidenceType: "SUPPLIER_COST_CHANGE",
      title: "Supplier cost",
      description: `${supplier} raised the unit cost from ${fmtPrice(prev)} to ${fmtPrice(latest)} effective ${a.costChangeDate ? isoDate(a.costChangeDate) : "recently"}.`,
      sourceType: "supplier_costs",
      sourceReference: a.costSource,
      confidence: 0.95,
      data: {
        previousUnitCostCents: prev,
        latestUnitCostCents: latest,
        costChangePercent: a.costChangePercent,
        effectiveDate: a.costChangeDate ? isoDate(a.costChangeDate) : null,
        supplier,
        display: { kind: "change", label: "Supplier cost", before: fmtPrice(prev), after: fmtPrice(latest), delta: `+${pct(a.costChangePercent)}`, tone: "negative" },
      },
    },
    {
      evidenceType: "RETAIL_PRICE_HISTORY",
      title: "Retail price",
      description: a.retailPriceChanged
        ? `Average selling price moved from ${fmtPrice(a.priceBeforeChangeCents ?? 0)} to ${fmtPrice(a.priceAfterChangeCents ?? 0)}.`
        : `Orders before and after the cost change sold at ${fmtPrice(a.currentSellingPriceCents)}.`,
      sourceType: "sales",
      sourceReference: a.sku,
      confidence: 0.95,
      data: {
        priceBeforeChangeCents: a.priceBeforeChangeCents,
        priceAfterChangeCents: a.priceAfterChangeCents,
        currentSellingPriceCents: a.currentSellingPriceCents,
        retailPriceChanged: a.retailPriceChanged,
        display: {
          kind: "change",
          label: "Retail price",
          before: fmtPrice(a.priceBeforeChangeCents ?? a.currentSellingPriceCents),
          after: fmtPrice(a.currentSellingPriceCents),
          delta: a.retailPriceChanged ? "Changed" : "No change",
          tone: "neutral",
        },
      },
    },
    {
      evidenceType: "GROSS_MARGIN_CHANGE",
      title: "Gross margin",
      description: `Gross margin fell from ${pct(a.historicalMarginPct)} to ${pct(a.currentMarginPct)}.`,
      sourceType: "calculation",
      sourceReference: null,
      confidence: 0.95,
      data: {
        historicalMarginPct: a.historicalMarginPct,
        currentMarginPct: a.currentMarginPct,
        marginDeltaPoints: a.marginDeltaPoints,
        display: { kind: "change", label: "Gross margin", before: pct(a.historicalMarginPct), after: pct(a.currentMarginPct), delta: `${a.marginDeltaPoints.toFixed(1)} pts`, tone: "negative" },
      },
    },
    {
      evidenceType: "SALES_VELOCITY",
      title: "Sales velocity",
      description: `${a.unitsTrailing90Days} units sold in the last 90 days (${a.monthlyUnitVelocity} per month).`,
      sourceType: "sales",
      sourceReference: a.sku,
      confidence: 0.9,
      data: {
        unitsTrailing90Days: a.unitsTrailing90Days,
        monthlyUnitVelocity: a.monthlyUnitVelocity,
        monthlyAbsorbedCostCents: a.monthlyAbsorbedCostCents,
        display: { kind: "metric", label: "Units sold, last 90 days", value: String(a.unitsTrailing90Days), note: `${a.monthlyUnitVelocity} per month` },
      },
    },
  ];
  if (opp) evidence.push(marketSummaryEvidence(opp), ...competitorEvidence(opp.observations));

  const calculations: Calculation[] = [
    { label: "Historical gross margin", formula: `(${fmtPrice(a.priceBeforeChangeCents ?? a.currentSellingPriceCents)} − ${fmtPrice(prev)}) / ${fmtPrice(a.priceBeforeChangeCents ?? a.currentSellingPriceCents)}`, result: pct(a.historicalMarginPct) },
    { label: "Current gross margin", formula: `(${fmtPrice(a.currentSellingPriceCents)} − ${fmtPrice(latest)}) / ${fmtPrice(a.currentSellingPriceCents)}`, result: pct(a.currentMarginPct) },
    { label: "Margin compression", formula: `${pct(a.currentMarginPct)} − ${pct(a.historicalMarginPct)}`, result: `${a.marginDeltaPoints.toFixed(1)} pts` },
    { label: "Cost absorbed per month", formula: `${fmtPrice(costDelta)} × ${a.monthlyUnitVelocity} units/month`, result: fmtPrice(a.monthlyAbsorbedCostCents) },
    { label: "Cost absorbed per year", formula: `${fmtPrice(a.monthlyAbsorbedCostCents)} × 12 (unrounded)`, result: fmtPrice(a.annualAbsorbedCostCents) },
    ...(opp ? pricingCalculations(opp) : []),
    { label: "Recoverable per year", formula: opp ? "min(annual upside, annual absorbed cost)" : "annual absorbed cost", result: fmtPrice(impact.annualCents) },
  ];

  const competitorSentence = opp
    ? ` ${opp.stats.count} competing retailers currently list comparable products between ${fmtPrice(opp.stats.minCents)} and ${fmtPrice(opp.stats.maxCents)}, so a move to ${fmtPrice(opp.recommendedPriceCents)} keeps ${a.name} below the market median of ${fmtPrice(opp.stats.medianCents)}.`
    : "";

  return {
    ai: base(
      "MARGIN_EROSION",
      `MARGIN_EROSION:${a.sku}`,
      a.name,
      `Margin erosion on ${a.name}`,
      impact,
      Math.min(0.95, confidence),
      action,
      ["CHANGE_PRICE", "CONTACT_VENDOR"],
      {
        sku: a.sku,
        product: a.name,
        supplier,
        previousUnitCostCents: prev,
        latestUnitCostCents: latest,
        costChangePercent: a.costChangePercent,
        sellingPriceCents: a.currentSellingPriceCents,
        historicalMarginPct: a.historicalMarginPct,
        currentMarginPct: a.currentMarginPct,
        marginDeltaPoints: a.marginDeltaPoints,
        unitsTrailing90Days: a.unitsTrailing90Days,
        monthlyAbsorbedCostCents: a.monthlyAbsorbedCostCents,
        annualAbsorbedCostCents: a.annualAbsorbedCostCents,
        ...(opp
          ? {
              competitorMedianCents: opp.stats.medianCents,
              competitorMinCents: opp.stats.minCents,
              competitorMaxCents: opp.stats.maxCents,
              recommendedPriceCents: opp.recommendedPriceCents,
              monthlyUpsideCents: opp.monthlyUpsideCents,
              annualUpsideCents: opp.annualUpsideCents,
            }
          : {}),
      },
      evidence,
      [
        prev,
        latest,
        costDelta,
        a.currentSellingPriceCents,
        a.monthlyAbsorbedCostCents,
        a.annualAbsorbedCostCents,
        ...(opp
          ? [opp.stats.medianCents, opp.stats.minCents, opp.stats.maxCents, opp.recommendedPriceCents, opp.priceIncreaseCents, opp.monthlyUpsideCents, opp.annualUpsideCents, ...opp.observations.map((o) => o.priceCents)]
          : []),
      ],
      {
        title: `Margin erosion on ${a.name}`,
        summary: `Supplier costs for ${a.name} rose ${pct(a.costChangePercent)} while your price stayed at ${fmtPrice(a.currentSellingPriceCents)}, cutting gross margin by ${Math.abs(a.marginDeltaPoints).toFixed(1)} points.`,
        explanation: `${supplier} raised the unit cost from ${fmtPrice(prev)} to ${fmtPrice(latest)}, but ${a.name} still sells at ${fmtPrice(a.currentSellingPriceCents)}. The business is absorbing the full increase: about ${fmtPrice(a.monthlyAbsorbedCostCents)} a month at the current sales pace, and gross margin has fallen from ${pct(a.historicalMarginPct)} to ${pct(a.currentMarginPct)}.${competitorSentence}`,
        rationale: opp
          ? `Market evidence suggests room to raise price. The suggested price is deliberately conservative: capped at 90% of the competitor median and a 15% increase.`
          : `Without market pricing evidence, the safest lever is the supplier cost itself.`,
        uncertainty: [
          "Assumes sales volume holds at the historical pace after a price change; demand elasticity is not measured.",
          ...(opp ? ["Competitor products are comparable but not identical."] : ["No competitor pricing was available for this product."]),
        ],
      },
    ),
    impact,
    evidence,
    calculations,
    productId: a.productId,
    metadata: { sku: a.sku, productName: a.name, supplier, recoveryKind: "recurring", hasMarketEvidence: Boolean(opp), stream: "cogs" },
    recommendationMetadata: opp
      ? { fromPriceCents: a.currentSellingPriceCents, toPriceCents: opp.recommendedPriceCents, sku: a.sku }
      : { supplier, targetUnitCostCents: prev, sku: a.sku },
  };
}

// ---------------------------------------------------------------------------
// Finding C: pricing opportunity
// ---------------------------------------------------------------------------

export function buildPricingCandidate(product: { id: string; sku: string; name: string }, opp: PricingOpportunity): BuiltCandidate {
  const impact = calculateAnnualizedImpact(opp.monthlyUpsideCents);
  const withAnnual = { ...impact, annualCents: opp.annualUpsideCents };
  const inStock = opp.observations.filter((o) => o.availability === "in_stock").length;
  let confidence = 0.5 + 0.1 * Math.min(3, opp.stats.count);
  if (opp.stats.maxCents / opp.stats.minCents <= 1.15) confidence += 0.05;
  if (inStock === opp.observations.length) confidence += 0.05;
  // Price elasticity is unknown, so pricing findings are capped below cost-based findings.
  confidence = Math.min(0.88, confidence);

  const evidence = [marketSummaryEvidence(opp), ...competitorEvidence(opp.observations)];
  const action = {
    actionType: "CHANGE_PRICE" as const,
    title: `Raise price from ${fmtPrice(opp.currentPriceCents)} → ${fmtPrice(opp.recommendedPriceCents)}`,
    description: `Test a ${fmtPrice(opp.recommendedPriceCents)} price for ${product.name} and watch conversion for two weeks. The new price remains below every observed competitor.`,
  };

  return {
    ai: base(
      "PRICING_OPPORTUNITY",
      `PRICING_OPPORTUNITY:${product.sku}`,
      product.name,
      `Pricing opportunity on ${product.name}`,
      withAnnual,
      confidence,
      action,
      ["CHANGE_PRICE", "INVESTIGATE"],
      {
        sku: product.sku,
        product: product.name,
        currentPriceCents: opp.currentPriceCents,
        competitorMedianCents: opp.stats.medianCents,
        competitorMinCents: opp.stats.minCents,
        competitorMaxCents: opp.stats.maxCents,
        competitorCount: opp.stats.count,
        percentBelowMedian: opp.percentBelowMedian,
        recommendedPriceCents: opp.recommendedPriceCents,
        monthlyUnits: opp.monthlyUnits,
        monthlyUpsideCents: opp.monthlyUpsideCents,
        annualUpsideCents: opp.annualUpsideCents,
      },
      evidence,
      [opp.currentPriceCents, opp.stats.medianCents, opp.stats.minCents, opp.stats.maxCents, opp.recommendedPriceCents, opp.priceIncreaseCents, opp.priceDeltaCents, ...opp.observations.map((o) => o.priceCents)],
      {
        title: `Pricing opportunity on ${product.name}`,
        summary: `${product.name} sells at ${fmtPrice(opp.currentPriceCents)}, ${pct(opp.percentBelowMedian)} below the competitor median of ${fmtPrice(opp.stats.medianCents)}.`,
        explanation: `${opp.stats.count} competing retailers list comparable products between ${fmtPrice(opp.stats.minCents)} and ${fmtPrice(opp.stats.maxCents)}. Acme's ${fmtPrice(opp.currentPriceCents)} price is the lowest observed. Raising it to ${fmtPrice(opp.recommendedPriceCents)} would still undercut every competitor and adds about ${fmtPrice(opp.monthlyUpsideCents)} a month at the current sales pace.`,
        rationale: "Market evidence suggests you have room to raise price. The recommendation stays at or below 90% of the median and caps the increase at 15%.",
        uncertainty: [
          "Assumes unit sales hold at the historical pace; demand elasticity is not measured.",
          "Competitor products are comparable, not identical; brand and shipping terms differ.",
        ],
      },
    ),
    impact: withAnnual,
    evidence,
    calculations: pricingCalculations(opp),
    productId: product.id,
    metadata: { sku: product.sku, productName: product.name, recoveryKind: "recurring", hasMarketEvidence: true, stream: "uncaptured" },
    recommendationMetadata: { fromPriceCents: opp.currentPriceCents, toPriceCents: opp.recommendedPriceCents, sku: product.sku },
  };
}

// ---------------------------------------------------------------------------
// Finding D: subscription creep
// ---------------------------------------------------------------------------

function displayVendor(name: string): string {
  return name.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildSubscriptionCandidate(flag: RecurringFlag): BuiltCandidate {
  const s = flag.series;
  const vendor = displayVendor(s.normalizedMerchantName);
  const isDuplicate = flag.kind === "POSSIBLE_DUPLICATE_SUBSCRIPTION";
  const monthly = isDuplicate ? s.latestAmountCents : s.monthlyIncreaseCents;
  const impact = calculateAnnualizedImpact(monthly);
  const annual = isDuplicate ? s.annualizedSpendCents : s.annualizedIncreaseCents;
  const withAnnual = { ...impact, annualCents: annual };

  let confidence = 0.6;
  if (s.chargesAtPreviousPrice >= 3 || isDuplicate) confidence += 0.1;
  if (s.percentIncrease >= 50 || isDuplicate) confidence += 0.1;
  // No usage data is connected, so this can only be a "merits review" finding.
  confidence = Math.min(0.8, confidence);

  const evidence: EvidenceInput[] = [
    {
      evidenceType: "RECURRING_CHARGE_SERIES",
      title: `${vendor} charges`,
      description: `${s.charges.length} ${s.cadence} charges detected from bank descriptors grouped as "${s.normalizedMerchantName}".`,
      sourceType: "ledger",
      sourceReference: s.charges.map((c) => c.id).join(","),
      confidence: 0.9,
      data: {
        cadence: s.cadence,
        descriptors: Array.from(new Set(s.charges.map((c) => c.merchantName))),
        chargesCents: s.charges.map((c) => c.amountCents),
        intervalsDays: s.intervalsDays,
        display: { kind: "series", label: `${vendor} (${s.cadence})`, rows: s.charges.map((c) => ({ date: isoDate(c.transactionDate), amount: fmtPrice(c.amountCents) })) },
      },
    },
    isDuplicate
      ? {
          evidenceType: "PARALLEL_SUBSCRIPTION",
          title: "Second plan with the same vendor",
          description: `A separate ${fmtPrice(flag.relatedSeries?.latestAmountCents ?? 0)} monthly charge is also billed by ${vendor}.`,
          sourceType: "ledger",
          sourceReference: flag.relatedSeries?.charges.map((c) => c.id).join(",") ?? null,
          confidence: 0.8,
          data: { relatedAmountCents: flag.relatedSeries?.latestAmountCents ?? 0, display: { kind: "metric", label: "Parallel plan", value: fmtPrice(flag.relatedSeries?.latestAmountCents ?? 0), note: "per month" } },
        }
      : {
          evidenceType: "PRICE_INCREASE",
          title: "Plan price",
          description: `The charge rose from ${fmtPrice(s.previousAmountCents)} to ${fmtPrice(s.latestAmountCents)} starting ${s.priceChangeDate ? isoDate(s.priceChangeDate) : "recently"}.`,
          sourceType: "calculation",
          sourceReference: null,
          confidence: 0.9,
          data: {
            previousAmountCents: s.previousAmountCents,
            latestAmountCents: s.latestAmountCents,
            percentIncrease: s.percentIncrease,
            priceChangeDate: s.priceChangeDate ? isoDate(s.priceChangeDate) : null,
            display: { kind: "change", label: "Monthly charge", before: fmtPrice(s.previousAmountCents), after: fmtPrice(s.latestAmountCents), delta: `+${pct(s.percentIncrease)}`, tone: "negative" },
          },
        },
    {
      evidenceType: "ANNUALIZED_SPEND",
      title: "Annualized spend",
      description: `At the current price this costs ${fmtPrice(s.annualizedSpendCents)} a year.`,
      sourceType: "calculation",
      sourceReference: null,
      confidence: 0.9,
      data: { annualizedSpendCents: s.annualizedSpendCents, display: { kind: "metric", label: "Annualized spend", value: fmtPrice(s.annualizedSpendCents), note: "at the latest price" } },
    },
  ];

  const calculations: Calculation[] = isDuplicate
    ? [{ label: "Annual cost of the second plan", formula: `${fmtPrice(s.latestAmountCents)} × 12`, result: fmtPrice(annual) }]
    : [
        { label: "Baseline price", formula: `median of ${s.chargesAtPreviousPrice} charges before the change`, result: fmtPrice(s.previousAmountCents) },
        { label: "Increase", formula: `(${fmtPrice(s.latestAmountCents)} − ${fmtPrice(s.previousAmountCents)}) / ${fmtPrice(s.previousAmountCents)}`, result: `+${pct(s.percentIncrease)}` },
        { label: "Annualized spend", formula: `${fmtPrice(s.latestAmountCents)} × 12`, result: fmtPrice(s.annualizedSpendCents) },
        { label: "Annual cost of the increase", formula: `${fmtPrice(s.latestAmountCents - s.previousAmountCents)} × 12`, result: fmtPrice(annual) },
      ];

  const action = isDuplicate
    ? {
        actionType: "REVIEW_SUBSCRIPTION" as const,
        title: `Review the two ${vendor} plans`,
        description: `Confirm whether both ${vendor} accounts are needed and consolidate if one is redundant.`,
      }
    : {
        actionType: "REVIEW_SUBSCRIPTION" as const,
        title: `Review the ${vendor} plan change`,
        description: `Confirm whether the move from ${fmtPrice(s.previousAmountCents)} to ${fmtPrice(s.latestAmountCents)} a month was intended. If the added features are not needed, request the prior plan.`,
      };

  return {
    ai: base(
      "SUBSCRIPTION_CREEP",
      `SUBSCRIPTION_CREEP:${s.merchantKey}`,
      vendor,
      isDuplicate ? `Possible duplicate ${vendor} subscription` : `${vendor} subscription price increase`,
      withAnnual,
      confidence,
      action,
      ["REVIEW_SUBSCRIPTION", "CONTACT_VENDOR"],
      {
        vendor,
        cadence: s.cadence,
        previousAmountCents: s.previousAmountCents,
        latestAmountCents: s.latestAmountCents,
        percentIncrease: s.percentIncrease,
        chargesAtPreviousPrice: s.chargesAtPreviousPrice,
        chargesAtLatestPrice: s.chargesAtLatestPrice,
        annualizedSpendCents: s.annualizedSpendCents,
        annualizedIncreaseCents: s.annualizedIncreaseCents,
        usageDataAvailable: "no",
      },
      evidence,
      [s.previousAmountCents, s.latestAmountCents, s.latestAmountCents - s.previousAmountCents, s.annualizedSpendCents, s.annualizedIncreaseCents, monthly],
      isDuplicate
        ? {
            title: `Possible duplicate ${vendor} subscription`,
            summary: `${vendor} bills two separate monthly plans. The recurring expense merits review.`,
            explanation: `Bank descriptors for ${vendor} split into two monthly series at different amounts. That pattern usually means two accounts or seats were opened separately.`,
            rationale: "Consolidating duplicate accounts removes spend without losing capability, if one account is redundant.",
            uncertainty: ["No usage data is connected; both plans may be in active use."],
          }
        : {
            title: `${vendor} subscription price increase`,
            summary: `${vendor} rose from ${fmtPrice(s.previousAmountCents)} to ${fmtPrice(s.latestAmountCents)} a month (+${pct(s.percentIncrease)}). The recurring expense merits review.`,
            explanation: `After ${s.chargesAtPreviousPrice} monthly charges at ${fmtPrice(s.previousAmountCents)}, ${vendor} has billed ${fmtPrice(s.latestAmountCents)} for the last ${s.chargesAtLatestPrice} cycles. Bank descriptors vary ("${Array.from(new Set(s.charges.map((c) => c.merchantName))).slice(0, 2).join('", "')}"), which makes the change easy to miss. The increase costs ${fmtPrice(s.annualizedIncreaseCents)} a year.`,
            rationale: "Plan upgrades often happen automatically when a usage tier is crossed. A quick review confirms whether the higher tier is earning its cost.",
            uncertainty: ["No usage data is connected, so LedgerLens cannot tell whether the higher tier is needed.", "The vendor may have changed list prices for all customers."],
          },
    ),
    impact: withAnnual,
    evidence,
    calculations,
    productId: null,
    metadata: { vendor, cadence: s.cadence, kind: flag.kind, recoveryKind: "recurring", stream: streamForCategory(s.charges[0]?.category) },
    recommendationMetadata: { vendor, previousAmountCents: s.previousAmountCents, latestAmountCents: s.latestAmountCents },
  };
}
