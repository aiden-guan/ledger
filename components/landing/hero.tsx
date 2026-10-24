"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LandingData } from "@/lib/landing/data";
import { cn } from "@/lib/utils/cn";
import { Rosette } from "./rosette";

const LINES = ["Find the money", "your business", "is quietly losing."];

export function Hero({ data }: { data: LandingData }) {
  const [active, setActive] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const lit = focus ?? active;

  return (
    <section className="mx-auto grid max-w-6xl gap-x-12 gap-y-8 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:pb-24 lg:pt-16">
      <div className="lg:col-start-1 lg:row-start-1">
        <p className="label animate-fade">An autonomous financial investigator</p>
        <h1 className="display mt-5 text-[clamp(2.6rem,5.2vw,4.7rem)] font-medium leading-[0.98] tracking-[-0.03em]">
          {LINES.map((line, i) => (
            <span key={line} className="rise-slot">
              <span style={{ animationDelay: `${120 + i * 110}ms` }}>
                {i === 2 ? (
                  <>
                    is <em className="font-normal italic">quietly</em> losing.
                  </>
                ) : (
                  line
                )}
              </span>
            </span>
          ))}
        </h1>
        <p className="animate-fade mt-6 max-w-[34rem] text-[17px] leading-relaxed text-muted-foreground [animation-delay:500ms]">
          LedgerLens reads every line of your books, checks your prices against the market, and proves each leak with the receipts. Nothing changes until you approve it.
        </p>
      </div>

      <div className="relative lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:self-center">
        <div className="mb-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.12em] lg:mb-0">
          <p className="text-muted-foreground">series 2026</p>
          <p className="text-signal">LL {String(Math.round(data.totalCents / 100)).padStart(6, "0")} A</p>
        </div>
        <Rosette leaks={data.leaks} ledger={data.ledger} focus={focus} onActiveChange={setActive} />
        <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <span className="hidden sm:inline">Move the loupe. </span>The microprint is the demo company&apos;s real ledger.
        </p>
      </div>

      <div className="animate-fade [animation-delay:700ms] lg:col-start-1 lg:row-start-2">
        <div className="flex items-baseline justify-between border-b border-border-strong pb-2">
          <span className="label">Found in the demo books</span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {data.stats.days} days · {(data.stats.sales + data.stats.transactions).toLocaleString("en-US")} records
          </span>
        </div>
        <ul onMouseLeave={() => setFocus(null)}>
          {data.leaks.map((leak, i) => (
            <li key={leak.n}>
              <button
                type="button"
                onMouseEnter={() => setFocus(i)}
                onFocus={() => setFocus(i)}
                onBlur={() => setFocus(null)}
                onClick={() => setFocus(i)}
                className="group flex w-full items-baseline gap-3 border-b border-border py-2.5 text-left outline-none"
              >
                <span
                  className={cn(
                    "w-7 shrink-0 text-center font-mono text-[11px] tabular transition-colors",
                    lit === i ? "bg-signal text-background" : "text-signal",
                  )}
                >
                  {leak.n}
                </span>
                <span className="text-[15px]">{leak.kind}</span>
                <span className="hidden truncate text-[13px] text-muted-foreground sm:inline">{leak.subject}</span>
                <span className="leader" />
                <span className={cn("font-mono text-[13px] tabular transition-colors", lit === i ? "text-signal" : "text-foreground")}>
                  {leak.amount}
                  <span className="text-muted-foreground"> {leak.per === "once" ? "once" : "/yr"}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-end justify-between gap-4 pt-4">
          <div>
            <p className="label">Recoverable</p>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              {data.recurringAnnual} a year, plus {data.oneTime} once
            </p>
          </div>
          <p className="display figure text-[44px] leading-none text-signal tabular">{data.totalAnnual}</p>
        </div>
      </div>

      <div className="animate-fade flex flex-wrap gap-3 [animation-delay:850ms] lg:col-start-1 lg:row-start-3">
        <Button asChild size="lg">
          <Link href="/overview">
            Open the case files <ArrowRight />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a href="#how">
            How it works <ArrowDown />
          </a>
        </Button>
      </div>
    </section>
  );
}
