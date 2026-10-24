import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

import { closeDb } from "@/lib/db/client";
import { resetDemo } from "@/lib/demo/service";
import { format } from "@/lib/finance/money";

/** Deletes all demo data and investigation artifacts, reseeds, and runs a baseline investigation. */
async function main() {
  const result = await resetDemo();
  console.log("Demo reset complete:", result.counts);
  console.log(`Baseline investigation ${result.baselineInvestigationId}`);
  const { getDb } = await import("@/lib/db/client");
  const { investigations } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const [inv] = await getDb().select().from(investigations).where(eq(investigations.id, result.baselineInvestigationId));
  console.log(`Potential annual recovery: ${format(inv.totalRecoveryAnnualCents)}`);
}

main()
  .catch((error) => {
    console.error("Reset failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
