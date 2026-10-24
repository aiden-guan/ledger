"use client";

import { useState } from "react";
import type { CashForecast } from "@/lib/finance/forecast";
import { format } from "@/lib/finance/money";

const W = 300;
const H = 132;
const PAD = { top: 8, right: 2, bottom: 16, left: 2 };

/**
 * Cash over the next 90 days: as things stand, with the fixes already approved, and dashed, with
 * every open fix approved. Approving a fix moves money from the dashed line to the solid one.
 */
export function ForecastChart({ forecast }: { forecast: CashForecast }) {
  const [hover, setHover] = useState<number | null>(null);
  const { points } = forecast;
  const values = points.flatMap((p) => [p.base, p.approved, p.potential]);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(1, hi - lo);
  const x = (day: number) => PAD.left + (day / forecast.horizonDays) * (W - PAD.left - PAD.right);
  const y = (cents: number) => PAD.top + (1 - (cents - lo) / span) * (H - PAD.top - PAD.bottom);
  const path = (key: "base" | "approved" | "potential") => points.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");
  const at = hover === null ? null : points[hover];
  const hasApproved = forecast.end.approved !== forecast.end.base;

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none overflow-visible"
        role="img"
        aria-label={`Cash forecast: ${format(forecast.balanceCents, { compact: true })} now, ${format(forecast.end.base, { compact: true })} in 90 days as is, ${format(forecast.end.potential, { compact: true })} with every fix`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const day = Math.round(((e.clientX - r.left) / r.width) * forecast.horizonDays);
          setHover(Math.max(0, Math.min(forecast.horizonDays, day)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        {[30, 60, 90].map((d) => (
          <g key={d}>
            <line x1={x(d)} x2={x(d)} y1={PAD.top} y2={H - PAD.bottom} className="stroke-border" strokeWidth={1} />
            <text x={x(d)} y={H - 3} textAnchor={d === 90 ? "end" : "middle"} className="fill-faint font-mono text-[9px]">
              {d}d
            </text>
          </g>
        ))}
        <path d={path("potential")} fill="none" className="stroke-signal" strokeWidth={1.25} strokeDasharray="3 3" />
        <path d={path("base")} fill="none" className="stroke-foreground/45" strokeWidth={1} />
        {hasApproved && <path d={path("approved")} fill="none" className="stroke-signal" strokeWidth={1.75} />}
        {at && (
          <g>
            <line x1={x(at.day)} x2={x(at.day)} y1={PAD.top} y2={H - PAD.bottom} className="stroke-foreground/40" strokeWidth={1} />
            <circle cx={x(at.day)} cy={y(at.potential)} r={2.5} className="fill-signal" />
            <circle cx={x(at.day)} cy={y(at.base)} r={2.5} className="fill-foreground" />
          </g>
        )}
      </svg>
      <figcaption className="mt-3 grid gap-1 font-mono text-[11px] text-muted-foreground">
        <p className="text-faint">{at ? `day ${at.day}` : "in 90 days"}</p>
        <Legend swatch="border-foreground/45" label="as is" value={at?.base ?? forecast.end.base} />
        {hasApproved && <Legend swatch="border-signal border-t-2" label="approved fixes" value={at?.approved ?? forecast.end.approved} />}
        <Legend swatch="border-signal border-dashed" label="every fix" value={at?.potential ?? forecast.end.potential} accent />
      </figcaption>
    </figure>
  );
}

function Legend({ swatch, label, value, accent }: { swatch: string; label: string; value: number; accent?: boolean }) {
  return (
    <p className="flex items-baseline gap-2">
      <span aria-hidden className={`inline-block w-4 -translate-y-[3px] border-t ${swatch}`} />
      <span>{label}</span>
      <span className="leader" />
      <span className={`tabular ${accent ? "text-signal" : "text-foreground"}`}>{format(value, { compact: true })}</span>
    </p>
  );
}
