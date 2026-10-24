import { fetchMutation } from "convex/nextjs";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { idParam, json, parseOrThrow, readJson, route, type IdContext } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ reason: z.string().trim().max(500).optional() }).strict();

export const POST = route(async (request: Request, context: IdContext) => {
  const id = await idParam(context);
  const body = parseOrThrow(BodySchema, await readJson(request));
  return json({ recommendation: await fetchMutation(api.recommendations.reject, { id, reason: body.reason || null }) });
});
