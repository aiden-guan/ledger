import { getInvestigation, serializeInvestigation } from "@/lib/db/queries/investigations";
import { ApiError, idParam, json, requireOrganization, route, type IdContext } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export const GET = route(async (_request: Request, context: IdContext) => {
  const id = await idParam(context);
  const org = await requireOrganization();
  const inv = await getInvestigation(id, org.id);
  if (!inv) throw new ApiError("NOT_FOUND", "Investigation not found");
  return json({ investigation: serializeInvestigation(inv) });
});
