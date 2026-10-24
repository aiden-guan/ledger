"use client";

import type { LandingData } from "@/lib/landing/data";
import { cn } from "@/lib/utils/cn";
import { Section } from "./section";
import { useInView } from "./use-in-view";

export function Found({ data }: { data: LandingData }) {
  const [ref, on] = useInView<HTMLOListElement>(0.3);
  const max = Math.max(...data.leaks.map((l) => l.cents));
  return (
    <Section
      n="01"
      label="Found"
      title={
        <>
          {data.totalAnnual} a year, <span className="text-faint">in {data.stats.records.toLocaleString("en-US")} records.</span>
        </>
      }
    >
      <ol ref={ref} className="mt-12 border-t border-foreground">
        {data.leaks.map((l, i) => (
          <li key={l.n} className="grid grid-cols-[2rem_1fr_auto] items-baseline gap-x-4 border-b border-border py-4 sm:grid-cols-[2.5rem_14rem_1fr_9rem]">
            <span className="font-mono text-[11px] text-signal">{l.n}</span>
            <span className="text-[17px]">
              {l.kind}
              <span className="block text-[13px] text-muted-foreground sm:hidden">{l.subject}</span>
            </span>
            <span className="hidden items-center gap-4 sm:flex">
              <span className="w-44 truncate text-[13px] text-muted-foreground">{l.subject}</span>
              <span className="relative h-px flex-1 bg-border-strong">
                <span
                  className="absolute inset-y-[-1px] left-0 bg-signal transition-[width] duration-1000 ease-out"
                  style={{ width: on ? `${(l.cents / max) * 100}%` : 0, transitionDelay: `${i * 90}ms` }}
                />
              </span>
            </span>
            <span className="text-right font-mono text-[14px] tabular">
              {l.amount}
              <span className="text-faint">{l.once ? " once" : " /yr"}</span>
            </span>
          </li>
        ))}
        <li className="grid grid-cols-[2rem_1fr_auto] items-baseline gap-x-4 py-4 sm:grid-cols-[2.5rem_14rem_1fr_9rem]">
          <span />
          <span className="font-mono text-[11px] text-muted-foreground">Total</span>
          <span className="hidden sm:block" />
          <span className={cn("text-right font-mono text-[14px] tabular text-signal")}>{data.totalAnnual}</span>
        </li>
      </ol>
    </Section>
  );
}
