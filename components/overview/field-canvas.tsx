"use client";

import { useEffect, useRef } from "react";
import type { FieldData } from "@/lib/field/model";
import { place, rowOf, yOf, type Domains, type Geometry, type Placed, type Range } from "./geometry";

/*
 * Paints the field: one square per record, in the landing's inks. Blue is the books, orange is
 * money the engine found. Each square eases to its tone on its own clock, so a finding spreads
 * through its records from the one its label points at, and the amount scale glides when a
 * finding is brought into focus.
 */

export const TONE = { normal: 0, suspect: 1, found: 2, fixed: 3, dim: 4, cited: 5 } as const;
export type Tone = (typeof TONE)[keyof typeof TONE];

/** A point on the field: a record, an amount in a half at a column, or a fixed point. */
export type Anchor = { id: string } | { col: number; cents: number; up: boolean } | { x: number; y: number };

export interface Leader {
  from: Anchor;
  /** The label's edge, in field coordinates. */
  x1: number;
  y1: number;
  ink: "found" | "signal" | "bark";
  strong?: boolean;
}

export interface Scene {
  field: FieldData | null;
  g: Geometry | null;
  domains: Domains | null;
  tones: Map<string, Tone>;
  delays: Map<string, number>;
  /** 0 to 1: how far ordinary records recede while findings are on screen. */
  recede: number;
  introAt: number | null;
  scan: { band: "in" | "out" | "all"; startedAt: number; period: number } | null;
  leaders: Leader[];
  /** Supplier unit cost before and after a change, drawn as a stepped line through money in. */
  costs: { changeCol: number; endCol: number; before: number; after: number; strong: boolean }[];
  /** Competitor prices, drawn beside today's column at their amount. */
  prices: { cents: number; strong: boolean }[];
  /** Payments the screen stopped, at the seam past today; `y` is the square's top edge. */
  waiting: { id: string; status: string; y: number }[];
  hot: string | null;
  arrivals: Map<string, number>;
  reduced: boolean;
  dark: boolean;
}

const INKS = {
  light: { bark: "#9b958b", ink: "#161616", moss: "#1f63e6", mossLight: "#86b4f6", fruit: "#ee7f2d", fruitPale: "#f5b867", dust: "#d9d5cc", navy: "#13307a", bg: [246, 244, 238] },
  dark: { bark: "#8a847a", ink: "#ebe5d9", moss: "#4f8dff", mossLight: "#2f5fc0", fruit: "#ff9440", fruitPale: "#b06a2e", dust: "#2e2c28", navy: "#9db8ff", bg: [13, 13, 14] },
};
type RGB = [number, number, number];

const rgb = (c: string): RGB => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const css = (c: RGB, alpha = 1) => `rgb(${c[0] | 0} ${c[1] | 0} ${c[2] | 0}${alpha < 1 ? ` / ${alpha.toFixed(3)}` : ""})`;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (u: number) => 1 - (1 - u) ** 3;
const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
const easeBack = (u: number) => 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2;
const ZOOM_MS = 650;

interface Cell {
  tone: Tone;
  from: RGB;
  now: RGB;
  t0: number;
  delay: number;
}

