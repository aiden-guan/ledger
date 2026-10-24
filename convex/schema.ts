import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Money fields are integer cents. Timestamps are epoch milliseconds.

const investigationStatus = v.union(v.literal("CREATED"), v.literal("INGESTING"), v.literal("ANALYZING_INTERNAL_DATA"), v.literal("GENERATING_HYPOTHESES"), v.literal("GATHERING_EXTERNAL_EVIDENCE"), v.literal("VALIDATING_FINDINGS"), v.literal("CALCULATING_IMPACT"), v.literal("GENERATING_RECOMMENDATIONS"), v.literal("COMPLETED"), v.literal("FAILED"));
const findingType = v.union(v.literal("DUPLICATE_PAYMENT"), v.literal("MARGIN_EROSION"), v.literal("PRICING_OPPORTUNITY"), v.literal("SUBSCRIPTION_CREEP"));
const recommendationStatus = v.union(v.literal("PROPOSED"), v.literal("APPROVED"), v.literal("REJECTED"), v.literal("READY_FOR_EXECUTION"));
const actionType = v.union(v.literal("REVIEW_PAYMENT"), v.literal("CONTACT_VENDOR"), v.literal("REVIEW_SUBSCRIPTION"), v.literal("CHANGE_PRICE"), v.literal("INVESTIGATE"));

export default defineSchema({
  organizations: defineTable({
    slug: v.string(),
    name: v.string(),
    industry: v.string(),
    currency: v.string(),
    demoMode: v.boolean(),
  }).index("by_slug", ["slug"]),

  products: defineTable({
    organizationId: v.id("organizations"),
    sku: v.string(),
    name: v.string(),
    category: v.union(v.string(), v.null()),
    sellingPriceCents: v.number(),
    active: v.boolean(),
  }).index("by_org", ["organizationId"]),

  competitors: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    domain: v.string(),
  }).index("by_org", ["organizationId"]),

  competitorProducts: defineTable({
    organizationId: v.id("organizations"),
    productId: v.id("products"),
    competitorId: v.id("competitors"),
    productUrl: v.string(),
    externalName: v.string(),
  }).index("by_org", ["organizationId"]),

  sales: defineTable({
    organizationId: v.id("organizations"),
    productId: v.id("products"),
    orderId: v.string(),
    soldAt: v.number(),
    quantity: v.number(),
    unitPriceCents: v.number(),
    grossRevenueCents: v.number(),
  }).index("by_org", ["organizationId", "soldAt"]),

  supplierCosts: defineTable({
    organizationId: v.id("organizations"),
    productId: v.id("products"),
    supplierName: v.string(),
    effectiveDate: v.number(),
    unitCostCents: v.number(),
    source: v.string(),
  }).index("by_org", ["organizationId", "effectiveDate"]),

  transactions: defineTable({
    organizationId: v.id("organizations"),
    transactionDate: v.number(),
    merchantName: v.string(),
    normalizedMerchantName: v.string(),
    amountCents: v.number(),
    currency: v.string(),
    transactionType: v.union(v.literal("DEBIT"), v.literal("CREDIT")),
    category: v.union(v.string(), v.null()),
    invoiceReference: v.union(v.string(), v.null()),
    source: v.string(),
    externalId: v.union(v.string(), v.null()),
    metadata: v.any(),
  }).index("by_org", ["organizationId", "transactionDate"]),

  externalPriceObservations: defineTable({
    organizationId: v.id("organizations"),
    investigationId: v.union(v.id("investigations"), v.null()),
    productId: v.id("products"),
    competitorId: v.id("competitors"),
    priceCents: v.number(),
    currency: v.string(),
    availability: v.union(v.string(), v.null()),
    externalName: v.union(v.string(), v.null()),
    productUrl: v.string(),
    sourceUrl: v.string(),
    capturedAt: v.number(),
    captureMode: v.union(v.literal("live"), v.literal("fixture")),
    apifyRunId: v.union(v.string(), v.null()),
    rawPayload: v.any(),
  }).index("by_org", ["organizationId"]),

  investigations: defineTable({
    organizationId: v.id("organizations"),
    status: investigationStatus,
    triggerType: v.union(v.literal("MANUAL"), v.literal("SCHEDULED"), v.literal("DEMO_SEED")),
    startedAt: v.number(),
    completedAt: v.union(v.number(), v.null()),
    totalRecoveryMonthlyCents: v.number(),
    totalRecoveryAnnualCents: v.number(),
    errorMessage: v.union(v.string(), v.null()),
    metadata: v.any(),
  })
    .index("by_org", ["organizationId", "startedAt"])
    .index("by_org_status", ["organizationId", "status"]),

  investigationEvents: defineTable({
    investigationId: v.id("investigations"),
    // Monotonic per investigation so clients can order and diff the timeline.
    seq: v.number(),
    eventType: v.string(),
    message: v.string(),
    metadata: v.any(),
  }).index("by_investigation", ["investigationId", "seq"]),

  evidence: defineTable({
    investigationId: v.id("investigations"),
    evidenceType: v.string(),
    title: v.string(),
    description: v.string(),
    sourceType: v.string(),
    sourceReference: v.union(v.string(), v.null()),
    data: v.any(),
    confidence: v.number(),
  }).index("by_investigation", ["investigationId"]),

  findings: defineTable({
    investigationId: v.id("investigations"),
    organizationId: v.id("organizations"),
    findingType,
    /** Stable identity across investigations (type + subject) for carrying decisions forward. */
    fingerprint: v.string(),
    title: v.string(),
    summary: v.string(),
    severity: v.union(v.literal("HIGH"), v.literal("MEDIUM"), v.literal("LOW")),
    confidence: v.number(),
    monthlyImpactCents: v.number(),
    annualImpactCents: v.number(),
    status: v.union(v.literal("OPEN"), v.literal("NEEDS_REVIEW"), v.literal("ACTIONED"), v.literal("DISMISSED")),
    evidenceIds: v.array(v.id("evidence")),
    metadata: v.any(),
  })
    .index("by_investigation", ["investigationId", "annualImpactCents"])
    .index("by_org_fingerprint", ["organizationId", "fingerprint"]),

  recommendations: defineTable({
    findingId: v.id("findings"),
    organizationId: v.id("organizations"),
    actionType,
    title: v.string(),
    description: v.string(),
    estimatedMonthlyImpactCents: v.number(),
    estimatedAnnualImpactCents: v.number(),
    status: recommendationStatus,
    reasoning: v.string(),
    metadata: v.any(),
    approvedAt: v.union(v.number(), v.null()),
    rejectedAt: v.union(v.number(), v.null()),
    decidedAt: v.union(v.number(), v.null()),
  }).index("by_finding", ["findingId"]),

  auditLog: defineTable({
    organizationId: v.id("organizations"),
    actorType: v.union(v.literal("USER"), v.literal("SYSTEM"), v.literal("AGENT")),
    action: v.string(),
    entityType: v.string(),
    entityId: v.union(v.string(), v.null()),
    metadata: v.any(),
  })
    .index("by_org", ["organizationId"])
    .index("by_entity", ["entityId"]),
});
