import { query } from "./_generated/server";
import { getEnv } from "../lib/env";

/** Configuration state for the health check. Reports whether keys are set, never their values. */
export const status = query({
  args: {},
  handler: async () => {
    const env = getEnv();
    return {
      demoMode: env.DEMO_MODE,
      externalIntel: { mode: env.EXTERNAL_INTEL_MODE, apifyConfigured: Boolean(env.APIFY_TOKEN && env.APIFY_ACTOR_ID) },
      ai: { provider: env.LLM_API_KEY && env.LLM_PROVIDER !== "none" ? env.LLM_PROVIDER : "deterministic", model: env.LLM_API_KEY ? env.LLM_MODEL : null },
    };
  },
});
