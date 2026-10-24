import { getDashboardData } from "@/lib/db/queries/dashboard";
import { json, requireOrganization, route } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const org = await requireOrganization();
  return json(await getDashboardData(org));
});
