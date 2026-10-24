import { cn } from "@/lib/utils/cn";

/**
 * The LedgerLens mark: the landing page's koi, curled up in the pond's pixels. Its orange is the
 * money found and its patches are the books' blue.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0.5 0.5 16 16" aria-hidden shapeRendering="crispEdges" className={cn("size-6", className)}>
      <path d={KOI.body} className="fill-[#ee7f2d] dark:fill-[#ff9440]" />
      <path d={KOI.fins} className="fill-[#f5b867] dark:fill-[#b06a2e]" />
      <path d={KOI.books} className="fill-[#1f63e6] dark:fill-[#4f8dff]" />
      <path d={KOI.eye} className="fill-[#13307a] dark:fill-background" />
    </svg>
  );
}

/** One run of pixels per command, drawn on a 16-pixel grid. */
const KOI = {
  body: "M4 2h6v1h-6zM3 3h4v1h-4zM9 3h3v1h-3zM2 4h1v1h-1zM4 4h3v1h-3zM10 4h3v1h-3zM2 5h7v1h-7zM10 5h4v1h-4zM3 6h5v1h-5zM10 6h4v1h-4zM11 7h3v1h-3zM12 8h3v1h-3zM12 9h3v1h-3zM11 10h3v1h-3zM10 11h2v1h-2zM9 12h3v1h-3zM7 13h4v1h-4zM7 14h2v1h-2z",
  fins: "M6 1h2v1h-2zM4 7h2v1h-2zM4 8h1v1h-1zM2 12h1v1h-1zM2 13h3v1h-3zM3 14h4v1h-4zM2 15h3v1h-3z",
  books: "M7 3h2v1h-2zM7 4h3v1h-3zM9 5h1v1h-1zM12 11h1v1h-1z",
  eye: "M3 4h1v1h-1z",
};
