import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { json, route } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export const GET = route(async () => json({ entries: await fetchQuery(api.findings.auditTrail, {}) }));
