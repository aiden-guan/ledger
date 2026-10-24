import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

/** Mono status tag with a leading dot, e.g. ● awaiting approval. */
const badgeVariants = cva("inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-[11px] leading-none", {
  variants: {
    variant: {
      default: "text-muted-foreground",
      outline: "text-muted-foreground",
      positive: "text-positive",
      negative: "text-signal",
      warning: "text-warning",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      <span aria-hidden className="size-[5px] rounded-full bg-current" />
      {children}
    </span>
  );
}
