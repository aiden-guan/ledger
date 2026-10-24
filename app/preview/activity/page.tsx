import { ActivityContent } from "@/components/activity/activity-view";
import { previewAudit } from "@/lib/demo/preview";

export const dynamic = "force-dynamic";

export default async function PreviewActivity() {
  return <ActivityContent org={{ name: "Acme Outdoor Co.", demoMode: true }} entries={await previewAudit()} />;
}
