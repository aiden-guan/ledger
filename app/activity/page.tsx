import { preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { ActivityView } from "@/components/activity/activity-view";
import { AppHeader } from "@/components/layout/app-header";
import { SystemErrorPanel } from "@/components/dashboard/empty-states";
import { isConvexConfigured } from "@/lib/convex/config";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  if (!isConvexConfigured()) {
    return (
      <>
        <AppHeader demoMode={false} />
        <SystemErrorPanel reason="not_configured" />
      </>
    );
  }
  const [organization, trail] = await Promise.all([preloadQuery(api.dashboard.organization, {}), preloadQuery(api.findings.auditTrail, {})]);
  return <ActivityView organization={organization} trail={trail} />;
}
