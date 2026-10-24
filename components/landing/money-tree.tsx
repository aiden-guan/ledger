"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "@/lib/finance/money";
import type { LandingData } from "@/lib/landing/data";
import { type Anchor, CLOCK, type Dot, type Ink, INK, INK_PRIORITY, PART, growTree, sprout, visibleCount } from "@/lib/landing/tree";
import { cn } from "@/lib/utils/cn";

/*
 * The landing page is one tree, drawn on a pixel grid. Roots are the books the engine reads, the
 * trunk is the engine, each limb is a finding, and orange marks money found. Scroll is the growth
 * clock: the section is tall, the stage is sticky, and every frame is drawn from the scroll
 * position, so scrolling back un-grows it. Opening a finding grows twigs out to its evidence.
 */

const SCROLL_HEIGHT_VH = 560;
const START = CLOCK.roots[1];
const INKS = 9;

type Node = {
  key: string;
  anchor: Anchor;
  side: "left" | "right";
  /** Beside its marker, or out in a column clear of the canopy with a leader back to it. */
  layout: "beside" | "column";
  /** Growth time at which it fades in. */
  at: number;
  name: string;
  sub: string;
  value?: string;
  /** The part of the tree it names; hovering it brings that part forward. */
  part: number;
  /** For a finding: its index and how much it recovers. */
  leak?: number;
  cents?: number;
};

// Ink colours by INK index: bark, shadow, rust, moss, light moss, fruit, pale fruit, dust, navy.
const PALETTES = {
  light: { inks: ["#9b958b", "#161616", "#7a3524", "#1f63e6", "#86b4f6", "#ee7f2d", "#f5b867", "#bcb7ad", "#13307a"], bg: [246, 244, 238] },
  dark: { inks: ["#8a847a", "#ebe5d9", "#c0644a", "#4f8dff", "#2f5fc0", "#ff9440", "#b06a2e", "#58544d", "#9db8ff"], bg: [13, 13, 14] },
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number) => {
  const u = clamp01((v - a) / (b - a));
  return u * u * (3 - 2 * u);
};
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

function hex(c: string) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** A colour pushed `k` of the way toward the paper. */
function fade(c: string, bg: number[], k: number) {
  const [r, g, b] = hex(c);
  return `rgb(${Math.round(lerp(r, bg[0], k))} ${Math.round(lerp(g, bg[1], k))} ${Math.round(lerp(b, bg[2], k))})`;
}

type Controls = { hover: (key: string, part: number) => void; open: (leak: number | null) => void };

