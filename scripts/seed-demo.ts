import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

import { closeDb } from "@/lib/db/client";
import { ensureDemoSeeded } from "@/lib/demo/service";

/** Seeds Acme Outdoor Co. if it does not exist yet. Use `npm run demo:reset` to start over. */
async function main() {
  const result = await ensureDemoSeeded();
  console.log(result.created ? `Seeded demo company ${result.organizationId}` : `Demo company already exists (${result.organizationId}). Run npm run demo:reset to restore it.`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
