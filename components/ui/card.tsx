import * as React from "react";
import { cn } from "@/lib/utils/cn";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border border-border-strong bg-card text-card-foreground", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 px-5 pt-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("label", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5 pt-2", className)} {...props} />;
}

/** A panel with its title set into the top rule. */
export function Frame({ title, className, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { title?: React.ReactNode }) {
  return (
    <div className={cn("frame", className)} {...props}>
      {title && <span className="frame-title">{title}</span>}
      {children}
    </div>
  );
}
