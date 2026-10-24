import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import type { InvestigationStatus } from "@/lib/db/schema";
import { logger } from "@/lib/utils/logger";
import { assertTransition, type StepKey } from "./state-machine";

export type StepStatus = "started" | "completed" | "warning" | "failed" | "info";

export const EVENT_TYPES = {
  STATE_CHANGED: "STATE_CHANGED",
  STEP_STARTED: "STEP_STARTED",
  STEP_PROGRESS: "STEP_PROGRESS",
  STEP_COMPLETED: "STEP_COMPLETED",
  STEP_WARNING: "STEP_WARNING",
  STEP_FAILED: "STEP_FAILED",
} as const;

export async function emitEvent(
  db: Database,
  investigationId: string,
  eventType: string,
  message: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(schema.investigationEvents).values({ investigationId, eventType, message, metadataJson: metadata });
}

export async function emitStep(
  db: Database,
  investigationId: string,
  step: StepKey,
  status: StepStatus,
  message: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const type =
    status === "started"
      ? EVENT_TYPES.STEP_STARTED
      : status === "completed"
        ? EVENT_TYPES.STEP_COMPLETED
        : status === "warning"
          ? EVENT_TYPES.STEP_WARNING
          : status === "failed"
            ? EVENT_TYPES.STEP_FAILED
            : EVENT_TYPES.STEP_PROGRESS;
  await emitEvent(db, investigationId, type, message, { step, status, ...extra });
}

/** Persists a state transition and records it on the timeline. */
export async function transition(
  db: Database,
  investigation: { id: string; organizationId: string; status: InvestigationStatus },
  to: InvestigationStatus,
  started: number,
): Promise<void> {
  assertTransition(investigation.status, to);
  await db.update(schema.investigations).set({ status: to }).where(eq(schema.investigations.id, investigation.id));
  await emitEvent(db, investigation.id, EVENT_TYPES.STATE_CHANGED, to, { state: to });
  logger.info("investigation_step", {
    investigationId: investigation.id,
    organizationId: investigation.organizationId,
    step: to,
    durationMs: Date.now() - started,
    status: "ok",
  });
  investigation.status = to;
}