export function MoneyTree({ data }: { data: LandingData }) {
  const leaks = useMemo(() => data.leaks.slice(0, 4), [data.leaks]);
  const tree = useMemo(() => {
    const max = Math.max(1, ...leaks.map((l) => l.cents));
    return growTree(leaks.map((l) => l.cents / max));
  }, [leaks]);
  const [open, setOpen] = useState<number | null>(null);

  const nodes: Node[] = useMemo(() => {
    const [bank, sales, costs, market] = tree.roots;
    const n = (v: number) => v.toLocaleString("en-US");
    return [
      { key: "bank", anchor: bank, side: "left", layout: "beside", at: 0.07, name: "Bank feed", sub: `${n(data.stats.transactions)} transactions`, part: PART.root(0) },
      { key: "sales", anchor: sales, side: "left", layout: "beside", at: 0.085, name: "Sales", sub: `${n(data.stats.sales)} orders`, part: PART.root(1) },
      { key: "costs", anchor: costs, side: "right", layout: "beside", at: 0.095, name: "Supplier costs", sub: `${n(data.stats.costs)} price changes`, part: PART.root(2) },
      { key: "market", anchor: market, side: "right", layout: "beside", at: 0.105, name: "Competitor prices", sub: `${data.stats.competitors} stores, read by Apify`, part: PART.root(3) },
      { key: "rules", anchor: tree.engine, side: "right", layout: "beside", at: tree.engine.t, name: "Rules", sub: "Integer cents. Deterministic.", part: PART.trunk },
      { key: "llm", anchor: tree.model, side: "left", layout: "beside", at: tree.model.t, name: "LLM", sub: "Explains. Never decides.", part: PART.trunk },
      ...tree.limbs.map((a, i): Node => {
        const l = leaks[i];
        return {
          key: `f${i}`,
          anchor: a,
          side: a.x < 0 ? "left" : "right",
          layout: "column",
          at: a.t - 0.05,
          name: l.kind,
          sub: l.subject,
          value: `${l.amount}${l.once ? " once" : " a year"}`,
          part: i,
          leak: i,
          cents: l.cents,
        };
      }),
      { key: "approval", anchor: tree.crown, side: "right", layout: "column", at: CLOCK.crown[1] - 0.04, name: "Approval", sub: "Nothing moves without you.", part: PART.crown },
    ];
  }, [tree, data, leaks]);

  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const cue = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const found = useRef<HTMLSpanElement>(null);
  const yieldRef = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLOListElement>(null);
  const nodeEls = useRef<Record<string, HTMLDivElement | null>>({});
  // Set by the drawing effect, so handlers can reach it without re-rendering.
  const ctl = useRef<Controls>({ hover: () => undefined, open: () => undefined });

  useEffect(() => ctl.current.open(open), [open]);

  useEffect(() => {
    const cv = canvas.current;
    const st = stage.current;
    const sec = section.current;
    if (!cv || !st || !sec) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let pal = dark.matches ? PALETTES.dark : PALETTES.light;
    const onScheme = () => {
      pal = dark.matches ? PALETTES.dark : PALETTES.light;
      request();
    };

    let vw = 0;
    let vh = 0;
    let dpr = 1;
    let cell = 4;
    let gw = 0;
    let gh = 0;
    let grid = new Uint8Array(0);
    let gpart = new Uint8Array(0);
    let buckets: Int32Array[] = [];
    const counts = new Int32Array(INKS * 2);
    let intro = still ? START : 0;
    let scrolled = 0;
    let pointer: { x: number; y: number } | null = null;
    let frame = 0;
    let lastFound = "";
    let W = 200;

    // What is in focus (hovered, or opened), and how far the rest has faded back.
    let hover = { key: "", part: -1 };
    // When the current pulse started (performance.now()), or 0 for none.
    let pulse = 0;
    let focus = 0;
    let focusPart = -1;

    // An opened finding: twigs grow out to its evidence on their own clock, p.
    let opened: { leak: number; target: number; p: number; g: number; twigs: Dot[] | null; ends: { x: number; y: number; at: number }[] } | null = null;
    let lastTime = performance.now();

    const { minX, maxX, minY, maxY } = tree.bounds;
    const fullW = maxX - minX + 0.06;

    // Camera keys: which slice of the world is on screen at each point of the clock. After the
    // trunk it pulls back to the whole tree and holds still while the limbs grow.
    const wide = [
      { g: START, top: -0.1, bot: maxY + 0.05, st: 0.5, sb: 0.97, w: 0.8 },
      { g: 0.22, top: -0.6, bot: maxY * 0.8, st: 0.12, sb: 0.95, w: 0.9 },
      { g: 0.34, top: minY - 0.04, bot: maxY * 0.55, st: 0.09, sb: 0.97, w: fullW },
      { g: 0.86, top: minY - 0.04, bot: maxY * 0.55, st: 0.09, sb: 0.97, w: fullW },
      { g: 1, top: minY - 0.04, bot: 0.06, st: 0.1, sb: 0.74, w: fullW },
    ];
    // On a phone the labels can't sit beside the tree, so it keeps to the top and they list below.
    const phone = [
      { g: START, top: -0.08, bot: maxY + 0.04, st: 0.44, sb: 0.68, w: 0.8 },
      { g: 0.22, top: -0.6, bot: maxY * 0.8, st: 0.1, sb: 0.64, w: 0.9 },
      { g: 0.34, top: minY - 0.04, bot: maxY * 0.55, st: 0.1, sb: 0.62, w: fullW },
      { g: 0.86, top: minY - 0.04, bot: maxY * 0.55, st: 0.1, sb: 0.62, w: fullW },
      { g: 1, top: minY - 0.04, bot: 0.06, st: 0.1, sb: 0.56, w: fullW },
    ];
    const camera = (g: number) => {
      const keys = vw < 640 ? phone : wide;
      let i = 0;
      while (i < keys.length - 2 && g > keys[i + 1].g) i++;
      const a = keys[i];
      const b = keys[i + 1];
      const u = smooth(a.g, b.g, g);
      const top = lerp(a.top, b.top, u);
      const bot = lerp(a.bot, b.bot, u);
      const sTop = lerp(a.st, b.st, u) * vh;
      const sBot = lerp(a.sb, b.sb, u) * vh;
      const w = lerp(a.w, b.w, u);
      let s = (sBot - sTop) / (bot - top);
      let oy = sTop - top * s;
      // Leave room on both sides for the labels, except on phones, where they sit over the tree.
      const margin = vw < 640 ? 12 : W + 40;
      const sMax = (vw - margin * 2) / w;
      if (s > sMax) {
        const mid = (sTop + sBot) / 2;
        s = sMax;
        oy = mid - ((top + bot) / 2) * s;
      }
      return { s, ox: vw / 2, oy };
    };

    const clock = () => (scrolled > 0 ? Math.max(intro, START + (1 - START) * clamp01(scrolled * 1.06)) : intro);

    function draw() {
      frame = 0;
      if (!ctx) return;
      const now = performance.now();
      const dt = Math.min(64, now - lastTime);
      lastTime = now;
      const g = clock();
      const { s, ox, oy } = camera(g);
      const X = (x: number) => ox + x * s;
      const Y = (y: number) => oy + y * s;
      const narrow = vw < 640;

      // Focus: an open finding wins over a hover.
      const target = opened && opened.target > 0 ? opened.leak : hover.part;
      if (target >= 0) focusPart = target;
      const want = target >= 0 ? 1 : 0;
      focus += (want - focus) * Math.min(1, dt / 70);
      if (Math.abs(want - focus) < 0.01) focus = want;
      else request();

      if (opened) {
        opened.p = opened.target ? Math.min(1, opened.p + dt / 900) : Math.max(0, opened.p - dt / 450);
        if (opened.p > 0 && opened.p < 1) request();
        if (!opened.target && opened.p === 0) opened = null;
      }

      // Lay visible dots into the grid; when two share a cell the higher ink wins.
      grid.fill(0);
      const R = 70;
      const put = (cx: number, cy: number, ink: number, part: number) => {
        if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) return;
        const i = cy * gw + cx;
        const cur = grid[i];
        if (cur === 0 || INK_PRIORITY[ink] >= INK_PRIORITY[cur - 1]) {
          grid[i] = ink + 1;
          gpart[i] = part;
        }
      };
      const lay = (d: Dot, age: number, ink: number = d.ink) => {
        let x = X(d.x);
        let y = Y(d.y);
        if (y < -8 || y > vh + 8 || x < -8 || x > vw + 8) return;
        if (pointer) {
          const dx = x - pointer.x;
          const dy = y - pointer.y;
          const dist = Math.hypot(dx, dy);
          if (dist < R && dist > 0.01) {
            const push = (1 - dist / R) ** 2 * 16;
            x += (dx / dist) * push;
            y += (dy / dist) * push;
          }
        }
        const rc = (d.r * s * (0.55 + 0.45 * age)) / cell;
        const cx = Math.floor(x / cell);
        const cy = Math.floor(y / cell);
        if (rc < 0.85) put(cx, cy, ink, d.part);
        else {
          const r = Math.ceil(rc);
          const r2 = rc * rc;
          for (let oy2 = -r; oy2 <= r; oy2++) for (let ox2 = -r; ox2 <= r; ox2++) if (ox2 * ox2 + oy2 * oy2 <= r2) put(cx + ox2, cy + oy2, ink, d.part);
        }
      };
      const n = visibleCount(tree.dots, g);
      // Now and then a pulse runs in from the root tips, up the trunk and out to the findings: the
      // books being read. It is blue until it reaches a finding, then orange.
      let tipward = -1;
      let upward = -1;
      if (pulse) {
        const u = (now - pulse) / 2200;
        if (u >= 1) pulse = 0;
        else {
          request();
          if (u < 0.3) tipward = START * (1 - u / 0.3);
          else upward = START + ((u - 0.3) / 0.7) * (g - START + 0.03);
        }
      }
      for (let i = 0; i < n; i++) {
        const d = tree.dots[i];
        let ink: number = d.ink;
        if (tipward >= 0 ? d.part >= PART.root(0) && Math.abs(d.t - tipward) < 0.007 : upward >= 0 && d.part < PART.root(0) && Math.abs(d.t - upward) < 0.012)
          ink = d.part < PART.trunk ? INK.fruit : INK.moss;
        lay(d, clamp01((g - d.t) / 0.01), ink);
      }
      if (opened?.twigs) {
        const m = visibleCount(opened.twigs, opened.p);
        for (let i = 0; i < m; i++) lay(opened.twigs[i], 1);
      }

      // The ground: a dotted row of pixels.
      const groundRow = Math.floor(Y(0) / cell) + 1;
      if (groundRow >= 0 && groundRow < gh) for (let cx = 0; cx < gw; cx += 2) if (!grid[groundRow * gw + cx]) put(cx, groundRow, INK.dust, 255);

      // Sort cells into colour buckets (even: in focus, odd: faded back), then fill each as one path.
      counts.fill(0);
      const total = gw * gh;
      for (let i = 0; i < total; i++) {
        const v = grid[i];
        if (!v) continue;
        const b = (v - 1) * 2 + (focus > 0 && gpart[i] !== focusPart ? 1 : 0);
        buckets[b][counts[b]++] = i;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv!.width, cv!.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const size = cell - 1 / dpr;
      for (let b = 0; b < INKS * 2; b++) {
        const c = counts[b];
        if (!c) continue;
        const ink = pal.inks[b >> 1];
        ctx.fillStyle = b & 1 ? fade(ink, pal.bg, 0.8 * focus) : ink;
        ctx.beginPath();
        const list = buckets[b];
        for (let k = 0; k < c; k++) {
          const i = list[k];
          ctx.rect((i % gw) * cell, Math.floor(i / gw) * cell, size, size);
        }
        ctx.fill();
      }

      // Labels. Roots and trunk sit beside their markers; findings stand in a column clear of the
      // canopy, pushed apart so they never overlap, with a dotted leader back to the tree.
      const paper = `rgb(${pal.bg.join(" ")})`;
      const colLeft = X(tree.canopy.minX) - 22;
      const colRight = X(tree.canopy.maxX) + 22;
      type Placed = { node: Node; el: HTMLDivElement; vis: number; ax: number; ay: number; edge: number; top: number; h: number };
      const placed: Placed[] = [];
      let cents = 0;
      for (const node of nodes) {
        const el = nodeEls.current[node.key];
        if (!el) continue;
        let vis = smooth(node.at, node.at + 0.025, g);
        if (vis > 0.5) cents += node.cents ?? 0;
        // Where the closing line shares the bottom of the screen with the roots, it wins.
        if (vw < 1100 && node.part >= PART.root(0)) vis *= 1 - smooth(CLOCK.yield, CLOCK.yield + 0.04, g);
        const ax = X(node.anchor.x);
        const ay = Y(node.anchor.y);
        const left = node.side === "left";
        let edge = left ? ax - 14 : ax + 14;
        if (node.layout === "column" && !narrow) edge = left ? Math.min(ax - 24, colLeft) : Math.max(ax + 24, colRight);
        edge = left ? Math.max(16 + W, edge) : Math.min(vw - 16 - W, edge);
        placed.push({ node, el, vis, ax, ay, edge, top: ay - 9, h: el.offsetHeight });
      }
      if (narrow) {
        // Phones: one chapter's labels at a time, listed under the tree.
        const firstFinding = Math.min(...nodes.filter((q) => q.leak !== undefined).map((q) => q.at + 0.01));
        const chapter = (p: Placed) => {
          const k = p.node.part;
          if (g < CLOCK.trunk[0] + 0.02) return k >= PART.root(0);
          if (g < firstFinding) return k === PART.trunk;
          if (g < CLOCK.crown[0] + 0.06) return k < PART.trunk;
          return g < CLOCK.yield && k === PART.crown;
        };
        let y = Y(tree.underground.maxY) + 28;
        if (g >= CLOCK.trunk[0] + 0.02) y = Math.min(y, vh * 0.66);
        const rows = placed.filter((p) => p.vis > 0.01 && chapter(p));
        for (const p of placed) if (!rows.includes(p)) p.vis = 0;
        for (const p of rows) {
          p.edge = 16;
          p.top = y;
          y += p.h + 12;
        }
        const over = y - 12 - (vh - 20);
        if (over > 0) for (const p of rows) p.top -= over;
      } else {
        for (const side of ["left", "right"] as const) {
          const col = placed.filter((p) => p.node.side === side && p.vis > 0.01 && p.node.layout === "column").sort((a, b) => a.top - b.top);
          for (let i = 1; i < col.length; i++) col[i].top = Math.max(col[i].top, col[i - 1].top + col[i - 1].h + 12);
        }
      }

      const dim = (p: Placed) => (focus > 0 && p.node.part !== focusPart ? 1 - 0.8 * focus : 1);
      for (const p of placed) {
        const { node, el, vis, ax, ay, edge, top } = p;
        const left = node.side === "left";
        const a = vis * dim(p);
        el.style.opacity = String(a);
        el.style.transform = `translate(${Math.round(left && !narrow ? edge - W : edge)}px, ${Math.round(top)}px)`;
        el.style.pointerEvents = vis > 0.6 ? "auto" : "none";
        if (smooth(node.at, node.at + 0.025, g) <= 0.001) continue;

        ctx.globalAlpha = smooth(node.at, node.at + 0.025, g) * dim(p);
        const color = pal.inks[node.cents ? INK.fruit : INK.moss];
        const cx = Math.floor(ax / cell);
        const cy = Math.floor(ay / cell);
        // Leader: dotted pixels from the marker out to the label's first line.
        const ex = Math.floor((left ? edge + 6 : edge - 6) / cell);
        const ey = Math.floor((top + 9) / cell);
        if (!narrow && (Math.abs(ex - cx) > 3 || Math.abs(ey - cy) > 1)) {
          ctx.fillStyle = color;
          const bend = left ? Math.max(ex + 3, Math.min(cx - 3, ex + 6)) : Math.min(ex - 3, Math.max(cx + 3, ex - 6));
          const dots = (x0: number, y0: number, x1: number, y1: number) => {
            const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
            for (let k = 0; k <= steps; k += 2) ctx.fillRect(Math.round(lerp(x0, x1, k / steps || 0)) * cell, Math.round(lerp(y0, y1, k / steps || 0)) * cell, size, size);
          };
          dots(left ? cx - 2 : cx + 2, cy, bend, cy);
          dots(bend, cy, ex, ey);
        }
        // Marker: a hollow square of pixels, solid while its part is in focus.
        ctx.fillStyle = paper;
        ctx.fillRect((cx - 2) * cell, (cy - 2) * cell, cell * 5, cell * 5);
        ctx.fillStyle = color;
        const solid = focus > 0.5 && node.part === focusPart;
        for (let oy2 = -1; oy2 <= 1; oy2++) for (let ox2 = -1; ox2 <= 1; ox2++) if (oy2 || ox2 || solid) ctx.fillRect((cx + ox2) * cell, (cy + oy2) * cell, size, size);
      }
      ctx.globalAlpha = 1;

      // An opened finding: once its evidence lines are laid out, grow a twig to each of them.
      if (opened) {
        const p = placed.find((q) => q.node.leak === opened!.leak);
        const lines = p ? Array.from(p.el.querySelectorAll<HTMLElement>("[data-evidence]")) : [];
        if (p && !opened.twigs && lines.length) {
          const left = p.node.side === "left";
          const twigs: Dot[] = [];
          opened.ends = lines.map((line, j) => {
            const sx = left ? p.edge + 8 : p.edge - 8;
            const sy = p.top + line.offsetTop + 8;
            const at = 0.1 + j * 0.12;
            if (!narrow) {
              const wx = (sx - ox) / s;
              const wy = (sy - oy) / s;
              for (const d of sprout(p.node.anchor.x, p.node.anchor.y, wx, wy, p.node.part, 0.5, 900 + opened!.leak * 10 + j, false)) {
                // Evidence twigs carry the finding's colour all the way to the text.
                const ink = d.ink === INK.dust || d.ink === INK.bark ? ((twigs.length & 1 ? INK.fruit : INK.fruitPale) as Ink) : d.ink;
                twigs.push({ ...d, ink, t: at + d.t * 0.75 });
              }
            }
            return { x: sx, y: sy, at: narrow ? at : at + 0.6 };
          });
          opened.twigs = twigs.sort((a, b) => a.t - b.t);
          request();
        }
        lines.forEach((line, j) => {
          const end = opened!.ends[j];
          line.style.opacity = end ? String(smooth(end.at, end.at + 0.15, opened!.p)) : "0";
        });
      }

      if (status.current && found.current) {
        const f = format(cents);
        if (f !== lastFound) found.current.textContent = lastFound = f;
        status.current.style.opacity = String(smooth(CLOCK.limbs[0], CLOCK.limbs[0] + 0.03, g) * (1 - smooth(CLOCK.yield - 0.01, CLOCK.yield + 0.03, g)));
      }
      if (hero.current) {
        const out = smooth(START + 0.01, START + 0.08, g);
        hero.current.style.opacity = String(1 - out);
        hero.current.style.transform = `translateY(${-out * 40}px)`;
        hero.current.style.visibility = out >= 1 ? "hidden" : "visible";
      }
      if (cue.current) cue.current.style.opacity = String(1 - smooth(START, START + 0.03, g));
      if (yieldRef.current) {
        const on = smooth(CLOCK.yield, CLOCK.yield + 0.05, g);
        yieldRef.current.style.opacity = String(on);
        yieldRef.current.style.transform = `translateY(${(1 - on) * 16}px)`;
        yieldRef.current.style.pointerEvents = on > 0.5 ? "auto" : "none";
        yieldRef.current.style.visibility = on <= 0 ? "hidden" : "visible";
      }
      if (rail.current) {
        const els = rail.current.children;
        for (let i = 0; i < els.length; i++) {
          const el = els[i] as HTMLElement;
          const from = Number(el.dataset.g);
          const to = i + 1 < els.length ? Number((els[i + 1] as HTMLElement).dataset.g) : 2;
          el.dataset.on = String(g >= from - 0.001 && g < to);
        }
      }
    }

    function request() {
      if (!frame) frame = requestAnimationFrame(draw);
    }

    function measure() {
      vw = st!.clientWidth;
      vh = st!.clientHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cell = vw < 640 ? 3 : 4;
      W = vw < 640 ? vw - 32 : vw < 1100 ? 168 : 220;
      cv!.width = Math.round(vw * dpr);
      cv!.height = Math.round(vh * dpr);
      cv!.style.width = `${vw}px`;
      cv!.style.height = `${vh}px`;
      gw = Math.ceil(vw / cell);
      gh = Math.ceil(vh / cell);
      grid = new Uint8Array(gw * gh);
      gpart = new Uint8Array(gw * gh);
      buckets = Array.from({ length: INKS * 2 }, () => new Int32Array(gw * gh));
      for (const el of Object.values(nodeEls.current)) {
        if (!el) continue;
        el.style.width = `${W}px`;
        // Phone labels swap in and out by chapter, so they cross-fade.
        el.style.transition = vw < 640 ? "opacity 250ms" : "";
      }
      if (opened) opened.twigs = null;
      onScroll();
    }

    function onScroll() {
      const r = sec!.getBoundingClientRect();
      scrolled = clamp01(-r.top / Math.max(1, r.height - window.innerHeight));
      // Evidence is a close look at one moment; moving on closes it.
      if (opened?.target && Math.abs(clock() - opened.g) > 0.02) setOpen(null);
      request();
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = st.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
      request();
    };
    const onLeave = () => {
      pointer = null;
      request();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };

    ctl.current = {
      hover: (key, part) => {
        hover = { key, part };
        request();
      },
      open: (leak) => {
        if (leak === null) {
          if (opened) opened.target = 0;
        } else opened = { leak, target: 1, p: 0, g: clock(), twigs: null, ends: [] };
        lastTime = performance.now();
        request();
      },
    };

    // The roots grow on their own when the page opens.
    let introFrame = 0;
    if (!still) {
      const t0 = performance.now();
      const tick = (now: number) => {
        const u = clamp01((now - t0) / 2600);
        intro = START * (1 - (1 - u) ** 3);
        request();
        if (u < 1) introFrame = requestAnimationFrame(tick);
      };
      introFrame = requestAnimationFrame(tick);
    }
    // A pulse every few seconds while the tree is on screen and nothing is open.
    const pulses = still
      ? 0
      : window.setInterval(() => {
          const r = sec.getBoundingClientRect();
          if (document.visibilityState !== "visible" || opened || pulse || r.bottom < 0 || r.top > window.innerHeight) return;
          pulse = performance.now();
          lastTime = pulse;
          request();
        }, 6000);

    const ro = new ResizeObserver(measure);
    ro.observe(st);
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKey);
    st.addEventListener("pointermove", onMove);
    st.addEventListener("pointerleave", onLeave);
    dark.addEventListener("change", onScheme);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(introFrame);
      window.clearInterval(pulses);
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
      st.removeEventListener("pointermove", onMove);
      st.removeEventListener("pointerleave", onLeave);
      dark.removeEventListener("change", onScheme);
    };
  }, [tree, nodes]);

  // Jump to a chapter by scrolling to the point where the clock reads g.
  const jump = (g: number) => {
    const sec = section.current;
    if (!sec) return;
    const top = sec.getBoundingClientRect().top + window.scrollY;
    const travel = sec.offsetHeight - window.innerHeight;
    const at = g <= START ? 0 : clamp01((g - START) / (1 - START) / 1.06);
    window.scrollTo({ top: top + at * travel, behavior: "smooth" });
  };

  const chapters = [
    { g: 0, name: "Roots" },
    { g: CLOCK.trunk[0] + 0.04, name: "Engine" },
    { g: CLOCK.limbs[0], name: "Findings" },
    { g: CLOCK.yield, name: "Yield" },
  ];

  return (
    <section ref={section} aria-label="How LedgerLens works" className="relative" style={{ height: `${SCROLL_HEIGHT_VH}vh` }}>
      <div ref={stage} className="paper sticky top-0 h-[100svh] overflow-hidden" onClick={() => setOpen(null)}>
        <canvas ref={canvas} aria-hidden className="absolute inset-0" />

        <div ref={hero} className="pointer-events-none absolute inset-x-0 top-[13svh] px-4 text-center will-change-transform sm:top-[15svh]">
          <h1 className="display text-[clamp(2.6rem,7.4vw,6.2rem)] leading-[0.95] tracking-[-0.05em]">
            <span className="rise-slot">
              <span>Money does</span>
            </span>
            <span className="rise-slot">
              <span style={{ animationDelay: "120ms" }}>
                grow on <span className="text-signal">trees.</span>
              </span>
            </span>
          </h1>
          <p className="animate-fade mx-auto mt-6 max-w-md text-balance text-[15px] leading-snug text-muted-foreground [animation-delay:500ms]">
            LedgerLens finds where a small business is losing money.
          </p>
        </div>

        {nodes.map((node) => {
          const left = node.side === "left";
          const finding = node.leak !== undefined;
          const isOpen = finding && open === node.leak;
          const Label = finding ? "button" : "div";
          return (
            <div
              key={node.key}
              ref={(e) => void (nodeEls.current[node.key] = e)}
              onPointerEnter={(e) => e.pointerType === "mouse" && ctl.current.hover(node.key, node.part)}
              onPointerLeave={() => ctl.current.hover("", -1)}
              className={cn("halo pointer-events-none absolute left-0 top-0 opacity-0 will-change-transform", left && "sm:text-right")}
            >
              <Label
                {...(finding
                  ? {
                      type: "button" as const,
                      "aria-expanded": isOpen,
                      onClick: (e: React.MouseEvent) => {
                        e.stopPropagation();
                        setOpen(isOpen ? null : node.leak!);
                      },
                    }
                  : {})}
                className={cn("group block w-full text-left", left && "sm:text-right", finding && "cursor-pointer focus-visible:outline-none")}
              >
                <span className="block truncate text-[13px] font-medium leading-[18px] sm:text-[14px]">
                  {node.name}
                  {finding && (
                    <span className={cn("ml-1.5 inline-block font-mono text-[11px] text-faint transition-transform group-hover:text-foreground", isOpen && "rotate-45 text-foreground")}>+</span>
                  )}
                </span>
                <span className="block truncate text-[11.5px] leading-snug text-faint sm:text-[12.5px]">{node.sub}</span>
                {node.value && <span className="mt-0.5 block font-mono text-[11px] tabular text-found sm:text-[12px]">{node.value}</span>}
              </Label>
              {isOpen && (
                <ul className="mt-2.5 space-y-2" onClick={(e) => e.stopPropagation()}>
                  {leaks[node.leak!].evidence.map((line) => (
                    <li key={line} data-evidence className="font-mono text-[11px] leading-[15px] text-muted-foreground opacity-0">
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

        <p ref={status} className="pointer-events-none absolute bottom-5 left-4 font-mono text-[11px] text-faint tabular opacity-0 sm:left-8">
          <span ref={found} className="text-found">
            $0
          </span>{" "}
          found
        </p>

        <div
          ref={yieldRef}
          className="invisible absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-5 px-4 pb-8 opacity-0 sm:px-10 sm:pb-12"
        >
          <p className="display text-[clamp(1.6rem,3.6vw,2.8rem)] leading-[1.02]">
            <span className="tabular text-found">{data.totalAnnual}</span> in year one,
            <span className="block text-faint">from {data.stats.records.toLocaleString("en-US")} records.</span>
          </p>
          <div className="flex gap-2">
            <Button asChild size="lg">
              <Link href="/overview">
                Open the demo <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="https://github.com/aiden-guan/ledger">Source</a>
            </Button>
          </div>
        </div>

        <ol ref={rail} className="absolute right-4 top-1/2 hidden -translate-y-1/2 flex-col gap-3 sm:flex sm:right-8">
          {chapters.map((c, i) => (
            <li key={c.name} data-g={c.g} data-on={i === 0} className="group">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  jump(c.g);
                }}
                className="flex items-center justify-end gap-2.5 font-mono text-[10.5px] text-faint transition-colors hover:text-foreground group-data-[on=true]:text-foreground"
              >
                <span className="opacity-0 transition-opacity group-hover:opacity-100">{c.name}</span>
                <span className="h-px w-3 bg-current transition-[width] group-data-[on=true]:w-6 group-data-[on=true]:bg-signal" />
              </button>
            </li>
          ))}
        </ol>

        <div ref={cue} className="pointer-events-none absolute inset-x-0 bottom-10 flex justify-center">
          <span className="scroll-cue block h-8 w-px bg-foreground/40" />
        </div>
      </div>
    </section>
  );
}
