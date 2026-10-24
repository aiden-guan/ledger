import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { found, idParam, json, route, type IdContext } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export const GET = route(async (_request: Request, context: IdContext) => {
  const id = await idParam(context);
  return json({ investigation: found(await fetchQuery(api.investigations.get, { id }), "Investigation") });
});
