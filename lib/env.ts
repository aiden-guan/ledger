import "server-only";
import { z } from "zod";

/**
 * Server-only environment. Secrets (DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * APIFY_TOKEN, LLM_API_KEY) are read here and never referenced from client code.
 * Only NEXT_PUBLIC_* variables may reach the browser.
 */
const booleanString = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (Supabase Postgres connection string)"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  DEMO_MODE: booleanString.default(true),
  DEFAULT_ORGANIZATION_SLUG: z.string().default("acme-outdoor"),
  EXTERNAL_INTEL_MODE: z.enum(["live", "fixture"]).default("fixture"),
  APIFY_TOKEN: z.string().optional(),
  APIFY_ACTOR_ID: z.string().optional(),
  APIFY_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  LLM_PROVIDER: z.enum(["anthropic", "none"]).default("anthropic"),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default("claude-opus-5-5"),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  INVESTIGATION_STEP_DELAY_MS: z.coerce.number().int().min(0).default(450),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

function blankToUndefined(source: NodeJS.ProcessEnv): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(source).map(([k, v]) => [k, v === "" ? undefined : v]));
}

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(blankToUndefined(process.env));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test hook: re-read process.env on next access. */
export function resetEnvCache(): void {
  cached = null;
}
