import { resetDemo } from "@/lib/demo/service";
import { getEnv } from "@/lib/env";
import { ApiError, json, route } from "@/lib/utils/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = route(async () => {
  if (!getEnv().DEMO_MODE) throw new ApiError("FORBIDDEN", "Demo reset is only available when DEMO_MODE=true");
  const result = await resetDemo();
  return json({ ok: true, ...result });
});
