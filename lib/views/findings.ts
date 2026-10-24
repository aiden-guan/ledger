import type { ActionType, FindingType, RecommendationStatus } from "@/lib/domain";
import type { Calculation, EvidenceDisplay } from "@/lib/investigation/candidates";

export interface FindingDetail {
  organization: { name: string; demoMode: boolean };
  finding: {
    id: string;
    investigationId: string;
    findingType: FindingType;
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
    actionType: ActionType;
    title: string;
    description: string;
    reasoning: string;
    status: RecommendationStatus;
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

const iso = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString() : null);

export interface FindingDetailInput {
  organization: { name: string; demoMode: boolean };
  finding: {
    id: string;
    investigationId: string;
    findingType: FindingType;
    title: string;
    summary: string;
    severity: "HIGH" | "MEDIUM" | "LOW";
    confidence: number;
    monthlyImpactCents: number;
    annualImpactCents: number;
    status: string;
    createdAt: number;
    metadata: Record<string, unknown>;
  };
  evidence: { id: string; evidenceType: string; title: string; description: string; sourceType: string; sourceReference: string | null; confidence: number; data: Record<string, unknown> }[];
  recommendation: {
    id: string;
    actionType: ActionType;
    title: string;
    description: string;
    reasoning: string;
    status: RecommendationStatus;
    estimatedMonthlyImpactCents: number;
    estimatedAnnualImpactCents: number;
    approvedAt: number | null;
    rejectedAt: number | null;
    metadata: Record<string, unknown>;
  } | null;
  audit: { id: string; action: string; actorType: string; createdAt: number; metadata: Record<string, unknown> }[];
  investigation: { id: string; completedAt: number | null; startedAt: number };
  events: { seq: number; eventType: string; message: string; createdAt: number; metadata: Record<string, unknown> }[];
}

export function buildFindingDetail(input: FindingDetailInput): FindingDetail {
  const f = input.finding;
  const m = f.metadata;
  const rec = input.recommendation;
  const rm = rec?.metadata ?? {};
  return {
    organization: input.organization,
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
      createdAt: new Date(f.createdAt).toISOString(),
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
    evidence: input.evidence.map((e) => ({
      id: e.id,
      evidenceType: e.evidenceType,
      title: e.title,
      description: e.description,
      sourceType: e.sourceType,
      sourceReference: e.sourceReference,
      confidence: e.confidence,
      display: (e.data.display as EvidenceDisplay) ?? null,
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
          approvedAt: iso(rec.approvedAt),
          rejectedAt: iso(rec.rejectedAt),
          checklist: (rm.executionChecklist as string[]) ?? [],
          carriedForward: Boolean(rm.carriedForward),
          metadata: rm,
        }
      : null,
    audit: input.audit.map((a) => ({ id: a.id, action: a.action, actorType: a.actorType, createdAt: new Date(a.createdAt).toISOString(), metadata: a.metadata })),
    investigation: { id: input.investigation.id, completedAt: iso(input.investigation.completedAt), startedAt: new Date(input.investigation.startedAt).toISOString() },
    events: input.events.map((e) => ({ ...e, createdAt: new Date(e.createdAt).toISOString() })),
  };
}

export interface AuditEntryDTO {
  id: string;
  action: string;
  actorType: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface InvestigationDTO {
  id: string;
  status: string;
  triggerType: string;
  startedAt: string;
  completedAt: string | null;
  totalRecoveryMonthlyCents: number;
  totalRecoveryAnnualCents: number;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
}

export interface InvestigationEventDTO {
  seq: number;
  eventType: string;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}
