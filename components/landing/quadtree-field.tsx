"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LandingData } from "@/lib/landing/data";
import { buildQuadtree, leafAt, type QCell } from "@/lib/quadtree";

/*
 * Fig. 1: every sale and bank line of the demo company, plotted by date and amount. A scan reads
 * them left to right, then a quadtree keeps splitting only the cells that hold something wrong,
 * until each leak sits in its own small cell. Hover any cell to read the records inside it.
 */

const SCAN_MS = 1100;
const SPLIT_START = 900;
const SPLIT_STEP = 230;
const GROW_MS = 300;
const HOT_DEPTH = 7;
const DONE_MS = SPLIT_START + HOT_DEPTH * SPLIT_STEP + 260 + GROW_MS;

const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

interface Colors {
  ink: string;
  faint: string;
  rule: string;
  signal: string;
  bg: string;
}

function readColors(el: Element): Colors {
  const cs = getComputedStyle(el);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return { ink: v("--foreground"), faint: v("--faint"), rule: v("--border-strong"), signal: v("--signal"), bg: v("--background") };
}

export function QuadtreeField({ data, onProgress }: { data: LandingData; onProgress?: (p: { records: number; cells: number; depth: number; found: number }) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [done, setDone] = useState(false);
  const [hover, setHover] = useState<{ cell: QCell; px: number; py: number } | null>(null);
  const [run, setRun] = useState(0);
  const start = useRef(0);
  // Once the search has played, a resize redraws the final state instead of replaying it.
  const played = useRef(false);
  const lastRun = useRef(0);

  const points = useMemo(() => data.points.map(([x, y, hot]) => ({ x, y, hot })), [data.points]);
  const cells = useMemo(() => buildQuadtree(points, { baseDepth: 2, hotDepth: HOT_DEPTH, density: 14, densityDepth: 4 }), [points]);

  // Where each leak ends up: the union of its smallest cells.
  const boxes = useMemo(
    () =>
      data.leaks.map((_, li) => {
        const leaves = cells.filter((c) => !c.split && c.hot === li && c.depth === HOT_DEPTH);
        const x0 = Math.min(...leaves.map((c) => c.x));
        const y0 = Math.min(...leaves.map((c) => c.y));
        const x1 = Math.max(...leaves.map((c) => c.x + c.w));
        const y1 = Math.max(...leaves.map((c) => c.y + c.h));
        return leaves.length ? { x0, y0, x1, y1, leaves } : null;
      }),
    [cells, data.leaks],
  );

  // Label positions in pixels, nudged apart so they never overlap.
  const labels = useMemo(() => {
    if (!size.w) return [];
    const out = boxes
      .map((b, i) => {
        if (!b) return null;
        const right = (b.x0 + b.x1) / 2 < 0.62;
        return { i, right, ax: (right ? b.x1 : b.x0) * size.w, ay: ((b.y0 + b.y1) / 2) * size.h, y: ((b.y0 + b.y1) / 2) * size.h };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null)
      .sort((a, b) => a.y - b.y);
    for (let k = 1; k < out.length; k++) if (out[k].y - out[k - 1].y < 26) out[k].y = out[k - 1].y + 26;
    return out;
  }, [boxes, size]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !size.w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = size.w * dpr;
    cv.height = size.h * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let colors = readColors(cv);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => (colors = readColors(cv));
    mq.addEventListener("change", onScheme);

    const replay = run !== lastRun.current;
    lastRun.current = run;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches || (played.current && !replay);
    const { w, h } = size;
    const crisp = (v: number) => Math.round(v) + 0.5;
    let raf = 0;
    let visible = true;
    let finished = false;
    start.current = 0;

    const draw = (now: number) => {
      if (!start.current) start.current = now;
      const t = reduced ? DONE_MS + 1 : now - start.current;
      ctx.clearRect(0, 0, w, h);

      // Points: read left to right by the scan.
      const scanX = Math.min(1, t / SCAN_MS);
      let read = 0;
      for (const p of points) {
        if (p.x > scanX + 0.002) continue;
        read++;
        const hot = p.hot >= 0 && t > DONE_MS - GROW_MS;
        ctx.fillStyle = hot ? colors.signal : colors.ink;
        ctx.globalAlpha = hot ? 1 : 0.34;
        const s = hot ? 3 : 2;
        ctx.fillRect(Math.round(p.x * w - s / 2), Math.round(p.y * h - s / 2), s, s);
      }
      ctx.globalAlpha = 1;
      if (scanX < 1) {
        ctx.strokeStyle = colors.signal;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(crisp(scanX * w), 0);
        ctx.lineTo(crisp(scanX * w), h);
        ctx.stroke();
      }

      // Splits: each cell draws its cross, growing out from the centre, one depth at a time.
      let shown = 0;
      let depth = 0;
      ctx.lineWidth = 1;
      for (const c of cells) {
        if (!c.split) continue;
        const begin = SPLIT_START + c.depth * SPLIT_STEP + c.x * 260;
        const k = ease((t - begin) / GROW_MS);
        if (k <= 0) continue;
        shown++;
        depth = Math.max(depth, c.depth + 1);
        const cx = (c.x + c.w / 2) * w;
        const cy = (c.y + c.h / 2) * h;
        const hw = (c.w / 2) * w * k;
        const hh = (c.h / 2) * h * k;
        ctx.strokeStyle = c.hot >= 0 && c.depth >= 2 ? colors.ink : colors.rule;
        ctx.globalAlpha = c.hot >= 0 && c.depth >= 2 ? 0.5 + c.depth * 0.06 : 1;
        ctx.beginPath();
        ctx.moveTo(crisp(cx - hw), crisp(cy));
        ctx.lineTo(crisp(cx + hw), crisp(cy));
        ctx.moveTo(crisp(cx), crisp(cy - hh));
        ctx.lineTo(crisp(cx), crisp(cy + hh));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Found: each leak's cells outlined in signal, with a leader to its label.
      const found = t > DONE_MS - GROW_MS;
      if (found) {
        const a = ease((t - (DONE_MS - GROW_MS)) / 400);
        ctx.globalAlpha = a;
        ctx.strokeStyle = colors.signal;
        for (const b of boxes) {
          if (!b) continue;
          for (const c of b.leaves) {
            ctx.fillStyle = colors.signal;
            ctx.globalAlpha = a * 0.16;
            ctx.fillRect(Math.round(c.x * w), Math.round(c.y * h), Math.round(c.w * w), Math.round(c.h * h));
            ctx.globalAlpha = a;
            ctx.strokeRect(crisp(c.x * w), crisp(c.y * h), Math.round(c.w * w), Math.round(c.h * h));
          }
        }
        for (const l of labels) {
          const b = boxes[l.i]!;
          const lx = l.right ? l.ax + 28 : l.ax - 28;
          ctx.beginPath();
          ctx.moveTo(crisp(l.ax + (l.right ? 3 : -3)), crisp(((b.y0 + b.y1) / 2) * h));
          ctx.lineTo(crisp(lx), crisp(l.y));
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      onProgress?.({ records: read, cells: shown * 4 + 1, depth, found: found ? data.leaks.length : 0 });
      if (t >= DONE_MS + 400) {
        if (!finished) {
          finished = true;
          played.current = true;
          setDone(true);
        }
        return;
      }
      if (visible) raf = requestAnimationFrame(draw);
    };

    // Start when the figure is on screen; pause while it is not.
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        if (visible && !finished) {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(draw);
        }
      },
      { threshold: 0.2 },
    );
    io.observe(cv);
    if (!reduced) setDone(false);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      mq.removeEventListener("change", onScheme);
    };
  }, [size, cells, points, boxes, labels, data.leaks.length, onProgress, run]);

  const onMove = (e: React.PointerEvent) => {
    if (!done) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const cell = leafAt(cells, px / r.width, py / r.height);
    setHover(cell && cell.points.length ? { cell, px, py } : null);
  };

  const hc = hover?.cell;
  return (
    <div className="relative">
      <div
        ref={wrap}
        className="relative aspect-[4/3] w-full touch-none select-none sm:aspect-[2.35/1]"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <canvas ref={canvas} className="absolute inset-0 size-full" aria-label={`${data.stats.records} records of the demo company, with ${data.leaks.length} leaks isolated by a quadtree`} />

        {/* Axes */}
        {data.axes.x.map((t) => (
          <span key={t.label + t.at} className="pointer-events-none absolute -bottom-px -translate-x-1/2 translate-y-full bg-background px-1 pt-1 font-mono text-[10px] text-faint" style={{ left: `${t.at * 100}%` }}>
            {t.label}
          </span>
        ))}
        {data.axes.y.map((t) => (
          <span key={t.label} className="pointer-events-none absolute left-0 -translate-y-1/2 bg-background pr-1 font-mono text-[10px] text-faint" style={{ top: `${t.at * 100}%` }}>
            {t.label}
          </span>
        ))}

        {/* Leak labels */}
        {labels.map((l) => {
          const leak = data.leaks[l.i];
          return (
            <span
              key={leak.n}
              className="pointer-events-none absolute flex -translate-y-1/2 items-center gap-2 whitespace-nowrap bg-background/90 px-1 font-mono text-[11px] transition-opacity duration-500"
              style={{
                top: l.y,
                ...(l.right ? { left: l.ax + 30 } : { right: size.w - l.ax + 30 }),
                opacity: done ? 1 : 0,
              }}
            >
              <span className="text-signal">{leak.n}</span>
              <span className="hidden text-foreground sm:inline">{leak.kind}</span>
              <span className="text-foreground">{leak.amount}</span>
            </span>
          );
        })}

        {/* Hovered cell */}
        {hc && (
          <>
            <span
              className="pointer-events-none absolute border border-foreground"
              style={{ left: `${hc.x * 100}%`, top: `${hc.y * 100}%`, width: `${hc.w * 100}%`, height: `${hc.h * 100}%` }}
            />
            <div
              className="pointer-events-none absolute z-10 w-max max-w-[min(22rem,80vw)] rounded-[var(--radius)] border border-border-strong bg-card px-3 py-2 font-mono text-[11px] leading-relaxed shadow-sm"
              style={{
                top: Math.min(hover.py + 14, size.h - 20),
                ...(hover.px > size.w * 0.55 ? { right: size.w - hover.px + 14 } : { left: hover.px + 14 }),
              }}
            >
              <p className="mb-1 text-faint">
                depth {hc.depth} · {hc.points.length} {hc.points.length === 1 ? "record" : "records"}
              </p>
              {hc.points.slice(0, 4).map((i) => (
                <p key={i} className={points[i].hot >= 0 ? "text-signal" : "text-foreground"}>
                  {data.labels[i]}
                </p>
              ))}
              {hc.points.length > 4 && <p className="text-faint">+{hc.points.length - 4} more</p>}
            </div>
          </>
        )}
      </div>
      {done && (
        <button
          type="button"
          onClick={() => {
            setHover(null);
            setRun((r) => r + 1);
          }}
          className="absolute right-0 top-0 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          replay
        </button>
      )}
    </div>
  );
}
