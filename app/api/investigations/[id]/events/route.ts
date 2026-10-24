import { z } from "zod";
import { getInvestigation, getInvestigationEvents, serializeInvestigation } from "@/lib/db/queries/investigations";
import { ApiError, idParam, json, parseOrThrow, requireOrganization, route, type IdContext } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({ after: z.coerce.number().int().min(0).default(0) });

/** Polled about once a second by the investigation timeline. */
export const GET = route(async (request: Request, context: IdContext) => {
  const id = await idParam(context);
  const query = parseOrThrow(QuerySchema, Object.fromEntries(new URL(request.url).searchParams));
  const org = await requireOrganization();
  const inv = await getInvestigation(id, org.id);
  if (!inv) throw new ApiError("NOT_FOUND", "Investigation not found");
  const events = await getInvestigationEvents(id, query.after);
  return json({ investigation: serializeInvestigation(inv), events });
});
