import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

/** Bracketed mono status tag, e.g. [awaiting approval]. */
const badgeVariants = cva("inline-flex items-center whitespace-nowrap font-mono text-[11px] leading-none tracking-[0.02em] before:content-['['] after:content-[']']", {
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
      <span className="px-[0.35em]">{children}</span>
    </span>
  );
}
