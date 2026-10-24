import { cn } from "@/lib/utils/cn";

/**
 * The LedgerLens mark: a tree on a ground line. The blue fruit is the books; the orange one is
 * the money the engine found.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-5", className)}>
      <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M3 21.25H21M12 21.25V8.5M12 15.5L6.5 10M12 12.5L17.5 7.5" />
      </g>
      <circle cx="12" cy="5.25" r="2.25" className="fill-signal" />
      <circle cx="5.25" cy="8.75" r="2" className="fill-current" />
      <circle cx="18.75" cy="6.25" r="2" className="fill-found" />
    </svg>
  );
}
