import "server-only";
import { and, asc, eq, gt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

export async function getInvestigation(id: string, organizationId: string) {
  const [row] = await getDb()
    .select()
    .from(schema.investigations)
    .where(and(eq(schema.investigations.id, id), eq(schema.investigations.organizationId, organizationId)));
  return row ?? null;
}

export function serializeInvestigation(inv: schema.Investigation) {
  return {
    id: inv.id,
    status: inv.status,
    triggerType: inv.triggerType,
    startedAt: inv.startedAt.toISOString(),
    completedAt: inv.completedAt?.toISOString() ?? null,
    totalRecoveryMonthlyCents: inv.totalRecoveryMonthlyCents,
    totalRecoveryAnnualCents: inv.totalRecoveryAnnualCents,
    errorMessage: inv.errorMessage,
    metadata: inv.metadataJson,
  };
}

export async function getInvestigationEvents(investigationId: string, afterSeq = 0) {
  const rows = await getDb()
    .select()
    .from(schema.investigationEvents)
    .where(and(eq(schema.investigationEvents.investigationId, investigationId), gt(schema.investigationEvents.seq, afterSeq)))
    .orderBy(asc(schema.investigationEvents.seq));
  return rows.map((e) => ({
    seq: e.seq,
    eventType: e.eventType,
    message: e.message,
    metadata: e.metadataJson,
    createdAt: e.createdAt.toISOString(),
  }));
}

export type InvestigationEventDTO = Awaited<ReturnType<typeof getInvestigationEvents>>[number];
