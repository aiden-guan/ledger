import { ensureDemoSeeded } from "@/lib/demo/service";
import { getEnv } from "@/lib/env";
import { ApiError, json, route } from "@/lib/utils/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Idempotent: seeds the demo company only if it does not exist yet. */
export const POST = route(async () => {
  if (!getEnv().DEMO_MODE) throw new ApiError("FORBIDDEN", "Demo seeding is only available when DEMO_MODE=true");
  const result = await ensureDemoSeeded();
  return json({ ok: true, ...result }, { status: result.created ? 201 : 200 });
});
