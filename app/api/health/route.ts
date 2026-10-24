import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { json, route } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

/** Reports configuration state without revealing any secret values. */
export const GET = route(async () => {
  const status = await fetchQuery(api.system.status, {});
  return json({ ok: true, backend: "convex", ...status });
});
