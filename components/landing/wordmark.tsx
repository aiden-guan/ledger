"use client";

import { useEffect, useRef } from "react";
import { coverageQuadtree } from "@/lib/quadtree";

/*
 * The wordmark, drawn the way the engine searches: the type is rasterised, then a quadtree keeps
 * splitting along every edge, so strokes fill with large cells and their contours with fine ones.
 */
export function Wordmark({ text = "LedgerLens" }: { text?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    let raf = 0;
    let cancelled = false;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const render = async () => {
      await document.fonts.ready;
      if (cancelled) return;
      const w = cv.clientWidth;
      if (!w) return;
      const family = getComputedStyle(document.body).fontFamily;
      const probe = document.createElement("canvas").getContext("2d")!;
      probe.font = `500 100px ${family}`;
      if ("letterSpacing" in probe) (probe as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "-4.5px";
      const fontSize = Math.floor((100 * w * 0.99) / probe.measureText(text).width);
      const h = Math.round(fontSize * 0.84);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = w * dpr;
      cv.height = h * dpr;
      cv.style.height = `${h}px`;

      // Rasterise the type into a coverage mask and build a summed-area table over it.
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const o = off.getContext("2d", { willReadFrequently: true })!;
      o.font = `500 ${fontSize}px ${family}`;
      o.textBaseline = "alphabetic";
      if ("letterSpacing" in o) (o as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${-fontSize * 0.045}px`;
      const tw = o.measureText(text).width;
      o.fillText(text, Math.max(0, (w - tw) / 2), h * 0.78);
      const px = o.getImageData(0, 0, w, h).data;
      const sat = new Float64Array((w + 1) * (h + 1));
      for (let y = 0; y < h; y++) {
        let row = 0;
        for (let x = 0; x < w; x++) {
          row += px[(y * w + x) * 4 + 3] / 255;
          sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1] + row;
        }
      }
      const coverage = (x: number, y: number, cw: number, ch: number) => {
        const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(w, Math.floor(x + cw)), y1 = Math.min(h, Math.floor(y + ch));
        const area = (x1 - x0) * (y1 - y0);
        if (area <= 0) return 0;
        const s = sat[y1 * (w + 1) + x1] - sat[y0 * (w + 1) + x1] - sat[y1 * (w + 1) + x0] + sat[y0 * (w + 1) + x0];
        return s / area;
      };
      const base = Math.max(32, Math.round(w / 16));
      const cells = coverageQuadtree(coverage, w, h, base, 5);
      const finest = cells.filter((c) => c.depth === 5);
      const leak = finest[Math.floor(finest.length * 0.93)];

      const ctx = cv.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 0.6;
      const cs = getComputedStyle(cv);
      const ink = cs.getPropertyValue("--foreground").trim();
      const signal = cs.getPropertyValue("--signal").trim();
      const bg = cs.getPropertyValue("--background").trim();

      const t0 = performance.now();
      const frame = (now: number) => {
        const t = reduced ? 1e6 : now - t0;
        ctx.clearRect(0, 0, w, h);
        for (const c of cells) {
          const a = Math.min(1, Math.max(0, (t - c.depth * 160 - (c.x / w) * 500) / 300));
          if (a <= 0) continue;
          if (c === leak) {
            ctx.globalAlpha = a;
            ctx.fillStyle = signal;
            ctx.fillRect(c.x, c.y, c.s, c.s);
            continue;
          }
          ctx.globalAlpha = a;
          ctx.fillStyle = ink;
          ctx.fillRect(c.x, c.y, c.s, c.s);
          if (c.s >= 6) {
            ctx.strokeStyle = bg;
            ctx.strokeRect(c.x, c.y, c.s, c.s);
          }
        }
        ctx.globalAlpha = 1;
        if (t < 5 * 160 + 500 + 300) raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    };

    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          io.disconnect();
          void render();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(cv);
    return () => {
      cancelled = true;
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [text]);

  return <canvas ref={canvas} aria-label={text} role="img" className="block w-full" style={{ height: "16vw", maxHeight: 190 }} />;
}
