"use client";

import { useRef } from "react";
import { rosettePath } from "@/lib/guilloche";
import type { LandingData } from "@/lib/landing/data";

const SEAL_OUTER = rosettePath(200, { lobes: 18, lines: 14, r: 0.78, amp: 0.3 });
const SEAL_MID = rosettePath(200, { lobes: 11, lines: 10, r: 0.55, amp: 0.34 });
const SEAL_INNER = rosettePath(200, { lobes: 7, lines: 8, r: 0.3, amp: 0.38 });

/** Underprint: rows of fine waves, the background engraving of a note. */
function underprint(width: number, height: number) {
  const paths: string[] = [];
  for (let i = 0; i < 26; i++) {
    const base = (i / 25) * height;
    let d = "";
    for (let x = 0; x <= width; x += 6) {
      const y = base + Math.sin(x * 0.035 + i * 0.55) * 7 + Math.sin(x * 0.011 - i * 0.3) * 9;
      d += `${x ? "L" : "M"}${x} ${y.toFixed(1)}`;
    }
    paths.push(d);
  }
  return paths.join("");
}
const UNDERPRINT = underprint(880, 400);

/**
 * The result, printed as currency: what LedgerLens recovers for the demo company, on a note
 * that tilts under the pointer so its foil thread catches the light.
 */
export function Banknote({ data }: { data: LandingData }) {
  const ref = useRef<HTMLDivElement>(null);
  const whole = data.totalAnnual.replace("$", "");
  const serial = `LL ${String(Math.round(data.totalCents / 100)).padStart(6, "0")} A`;
  const border = "LEDGERLENS · RECOVERABLE PROFIT · ACME OUTDOOR CO. · ".repeat(12);

  const onMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(-py * 9).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(px * 12).toFixed(2)}deg`);
    el.style.setProperty("--foil", `${((px + py + 1) * 50).toFixed(1)}%`);
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };

  return (
    <div className="[perspective:1400px]">
      <div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        className="@container relative mx-auto aspect-[2.2/1] w-full max-w-[880px] select-none border border-border-strong bg-card transition-transform duration-300 ease-out [transform:rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] [transform-style:preserve-3d]"
        role="img"
        aria-label={`A banknote for ${data.totalAnnual}: profit LedgerLens found recoverable for Acme Outdoor Co., ${data.recurringAnnual} a year plus ${data.oneTime} once.`}
      >
        <svg viewBox="0 0 880 400" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
          <path d={UNDERPRINT} fill="none" className="stroke-engrave" strokeWidth="0.5" opacity="0.32" />
        </svg>

        {/* Microprint border between two rules. */}
        <div className="absolute inset-[2.2cqw] border border-border-strong">
          <div className="microprint absolute inset-x-0 top-0 border-b border-border-strong px-1 py-[0.35cqw] !text-[max(5px,0.8cqw)]">{border}</div>
          <div className="microprint absolute inset-x-0 bottom-0 border-t border-border-strong px-1 py-[0.35cqw] !text-[max(5px,0.8cqw)]">{border}</div>
        </div>

        {/* Foil security thread. */}
        <div
          aria-hidden
          className="absolute inset-y-[2.2cqw] left-[70%] w-[0.9cqw] opacity-70 mix-blend-multiply dark:mix-blend-screen"
          style={{
            backgroundImage:
              "linear-gradient(170deg, oklch(0.82 0.05 160), oklch(0.78 0.08 300), oklch(0.86 0.06 80), oklch(0.8 0.07 200), oklch(0.82 0.05 160))",
            backgroundSize: "100% 300%",
            backgroundPosition: "50% var(--foil, 50%)",
          }}
        />

        <div className="absolute inset-[4.6cqw] grid grid-cols-[1fr_auto] grid-rows-[auto_1fr_auto] text-foreground">
          <div>
            <p className="font-mono text-[1.25cqw] uppercase tracking-[0.3em] text-muted-foreground">LedgerLens · Recoverable profit</p>
            <p className="display figure mt-[0.6cqw] text-[11cqw] font-medium leading-[0.8] tabular">{whole}</p>
          </div>
          <div className="text-right font-mono text-[1.35cqw] uppercase leading-tight tracking-[0.14em]">
            <p className="text-signal">{serial}</p>
            <p className="mt-[0.4cqw] text-muted-foreground">series 2026</p>
          </div>

          <div className="col-span-2 flex items-center gap-[3cqw]">
            <svg viewBox="0 0 200 200" className="size-[17cqw] shrink-0 text-engrave" aria-hidden>
              <path d={SEAL_OUTER} fill="none" stroke="currentColor" strokeWidth="0.55" />
              <path d={SEAL_MID} fill="none" stroke="currentColor" strokeWidth="0.55" />
              <path d={SEAL_INNER} fill="none" stroke="currentColor" strokeWidth="0.55" />
              <circle cx="100" cy="100" r="98" fill="none" stroke="currentColor" strokeWidth="1" />
              <text x="100" y="114" textAnchor="middle" className="display fill-foreground text-[44px]">
                $
              </text>
            </svg>
            <div className="max-w-[48cqw]">
              <p className="display text-[3.6cqw] italic leading-[1.05]">Payable to Acme Outdoor Co.</p>
              <p className="mt-[1cqw] font-mono text-[1.35cqw] uppercase leading-relaxed tracking-[0.08em] text-muted-foreground">
                {data.recurringAnnual} every year the fixes stay approved, plus {data.oneTime} paid twice and owed back.
              </p>
            </div>
          </div>

          <p className="self-end font-mono text-[1.35cqw] uppercase tracking-[0.14em] text-signal">{serial}</p>
          <p className="display figure self-end text-right text-[5cqw] leading-[0.8] tabular">{whole}</p>
        </div>
      </div>
    </div>
  );
}
