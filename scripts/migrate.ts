import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDb, getDb } from "@/lib/db/client";

async function main() {
  const started = Date.now();
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  console.log(`Migrations applied in ${Date.now() - started}ms`);
}

main()
  .catch((error) => {
    console.error("Migration failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
