import { config } from "dotenv";

// Tests never depend on live Apify or a live model.
config({ path: ".env.test", quiet: true });
process.env.EXTERNAL_INTEL_MODE = process.env.EXTERNAL_INTEL_MODE ?? "fixture";
process.env.INVESTIGATION_STEP_DELAY_MS = "0";
