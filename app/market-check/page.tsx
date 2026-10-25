import { preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { MarketView } from "@/components/market/market-view";
import { AppHeader } from "@/components/layout/app-header";
import { SystemErrorPanel } from "@/components/dashboard/empty-states";
import { isConvexConfigured } from "@/lib/convex/config";

export const dynamic = "force-dynamic";

export default async function MarketPage() {
  if (!isConvexConfigured())
    return (
      <>
        <AppHeader demoMode={false} />
        <SystemErrorPanel reason="not_configured" />
      </>
    );
  try {
    return <MarketView preloaded={await preloadQuery(api.market.get, {})} />;
  } catch {
    return (
      <>
        <AppHeader demoMode={false} />
        <SystemErrorPanel />
      </>
    );
  }
}
