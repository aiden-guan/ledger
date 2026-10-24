import { fetchMutation } from "convex/nextjs";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { json, parseOrThrow, readJson, route } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ triggerType: z.enum(["MANUAL"]).default("MANUAL") }).strict();

/** Starts a run; the engine continues in a Convex action after this responds. */
export const POST = route(async (request: Request) => {
  parseOrThrow(BodySchema, await readJson(request));
  const result = await fetchMutation(api.investigations.start, {});
  return json(result, { status: result.alreadyRunning ? 200 : 202 });
});
