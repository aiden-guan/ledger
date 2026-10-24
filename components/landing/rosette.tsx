"use client";

import { useEffect, useRef } from "react";
import { ROSETTE, bandRadius, fractureWeight, type Fracture } from "@/lib/guilloche";
import type { LandingLeak } from "@/lib/landing/data";

/*
 * The hero: a banknote rosette engraved live on a canvas, ringed with microprint made of the
 * demo company's real ledger lines. A loupe follows the pointer (or tours the leaks on its
 * own) and magnifies what is under it, so the microprint becomes readable and the breaks in
 * the weave show what is leaking.
 */

interface Props {
  leaks: LandingLeak[];
  ledger: string[];
  /** Leak the loupe should travel to (from the list beside the rosette), or null. */
  focus: number | null;
  onActiveChange: (index: number | null) => void;
}

const MAG = 3.2;
const RINGS = [
  { r: 0.988, band: 0 },
  { r: 0.612, band: 1 },
  { r: 0.386, band: 2 },
] as const;

interface Ring {
  r: number;
  chars: string[];
  hot: Uint8Array;
}

function readColors() {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim();
  // Canvas font strings cannot use var(), so resolve the loaded mono family once.
  const mono = `${getComputedStyle(document.body).getPropertyValue("--font-geist-mono").trim() || "ui-monospace"}, ui-monospace, monospace`;
  return { ink: v("--engrave"), red: v("--signal"), paper: v("--background"), fg: v("--foreground"), muted: v("--muted-foreground"), mono };
}

/** Lays the ledger text around each ring and drops every leak's phrase on top of its break. */
function buildRings(leaks: LandingLeak[], ledger: string[], perRingChars: number[]): Ring[] {
  const filler = ledger.join("  ·  ").toUpperCase();
  let cursor = 0;
  return RINGS.map((ring, ri) => {
    const n = perRingChars[ri];
    const chars: string[] = [];
    for (let k = 0; k < n; k++) chars.push(filler[(cursor + k) % filler.length]);
    cursor += n;
    const hot = new Uint8Array(n);
    for (const leak of leaks) {
      const target = RINGS.findIndex((x) => x.band === leak.fracture.band);
      if (target !== ri) continue;
      const phrase = `  ${leak.micro}  `;
      // Ring text starts at 12 o'clock and runs clockwise; canvas angles start at 3 o'clock.
      const turn = (((leak.fracture.angle + Math.PI / 2) / (Math.PI * 2)) % 1 + 1) % 1;
      const mid = Math.round(turn * n);
      const start = mid - Math.floor(phrase.length / 2);
      for (let k = 0; k < phrase.length; k++) {
        const idx = (((start + k) % n) + n) % n;
        chars[idx] = phrase[k];
        hot[idx] = 1;
      }
    }
    return { r: ring.r, chars, hot };
  });
}

