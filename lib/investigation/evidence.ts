import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import type { ActionType, FindingType, RecommendationStatus } from "@/lib/db/schema";
import type { EvidenceInput } from "./candidates";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0] | Database;

/** Persists evidence records for an investigation; returns their ids in input order. */
export async function saveEvidence(db: Tx, investigationId: string, items: EvidenceInput[]): Promise<string[]> {
  if (items.length === 0) return [];
  const rows = await db
    .insert(schema.evidence)
    .values(
      items.map((e) => ({
        investigationId,
        evidenceType: e.evidenceType,
        title: e.title,
        description: e.description,
        sourceType: e.sourceType,
        sourceReference: e.sourceReference,
        dataJson: e.data,
        confidence: e.confidence,
      })),
    )
    .returning({ id: schema.evidence.id });
  return rows.map((r) => r.id);
}

export interface FindingInput {
  investigationId: string;
  organizationId: string;
  findingType: FindingType;
  fingerprint: string;
  title: string;
  summary: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  confidence: number;
  monthlyImpactCents: number;
  annualImpactCents: number;
  status: "OPEN" | "NEEDS_REVIEW" | "ACTIONED" | "DISMISSED";
  metadata: Record<string, unknown>;
  evidenceIds: string[];
}

export async function createFinding(db: Tx, input: FindingInput): Promise<string> {
  const [row] = await db
    .insert(schema.findings)
    .values({
      investigationId: input.investigationId,
      organizationId: input.organizationId,
      findingType: input.findingType,
      fingerprint: input.fingerprint,
      title: input.title,
      summary: input.summary,
      severity: input.severity,
      confidence: input.confidence,
      monthlyImpactCents: input.monthlyImpactCents,
      annualImpactCents: input.annualImpactCents,
      status: input.status,
      metadataJson: input.metadata,
    })
    .returning({ id: schema.findings.id });
  if (input.evidenceIds.length) {
    await db.insert(schema.findingEvidence).values(input.evidenceIds.map((evidenceId) => ({ findingId: row.id, evidenceId })));
  }
  return row.id;
}

export interface RecommendationInput {
  findingId: string;
  actionType: ActionType;
  title: string;
  description: string;
  estimatedMonthlyImpactCents: number;
  estimatedAnnualImpactCents: number;
  reasoning: string;
  metadata: Record<string, unknown>;
  status?: RecommendationStatus;
  approvedAt?: Date | null;
  rejectedAt?: Date | null;
}

export async function createRecommendation(db: Tx, input: RecommendationInput): Promise<string> {
  const [row] = await db
    .insert(schema.recommendations)
    .values({
      findingId: input.findingId,
      actionType: input.actionType,
      title: input.title,
      description: input.description,
      estimatedMonthlyImpactCents: input.estimatedMonthlyImpactCents,
      estimatedAnnualImpactCents: input.estimatedAnnualImpactCents,
      reasoning: input.reasoning,
      metadataJson: input.metadata,
      status: input.status ?? "PROPOSED",
      approvedAt: input.approvedAt ?? null,
      rejectedAt: input.rejectedAt ?? null,
    })
    .returning({ id: schema.recommendations.id });
  return row.id;
}

/**
 * A decision already made on the same issue (same fingerprint) in an earlier investigation.
 * Re-running an investigation must not silently reopen an approved or rejected action.
 */
export async function findPriorDecision(
  db: Tx,
  organizationId: string,
  fingerprint: string,
  excludeInvestigationId: string,
): Promise<{ status: RecommendationStatus; approvedAt: Date | null; rejectedAt: Date | null; metadata: Record<string, unknown> } | null> {
  const rows = await db
    .select({
      status: schema.recommendations.status,
      approvedAt: schema.recommendations.approvedAt,
      rejectedAt: schema.recommendations.rejectedAt,
      metadata: schema.recommendations.metadataJson,
    })
    .from(schema.recommendations)
    .innerJoin(schema.findings, eq(schema.findings.id, schema.recommendations.findingId))
    .where(
      and(
        eq(schema.findings.organizationId, organizationId),
        eq(schema.findings.fingerprint, fingerprint),
        ne(schema.findings.investigationId, excludeInvestigationId),
        inArray(schema.recommendations.status, ["APPROVED", "REJECTED", "READY_FOR_EXECUTION"]),
      ),
    )
    .orderBy(desc(schema.recommendations.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}
