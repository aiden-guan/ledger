import { fetchAction } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { json, route } from "@/lib/utils/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Idempotent: seeds the demo company only if it does not exist yet. */
export const POST = route(async () => {
  const result = await fetchAction(api.engine.seedDemo, {});
  return json({ ok: true, ...result }, { status: result.created ? 201 : 200 });
});
