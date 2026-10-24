import { ApifyClient } from "apify-client";
import { timedExternalCall } from "@/lib/utils/logger";
import { ActorOutputItemSchema, type ActorInput, type ActorOutputItem } from "./schemas";

export type ActorRunStatus = "READY" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMING-OUT" | "TIMED-OUT" | "ABORTING" | "ABORTED";

export interface ActorRunInfo {
  id: string;
  status: ActorRunStatus;
  defaultDatasetId: string;
  startedAt: Date | null;
  finishedAt: Date | null;
}

const TERMINAL: ActorRunStatus[] = ["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED"];

export function isTerminal(status: ActorRunStatus): boolean {
  return TERMINAL.includes(status);
}

export function createApifyClient(token: string): ApifyClient {
  return new ApifyClient({ token, maxRetries: 2, timeoutSecs: 30 });
}

function toRunInfo(run: { id: string; status: string; defaultDatasetId: string; startedAt?: Date; finishedAt?: Date }): ActorRunInfo {
  return {
    id: run.id,
    status: run.status as ActorRunStatus,
    defaultDatasetId: run.defaultDatasetId,
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? null,
  };
}

/** Starts the competitor pricing Actor without waiting for it to finish. */
export async function runCompetitorPricingActor(
  client: ApifyClient,
  actorId: string,
  input: ActorInput,
  options: { timeoutSecs: number },
): Promise<ActorRunInfo> {
  const run = await timedExternalCall("apify", "actor.start", () =>
    client.actor(actorId).start(input, { timeout: options.timeoutSecs, memory: 1024 }),
  );
  return toRunInfo(run);
}

export async function getActorRun(client: ApifyClient, runId: string): Promise<ActorRunInfo> {
  const run = await timedExternalCall("apify", "run.get", () => client.run(runId).get());
  if (!run) throw new Error(`Apify run ${runId} not found`);
  return toRunInfo(run);
}

export async function abortActorRun(client: ApifyClient, runId: string): Promise<void> {
  await timedExternalCall("apify", "run.abort", () => client.run(runId).abort());
}

export interface DatasetResult {
  items: ActorOutputItem[];
  rejected: { index: number; reason: string }[];
  raw: Record<string, unknown>[];
}

/** Reads the run's dataset and validates each record; malformed records are rejected, not trusted. */
export async function fetchActorDataset(client: ApifyClient, datasetId: string): Promise<DatasetResult> {
  const page = await timedExternalCall("apify", "dataset.listItems", () =>
    client.dataset(datasetId).listItems({ clean: true, limit: 1000 }),
  );
  return validateDatasetItems(page.items as Record<string, unknown>[]);
}

export function validateDatasetItems(rawItems: Record<string, unknown>[]): DatasetResult {
  const items: ActorOutputItem[] = [];
  const raw: Record<string, unknown>[] = [];
  const rejected: { index: number; reason: string }[] = [];
  rawItems.forEach((item, index) => {
    const parsed = ActorOutputItemSchema.safeParse(item);
    if (parsed.success) {
      items.push(parsed.data);
      raw.push(item);
    } else {
      rejected.push({ index, reason: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    }
  });
  return { items, rejected, raw };
}
