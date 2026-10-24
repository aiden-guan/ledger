"use client";

import Link from "next/link";
import { useCallback, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LandingData } from "@/lib/landing/data";
import { QuadtreeField } from "./quadtree-field";
import { Caption } from "./section";

export function Hero({ data }: { data: LandingData }) {
  const out = useRef<Record<string, HTMLElement | null>>({});
  // The readout ticks with the animation; written straight to the DOM to avoid a render per frame.
  const onProgress = useCallback((p: { records: number; cells: number; depth: number; found: number }) => {
    const o = out.current;
    if (o.records) o.records.textContent = p.records.toLocaleString("en-US");
    if (o.cells) o.cells.textContent = String(p.cells);
    if (o.depth) o.depth.textContent = String(p.depth);
    if (o.found) o.found.textContent = String(p.found);
  }, []);

  return (
    <header className="mx-auto max-w-6xl px-4 pt-14 sm:px-6 sm:pt-20">
      <div>
        <h1 className="display text-[clamp(2rem,7.6vw,6.4rem)] leading-[0.94] tracking-[-0.05em]">
          <span className="rise-slot">
            <span>Find the leak.</span>
          </span>
          <span className="rise-slot text-faint">
            <span style={{ animationDelay: "120ms" }}>Prove it to the cent.</span>
          </span>
        </h1>
        <div className="animate-fade mt-10 flex flex-wrap items-center justify-between gap-6 [animation-delay:400ms]">
          <p className="text-[18px] leading-snug text-muted-foreground">An autonomous investigator for small-business books.</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="lg">
              <Link href="/overview">
                Open the demo <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#method">How it works</a>
            </Button>
          </div>
        </div>
      </div>

      <figure className="animate-fade mt-14 [animation-delay:250ms] sm:mt-20">
        <QuadtreeField data={data} onProgress={onProgress} />
        <Caption
          n={1}
          aside={
            <span className="tabular flex gap-4">
              <span>
                records <b ref={(e) => void (out.current.records = e)} className="font-medium text-foreground">0</b>
              </span>
              <span className="hidden sm:inline">
                cells <b ref={(e) => void (out.current.cells = e)} className="font-medium text-foreground">1</b>
              </span>
              <span className="hidden sm:inline">
                depth <b ref={(e) => void (out.current.depth = e)} className="font-medium text-foreground">0</b>
              </span>
              <span>
                leaks <b ref={(e) => void (out.current.found = e)} className="font-medium text-signal">0</b>
              </span>
            </span>
          }
        >
          {data.stats.days} days of Acme Outdoor Co. <span className="hidden md:inline">Hover a cell.</span>
        </Caption>
      </figure>
    </header>
  );
}
