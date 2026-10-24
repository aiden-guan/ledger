import { z } from "zod";

/**
 * Backend environment, read inside Convex functions (set with `npx convex env set`). Secrets
 * (APIFY_TOKEN, LLM_API_KEY) live only in the Convex deployment: the Next.js app never reads
 * them, and `npm run check:bundle` verifies they never reach the browser.
 */
const booleanString = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  /** Public URL of the Next.js app; the demo's sandbox competitor pages live there. */
  APP_URL: z.string().url().default("http://localhost:3000"),
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

const ENV_KEYS = Object.keys(EnvSchema.shape);

// Keyed on the raw values, so a variable set with `npx convex env set` is picked up by a warm
// function instance without waiting for a redeploy.
let cached: { key: string; env: Env } | null = null;

// Each key is read by name: Convex's default (non-Node) runtime does not let process.env be
// enumerated, so Object.entries(process.env) comes back empty there and every value falls back
// to its default.
function readEnv(): Record<string, string | undefined> {
  return Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k] === "" ? undefined : process.env[k]]));
}

export function getEnv(): Env {
  const source = readEnv();
  const key = ENV_KEYS.map((k) => source[k] ?? "").join("\u0000");
  if (cached?.key === key) return cached.env;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = { key, env: parsed.data };
  return cached.env;
}

/** Test hook: re-read process.env on next access. */
export function resetEnvCache(): void {
  cached = null;
}
