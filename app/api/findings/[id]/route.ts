import { getFindingDetail } from "@/lib/db/queries/findings";
import { ApiError, idParam, json, requireOrganization, route, type IdContext } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export const GET = route(async (_request: Request, context: IdContext) => {
  const id = await idParam(context);
  const org = await requireOrganization();
  const detail = await getFindingDetail(id, org.id);
  if (!detail) throw new ApiError("NOT_FOUND", "Finding not found");
  return json(detail);
});
