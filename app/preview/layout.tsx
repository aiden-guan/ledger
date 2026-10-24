import { notFound } from "next/navigation";
import { PreviewConvexProvider } from "@/components/providers/preview-convex-provider";

/** Development-only previews of the app views, filled from an in-memory engine run. */
export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return <PreviewConvexProvider>{children}</PreviewConvexProvider>;
}
