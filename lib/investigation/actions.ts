import "server-only";
import { eq } from "drizzle-orm";
import { getDb, type Database } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { format } from "@/lib/finance/money";

export class ActionError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "ActionError";
  }
}

/**
 * Deterministic execution checklist for an approved recommendation. LedgerLens never executes
 * these itself: no payments, price changes, cancellations or vendor emails.
 */
export function buildExecutionChecklist(rec: schema.Recommendation): string[] {
  const m = rec.metadataJson as Record<string, unknown>;
  const money = (v: unknown) => (typeof v === "number" ? format(v) : "");
  switch (rec.actionType) {
    case "REVIEW_PAYMENT":
      return [
        `Pull both payment confirmations${m.invoiceReference ? ` for ${m.invoiceReference}` : ""} from the bank and vendor portal.`,
        `Email ${m.vendor ?? "the vendor"} requesting a refund of ${money(m.refundAmountCents)} or a credit on the next invoice.`,
        "Record the refund or credit in the books when it arrives.",
        "Disable duplicate payment paths (for example, portal autopay plus ACH) for this vendor.",
      ];
    case "CHANGE_PRICE":
      return [
        `Update ${m.sku ?? "the product"} from ${money(m.fromPriceCents)} to ${money(m.toPriceCents)} in the storefront.`,
        "Update any marketplace listings and ad copy that show the old price.",
        "Watch conversion rate and units sold for 14 days against the prior 14 days.",
        "Re-run LedgerLens after two weeks to confirm margin recovery.",
      ];
    case "CONTACT_VENDOR":
      return [
        `Request an itemized explanation of the cost change from ${m.supplier ?? m.vendor ?? "the vendor"}.`,
        "Collect at least two alternative supplier quotes.",
        "Negotiate a rollback or volume discount; record the agreed unit cost.",
      ];
    case "REVIEW_SUBSCRIPTION":
      return [
        `Log in to ${m.vendor ?? "the vendor"} and confirm the current plan and what changed.`,
        "Check seat or usage levels against the lower tier's limits.",
        `If the higher tier is not needed, request a downgrade${m.previousAmountCents ? ` back to the ${money(m.previousAmountCents)} plan` : ""}.`,
        "Confirm the next charge reflects the change.",
      ];
    default:
      return ["Assign an owner to investigate this finding.", "Document the outcome in LedgerLens."];
  }
}

async function loadForOrg(db: Database, recommendationId: string, organizationId: string) {
  const [row] = await db
    .select({ rec: schema.recommendations, finding: schema.findings })
    .from(schema.recommendations)
    .innerJoin(schema.findings, eq(schema.findings.id, schema.recommendations.findingId))
    .where(eq(schema.recommendations.id, recommendationId));
  if (!row || row.finding.organizationId !== organizationId) throw new ActionError("NOT_FOUND", "Recommendation not found");
  return row;
}

export async function approveRecommendation(
  recommendationId: string,
  organizationId: string,
  db: Database = getDb(),
): Promise<schema.Recommendation> {
  return db.transaction(async (tx) => {
    const { rec, finding } = await loadForOrg(tx as unknown as Database, recommendationId, organizationId);
    if (rec.status !== "PROPOSED") throw new ActionError("CONFLICT", `Recommendation is already ${rec.status.toLowerCase().replace(/_/g, " ")}`);
    const now = new Date();
    await tx.update(schema.recommendations).set({ status: "APPROVED", approvedAt: now }).where(eq(schema.recommendations.id, rec.id));
    await tx.insert(schema.auditLog).values({
      organizationId,
      actorType: "USER",
      action: "recommendation.approved",
      entityType: "recommendation",
      entityId: rec.id,
      metadataJson: {
        findingId: finding.id,
        findingType: finding.findingType,
        title: rec.title,
        estimatedAnnualImpactCents: rec.estimatedAnnualImpactCents,
      },
    });
    const checklist = buildExecutionChecklist(rec);
    const [updated] = await tx
      .update(schema.recommendations)
      .set({ status: "READY_FOR_EXECUTION", metadataJson: { ...rec.metadataJson, executionChecklist: checklist } })
      .where(eq(schema.recommendations.id, rec.id))
      .returning();
    await tx.update(schema.findings).set({ status: "ACTIONED" }).where(eq(schema.findings.id, finding.id));
    await tx.insert(schema.auditLog).values({
      organizationId,
      actorType: "SYSTEM",
      action: "recommendation.ready_for_execution",
      entityType: "recommendation",
      entityId: rec.id,
      metadataJson: { checklistItems: checklist.length, note: "LedgerLens does not execute financial actions." },
    });
    return updated;
  });
}

export async function rejectRecommendation(
  recommendationId: string,
  organizationId: string,
  reason: string | null,
  db: Database = getDb(),
): Promise<schema.Recommendation> {
  return db.transaction(async (tx) => {
    const { rec, finding } = await loadForOrg(tx as unknown as Database, recommendationId, organizationId);
    if (rec.status !== "PROPOSED") throw new ActionError("CONFLICT", `Recommendation is already ${rec.status.toLowerCase().replace(/_/g, " ")}`);
    const [updated] = await tx
      .update(schema.recommendations)
      .set({ status: "REJECTED", rejectedAt: new Date(), metadataJson: { ...rec.metadataJson, rejectionReason: reason } })
      .where(eq(schema.recommendations.id, rec.id))
      .returning();
    await tx.update(schema.findings).set({ status: "DISMISSED" }).where(eq(schema.findings.id, finding.id));
    await tx.insert(schema.auditLog).values({
      organizationId,
      actorType: "USER",
      action: "recommendation.rejected",
      entityType: "recommendation",
      entityId: rec.id,
      metadataJson: { findingId: finding.id, findingType: finding.findingType, title: rec.title, reason },
    });
    return updated;
  });
}
