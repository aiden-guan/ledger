import { preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { AppHeader } from "@/components/layout/app-header";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { SystemErrorPanel } from "@/components/dashboard/empty-states";
import { isConvexConfigured } from "@/lib/convex/config";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!isConvexConfigured()) {
    return (
      <>
        <AppHeader demoMode={false} />
        <SystemErrorPanel reason="not_configured" />
      </>
    );
  }
  try {
    const preloaded = await preloadQuery(api.dashboard.get, {});
    return <DashboardView preloaded={preloaded} />;
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
