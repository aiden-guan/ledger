import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { ApiError, json, route } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const data = await fetchQuery(api.dashboard.get, {});
  if (!data) throw new ApiError("NOT_FOUND", "No organization found. Seed the demo with POST /api/demo/seed.");
  return json(data);
});
