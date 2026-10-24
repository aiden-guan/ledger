import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getEnv } from "@/lib/env";

/**
 * Resolves the organization for the current request. Authentication is out of scope for the
 * MVP: with DEMO_MODE=true this is the seeded demo company; otherwise DEFAULT_ORGANIZATION_SLUG.
 */
export async function getCurrentOrganization(): Promise<schema.Organization | null> {
  const env = getEnv();
  const slug = env.DEMO_MODE ? "acme-outdoor" : env.DEFAULT_ORGANIZATION_SLUG;
  const [org] = await getDb().select().from(schema.organizations).where(eq(schema.organizations.slug, slug));
  return org ?? null;
}
