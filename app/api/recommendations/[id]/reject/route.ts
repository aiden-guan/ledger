import { z } from "zod";
import { rejectRecommendation } from "@/lib/investigation/actions";
import { idParam, json, parseOrThrow, readJson, requireOrganization, route, type IdContext } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ reason: z.string().trim().max(500).optional() }).strict();

export const POST = route(async (request: Request, context: IdContext) => {
  const id = await idParam(context);
  const body = parseOrThrow(BodySchema, await readJson(request));
  const org = await requireOrganization();
  const rec = await rejectRecommendation(id, org.id, body.reason || null);
  return json({ recommendation: { id: rec.id, status: rec.status, rejectedAt: rec.rejectedAt?.toISOString() ?? null } });
});
