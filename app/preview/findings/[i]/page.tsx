import { notFound } from "next/navigation";
import { FindingContent } from "@/components/findings/finding-view";
import { previewFinding } from "@/lib/demo/preview";

export const dynamic = "force-dynamic";

export default async function PreviewFinding({ params, searchParams }: { params: Promise<{ i: string }>; searchParams: Promise<{ approved?: string }> }) {
  const [{ i }, { approved }] = await Promise.all([params, searchParams]);
  const detail = await previewFinding(Number(i), approved === "1");
  if (!detail) notFound();
  return <FindingContent detail={detail} />;
}
