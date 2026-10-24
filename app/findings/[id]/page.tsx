import { notFound } from "next/navigation";
import { preloadQuery, preloadedQueryResult } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { FindingView } from "@/components/findings/finding-view";
import { isConvexConfigured } from "@/lib/convex/config";

export const dynamic = "force-dynamic";

export default async function FindingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isConvexConfigured() || id.length > 64) notFound();
  const preloaded = await preloadQuery(api.findings.detail, { id });
  if (!preloadedQueryResult(preloaded)) notFound();
  return <FindingView preloaded={preloaded} />;
}
