import { DashboardContent } from "@/components/dashboard/dashboard-view";
import { previewDashboard } from "@/lib/demo/preview";

export const dynamic = "force-dynamic";

export default async function PreviewOverview({ searchParams }: { searchParams: Promise<{ approved?: string }> }) {
  const { approved } = await searchParams;
  const ids = (approved ?? "").split(",").filter(Boolean).map(Number);
  return <DashboardContent data={await previewDashboard(ids)} />;
}
