import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// Money columns are integer minor units (cents). Never floating point.

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    industry: text("industry").notNull(),
    currency: text("currency").notNull().default("USD"),
    demoMode: boolean("demo_mode").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("organizations_slug_idx").on(t.slug)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    category: text("category"),
    sellingPriceCents: integer("selling_price_cents").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("products_org_sku_idx").on(t.organizationId, t.sku)],
);

export const competitors = pgTable("competitors", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  ...timestamps,
});

export const competitorProducts = pgTable("competitor_products", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  competitorId: uuid("competitor_id")
    .notNull()
    .references(() => competitors.id, { onDelete: "cascade" }),
  productUrl: text("product_url").notNull(),
  externalName: text("external_name").notNull(),
  ...timestamps,
});

export const sales = pgTable(
  "sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    orderId: text("order_id").notNull(),
    soldAt: timestamp("sold_at", { withTimezone: true }).notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    grossRevenueCents: integer("gross_revenue_cents").notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("sales_org_sold_at_idx").on(t.organizationId, t.soldAt)],
);

export const supplierCosts = pgTable("supplier_costs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  supplierName: text("supplier_name").notNull(),
  effectiveDate: timestamp("effective_date", { withTimezone: true }).notNull(),
  unitCostCents: integer("unit_cost_cents").notNull(),
  source: text("source").notNull(),
  createdAt: timestamps.createdAt,
});

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    transactionDate: timestamp("transaction_date", { withTimezone: true }).notNull(),
    merchantName: text("merchant_name").notNull(),
    normalizedMerchantName: text("normalized_merchant_name").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    transactionType: text("transaction_type", { enum: ["DEBIT", "CREDIT"] }).notNull(),
    category: text("category"),
    invoiceReference: text("invoice_reference"),
    source: text("source").notNull(),
    externalId: text("external_id"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("transactions_org_date_idx").on(t.organizationId, t.transactionDate)],
);

export const externalPriceObservations = pgTable("external_price_observations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  investigationId: uuid("investigation_id").references(() => investigations.id, { onDelete: "set null" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  competitorId: uuid("competitor_id")
    .notNull()
    .references(() => competitors.id, { onDelete: "cascade" }),
  priceCents: integer("price_cents").notNull(),
  currency: text("currency").notNull(),
  availability: text("availability"),
  externalName: text("external_name"),
  productUrl: text("product_url").notNull(),
  sourceUrl: text("source_url").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  captureMode: text("capture_mode", { enum: ["live", "fixture"] }).notNull(),
  apifyRunId: text("apify_run_id"),
  rawPayloadJson: jsonb("raw_payload_json").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamps.createdAt,
});

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

export const investigations = pgTable(
  "investigations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    status: text("status", { enum: INVESTIGATION_STATUSES }).notNull().default("CREATED"),
    triggerType: text("trigger_type", { enum: ["MANUAL", "SCHEDULED", "DEMO_SEED"] }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    totalRecoveryMonthlyCents: integer("total_recovery_monthly_cents").notNull().default(0),
    totalRecoveryAnnualCents: integer("total_recovery_annual_cents").notNull().default(0),
    errorMessage: text("error_message"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [index("investigations_org_started_idx").on(t.organizationId, t.startedAt)],
);

export const investigationEvents = pgTable(
  "investigation_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Monotonic sequence so pollers can ask for "events after N".
    seq: serial("seq").notNull(),
    investigationId: uuid("investigation_id")
      .notNull()
      .references(() => investigations.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    message: text("message").notNull(),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("investigation_events_inv_seq_idx").on(t.investigationId, t.seq)],
);

export const evidence = pgTable("evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  investigationId: uuid("investigation_id")
    .notNull()
    .references(() => investigations.id, { onDelete: "cascade" }),
  evidenceType: text("evidence_type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  sourceType: text("source_type").notNull(),
  sourceReference: text("source_reference"),
  dataJson: jsonb("data_json").$type<Record<string, unknown>>().notNull(),
  confidence: real("confidence").notNull(),
  createdAt: timestamps.createdAt,
});

export const FINDING_TYPES = ["DUPLICATE_PAYMENT", "MARGIN_EROSION", "PRICING_OPPORTUNITY", "SUBSCRIPTION_CREEP"] as const;
export type FindingType = (typeof FINDING_TYPES)[number];

export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    investigationId: uuid("investigation_id")
      .notNull()
      .references(() => investigations.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    findingType: text("finding_type", { enum: FINDING_TYPES }).notNull(),
    /** Stable identity across investigations (type + subject) for carrying decisions forward. */
    fingerprint: text("fingerprint").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    severity: text("severity", { enum: ["HIGH", "MEDIUM", "LOW"] }).notNull(),
    confidence: real("confidence").notNull(),
    monthlyImpactCents: integer("monthly_impact_cents").notNull(),
    annualImpactCents: integer("annual_impact_cents").notNull(),
    status: text("status", { enum: ["OPEN", "NEEDS_REVIEW", "ACTIONED", "DISMISSED"] })
      .notNull()
      .default("OPEN"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [index("findings_investigation_idx").on(t.investigationId)],
);

export const findingEvidence = pgTable(
  "finding_evidence",
  {
    findingId: uuid("finding_id")
      .notNull()
      .references(() => findings.id, { onDelete: "cascade" }),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.findingId, t.evidenceId] })],
);

export const RECOMMENDATION_STATUSES = ["PROPOSED", "APPROVED", "REJECTED", "READY_FOR_EXECUTION"] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

export const ACTION_TYPES = ["REVIEW_PAYMENT", "CONTACT_VENDOR", "REVIEW_SUBSCRIPTION", "CHANGE_PRICE", "INVESTIGATE"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const recommendations = pgTable("recommendations", {
  id: uuid("id").primaryKey().defaultRandom(),
  findingId: uuid("finding_id")
    .notNull()
    .references(() => findings.id, { onDelete: "cascade" }),
  actionType: text("action_type", { enum: ACTION_TYPES }).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  estimatedMonthlyImpactCents: integer("estimated_monthly_impact_cents").notNull(),
  estimatedAnnualImpactCents: integer("estimated_annual_impact_cents").notNull(),
  status: text("status", { enum: RECOMMENDATION_STATUSES }).notNull().default("PROPOSED"),
  reasoning: text("reasoning").notNull(),
  metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  ...timestamps,
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorType: text("actor_type", { enum: ["USER", "SYSTEM", "AGENT"] }).notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("audit_log_org_created_idx").on(t.organizationId, t.createdAt)],
);

export type Organization = typeof organizations.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Investigation = typeof investigations.$inferSelect;
export type InvestigationEvent = typeof investigationEvents.$inferSelect;
export type Evidence = typeof evidence.$inferSelect;
export type Finding = typeof findings.$inferSelect;
export type Recommendation = typeof recommendations.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
export type ExternalPriceObservation = typeof externalPriceObservations.$inferSelect;