export function Rosette({ leaks, ledger, focus, onActiveChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const focusRef = useRef(focus);
  const activeCb = useRef(onActiveChange);
  const kickRef = useRef<() => void>(() => {});
  focusRef.current = focus;
  activeCb.current = onActiveChange;

  useEffect(() => kickRef.current(), [focus]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fractures: Fracture[] = leaks.map((l) => l.fracture);
    let colors = readColors();
    let size = 0;
    let dpr = 1;
    let rings: Ring[] = [];
    let fontPx = 2.6;
    let ringLayer: HTMLCanvasElement | null = null;

    const lens = { x: 0, y: 0, tx: 0, ty: 0, placed: false };
    let pointer: { x: number; y: number } | null = null;
    let pinnedUntil = 0;
    let active: number | null = null;
    let visible = true;
    let raf = 0;
    const born = performance.now();
    let last = born;

    const geom = () => {
      const c = size / 2;
      return { c, R: size * 0.44, L: Math.max(54, size * 0.13) };
    };

    /** Centre of a leak's break, in canvas pixels. */
    const leakPoint = (i: number, t: number) => {
      const { c, R } = geom();
      const f = fractures[i];
      const band = ROSETTE[f.band];
      // Aim between the break and its microprint ring, so the loupe shows both.
      const ring = RINGS.find((x) => x.band === f.band);
      const r = ((bandRadius(band, 0, f.angle, t) + (ring?.r ?? band.r)) / 2) * R;
      return { x: c + Math.cos(f.angle) * r, y: c + Math.sin(f.angle) * r };
    };

    const drawRingChars = (target: CanvasRenderingContext2D, ring: Ring, filter?: (x: number, y: number) => boolean) => {
      const { c, R } = geom();
      const rr = ring.r * R;
      const n = ring.chars.length;
      target.font = `500 ${fontPx}px ${colors.mono}`;
      target.textAlign = "center";
      target.textBaseline = "middle";
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 - Math.PI / 2;
        const x = c + Math.cos(a) * rr;
        const y = c + Math.sin(a) * rr;
        if (filter && !filter(x, y)) continue;
        target.save();
        target.translate(x, y);
        target.rotate(a + Math.PI / 2);
        target.fillStyle = ring.hot[k] ? colors.red : colors.muted;
        target.fillText(ring.chars[k], 0, 0);
        target.restore();
      }
    };

    const layout = () => {
      const rect = wrap.getBoundingClientRect();
      size = Math.max(200, Math.floor(rect.width));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      const { R } = geom();
      fontPx = Math.max(2.2, size * 0.0043);
      const advance = fontPx * 0.62;
      rings = buildRings(
        leaks,
        ledger,
        RINGS.map((r) => Math.floor((Math.PI * 2 * r.r * R) / advance)),
      );
      ringLayer = document.createElement("canvas");
      ringLayer.width = size * dpr;
      ringLayer.height = size * dpr;
      const rctx = ringLayer.getContext("2d");
      if (rctx) {
        rctx.scale(dpr, dpr);
        for (const ring of rings) drawRingChars(rctx, ring);
      }
      if (!lens.placed) {
        const p = leakPoint(0, 0);
        lens.x = lens.tx = p.x;
        lens.y = lens.ty = p.y;
        lens.placed = true;
      }
    };

    /** Builds the engraving for time t; `reveal` (0..1) draws the lines in during the intro. */
    const engrave = (t: number, reveal: number) => {
      const { c, R } = geom();
      const ink = new Path2D();
      const red = new Path2D();
      const breathe = 1 + 0.05 * Math.sin(t * 0.6);
      ROSETTE.forEach((band, bi) => {
        const local = Math.min(1, Math.max(0, reveal * 1.6 - bi * 0.18));
        if (local <= 0) return;
        const steps = Math.max(160, Math.round(band.lobes * 14));
        const until = Math.round(steps * (1 - Math.pow(1 - local, 3)));
        for (let i = 0; i < band.lines; i++) {
          let prevHot = false;
          const startOffset = Math.floor((i / band.lines) * steps);
          for (let s = 0; s <= until; s++) {
            const theta = (((s + startOffset) % steps) / steps) * Math.PI * 2;
            let r = bandRadius(band, i, theta, t, breathe);
            let w = 0;
            for (const f of fractures) {
              if (f.band !== bi) continue;
              const fw = fractureWeight(f, theta);
              if (fw > 0) {
                // The weave loosens: lines lose their swing and fan apart into a gap.
                const own = bandRadius(band, i, theta, t, breathe) - band.r;
                r -= own * fw * 0.75;
                r += fw * band.amp * 2.2 * (i / (band.lines - 1) - 0.5);
                w = Math.max(w, fw);
              }
            }
            const x = c + Math.cos(theta) * r * R;
            const y = c + Math.sin(theta) * r * R;
            const hot = w > 0.08;
            if (s === 0) {
              (hot ? red : ink).moveTo(x, y);
            } else if (hot !== prevHot) {
              (prevHot ? red : ink).lineTo(x, y);
              (hot ? red : ink).moveTo(x, y);
            } else {
              (hot ? red : ink).lineTo(x, y);
            }
            prevHot = hot;
          }
        }
      });
      return { ink, red };
    };

    const drawMarkers = (t: number, reveal: number) => {
      const { c, R } = geom();
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, reveal * 2 - 1));
      ctx.font = `500 ${Math.max(9, size * 0.016)}px ${colors.mono}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      fractures.forEach((f, i) => {
        const on = active === i;
        const rOut = R * 1.075;
        // Bracket hugging the break, just outside the rosette.
        ctx.beginPath();
        ctx.arc(c, c, R * 1.03, f.angle - f.spread * 0.7, f.angle + f.spread * 0.7);
        ctx.strokeStyle = colors.red;
        ctx.lineWidth = on ? 1.4 : 0.8;
        ctx.stroke();
        const x = c + Math.cos(f.angle) * rOut;
        const y = c + Math.sin(f.angle) * rOut;
        if (on) {
          ctx.fillStyle = colors.red;
          ctx.fillRect(x - 11, y - 7, 22, 14);
          ctx.fillStyle = colors.paper;
        } else {
          ctx.fillStyle = colors.red;
        }
        ctx.fillText(leaks[i].n, x, y + 0.5);
      });
      ctx.restore();
      void t;
    };

    const drawLens = (paths: { ink: Path2D; red: Path2D }) => {
      const { L } = geom();
      const { x, y } = lens;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, L, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = colors.paper;
      ctx.fillRect(x - L, y - L, L * 2, L * 2);
      ctx.translate(x, y);
      ctx.scale(MAG, MAG);
      ctx.translate(-x, -y);
      ctx.lineWidth = 1 / MAG;
      ctx.strokeStyle = colors.ink;
      ctx.globalAlpha = 0.85;
      ctx.stroke(paths.ink);
      ctx.strokeStyle = colors.red;
      ctx.lineWidth = 1.3 / MAG;
      ctx.globalAlpha = 1;
      ctx.stroke(paths.red);
      const reach = L / MAG + fontPx * 2;
      for (const ring of rings) drawRingChars(ctx, ring, (cx, cy) => Math.abs(cx - x) < reach && Math.abs(cy - y) < reach);
      ctx.restore();

      // The loupe itself: a ruled ring with tick marks, no glow.
      ctx.save();
      ctx.strokeStyle = colors.fg;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(x, y, L, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let d = 0; d < 360; d += 6) {
        const a = (d * Math.PI) / 180;
        const inner = d % 30 === 0 ? L - 7 : L - 3.5;
        ctx.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
        ctx.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L);
      }
      ctx.stroke();
      ctx.fillStyle = colors.fg;
      ctx.font = `500 9px ${colors.mono}`;
      ctx.textAlign = "center";
      ctx.fillText(`×${MAG.toFixed(1)}`, x, y + L + 13);
      ctx.restore();
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const elapsed = (now - born) / 1000;
      const t = reduce ? 0 : elapsed;
      const reveal = reduce ? 1 : Math.min(1, elapsed / 2.4);

      // Where the loupe should be: the pointer, a requested leak, or touring the leaks.
      if (pointer && now > pinnedUntil) {
        lens.tx = pointer.x;
        lens.ty = pointer.y;
      } else if (focusRef.current !== null && fractures[focusRef.current]) {
        const p = leakPoint(focusRef.current, t);
        lens.tx = p.x;
        lens.ty = p.y;
      } else if (now > pinnedUntil && fractures.length) {
        const stop = reduce ? 0 : Math.floor(Math.max(0, elapsed - 2.6) / 3.4) % fractures.length;
        const p = leakPoint(stop, t);
        lens.tx = p.x;
        lens.ty = p.y;
      }
      const k = reduce ? 1 : 1 - Math.exp(-dt * 7);
      lens.x += (lens.tx - lens.x) * k;
      lens.y += (lens.ty - lens.y) * k;

      const { L } = geom();
      let nearest: number | null = null;
      let best = L * 0.9;
      fractures.forEach((_, i) => {
        const p = leakPoint(i, t);
        const d = Math.hypot(p.x - lens.x, p.y - lens.y);
        if (d < best) {
          best = d;
          nearest = i;
        }
      });
      if (nearest !== active) {
        active = nearest;
        activeCb.current(active);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const paths = engrave(t, reveal);
      ctx.lineWidth = 0.55;
      ctx.strokeStyle = colors.ink;
      ctx.globalAlpha = 0.78;
      ctx.stroke(paths.ink);
      ctx.globalAlpha = 1;
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = colors.red;
      ctx.stroke(paths.red);
      if (ringLayer) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, reveal * 1.5);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(ringLayer, 0, 0);
        ctx.restore();
      }
      drawMarkers(t, reveal);
      if (reveal > 0.55) drawLens(paths);

      if (visible && (!reduce || reveal < 1 || Math.hypot(lens.tx - lens.x, lens.ty - lens.y) > 0.5)) schedule();
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const local = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      pointer = local(e);
      schedule();
    };
    const onLeave = () => {
      pointer = null;
      schedule();
    };
    const onDown = (e: PointerEvent) => {
      const p = local(e);
      lens.tx = p.x;
      lens.ty = p.y;
      pinnedUntil = performance.now() + 4000;
      pointer = null;
      schedule();
    };

    const ro = new ResizeObserver(() => {
      layout();
      schedule();
    });
    ro.observe(wrap);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) schedule();
    });
    io.observe(wrap);
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => {
      colors = readColors();
      layout();
      schedule();
    };
    scheme.addEventListener("change", onScheme);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerdown", onDown);
    layout();
    schedule();
    kickRef.current = schedule;

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      scheme.removeEventListener("change", onScheme);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
    };
  }, [leaks, ledger]);

  return (
    <div ref={wrapRef} className="relative aspect-square w-full">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-none touch-pan-y"
        role="img"
        aria-label={`Rosette engraved from the demo company's ledger, with ${leaks.length} breaks marking leaks: ${leaks.map((l) => `${l.kind} ${l.subject} ${l.amount}`).join("; ")}.`}
      />
    </div>
  );
}
