import { getAuditTrail } from "@/lib/db/queries/findings";
import { json, requireOrganization, route } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const org = await requireOrganization();
  return json({ entries: await getAuditTrail(org.id) });
});
