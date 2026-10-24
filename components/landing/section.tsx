"use client";

import { cn } from "@/lib/utils/cn";
import { useInView } from "./use-in-view";

/** A numbered section: a hairline rule with its index, then the heading. */
export function Section({ id, n, label, title, children, className }: { id?: string; n: string; label: string; title: React.ReactNode; children: React.ReactNode; className?: string }) {
  const [ref, on] = useInView<HTMLDivElement>(0.15);
  return (
    <section id={id} className={cn("mx-auto max-w-6xl scroll-mt-16 px-4 pt-24 sm:px-6 sm:pt-32", className)}>
      <div ref={ref} className={cn("reveal", on && "in")}>
        <div className="flex items-baseline gap-3 border-t border-border-strong pt-3 font-mono text-[11px]">
          <span className="text-signal">{n}</span>
          <span className="text-muted-foreground">{label}</span>
        </div>
        <h2 className="display mt-8 max-w-3xl text-[clamp(2rem,4.6vw,3.5rem)] leading-[1.02]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

/** A figure caption: the figure number, a few words, and an optional readout on the right. */
export function Caption({ n, children, aside }: { n: number; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <figcaption className="mt-7 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border pt-2.5 font-mono text-[11px] text-muted-foreground">
      <span className="text-foreground">Fig. {n}</span>
      <span>{children}</span>
      {aside && <span className="ml-auto">{aside}</span>}
    </figcaption>
  );
}