export function FieldCanvas({ scene }: { scene: React.RefObject<Scene> }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const cells = new Map<string, Cell>();
    let frame = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let recede = 0;
    let dark: boolean | null = null;
    let ink: Record<string, RGB> = {};
    // The amount scale glides between ranges; positions are cached while it rests.
    let zoom: { from: Domains; to: Domains; t0: number } | null = null;
    let shownG: Geometry | null = null;
    let cache: { d: Domains; pos: Map<string, Placed> } | null = null;

    const lerpRange = (a: Range, b: Range, k: number): Range => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    const same = (a: Domains, b: Domains) => a.in[0] === b.in[0] && a.in[1] === b.in[1] && a.out[0] === b.out[0] && a.out[1] === b.out[1];

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const s = scene.current;
      const g = s?.g;
      const field = s?.field;
      if (!s || !g || !field || !s.domains) return;
      const target = Math.min(2, window.devicePixelRatio || 1);
      if (Math.round(g.width * target) !== width || Math.round(g.height * target) !== height) {
        dpr = target;
        width = Math.round(g.width * dpr);
        height = Math.round(g.height * dpr);
        el.width = width;
        el.height = height;
        el.style.width = `${g.width}px`;
        el.style.height = `${g.height}px`;
      }
      if (dark !== s.dark) {
        dark = s.dark;
        const p = s.dark ? INKS.dark : INKS.light;
        ink = {
          sale: rgb(p.mossLight),
          in: rgb(p.moss),
          out: rgb(p.navy),
          suspect: rgb(p.fruitPale),
          found: rgb(p.fruit),
          fixed: rgb(p.moss),
          dim: rgb(p.dust),
          ink: rgb(p.ink),
          bark: rgb(p.bark),
          moss: rgb(p.moss),
          bg: p.bg as RGB,
        };
        cells.clear();
      }

      // Domains: glide from wherever the scale is now to where the scene wants it.
      if (g !== shownG) {
        shownG = g;
        zoom = null;
        cache = null;
      }
      const want = s.domains;
      let d: Domains;
      if (!zoom) zoom = { from: want, to: want, t0: now };
      if (!same(zoom.to, want)) {
        const k = easeInOut(clamp01((now - zoom.t0) / ZOOM_MS));
        const cur = { in: lerpRange(zoom.from.in, zoom.to.in, k), out: lerpRange(zoom.from.out, zoom.to.out, k) };
        zoom = { from: cur, to: want, t0: s.reduced ? now - ZOOM_MS : now };
      }
      const k = easeInOut(clamp01((now - zoom.t0) / ZOOM_MS));
      d = k >= 1 ? zoom.to : { in: lerpRange(zoom.from.in, zoom.to.in, k), out: lerpRange(zoom.from.out, zoom.to.out, k) };
      if (k >= 1) d = zoom.to;
      if (!cache || !same(cache.d, d)) cache = { d, pos: place(g, d) };
      const pos = cache.pos;
      const yAt = (up: boolean, cents: number) => {
        const r = Math.floor(rowOf(g, up ? d.in : d.out, Math.log10(Math.max(100, cents))));
        return yOf(g, up, Math.max(0, Math.min(g.rows - 1, r))) + g.size / 2;
      };

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, g.width, g.height);
      recede += (s.recede - recede) * (s.reduced ? 1 : 0.08);
      const { cell, size } = g;
      const dur = s.reduced ? 1 : 320;

      // Axis: a dotted rule between the halves, and the seam before today.
      ctx.fillStyle = css(ink.bark, 0.6);
      const axisY = g.axis + cell / 2 - 0.5;
      for (let c = 0; c < g.todayCol - 1; c += 2) ctx.fillRect(g.left + c * cell + cell / 2 - 0.5, axisY, 1, 1);
      const seamX = g.left + (g.todayCol - 1) * cell + cell / 2 - 0.5;
      for (let y = g.top; y < g.bottom; y += 3) ctx.fillRect(seamX, y, 1, 1);

      // Scan line.
      let scanCol = -1;
      let scanUp: boolean | null = null;
      if (s.scan && !s.reduced) {
        const u = ((now - s.scan.startedAt) % s.scan.period) / s.scan.period;
        scanCol = Math.floor(u * (g.todayCol - 1));
        scanUp = s.scan.band === "all" ? null : s.scan.band === "in";
        const top = s.scan.band === "out" ? g.axis + cell : g.top;
        const bottom = s.scan.band === "in" ? g.axis : g.bottom;
        ctx.fillStyle = css(ink.moss, 0.9);
        const x = g.left + scanCol * cell + cell / 2 - 0.5;
        for (let y = top - 4; y < bottom + 4; y += 2) ctx.fillRect(x, y, 1, 1);
      }

      // Unit cost steps: the floor under a product's price lane.
      for (const c of s.costs) {
        ctx.fillStyle = css(ink.found, c.strong ? 1 : 0.7);
        const yb = yAt(true, c.before);
        const ya = yAt(true, c.after);
        const x0 = g.left;
        const xc = g.left + c.changeCol * cell;
        const x1 = g.left + (c.endCol + 1) * cell;
        for (let x = x0; x < xc; x += 3) ctx.fillRect(x, yb, 1.5, 1.5);
        for (let y = Math.min(ya, yb); y <= Math.max(ya, yb); y += 3) ctx.fillRect(xc, y, 1.5, 1.5);
        for (let x = xc; x < x1; x += 3) ctx.fillRect(x, ya, 1.5, 1.5);
      }

      for (const r of field.records) {
        const p = pos.get(r.id);
        if (!p) continue;
        const tone = s.tones.get(r.id) ?? TONE.normal;
        const rest =
          tone === TONE.normal
            ? mix(ink[r.kind], ink.bg, r.live ? 0 : 0.5 * recede)
            : tone === TONE.cited || tone === TONE.found
              ? ink.found
              : tone === TONE.suspect
                ? ink.suspect
                : tone === TONE.fixed
                  ? ink.fixed
                  : ink.dim;
        let c = cells.get(r.id);
        if (!c) {
          c = { tone, from: rest, now: rest, t0: now, delay: 0 };
          cells.set(r.id, c);
        } else if (c.tone !== tone) {
          c.from = c.now;
          c.tone = tone;
          c.t0 = now;
          c.delay = s.reduced ? 0 : (s.delays.get(r.id) ?? 0);
        }
        const kk = easeOut(clamp01((now - c.t0 - c.delay) / dur));
        c.now = kk >= 1 ? rest : mix(c.from, rest, kk);

        // Arrival: dropped in from above the field. Intro: the books fill in, left to right.
        let dy = 0;
        let alpha = p.clipped ? 0.18 : 1;
        let color = c.now;
        const arrived = s.arrivals.get(r.id);
        const born = arrived ?? (s.introAt !== null && !s.reduced ? s.introAt + (p.col / g.cols) * 1200 + ((p.y * 7) % 110) : null);
        if (born !== null) {
          const age = now - born;
          if (age < 0) continue;
          if (arrived !== undefined) {
            const u = clamp01(age / 700);
            dy = (1 - easeBack(u)) * -(p.y - 2);
            if (u < 1) color = mix(ink.ink, c.now, clamp01(age / 1000));
          } else if (age < 450) {
            const u = easeOut(age / 450);
            dy = (1 - u) * (r.kind === "out" ? 16 : -16);
            alpha *= u;
          }
        }
        if (scanCol >= 0 && (scanUp === null || scanUp === (r.kind !== "out"))) {
          const dd = scanCol - p.col;
          if (dd >= 0 && dd < 8) color = mix(color, ink.ink, (1 - dd / 8) * 0.4);
        }
        ctx.fillStyle = css(color, alpha);
        ctx.fillRect(p.x, p.y + dy, size, size);
      }

      // Competitor prices: hollow squares just past today, at their amount.
      const px = g.left + g.todayCol * cell;
      s.prices.forEach((pr, i) => {
        const y = yAt(true, pr.cents) - size / 2;
        ctx.strokeStyle = css(ink.found, pr.strong ? 1 : 0.8);
        ctx.lineWidth = 1;
        ctx.strokeRect(px + (i % 2) * cell + 0.5, y + 0.5, size - 1, size - 1);
      });

      // Payments waiting on a person, beside today's column at their amount.
      const blink = s.reduced ? 1 : 0.55 + 0.45 * Math.sin(now / 220);
      for (const w of s.waiting) {
        const y = w.y;
        const blocked = w.status === "blocked";
        ctx.strokeStyle = css(blocked ? ink.bark : ink.found, blocked ? 0.7 : blink);
        ctx.lineWidth = 1;
        ctx.strokeRect(g.seamX + 0.5, y + 0.5, size - 1, size - 1);
        if (!blocked) {
          ctx.fillStyle = css(ink.found, 0.45 * blink);
          ctx.fillRect(g.seamX + 2, y + 2, size - 4, size - 4);
        } else {
          ctx.fillStyle = css(ink.bark, 0.7);
          ctx.fillRect(g.seamX - 1, y + size / 2 - 0.5, size + 2, 1);
        }
      }

      // Leaders from records to their labels: dotted, with one bend.
      const resolve = (a: Anchor) => {
        if ("id" in a) {
          const p = pos.get(a.id);
          return p ? { x: p.x + size / 2, y: p.y + size / 2 } : null;
        }
        if ("cents" in a) return { x: g.left + a.col * cell + size / 2, y: yAt(a.up, a.cents) };
        return a;
      };
      for (const l of s.leaders) {
        const a = resolve(l.from);
        if (!a) continue;
        ctx.fillStyle = css(l.ink === "found" ? ink.found : l.ink === "signal" ? ink.moss : ink.bark, l.strong ? 1 : 0.7);
        const goingUp = l.y1 < a.y;
        const y0 = a.y + (goingUp ? -size : size);
        const dots = (x0: number, ya: number, x1: number, yb: number) => {
          const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(yb - ya)) / 3));
          for (let k2 = 0; k2 <= n; k2++) ctx.fillRect(Math.round(x0 + ((x1 - x0) * k2) / n), Math.round(ya + ((yb - ya) * k2) / n), 1.5, 1.5);
        };
        if (Math.abs(l.y1 - a.y) < 2) dots(a.x + size, a.y, l.x1, a.y);
        else {
          dots(a.x, y0, a.x, l.y1);
          if (Math.abs(l.x1 - a.x) > 2) dots(a.x, l.y1, l.x1, l.y1);
        }
      }

      // The record under the pointer.
      if (s.hot) {
        const p = pos.get(s.hot);
        if (p) {
          ctx.strokeStyle = css(ink.ink);
          ctx.lineWidth = 1;
          ctx.strokeRect(p.x - 1.5, p.y - 1.5, size + 3, size + 3);
        }
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [scene]);

  return <canvas ref={canvas} aria-hidden className="pointer-events-none absolute left-0 top-0" />;
}
