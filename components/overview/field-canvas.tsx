"use client";

import { useEffect, useRef } from "react";
import type { FieldData } from "@/lib/field/model";
import type { Wall } from "./wall";

/*
 * Paints the wall: one square per record, in the landing's inks. Blue is the books, orange is
 * money the engine found. Each square eases to its tone on its own clock, so a finding spreads
 * through its records from the one its label points at, and an approval washes them back to blue.
 */

export const TONE = { normal: 0, suspect: 1, found: 2, fixed: 3, dim: 4, cited: 5 } as const;
export type Tone = (typeof TONE)[keyof typeof TONE];

/** A point on the wall: a record, or a fixed point. */
export type Anchor = { id: string } | { x: number; y: number };

export interface Leader {
  from: Anchor;
  /** The label's edge, in wall coordinates. */
  x1: number;
  y1: number;
  ink: "found" | "signal";
  strong?: boolean;
}

export interface GateItem {
  id: string;
  status: string;
  y: number;
}

export interface Scene {
  field: FieldData | null;
  wall: Wall | null;
  tones: Map<string, Tone>;
  delays: Map<string, number>;
  /** 0 to 1: how far ordinary records recede while findings are on screen. */
  recede: number;
  introAt: number | null;
  scan: { band: "in" | "out" | "all"; startedAt: number; period: number } | null;
  leaders: Leader[];
  /** The gate past this week, and the payments waiting at it; null when the beat has no gate. */
  gate: GateItem[] | null;
  hot: string | null;
  /** When live records and gate items first appeared, to slide them in from the bank feed. */
  arrivals: Map<string, number>;
  reduced: boolean;
  dark: boolean;
}

