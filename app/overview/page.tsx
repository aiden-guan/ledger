import { preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { AppHeader } from "@/components/layout/app-header";
import { SystemErrorPanel } from "@/components/dashboard/empty-states";
import { LiveOverview } from "@/components/overview/overview";
import { isConvexConfigured } from "@/lib/convex/config";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  if (!isConvexConfigured()) {
    return (
      <>
        <AppHeader demoMode={false} />
        <SystemErrorPanel reason="not_configured" />
      </>
    );
  }
  try {
    const [dashboard, field] = await Promise.all([preloadQuery(api.dashboard.get, {}), preloadQuery(api.field.get, {})]);
    return <LiveOverview dashboard={dashboard} field={field} />;
  } catch (error) {
    logger.error("dashboard_load_failed", { error: error instanceof Error ? error.message : String(error) });
    return (
      <>
        <AppHeader demoMode={false} />
        <SystemErrorPanel />
      </>
    );
  }
}
