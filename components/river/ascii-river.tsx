"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { RiverData } from "@/lib/db/queries/dashboard";
import { format } from "@/lib/finance/money";
import { bandAt, buildRiverModel, type RiverBand, type RiverLeak } from "@/lib/river/model";
import { cn } from "@/lib/utils/cn";

export type { RiverLeak } from "@/lib/river/model";

const FONT_PX = 12;
const CELL_H = 15;
const LABEL_COLS = 36;
const WIDE_PX = 760;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  ch: string;
}

interface Palette {
  ink: string;
  muted: string;
  faint: string;
  signal: string;
  positive: string;
  warning: string;
}

function readPalette(): Palette {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim() || "#888";
  return { ink: v("--foreground"), muted: v("--muted-foreground"), faint: v("--faint"), signal: v("--signal"), positive: v("--positive"), warning: v("--warning") };
}

/** Flowing value noise in [0, 1]: drifts left to right over time. */
function flow(c: number, r: number, t: number, seed: number) {
  const a = Math.sin(c * 0.43 - t * 3.1 + r * 1.71 + seed * 2.3);
  const b = Math.cos(c * 0.127 - t * 1.3 - r * 0.53 + seed);
  const d = Math.sin(c * 0.071 + r * 2.9 - t * 0.7);
  return 0.5 + 0.5 * (a * 0.55 + b * 0.3 + d * 0.15);
}

function glyph(v: number) {
  if (v < 0.2) return " ";
  if (v < 0.46) return "·";
  if (v < 0.68) return ":";
  if (v < 0.86) return "•";
  return "●";
}

function leakU(index: number) {
  return 0.5 + index * 0.14;
}

/**
 * The money river, drawn in characters. Each stream of spending is a band of glyphs drifting
 * from revenue (left) to where the money ends up (right). Leaks drip out of their band in the
 * signal color; a sealed leak stops dripping and the profit band widens.
 */
