"use client";

import type { LandingData } from "@/lib/landing/data";
import { cn } from "@/lib/utils/cn";
import { Caption, Section } from "./section";
import { useInView } from "./use-in-view";

/** Fig. 2: the duplicate payment, checked rule by rule. Every term is a comparison in whole cents. */
function Trace({ dup }: { dup: LandingData["duplicate"] }) {
  const [ref, on] = useInView<HTMLDivElement>(0.4);
  const checks: [string, string][] = [
    ["vendor", "same"],
    ["amount", `${dup.cents.toLocaleString("en-US")}¢ = ${dup.cents.toLocaleString("en-US")}¢`],
    ["invoice", `${dup.invoice} ×2`],
    ["gap", `${dup.gapDays} days`],
  ];
  const step = (i: number) => ({ opacity: on ? 1 : 0, transitionDelay: `${300 + i * 260}ms` });
  return (
    <figure>
      <div ref={ref} className="frame grid-paper overflow-hidden p-4 font-mono text-[12px] sm:p-5">
        <div className="space-y-1.5">
          {dup.dates.map((d, i) => (
            <div key={d} className={cn("flex gap-3 border border-border-strong bg-card px-3 py-2 transition-opacity duration-500")} style={step(i - 1)}>
              <span className="text-faint">{d}</span>
              <span className="truncate">{dup.vendor.toUpperCase()}</span>
              <span className="ml-auto text-signal">{dup.amount}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-1 border-l border-border-strong pl-3">
          {checks.map(([k, v], i) => (
            <div key={k} className="flex gap-3 transition-opacity duration-300" style={step(i + 1)}>
              <span className="w-14 text-faint">{k}</span>
              <span className="truncate">{v}</span>
              <span className="ml-auto text-signal">✓</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-baseline justify-between border-t border-foreground pt-3 transition-opacity duration-500" style={step(5)}>
          <span className="text-muted-foreground">recoverable</span>
          <span className="display figure text-[28px] tracking-[-0.03em] text-signal">${dup.amount}</span>
        </div>
      </div>
      <Caption n={2} aside={`confidence ${dup.confidence}`}>
        Deterministic rules, integer cents.
      </Caption>
    </figure>
  );
}

/** Fig. 3: our price against competitor prices an Apify Actor read from their product pages. */
function Market({ market }: { market: LandingData["market"] }) {
  const [ref, on] = useInView<HTMLDivElement>(0.4);
  const all = [market.ours, ...market.competitors.map((c) => c.price)];
  const lo = Math.floor(Math.min(...all) / 5) * 5 - 5;
  const hi = Math.ceil(Math.max(...all) / 5) * 5 + 5;
  const x = (p: number) => ((p - lo) / (hi - lo)) * 100;
  const sorted = [...market.competitors].sort((a, b) => a.price - b.price);
  const median = sorted[Math.floor(sorted.length / 2)]?.price ?? market.ours;
  const ticks = Array.from({ length: (hi - lo) / 5 + 1 }, (_, i) => lo + i * 5);
  return (
    <figure>
      <div ref={ref} className="frame grid-paper relative h-full min-h-[15rem] overflow-hidden p-4 font-mono text-[11px] sm:p-5">
        <p className="text-muted-foreground">{market.product}</p>
        <div className="absolute inset-x-5 bottom-10 top-14">
          <div className="absolute inset-x-0 bottom-0 h-px bg-foreground" />
          {ticks.map((t) => (
            <span key={t} className="absolute bottom-0 translate-y-full -translate-x-1/2 pt-1.5 text-faint" style={{ left: `${x(t)}%` }}>
              ${t}
            </span>
          ))}
          {sorted.map((c, i) => (
            <div
              key={c.name}
              className="absolute bottom-0 transition-[opacity,transform] duration-700 ease-out"
              style={{ left: `${x(c.price)}%`, height: `${38 + i * 18}%`, opacity: on ? 1 : 0, transform: on ? "none" : "translateY(8px)", transitionDelay: `${200 + i * 160}ms` }}
            >
              <span className="absolute inset-y-0 left-0 border-l border-dashed border-foreground/40" />
              <span className="absolute -bottom-[3px] -left-[3px] size-[7px] rounded-full bg-foreground" />
              <span className="absolute -top-1 left-1.5 -translate-y-full whitespace-nowrap">
                {c.name} <span className="text-muted-foreground">${c.price}</span>
              </span>
            </div>
          ))}
          <div className="absolute bottom-0 h-[24%]" style={{ left: `${x(market.ours)}%` }}>
            <span className="absolute inset-y-0 left-0 border-l border-signal" />
            <span className="absolute -bottom-[3px] -left-[3px] size-[7px] rounded-full bg-signal" />
            <span className="absolute -top-1 right-1.5 -translate-y-full whitespace-nowrap text-signal">Acme ${market.ours}</span>
          </div>
        </div>
      </div>
      <Caption n={3} aside={<span className="text-signal">${median - market.ours} under median</span>}>
        Competitor prices, read by an Apify Actor.
      </Caption>
    </figure>
  );
}

export function Method({ data }: { data: LandingData }) {
  return (
    <Section
      id="method"
      n="02"
      label="Method"
      title={
        <>
          Math finds it. <span className="text-faint">AI explains it.</span>
        </>
      }
    >
      <div className="mt-12 grid gap-10 md:grid-cols-2 md:gap-6">
        <Trace dup={data.duplicate} />
        <Market market={data.market} />
      </div>
    </Section>
  );
}
