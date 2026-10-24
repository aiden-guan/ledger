import { cn } from "@/lib/utils/cn";
import { confidenceLabel, percent } from "@/lib/ui/labels";

const CELLS = 10;

/** Ten-cell mono gauge, e.g. ▮▮▮▮▮▮▮▮▯▯ 82%. */
export function ConfidenceMeter({ value, className, showLabel = true }: { value: number; className?: string; showLabel?: boolean }) {
  const label = confidenceLabel(value);
  const filled = Math.round(Math.min(1, Math.max(0, value)) * CELLS);
  return (
    <span className={cn("inline-flex items-center gap-2 font-mono text-[12px]", className)} title={`${label} confidence`}>
      <span aria-hidden className="tracking-[-0.12em]">
        <span className={label === "High" ? "text-positive" : label === "Medium" ? "text-warning" : "text-signal"}>{"▮".repeat(filled)}</span>
        <span className="text-faint">{"▯".repeat(CELLS - filled)}</span>
      </span>
      <span className="tabular text-foreground">{percent(value)}</span>
      {showLabel && <span className="text-muted-foreground">{label.toLowerCase()}</span>}
    </span>
  );
}
