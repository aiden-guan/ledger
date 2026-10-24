import { fetchQuery } from "convex/nextjs";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { found, idParam, json, parseOrThrow, route, type IdContext } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({ after: z.coerce.number().int().min(0).default(0) });

/** Timeline events after a sequence number. The UI subscribes to the same query instead of polling. */
export const GET = route(async (request: Request, context: IdContext) => {
  const id = await idParam(context);
  const query = parseOrThrow(QuerySchema, Object.fromEntries(new URL(request.url).searchParams));
  return json(found(await fetchQuery(api.investigations.timeline, { id, afterSeq: query.after }), "Investigation"));
});
