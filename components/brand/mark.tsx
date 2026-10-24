import { cn } from "@/lib/utils/cn";

/**
 * The LedgerLens mark: a quadtree closing in on one cell. Each split narrows the search; the last
 * cell, in signal blue, is the leak.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-5", className)}>
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="0.75" y="0.75" width="22.5" height="22.5" rx="1.5" />
        <path d="M12 0.75V23.25M0.75 12H23.25M17.625 12V23.25M12 17.625H23.25M14.81 12V17.625M12 14.81H17.625" />
      </g>
      <rect x="14.81" y="14.81" width="2.81" height="2.81" className="fill-signal" />
    </svg>
  );
}
