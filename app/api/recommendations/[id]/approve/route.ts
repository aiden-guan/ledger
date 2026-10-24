import { z } from "zod";
import { approveRecommendation } from "@/lib/investigation/actions";
import { idParam, json, parseOrThrow, readJson, requireOrganization, route, type IdContext } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

const BodySchema = z.object({}).strict();

/** Approval only marks the action ready for execution. LedgerLens never moves money or changes prices. */
export const POST = route(async (request: Request, context: IdContext) => {
  const id = await idParam(context);
  parseOrThrow(BodySchema, await readJson(request));
  const org = await requireOrganization();
  const rec = await approveRecommendation(id, org.id);
  return json({ recommendation: { id: rec.id, status: rec.status, approvedAt: rec.approvedAt?.toISOString() ?? null, checklist: rec.metadataJson.executionChecklist ?? [] } });
});
