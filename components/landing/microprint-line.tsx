import { cn } from "@/lib/utils/cn";

/**
 * A security line of microprint, set from real ledger text. At full size it reads as a fine
 * rule; zoom in and every character is a transaction. `drift` scrolls it slowly.
 */
export function MicroprintLine({ text, drift = false, className }: { text: string; drift?: boolean; className?: string }) {
  const run = `${text}  ·  `;
  return (
    <div aria-hidden className={cn("microprint relative select-none border-y border-border py-[3px]", className)}>
      <div className={cn("flex w-max", drift && "animate-[ll-drift_240s_linear_infinite] motion-reduce:animate-none")}>
        <span>{run.repeat(3)}</span>
        <span>{run.repeat(3)}</span>
      </div>
    </div>
  );
}
