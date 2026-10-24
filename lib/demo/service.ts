import "server-only";
import { eq } from "drizzle-orm";
import { getDb, type Database } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { runInvestigation } from "@/lib/investigation/engine";
import { DEMO_ORG } from "./catalog";
import { deleteDemoOrganization, seedDemoCompany, type SeedResult } from "./seed";

export interface DemoResetResult extends SeedResult {
  baselineInvestigationId: string;
}

/**
 * Restores the demo company to its original state: deletes all investigation artifacts and
 * financial records, reseeds them deterministically, and runs a baseline investigation in
 * fixture mode (no model, no pacing) so the dashboard opens with findings.
 */
export async function resetDemo(db: Database = getDb(), options: { anchorDate?: Date } = {}): Promise<DemoResetResult> {
  const env = getEnv();
  await deleteDemoOrganization(db, DEMO_ORG.slug);
  const seeded = await seedDemoCompany(db, { anchorDate: options.anchorDate, appUrl: env.NEXT_PUBLIC_APP_URL });
  const baselineInvestigationId = await runInvestigation(seeded.organizationId, "DEMO_SEED", {
    db,
    stepDelayMs: 0,
    provider: null,
    externalIntelMode: "fixture",
  });
  await db.insert(schema.auditLog).values({
    organizationId: seeded.organizationId,
    actorType: "SYSTEM",
    action: "demo.reset",
    entityType: "organization",
    entityId: seeded.organizationId,
    metadataJson: { counts: seeded.counts },
  });
  return { ...seeded, baselineInvestigationId };
}

/** Seeds only when the demo company does not exist yet. */
export async function ensureDemoSeeded(db: Database = getDb()): Promise<{ created: boolean; organizationId: string }> {
  const [existing] = await db.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.slug, DEMO_ORG.slug));
  if (existing) return { created: false, organizationId: existing.id };
  const result = await resetDemo(db);
  return { created: true, organizationId: result.organizationId };
}