export function AsciiRiver({ river, leaks, scanning = false, preview = false }: { river: RiverData; leaks: RiverLeak[]; scanning?: boolean; preview?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, cellW: 7.2 });
  const model = useMemo(() => buildRiverModel(river, leaks, preview), [river, leaks, preview]);

  // Values the animation loop reads without restarting.
  const live = useRef({ model, leaks, scanning, preview });
  live.current = { model, leaks, scanning, preview };

  const wide = size.width >= WIDE_PX;
  const cols = Math.max(20, Math.floor(size.width / size.cellW));
  const x0 = 3;
  const x1 = cols - (wide ? LABEL_COLS : 1);
  const rows = model.rows;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let cancelled = false;
    const measure = () => {
      const ctx = document.createElement("canvas").getContext("2d");
      const family = getComputedStyle(document.body).getPropertyValue("--font-geist-mono").trim() || "monospace";
      let cellW = 7.2;
      if (ctx) {
        ctx.font = `${FONT_PX}px ${family}`;
        cellW = ctx.measureText("M").width || 7.2;
      }
      if (!cancelled) setSize({ width: el.clientWidth, cellW });
    };
    document.fonts?.ready.then(measure);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.width) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cols * size.cellW;
    const H = rows * CELL_H;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const family = getComputedStyle(document.body).getPropertyValue("--font-geist-mono").trim() || "monospace";

    let palette = readPalette();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => (palette = readPalette());
    media.addEventListener("change", onScheme);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Animated geometry eases toward the target model.
    const current = new Map<string, RiverBand>();
    let ghost = live.current.model.ghostRows;
    let src = { top: live.current.model.srcTop, bottom: live.current.model.srcBottom };
    const particles: Particle[] = [];
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);

    const put = (c: number, r: number, ch: string, color: string, alpha = 1) => {
      if (ch === " " || c < 0 || c >= cols || r < 0 || r >= rows) return;
      if (ctx.fillStyle !== color) ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.fillText(ch, c * size.cellW + size.cellW / 2, r * CELL_H + CELL_H / 2 + 0.5);
    };

    let frame = 0;
    let lastDraw = 0;
    let lastTime = performance.now();
    const start = lastTime;

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (!visible || now - lastDraw < 33) return;
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      lastDraw = now;
      const t = reduce ? 0 : (now - start) / 1000;
      const { model: m, leaks: ls, scanning: scan, preview: pv } = live.current;

      const k = 1 - Math.exp(-dt * 5);
      for (const b of m.bands) {
        const c = current.get(b.key);
        if (!c) current.set(b.key, { ...b });
        else {
          c.sy0 += (b.sy0 - c.sy0) * k;
          c.sy1 += (b.sy1 - c.sy1) * k;
          c.ty0 += (b.ty0 - c.ty0) * k;
          c.ty1 += (b.ty1 - c.ty1) * k;
        }
      }
      ghost += (m.ghostRows - ghost) * k;
      src = { top: src.top + (m.srcTop - src.top) * k, bottom: src.bottom + (m.srcBottom - src.bottom) * k };

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.font = `${FONT_PX}px ${family}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Bands
      const span = Math.max(1, x1 - x0);
      const scanCol = scan && !reduce ? x0 + ((t * 0.45) % 1.12) * span : -99;
      m.bands.forEach((target, bi) => {
        const b = current.get(target.key)!;
        const isProfit = b.key === "profit";
        for (let c = x0; c <= x1; c++) {
          const u = (c - x0) / span;
          const { top, bottom } = bandAt(b, u);
          let r0 = Math.round(top);
          let r1 = Math.round(bottom) - 1;
          if (r1 < r0) r1 = r0 = Math.floor((top + bottom) / 2);
          for (let r = r0; r <= r1; r++) {
            const d = scanCol - c;
            if (d >= 0 && d < 4) {
              put(c, r, ["█", "▓", "▒", "░"][Math.floor(d)], palette.signal, 1 - d * 0.18);
              continue;
            }
            const edge = r === r0 || r === r1;
            const v = flow(c, r, t, bi);
            if (isProfit) put(c, r, v < 0.35 ? "•" : "●", palette.positive, 0.95);
            else put(c, r, edge ? (v < 0.5 ? "·" : ":") : glyph(v), edge ? palette.ink : palette.muted, edge ? 0.75 : 0.62);
          }
        }
      });

      // Uncaptured revenue: a dashed tributary that should be feeding the source but is not.
      if (ghost > 0.2) {
        const gTop = src.top - ghost;
        for (let c = 0; c < x0; c++) {
          const lift = (1 - c / x0) * 3;
          for (let r = Math.round(gTop - lift); r < Math.round(src.top - lift); r++) {
            if ((c + r + Math.floor(t * 4)) % 2 === 0) put(c, r, "·", palette.signal, 0.85);
          }
        }
      }

      // Source column
      for (let r = Math.round(src.top - ghost); r < Math.round(src.bottom); r++) {
        const inGhost = r < Math.round(src.top);
        put(x0 - 2, r, inGhost ? "░" : "█", inGhost ? palette.signal : palette.ink, inGhost ? 0.8 : 0.95);
        put(x0 - 1, r, inGhost ? "░" : "▌", inGhost ? palette.signal : palette.ink, inGhost ? 0.8 : 0.95);
      }

      // Leak markers and drips
      const perStream = new Map<string, number>();
      for (const leak of ls) {
        if (leak.state === "dismissed") continue;
        const state = pv && leak.state === "open" ? "sealed" : leak.state;
        const index = perStream.get(leak.stream) ?? 0;
        perStream.set(leak.stream, index + 1);
        let c: number;
        let r: number;
        if (leak.stream === "uncaptured") {
          c = 1 + index;
          r = src.top - ghost - 2.5;
        } else {
          const b = current.get(leak.stream);
          if (!b) continue;
          const u = leakU(index);
          c = Math.round(x0 + u * span);
          const { top, bottom } = bandAt(b, u);
          r = Math.floor((top + bottom) / 2);
        }
        if (state === "suspect") {
          if (reduce || Math.floor(t * 2.5) % 2 === 0) put(c, r, "?", palette.warning, 1);
        } else if (state === "sealed") {
          put(c, r, "■", palette.positive, 1);
        } else {
          put(c - 1, r, "[", palette.signal, 0.9);
          put(c, r, "◆", palette.signal, 1);
          put(c + 1, r, "]", palette.signal, 0.9);
          if (!reduce && Math.random() < dt * 9) {
            particles.push({ x: c + (Math.random() - 0.5) * 1.5, y: r + 0.6, vx: (Math.random() - 0.5) * 2.2, vy: 1 + Math.random() * 2, life: 1, ch: Math.random() < 0.5 ? "·" : "'" });
          }
        }
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vy += 9 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * 0.75;
        if (p.life <= 0 || p.y > rows) {
          particles.splice(i, 1);
          continue;
        }
        put(Math.round(p.x), Math.round(p.y), p.y - Math.floor(p.y) > 0.5 ? "," : p.ch, palette.signal, Math.max(0, p.life));
      }
      ctx.globalAlpha = 1;
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      media.removeEventListener("change", onScheme);
    };
  }, [size, cols, rows, x1]);

  // HTML overlays use the target geometry and CSS transitions so they settle with the bands.
  const span = Math.max(1, x1 - x0);
  const markers = useMemo(() => {
    const perStream = new Map<string, number>();
    return leaks
      .filter((l) => l.state !== "dismissed")
      .map((l) => {
        const index = perStream.get(l.stream) ?? 0;
        perStream.set(l.stream, index + 1);
        const state = preview && l.state === "open" ? "sealed" : l.state;
        if (l.stream === "uncaptured") return { leak: l, state, c: 1 + index, r: model.srcTop - model.ghostRows - 2.5, side: true };
        const b = model.bands.find((x) => x.key === l.stream);
        if (!b) return null;
        const u = leakU(index);
        const { top, bottom } = bandAt(b, u);
        return { leak: l, state, c: Math.round(x0 + u * span), r: Math.floor((top + bottom) / 2), side: false };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);
  }, [leaks, model, preview, span]);

  const W = cols * size.cellW;
  const H = rows * CELL_H;

  return (
    <div ref={wrapRef} className="w-full">
      <div className="relative" style={{ height: H || rows * CELL_H, width: W || "100%" }}>
        <canvas ref={canvasRef} className="absolute left-0 top-0" role="img" aria-label={`Money river: ${format(model.revenueCents)} revenue a year, ${format(model.bands.find((b) => b.key === "profit")?.cents ?? 0)} profit`} />
        {size.width > 0 && (
          <div className="pointer-events-none absolute inset-0 font-mono text-[11px]">
            <div className="absolute transition-[top] duration-700" style={{ left: 0, top: (model.srcBottom + 0.6) * CELL_H }}>
              <p className="label">revenue</p>
              <p className="tabular text-[13px] text-foreground">{format(model.revenueCents, { compact: true })}/yr</p>
            </div>

            {wide &&
              model.bands.map((b) => {
                const mid = (b.ty0 + b.ty1) / 2;
                const delta = b.cents - b.baseCents;
                const isProfit = b.key === "profit";
                return (
                  <div
                    key={b.key}
                    className="absolute flex -translate-y-1/2 items-baseline gap-2 transition-[top] duration-700"
                    style={{ left: (x1 + 2) * size.cellW, width: (LABEL_COLS - 3) * size.cellW, top: mid * CELL_H }}
                  >
                    <span className={cn("whitespace-nowrap", isProfit ? "font-medium text-positive" : "text-muted-foreground")}>{b.label.toLowerCase()}</span>
                    <span className="leader" />
                    {delta !== 0 && <span className="tabular text-positive">{delta > 0 ? "+" : "−"}{format(Math.abs(delta), { compact: true })}</span>}
                    <span className={cn("tabular", isProfit ? "font-medium text-positive" : "text-foreground")}>{format(b.cents, { compact: true })}</span>
                  </div>
                );
              })}

            {wide &&
              markers.map(({ leak, state, c, r, side }) => {
                const tag = (
                  <span
                    className={cn(
                      "pointer-events-auto inline-flex items-center gap-1.5 whitespace-nowrap border bg-background px-1.5 py-0.5 transition-colors",
                      state === "sealed" ? "border-positive/50 text-positive" : state === "suspect" ? "border-warning/50 text-warning" : "border-signal/50 text-signal hover:bg-signal hover:text-background",
                    )}
                  >
                    {state === "suspect" ? (
                      <>tracing<span className="cursor-blink">_</span></>
                    ) : (
                      <>
                        <span className="tabular">
                          {state === "sealed" ? "+" : "−"}
                          {format(leak.annualCents, { compact: true })}
                          {leak.recoveryKind === "one_time" ? " once" : "/yr"}
                        </span>
                        <span className="max-w-52 truncate text-foreground/70">{leak.title.toLowerCase()}</span>
                      </>
                    )}
                  </span>
                );
                return (
                  <div
                    key={leak.key}
                    className={cn("absolute transition-[top,left] duration-700", side ? "translate-x-3 -translate-y-1/2" : "-translate-x-1/2 translate-y-3")}
                    style={{ left: (c + (side ? 1 : 0.5)) * size.cellW, top: (r + (side ? 0.5 : 1)) * CELL_H }}
                  >
                    {leak.findingId && state !== "suspect" ? <Link href={`/findings/${leak.findingId}`}>{tag}</Link> : tag}
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {!wide && size.width > 0 && (
        <ul className="mt-4 divide-y divide-border border-y font-mono text-[12px]">
          {model.bands.map((b) => (
            <li key={b.key} className="flex items-baseline gap-2 py-1.5">
              <span className={b.key === "profit" ? "text-positive" : "text-muted-foreground"}>{b.label.toLowerCase()}</span>
              <span className="leader" />
              <span className={cn("tabular", b.key === "profit" && "text-positive")}>{format(b.cents, { compact: true })}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
