import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import type { Calculation, EvidenceDisplay } from "@/lib/investigation/candidates";

export interface FindingDetail {
  finding: {
    id: string;
    investigationId: string;
    findingType: schema.FindingType;
    title: string;
    summary: string;
    severity: "HIGH" | "MEDIUM" | "LOW";
    confidence: number;
    monthlyImpactCents: number;
    annualImpactCents: number;
    status: string;
    createdAt: string;
    explanation: string;
    uncertainty: string[];
    calculations: Calculation[];
    recoveryKind: string;
    narrativeSource: string;
    narrativeModel: string | null;
    deterministicConfidence: number | null;
    modelConfidence: number | null;
    externalIntelMode: string | null;
    metadata: Record<string, unknown>;
  };
  evidence: {
    id: string;
    evidenceType: string;
    title: string;
    description: string;
    sourceType: string;
    sourceReference: string | null;
    confidence: number;
    display: EvidenceDisplay | null;
  }[];
  recommendation: {
    id: string;
    actionType: schema.ActionType;
    title: string;
    description: string;
    reasoning: string;
    status: schema.RecommendationStatus;
    estimatedMonthlyImpactCents: number;
    estimatedAnnualImpactCents: number;
    approvedAt: string | null;
    rejectedAt: string | null;
    checklist: string[];
    carriedForward: boolean;
    metadata: Record<string, unknown>;
  } | null;
  audit: { id: string; action: string; actorType: string; createdAt: string; metadata: Record<string, unknown> }[];
  investigation: { id: string; completedAt: string | null; startedAt: string };
  events: { seq: number; eventType: string; message: string; createdAt: string; metadata: Record<string, unknown> }[];
}

export async function getFindingDetail(findingId: string, organizationId: string): Promise<FindingDetail | null> {
  const db = getDb();
  const [f] = await db
    .select()
    .from(schema.findings)
    .where(and(eq(schema.findings.id, findingId), eq(schema.findings.organizationId, organizationId)));
  if (!f) return null;

  const [evidenceRows, recRows, invRows, eventRows] = await Promise.all([
    db
      .select({ e: schema.evidence })
      .from(schema.findingEvidence)
      .innerJoin(schema.evidence, eq(schema.evidence.id, schema.findingEvidence.evidenceId))
      .where(eq(schema.findingEvidence.findingId, f.id))
      .orderBy(asc(schema.evidence.createdAt)),
    db.select().from(schema.recommendations).where(eq(schema.recommendations.findingId, f.id)),
    db.select().from(schema.investigations).where(eq(schema.investigations.id, f.investigationId)),
    db
      .select()
      .from(schema.investigationEvents)
      .where(eq(schema.investigationEvents.investigationId, f.investigationId))
      .orderBy(asc(schema.investigationEvents.seq)),
  ]);
  const rec = recRows[0] ?? null;
  const audit = rec
    ? await db
        .select()
        .from(schema.auditLog)
        .where(and(eq(schema.auditLog.organizationId, organizationId), inArray(schema.auditLog.entityId, [rec.id, f.id])))
        .orderBy(desc(schema.auditLog.createdAt))
    : [];
  const m = f.metadataJson as Record<string, unknown>;
  const rm = (rec?.metadataJson ?? {}) as Record<string, unknown>;
  const inv = invRows[0];

  return {
    finding: {
      id: f.id,
      investigationId: f.investigationId,
      findingType: f.findingType,
      title: f.title,
      summary: f.summary,
      severity: f.severity,
      confidence: f.confidence,
      monthlyImpactCents: f.monthlyImpactCents,
      annualImpactCents: f.annualImpactCents,
      status: f.status,
      createdAt: f.createdAt.toISOString(),
      explanation: String(m.explanation ?? ""),
      uncertainty: (m.uncertainty as string[]) ?? [],
      calculations: (m.calculations as Calculation[]) ?? [],
      recoveryKind: String(m.recoveryKind ?? "recurring"),
      narrativeSource: String(m.narrativeSource ?? "deterministic"),
      narrativeModel: (m.narrativeModel as string) ?? null,
      deterministicConfidence: (m.deterministicConfidence as number) ?? null,
      modelConfidence: (m.modelConfidence as number) ?? null,
      externalIntelMode: (m.externalIntelMode as string) ?? null,
      metadata: m,
    },
    evidence: evidenceRows.map(({ e }) => ({
      id: e.id,
      evidenceType: e.evidenceType,
      title: e.title,
      description: e.description,
      sourceType: e.sourceType,
      sourceReference: e.sourceReference,
      confidence: e.confidence,
      display: (e.dataJson.display as EvidenceDisplay) ?? null,
    })),
    recommendation: rec
      ? {
          id: rec.id,
          actionType: rec.actionType,
          title: rec.title,
          description: rec.description,
          reasoning: rec.reasoning,
          status: rec.status,
          estimatedMonthlyImpactCents: rec.estimatedMonthlyImpactCents,
          estimatedAnnualImpactCents: rec.estimatedAnnualImpactCents,
          approvedAt: rec.approvedAt?.toISOString() ?? null,
          rejectedAt: rec.rejectedAt?.toISOString() ?? null,
          checklist: (rm.executionChecklist as string[]) ?? [],
          carriedForward: Boolean(rm.carriedForward),
          metadata: rm,
        }
      : null,
    audit: audit.map((a) => ({ id: a.id, action: a.action, actorType: a.actorType, createdAt: a.createdAt.toISOString(), metadata: a.metadataJson })),
    investigation: { id: inv.id, completedAt: inv.completedAt?.toISOString() ?? null, startedAt: inv.startedAt.toISOString() },
    events: eventRows.map((e) => ({ seq: e.seq, eventType: e.eventType, message: e.message, createdAt: e.createdAt.toISOString(), metadata: e.metadataJson })),
  };
}

export async function getAuditTrail(organizationId: string, limit = 100) {
  const rows = await getDb()
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.organizationId, organizationId))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(limit);
  return rows.map((a) => ({
    id: a.id,
    action: a.action,
    actorType: a.actorType,
    entityType: a.entityType,
    entityId: a.entityId,
    createdAt: a.createdAt.toISOString(),
    metadata: a.metadataJson,
  }));
}
