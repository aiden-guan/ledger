import { after } from "next/server";
import { z } from "zod";
import { createInvestigation, executeInvestigation } from "@/lib/investigation/engine";
import { getInvestigation, serializeInvestigation } from "@/lib/db/queries/investigations";
import { json, parseOrThrow, readJson, requireOrganization, route } from "@/lib/utils/api";

export const dynamic = "force-dynamic";
// Live Apify runs can take a while; the investigation continues after the response is sent.
export const maxDuration = 300;

const BodySchema = z.object({ triggerType: z.enum(["MANUAL"]).default("MANUAL") }).strict();

export const POST = route(async (request: Request) => {
  const body = parseOrThrow(BodySchema, await readJson(request));
  const org = await requireOrganization();
  const { id, alreadyRunning } = await createInvestigation(org.id, body.triggerType);
  if (!alreadyRunning) {
    after(() => executeInvestigation(id));
  }
  const inv = await getInvestigation(id, org.id);
  return json({ investigation: inv ? serializeInvestigation(inv) : { id }, alreadyRunning }, { status: alreadyRunning ? 200 : 202 });
});
