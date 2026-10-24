"use client";

import { useEffect, useRef, useState } from "react";
import type { LandingData } from "@/lib/landing/data";
import { cn } from "@/lib/utils/cn";

/*
 * How it works, as four engraved plates. Each vignette is drawn from the same demo data the
 * engine used, and animates once when it scrolls into view.
 */

function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen] as const;
}

function LedgerScan({ scan, on }: { scan: LandingData["scan"]; on: boolean }) {
  const cols = 4;
  const rows = Math.ceil(scan.length / cols);
  const colW = 66;
  const rowH = 150 / rows;
  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" aria-hidden>
      {scan.map((line, i) => {
        const col = Math.floor(i / rows);
        const row = i % rows;
        const x = 22 + col * (colW + 8);
        const y = 26 + row * rowH;
        return (
          <line
            key={i}
            x1={x}
            x2={x + Math.max(4, line.w * colW)}
            y1={y}
            y2={y}
            pathLength={1}
            strokeWidth={line.hot ? 1.6 : 0.6}
            className={cn(line.hot ? "stroke-signal" : "stroke-engrave", "transition-[stroke-dashoffset] duration-300 ease-out")}
            style={{ strokeDasharray: 1, strokeDashoffset: on ? 0 : 1, transitionDelay: `${row * 22 + col * 90}ms` }}
          />
        );
      })}
      {scan.map((line, i) =>
        line.hot ? (
          <circle
            key={`m${i}`}
            cx={22 + Math.floor(i / rows) * (colW + 8) - 6}
            cy={26 + (i % rows) * rowH}
            r="1.6"
            className="fill-signal transition-opacity duration-500"
            style={{ opacity: on ? 1 : 0, transitionDelay: "1700ms" }}
          />
        ) : null,
      )}
    </svg>
  );
}

function MarketScale({ market, on }: { market: LandingData["market"]; on: boolean }) {
  const lo = 40;
  const hi = 70;
  const x = (p: number) => 20 + ((p - lo) / (hi - lo)) * 280;
  const sorted = [...market.competitors].sort((a, b) => a.price - b.price);
  const median = sorted[Math.floor(sorted.length / 2)]?.price ?? market.ours;
  return (
    <svg viewBox="0 0 320 200" className="h-full w-full font-mono" aria-hidden>
      <line x1="20" x2="300" y1="132" y2="132" className="stroke-foreground" strokeWidth="0.8" />
      {Array.from({ length: 7 }, (_, i) => lo + i * 5).map((p) => (
        <g key={p}>
          <line x1={x(p)} x2={x(p)} y1="132" y2="137" className="stroke-foreground" strokeWidth="0.6" />
          <text x={x(p)} y="149" textAnchor="middle" className="fill-muted-foreground text-[8px]">
            ${p}
          </text>
        </g>
      ))}
      {sorted.map((c, i) => (
        <g key={c.name} className="transition-[opacity,transform] duration-700 ease-out" style={{ opacity: on ? 1 : 0, transform: on ? "none" : "translateY(-14px)", transitionDelay: `${300 + i * 180}ms` }}>
          <line x1={x(c.price)} x2={x(c.price)} y1={62 + i * 18} y2="132" className="stroke-engrave" strokeWidth="0.8" strokeDasharray="2 2" />
          <circle cx={x(c.price)} cy="132" r="2.6" className="fill-engrave" />
          <text x={x(c.price) + 4} y={60 + i * 18} className="fill-foreground text-[8px]">
            {c.name} ${c.price}
          </text>
        </g>
      ))}
      <line x1={x(market.ours)} x2={x(market.ours)} y1="96" y2="132" className="stroke-signal" strokeWidth="1.3" />
      <circle cx={x(market.ours)} cy="132" r="3" className="fill-signal" />
      <text x={x(market.ours) - 4} y="92" textAnchor="end" className="fill-signal text-[8px]">
        Acme ${market.ours}
      </text>
      <path
        d={`M${x(market.ours)} 166 v5 H${x(median)} v-5`}
        fill="none"
        pathLength={1}
        className="stroke-signal transition-[stroke-dashoffset] duration-700 ease-out"
        strokeWidth="0.9"
        style={{ strokeDasharray: 1, strokeDashoffset: on ? 0 : 1, transitionDelay: "1000ms" }}
      />
      <text x={(x(market.ours) + x(median)) / 2} y="186" textAnchor="middle" className="fill-signal text-[8px] transition-opacity duration-500" style={{ opacity: on ? 1 : 0, transitionDelay: "1300ms" }}>
        ${median - market.ours} under the market median
      </text>
    </svg>
  );
}

