import { rosettePath } from "@/lib/guilloche";
import { cn } from "@/lib/utils/cn";

const OUTER = rosettePath(64, { lobes: 9, lines: 5, r: 0.7, amp: 0.42 });
const INNER = rosettePath(64, { lobes: 5, lines: 3, r: 0.3, amp: 0.44 });

/** The LedgerLens mark: a tiny guilloché rosette, the same weave the hero engraves. */
export function RosetteMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("size-5 text-engrave", className)}>
      <path d={OUTER} fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d={INNER} fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="32" cy="32" r="30.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}
