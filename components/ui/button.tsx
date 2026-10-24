import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[2px] font-mono text-[12px] uppercase tracking-[0.06em] transition-[background-color,color,border-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border border-foreground bg-foreground text-background hover:bg-background hover:text-foreground",
        outline: "border border-border-strong bg-transparent text-foreground hover:border-foreground",
        ghost: "text-muted-foreground hover:text-foreground",
        positive: "border border-positive bg-positive text-background hover:bg-background hover:text-positive",
        link: "normal-case tracking-normal text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-7 px-2.5 text-[11px]",
        lg: "h-11 px-5",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";

export { Button, buttonVariants };