function DuplicatePair({ dup, on }: { dup: LandingData["duplicate"]; on: boolean }) {
  const row = (date: string, y: number, delay: number) => (
    <g className="transition-[opacity,transform] duration-700 ease-out" style={{ opacity: on ? 1 : 0, transform: on ? "none" : "translateX(-12px)", transitionDelay: `${delay}ms` }}>
      <rect x="14" y={y} width="252" height="30" className="fill-card stroke-border-strong" strokeWidth="0.8" />
      <text x="24" y={y + 19} className="fill-muted-foreground text-[8.5px]">
        {date}
      </text>
      <text x="58" y={y + 19} className="fill-foreground text-[8.5px]">
        {dup.vendor.toUpperCase().slice(0, 23)}
      </text>
      <text x="256" y={y + 19} textAnchor="end" className="fill-foreground text-[8.5px]">
        {dup.amount}
      </text>
      <text x="58" y={y + 28} className="fill-signal text-[6.5px]">
        {dup.invoice}
      </text>
    </g>
  );
  return (
    <svg viewBox="0 0 320 200" className="h-full w-full font-mono" aria-hidden>
      {row(dup.dates[0] ?? "", 48, 100)}
      {row(dup.dates[1] ?? "", 104, 500)}
      <path
        d="M272 63 h14 v56 h-14"
        fill="none"
        pathLength={1}
        className="stroke-signal transition-[stroke-dashoffset] duration-700 ease-out"
        strokeWidth="1.1"
        style={{ strokeDasharray: 1, strokeDashoffset: on ? 0 : 1, transitionDelay: "1000ms" }}
      />
      <text x="292" y="94" className="fill-signal text-[8px] transition-opacity duration-500" style={{ opacity: on ? 1 : 0, transitionDelay: "1400ms" }}>
        ×2
      </text>
      <text x="140" y="168" textAnchor="middle" className="fill-signal text-[8.5px] transition-opacity duration-500" style={{ opacity: on ? 1 : 0, transitionDelay: "1500ms" }}>
        same vendor, amount and invoice: paid twice
      </text>
    </svg>
  );
}

function Stamp({ on }: { on: boolean }) {
  return (
    <div className="relative grid h-full place-items-center font-mono">
      <div className="absolute inset-x-6 bottom-9 border-b border-dashed border-border-strong" />
      <p className="absolute bottom-3 left-6 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">approved by you · logged to audit trail</p>
      <div
        className="border-[2.5px] border-positive px-5 py-2 text-[22px] font-semibold uppercase tracking-[0.18em] text-positive outline outline-1 outline-offset-[3px] outline-positive transition-[opacity,transform] duration-300"
        style={{
          opacity: on ? 0.92 : 0,
          transform: on ? "rotate(-7deg) scale(1)" : "rotate(-7deg) scale(1.5)",
          transitionDelay: "600ms",
          transitionTimingFunction: "cubic-bezier(0.3, 1.6, 0.5, 1)",
        }}
      >
        Approved
      </div>
    </div>
  );
}

function Plate({ n, title, body, children }: { n: string; title: string; body: string; children: (on: boolean) => React.ReactNode }) {
  const [ref, on] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className="frame flex flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="font-mono text-[11px] text-signal">{n}</span>
        <span className="label">plate {n}</span>
      </div>
      <div className="aspect-[16/10] border-b border-border">{children(on)}</div>
      <div className="p-5">
        <h3 className="display text-[26px] leading-tight">{title}</h3>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

export function Plates({ data }: { data: LandingData }) {
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-20 sm:px-6">
      <div className="max-w-2xl">
        <p className="label">How it works</p>
        <h2 className="display mt-4 text-[clamp(2.2rem,4.4vw,3.6rem)] leading-[1.02]">An investigator that shows its work.</h2>
      </div>
      <div className="mt-12 grid gap-8 sm:grid-cols-2">
        <Plate
          n="01"
          title="Reads every line"
          body={`All ${data.stats.transactions} bank lines and ${data.stats.sales} sales, checked against each other. The red lines are where the money went wrong.`}
        >
          {(on) => <LedgerScan scan={data.scan} on={on} />}
        </Plate>
        <Plate n="02" title="Checks the market" body="An Apify Actor visits competitor product pages and reads their prices, so a pricing gap is measured, not guessed.">
          {(on) => <MarketScale market={data.market} on={on} />}
        </Plate>
        <Plate n="03" title="Proves every dollar" body="Each leak links back to the exact records behind it. The arithmetic is deterministic, in whole cents; the AI only explains it.">
          {(on) => <DuplicatePair dup={data.duplicate} on={on} />}
        </Plate>
        <Plate n="04" title="Waits for your yes" body="Fixes arrive prepared, from the price change to the vendor email. Nothing moves until you approve, and every decision is logged.">
          {(on) => <Stamp on={on} />}
        </Plate>
      </div>
    </section>
  );
}
