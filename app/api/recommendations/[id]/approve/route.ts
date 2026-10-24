import { fetchMutation } from "convex/nextjs";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { idParam, json, parseOrThrow, readJson, route, type IdContext } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

const BodySchema = z.object({}).strict();

/** Approval only marks the action ready for execution. LedgerLens never moves money or changes prices. */
export const POST = route(async (request: Request, context: IdContext) => {
  const id = await idParam(context);
  parseOrThrow(BodySchema, await readJson(request));
  return json({ recommendation: await fetchMutation(api.recommendations.approve, { id }) });
});
