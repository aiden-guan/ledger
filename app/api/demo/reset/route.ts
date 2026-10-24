import { fetchAction } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { json, route } from "@/lib/utils/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Restores the seeded company and its baseline findings. Demo mode only (enforced in Convex). */
export const POST = route(async () => json({ ok: true, ...(await fetchAction(api.engine.resetDemo, {})) }));
