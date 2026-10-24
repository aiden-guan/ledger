import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getEnv } from "@/lib/env";
import { json, route } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

/** Reports configuration state without revealing any secret values. */
export const GET = route(async () => {
  const env = getEnv();
  await getDb().execute(sql`select 1`);
  return json({
    ok: true,
    database: "connected",
    demoMode: env.DEMO_MODE,
    externalIntel: { mode: env.EXTERNAL_INTEL_MODE, apifyConfigured: Boolean(env.APIFY_TOKEN && env.APIFY_ACTOR_ID) },
    ai: { provider: env.LLM_API_KEY && env.LLM_PROVIDER !== "none" ? env.LLM_PROVIDER : "deterministic", model: env.LLM_API_KEY ? env.LLM_MODEL : null },
  });
});