const INKS = {
  light: { bark: "#9b958b", ink: "#161616", moss: "#1f63e6", mossLight: "#86b4f6", fruit: "#ee7f2d", fruitPale: "#f5b867", dust: "#e3dfd6", navy: "#13307a", bg: [246, 244, 238] },
  dark: { bark: "#8a847a", ink: "#ebe5d9", moss: "#4f8dff", mossLight: "#2f5fc0", fruit: "#ff9440", fruitPale: "#b06a2e", dust: "#262522", navy: "#9db8ff", bg: [13, 13, 14] },
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
const easeBack = (u: number) => 1 + 2.4 * (u - 1) ** 3 + 1.4 * (u - 1) ** 2;
const ARRIVE_MS = 900;

interface Cell {
  tone: Tone;
  /** The tone before, and whether it had finished arriving when this one began. */
  prev: Tone;
  settled: boolean;
  from: RGB;
  now: RGB;
  t0: number;
  delay: number;
  /** Lighting up (found, approved, cited) swells the square for a moment. */
  pop: boolean;
  /** Between two inks that would mix to mud, the square flips halfway instead of blending. */
  flip: boolean;
}

const LIT: Set<Tone> = new Set([TONE.found, TONE.fixed, TONE.cited]);

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

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const s = scene.current;
      const w = s?.wall;
      const field = s?.field;
      if (!s || !w || !field) return;
      const target = Math.min(2, window.devicePixelRatio || 1);
      if (Math.round(w.width * target) !== width || Math.round(w.height * target) !== height) {
        dpr = target;
        width = Math.round(w.width * dpr);
        height = Math.round(w.height * dpr);
        el.width = width;
        el.height = height;
        el.style.width = `${w.width}px`;
        el.style.height = `${w.height}px`;
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
          cited: rgb(p.moss),
          dim: rgb(p.dust),
          ink: rgb(p.ink),
          bark: rgb(p.bark),
          bg: p.bg as RGB,
        };
        cells.clear();
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w.width, w.height);
      recede += (s.recede - recede) * (s.reduced ? 1 : 0.08);
      const { cell, size } = w;
      const dur = s.reduced ? 1 : 360;

      // The axis between money in and money out.
      ctx.fillStyle = css(ink.bark, 0.55);
      const axisY = Math.round(w.base + cell / 2 - 0.5);
      for (let x = w.left; x < w.right; x += 3) ctx.fillRect(x, axisY, 1.5, 1);

      // The scan: a beam crossing the weeks the engine is reading.
      let beam = -1;
      let band: boolean | null = null;
      if (s.scan && !s.reduced) {
        const u = ((now - s.scan.startedAt) % s.scan.period) / s.scan.period;
        beam = w.left + u * (w.right - w.left + 6 * cell);
        band = s.scan.band === "all" ? null : s.scan.band === "in";
        const top = s.scan.band === "out" ? w.base + cell : w.ceiling - 6;
        const bottom = s.scan.band === "in" ? w.base : w.floor + 6;
        if (beam <= w.right) {
          ctx.fillStyle = css(ink.in);
          ctx.fillRect(Math.round(beam) + 1, top, 1.5, bottom - top);
        }
      }

      for (const r of field.records) {
        const p = w.pos.get(r.id);
        if (!p) continue;
        const tone = s.tones.get(r.id) ?? TONE.normal;
        const restOf = (t: Tone) =>
          t === TONE.normal
            ? mix(ink[r.kind], ink.bg, r.live ? 0 : 0.6 * recede)
            : t === TONE.found
              ? ink.found
              : t === TONE.cited
                ? ink.cited
                : t === TONE.suspect
                  ? ink.suspect
                  : t === TONE.fixed
                    ? ink.fixed
                    : ink.dim;
        const rest = restOf(tone);
        let c = cells.get(r.id);
        if (!c) {
          c = { tone, prev: tone, settled: true, from: rest, now: rest, t0: now, delay: 0, pop: false, flip: false };
          cells.set(r.id, c);
        } else if (c.tone !== tone) {
          c.settled = now - c.t0 - c.delay >= dur;
          c.prev = c.tone;
          c.from = c.now;
          c.pop = !s.reduced && LIT.has(tone) && c.tone !== TONE.dim;
          c.flip = (LIT.has(tone) || LIT.has(c.tone)) && tone !== TONE.dim && c.tone !== TONE.dim;
          c.tone = tone;
          c.t0 = now;
          c.delay = s.reduced ? 0 : (s.delays.get(r.id) ?? 0);
        }
        const u = clamp01((now - c.t0 - c.delay) / dur);
        // While it waits its turn, a square keeps following its old tone (the books may still be receding).
        if (u <= 0 && c.settled) c.from = restOf(c.prev);
        c.now = u >= 1 ? rest : c.flip ? (u < 0.45 ? c.from : rest) : mix(c.from, rest, easeOut(u));

        const x = p.x;
        let y = p.y;
        let side = size;
        let alpha = 1;
        let color = c.now;
        // The books build up week by week, each stack rising from the axis.
        const arrived = s.arrivals.get(r.id);
        if (arrived !== undefined) {
          // A live payment lands: large and dark, settling into its square.
          const age = now - arrived;
          if (age < 0) continue;
          if (age < ARRIVE_MS && !s.reduced) {
            const k = easeOut(age / ARRIVE_MS);
            side = size * (1 + 1.4 * (1 - k));
            color = mix(ink.ink, c.now, k);
            alpha = clamp01(age / 120);
          }
        } else if (s.introAt !== null && !s.reduced) {
          const row = Math.abs(p.y - w.base) / cell;
          const age = now - (s.introAt + p.week * 38 + row * 16);
          if (age < 0) continue;
          if (age < 420) {
            const k = easeBack(age / 420);
            y += (1 - k) * (p.up ? cell * 1.5 : -cell * 1.5);
            alpha = clamp01(age / 200);
          }
        }
        if (c.pop && u > 0 && u < 1) side = Math.max(side, size * (1 + 0.3 * Math.sin(Math.PI * u)));
        if (beam >= 0 && (band === null || band === p.up)) {
          const d = (beam - p.x) / cell;
          if (d >= -1 && d < 9) color = mix(color, ink.in, Math.min(1, 1 - d / 9));
        }
        ctx.fillStyle = css(color, alpha);
        const o = (side - size) / 2;
        ctx.fillRect(x - o, y - o, side, side);
      }

      // The gate past this week: payments the screen stopped wait here for a person.
      if (s.gate) {
        const gx = w.gateX;
        ctx.fillStyle = s.gate.some((g) => g.status !== "blocked") ? css(ink.found, 0.85) : css(ink.bark, 0.6);
        for (let y = w.base + cell; y < w.floor + 4; y += 3) ctx.fillRect(gx - cell + Math.round(cell / 2) - 1, y, 1, 1.5);
        const blink = s.reduced ? 1 : 0.6 + 0.4 * Math.sin(now / 200);
        for (const g of s.gate) {
          const x = gx;
          let o = 0;
          const arrived = s.arrivals.get(g.id);
          if (arrived !== undefined && !s.reduced) {
            const age = now - arrived;
            if (age < 0) continue;
            if (age < ARRIVE_MS) o = (size * 1.4 * (1 - easeOut(age / ARRIVE_MS))) / 2;
          }
          if (g.status === "blocked") {
            ctx.strokeStyle = css(ink.bark, 0.8);
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, g.y + 0.5, size - 1, size - 1);
            ctx.fillStyle = css(ink.bark, 0.8);
            ctx.fillRect(x - 2, g.y + size / 2 - 0.5, size + 4, 1);
          } else {
            ctx.fillStyle = css(ink.found, o ? 1 : blink);
            ctx.fillRect(x - o, g.y - o, size + 2 * o, size + 2 * o);
          }
        }
      }

      // Leaders from records to their labels: dotted, with one bend.
      const resolve = (a: Anchor) => {
        if ("id" in a) {
          const p = w.pos.get(a.id);
          return p ? { x: p.x + size / 2, y: p.y + size / 2 } : null;
        }
        return a;
      };
      for (const l of s.leaders) {
        const a = resolve(l.from);
        if (!a) continue;
        ctx.fillStyle = css(l.ink === "found" ? ink.found : ink.in, l.strong === false ? 0.6 : 1);
        const dots = (x0: number, ya: number, x1: number, yb: number) => {
          const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(yb - ya)) / 3));
          for (let k = 0; k <= n; k++) ctx.fillRect(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(ya + ((yb - ya) * k) / n), 1.5, 1.5);
        };
        dots(a.x, a.y, a.x, l.y1);
        if (Math.abs(l.x1 - a.x) > 2) dots(a.x, l.y1, l.x1, l.y1);
      }

      // The record under the pointer.
      if (s.hot) {
        const p = w.pos.get(s.hot);
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
