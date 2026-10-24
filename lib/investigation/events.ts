import type { InvestigationStatus } from "@/lib/domain";
import { logger } from "@/lib/utils/logger";
import { assertTransition, type StepKey } from "./state-machine";
import type { InvestigationStore } from "./store";

export type StepStatus = "started" | "completed" | "warning" | "failed" | "info";

export const EVENT_TYPES = {
  STATE_CHANGED: "STATE_CHANGED",
  STEP_STARTED: "STEP_STARTED",
  STEP_PROGRESS: "STEP_PROGRESS",
  STEP_COMPLETED: "STEP_COMPLETED",
  STEP_WARNING: "STEP_WARNING",
  STEP_FAILED: "STEP_FAILED",
} as const;

export function stepEventType(status: StepStatus): string {
  return status === "started"
    ? EVENT_TYPES.STEP_STARTED
    : status === "completed"
      ? EVENT_TYPES.STEP_COMPLETED
      : status === "warning"
        ? EVENT_TYPES.STEP_WARNING
        : status === "failed"
          ? EVENT_TYPES.STEP_FAILED
          : EVENT_TYPES.STEP_PROGRESS;
}

export async function emitStep(
  store: InvestigationStore,
  investigationId: string,
  step: StepKey,
  status: StepStatus,
  message: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await store.emitEvent(investigationId, stepEventType(status), message, { step, status, ...extra });
}

/** Persists a state transition and records it on the timeline. */
export async function transition(
  store: InvestigationStore,
  investigation: { id: string; organizationId: string; status: InvestigationStatus },
  to: InvestigationStatus,
  started: number,
): Promise<void> {
  assertTransition(investigation.status, to);
  await store.patchInvestigation(investigation.id, { status: to });
  await store.emitEvent(investigation.id, EVENT_TYPES.STATE_CHANGED, to, { state: to });
  logger.info("investigation_step", {
    investigationId: investigation.id,
    organizationId: investigation.organizationId,
    step: to,
    durationMs: Date.now() - started,
    status: "ok",
  });
  investigation.status = to;
}
