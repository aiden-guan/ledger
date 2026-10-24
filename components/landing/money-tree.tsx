"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "@/lib/finance/money";
import type { LandingData } from "@/lib/landing/data";
import { type Garden, flowerInk, layGarden, padInk } from "@/lib/landing/garden";
import { DROP_HEART, FINS, GLINT, type KoiDot, type Loop, POND, SPINE, TAIL, TIP, WATER, bayer, condense, dropInk, follow, hash2, headAngle, koiDots, koiHalf, loopAt, ripples, splash, swim } from "@/lib/landing/pond";
import { type River, SHADOW, type Way, banks, centre, currents, layRiver, pace, riverWay, rockEdge, rockInk, sample, track, wayOut } from "@/lib/landing/river";
import { type Anchor, CLOCK, type Dot, type Ink, INK, INK_PRIORITY, PART, growTree, sprout, visibleCount } from "@/lib/landing/tree";
import { isDark, onThemeChange } from "@/lib/theme";
import { cn } from "@/lib/utils/cn";
import { scroller } from "./smooth-scroll";

/*
 * The landing page is one tree, drawn on a pixel grid. Roots are the books the engine reads, the
 * trunk is the engine, each limb is a finding, and orange marks money found. Scroll is the clock:
 * the section is tall, the stage is sticky, and every frame is drawn from the scroll position, so
 * scrolling back un-grows it. Opening a finding grows twigs out to its evidence.
 *
 * Grown, the tree condenses into a drop that falls into still water. Two koi come up and swim the
 * product's two loops, and the page says what each one does. Then the slow loop's koi swims off
 * down a river, around a rock for each kind of trouble the product deals with, to a pond at the
 * bottom that blooms as it arrives. The page ends there.
 */

// Scroll distances, in viewport heights: the tree grows, holds a moment, then the water clock runs
// (w goes from 0 to 1 over WATER_VH) until the koi leaves, and the river takes the rest.
const TREE_VH = 430;
const HOLD_VH = 30;
const WATER_VH = 300;
const RIVER_AT = TREE_VH + HOLD_VH + WATER.leave * WATER_VH;
const RIVER_VH = 380;
/** The last of it, with the koi at rest in the pond. */
const REST_VH = 45;
const TRAVEL_VH = RIVER_AT + RIVER_VH;
const START = CLOCK.roots[1];
const INKS = 13;
/** Scroll px between entries of the koi's pace and camera tables. */
const STEP = 2;
/** Tail beats a second for each koi: the fast loop's swims harder. */
const BEATS = [1.3, 0.8];

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

/** Notes on the water: where the drop lands, then each koi's loop. */
type Note = { key: string; name: string; sub: string; tag?: string; part: number };
const NOTES: Note[] = [
  { key: "forecast", name: "Cash forecast", sub: "The next 90 days, fixes included.", part: POND.water },
  { key: "fast", name: "Every payment", sub: "Screened before it posts.", tag: "fast loop", part: POND.koi(0) },
  { key: "slow", name: "Every morning", sub: "A full investigation, unasked.", tag: "slow loop", part: POND.koi(1) },
];

/** The rocks in the river: trouble a small business runs into, and what LedgerLens does about it. */
const ROCKS = [
  { key: "fake", name: "Fake invoices", sub: "Lookalike payees and new bank details, held." },
  { key: "twice", name: "Paying twice", sub: "Repeat invoices held, refund requests drafted." },
  { key: "costs", name: "Rising costs", sub: "Supplier and subscription rises, to the cent." },
  { key: "price", name: "Underpricing", sub: "Competitors' prices read, a new price ready." },
  { key: "ask", name: "Questions about the books", sub: "Answered with the records behind each claim." },
];

// Ink colours by INK index: bark, shadow, rust, moss, light moss, fruit, pale fruit, dust, navy,
// then the pond's petal, pale petal, gold and violet.
const PALETTES = {
  light: { inks: ["#9b958b", "#161616", "#7a3524", "#1f63e6", "#86b4f6", "#ee7f2d", "#f5b867", "#bcb7ad", "#13307a", "#e0457b", "#f4abc2", "#e5a21a", "#6a4bd0"], bg: [246, 244, 238] },
  dark: { inks: ["#8a847a", "#ebe5d9", "#c0644a", "#4f8dff", "#2f5fc0", "#ff9440", "#b06a2e", "#58544d", "#9db8ff", "#ff6b9d", "#9c3a60", "#ffc23d", "#9b82ff"], bg: [13, 13, 14] },
};
/** What each ink looks like further down in the water. */
const DEEP: Ink[] = [INK.dust, INK.bark, INK.fruitPale, INK.mossLight, INK.dust, INK.fruitPale, INK.dust, INK.dust, INK.moss, INK.petalPale, INK.dust, INK.fruitPale, INK.dust];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number) => {
  const u = clamp01((v - a) / (b - a));
  return u * u * (3 - 2 * u);
};
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
/** Scroll distance, in viewport heights, at which the tree reaches growth time g. */
const reachAt = (g: number) => (g <= START ? 0 : ((g - START) / (1 - START)) * TREE_VH);

function hex(c: string) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const BYTES = new Uint8ClampedArray(4);
const PIXEL = new Uint32Array(BYTES.buffer);
/** A colour pushed `k` of the way toward the paper, as one pixel of image data. */
function pixel(c: string, bg: number[], k: number) {
  const [r, g, b] = hex(c);
  BYTES[0] = lerp(r, bg[0], k);
  BYTES[1] = lerp(g, bg[1], k);
  BYTES[2] = lerp(b, bg[2], k);
  BYTES[3] = 255;
  return PIXEL[0];
}

type Controls = { hover: (key: string, part: number) => void; open: (leak: number | null) => void };

export function MoneyTree({ data }: { data: LandingData }) {
  const leaks = useMemo(() => data.leaks.slice(0, 4), [data.leaks]);
  const tree = useMemo(() => {
    const max = Math.max(1, ...leaks.map((l) => l.cents));
    return growTree(leaks.map((l) => l.cents / max));
  }, [leaks]);
  // The two loops' koi, then the three that live in the pond at the end.
  const fish = useMemo(() => [koiDots("fast", 31), koiDots("slow", 47), koiDots("fast", 53), koiDots("gold", 71), koiDots("slow", 89)], []);
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
  const closing = useRef<HTMLDivElement>(null);
  const foot = useRef<HTMLElement>(null);
  const rail = useRef<HTMLOListElement>(null);
  const nodeEls = useRef<Record<string, HTMLDivElement | null>>({});
  const noteEls = useRef<Record<string, HTMLDivElement | null>>({});
  const rockEls = useRef<(HTMLDivElement | null)[]>([]);
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
    // The grid is drawn as a small image, one pixel a cell, then scaled up, and the hairlines
    // between pixels are cleared with a repeating tile.
    const pix = document.createElement("canvas");
    const pctx = pix.getContext("2d");
    const tile = document.createElement("canvas");
    if (!pctx) return;
    let hairlines: CanvasPattern | null = null;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let pal = isDark() ? PALETTES.dark : PALETTES.light;
    const onScheme = () => {
      pal = isDark() ? PALETTES.dark : PALETTES.light;
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
    let gprio = new Uint8Array(0);
    let img = new ImageData(1, 1);
    let px32 = new Uint32Array(img.data.buffer);
    // Each ink in focus and faded back, and what they were worked out for.
    const colors = new Uint32Array(INKS * 2);
    let colorsFor = { pal, focus: -1 };
    // Shapes on the water that have stopped changing, kept as cells.
    const kept = new WeakMap<object, { fx: number; fy: number; tilt: number; night: boolean; cells: Int32Array }>();
    let intro = still ? START : 0;
    let scrolled = 0;
    let onScreen = true;
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

    // The water, laid out by measure(). The drop forms where the tree stood, falls to the water at
    // splashY, and the view then swings overhead with the water's centre moving up to pondY.
    let drop = { x: 0, y: 0, r: 20 };
    let splashY = 0;
    let pondY = 0;
    let flat = 0.8;
    let reach = 0;
    let loops: Loop[] = [];
    let lens = [0, 0];
    // Phase added to a koi's loop after it comes back to it from the river, so it carries on from there.
    const shift = [0, 0];
    // The river koi's tail beat, as a phase, since its beat changes as it slows.
    let tail = 0;
    // For the condense: each tree dot on screen in the grown tree, where it lands in the drop, the
    // drop's ink there, and when it sets off.
    let from = new Float32Array(0);
    let to = new Float32Array(0);
    let toInk = new Int8Array(0);
    let delay = new Float32Array(0);
    const spines = fish.map(() => new Float64Array(SPINE * 4));
    // Where the water's centre is on screen, and how flat it looks (1 is straight down on it).
    let surface = { x: 0, y: 0, tilt: 0.3 };
    // Small rings that spread on their own: koi touching the surface, and the pointer.
    let rings: { x: number; z: number; at: number; size: number }[] = [];
    const born = performance.now();
    const nextRing = [born + 2400, born + 4100];
    let lastRing: { x: number; y: number } | null = null;

    // The river below the pond and the pond at its end, laid out by measure(): the river, the koi's
    // way down it, the banks as dots, and the garden.
    let river: River | null = null;
    let riverPath: { xy: Float64Array; mouth: number } = { xy: new Float64Array(0), mouth: 0 };
    let garden: Garden | null = null;
    let bankDots = new Float32Array(0);
    let pebbles: { x: number; y: number; ink: Ink }[] = [];
    // Where the camera stops, and where it holds the koi's snout on the way down.
    let bottomDescent = 0;
    let hold = 0;
    // Set while the koi is off its loop: where it left it, its way, and the pace and camera tables
    // for it, with the scroll at which it passes the river's mouth.
    let journey: { angle: number; way: Way; swum: Float64Array; cam: Float64Array; mouthAt: number } | null = null;

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

    // Distance scrolled into the section, in viewport heights, and the two clocks it drives.
    const travel = () => scrolled * TRAVEL_VH;
    const clock = () => (scrolled > 0 ? Math.max(intro, START + (1 - START) * clamp01(travel() / TREE_VH)) : intro);
    const water = () => clamp01((travel() - TREE_VH - HOLD_VH) / WATER_VH);
    /** Scroll px since the koi left its loop (negative before). */
    const downstream = () => ((travel() - RIVER_AT) * vh) / 100;
    const loopNow = (k: number) => (shift[k] ? { ...loops[k], phase: loops[k].phase + shift[k] } : loops[k]);

    /** The koi leaves its loop from wherever it is on it, at `angle`. */
    function setOff(angle: number) {
      const way = wayOut(loops[1], angle, lens[1], riverPath);
      const total = (RIVER_VH * vh) / 100;
      const swum = pace(way, ((RIVER_VH - REST_VH) * vh) / 100, STEP, total);
      const cam = track(way, swum, hold, bottomDescent, STEP);
      let k = 0;
      while (k < swum.length - 1 && swum[k] < way.mouth) k++;
      journey = { angle, way, swum, cam, mouthAt: k * STEP };
    }

    function draw() {
      frame = 0;
      if (!ctx) return;
      const now = performance.now();
      const dt = Math.min(64, now - lastTime);
      lastTime = now;
      const g = clock();
      const w = water();
      const t = still ? 0 : (now - born) / 1000;
      // The drop and the koi are shaded by light, not by contrast: on a dark screen their deepest
      // and palest blues trade places, and the highlight is drawn instead of left as paper.
      const night = pal === PALETTES.dark;
      const shade = (ink: number) => (!night ? ink : ink === INK.navy ? INK.mossLight : ink === INK.mossLight ? INK.navy : ink);
      /** The same for stone, whose pale and dark greys trade places too. */
      const stone = (ink: number) => (!night ? ink : ink === INK.dust ? INK.bark : ink === INK.bark ? INK.dust : shade(ink));
      const { s, ox, oy } = camera(g);
      const X = (x: number) => ox + x * s;
      const Y = (y: number) => oy + y * s;
      const narrow = vw < 640;
      // How far the tree has condensed into the drop.
      const cl = clamp01((w - WATER.condense[0]) / (WATER.condense[1] - WATER.condense[0]));

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

      // Lay everything into the grid; when two dots share a cell the higher one wins.
      grid.fill(0);
      const put = (cx: number, cy: number, ink: number, part: number, z = INK_PRIORITY[ink]) => {
        if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) return;
        const i = cy * gw + cx;
        if (grid[i] === 0 || z >= gprio[i]) {
          grid[i] = ink + 1;
          gpart[i] = part;
          gprio[i] = z;
        }
      };
      /** A dot at a point on screen, `rc` cells in radius. */
      const dab = (x: number, y: number, rc: number, ink: number, part: number) => {
        const cx = Math.floor(x / cell);
        const cy = Math.floor(y / cell);
        if (rc < 0.85) put(cx, cy, ink, part);
        else {
          const r = Math.ceil(rc);
          const r2 = rc * rc;
          for (let oy2 = -r; oy2 <= r; oy2++) for (let ox2 = -r; ox2 <= r; ox2++) if (ox2 * ox2 + oy2 * oy2 <= r2) put(cx + ox2, cy + oy2, ink, part);
        }
      };
      const R = 70;
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
        dab(x, y, (d.r * s * (0.55 + 0.45 * age)) / cell, ink, d.part);
      };
      /** An ellipse of pixels on the water, thinned to `strength` by a pattern that holds still as it grows. */
      const ring = (x0: number, y0: number, r: number, tilt: number, strength: number, ink: number, part: number, z: number, salt: number) => {
        if (r <= 0 || strength <= 0.02) return;
        const steps = Math.max(12, Math.ceil((Math.PI * 2 * r) / (cell * 0.8)));
        for (let j = 0; j < steps; j++) {
          const a = (j / steps) * Math.PI * 2;
          if (strength < 1 && hash2(Math.round(a * 90), salt) > strength) continue;
          put(Math.floor((x0 + Math.cos(a) * r) / cell), Math.floor((y0 + Math.sin(a) * r * tilt) / cell), ink, part, z);
        }
      };
      /** The drop, centred on (x, y) and stretched by (sx, sy), with `cover` of its pixels drawn and none below `water`. */
      const layDrop = (x: number, y: number, r: number, sx: number, sy: number, cover: number, water: number) => {
        const cx0 = Math.floor(x / cell);
        const cy0 = Math.floor(y / cell);
        const x0 = Math.floor((x - r * sx * 1.1) / cell);
        const x1 = Math.ceil((x + r * sx * 1.1) / cell);
        const y0 = Math.floor((y - r * sy * (TIP + 0.1)) / cell);
        const y1 = Math.min(Math.ceil((y + r * sy * 1.1) / cell), Math.floor(water / cell) - 1);
        for (let cy = y0; cy <= y1; cy++) {
          for (let cx = x0; cx <= x1; cx++) {
            if (cover < 1 && hash2(cx * 3 + 1, cy * 7 + 2) > cover) continue;
            const ink = dropInk(((cx + 0.5) * cell - x) / (r * sx), ((cy + 0.5) * cell - y) / (r * sy), bayer(cx - cx0, cy - cy0), hash2(cx - cx0, cy - cy0));
            if (ink >= 0) put(cx, cy, shade(ink), POND.water, 8);
            else if (ink === GLINT && night) put(cx, cy, INK.shadow, POND.water, 8);
          }
        }
      };

      if (cl === 0) {
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
      } else if (cl < 1) {
        // The tree draws in on itself: each dot heads for its place in the drop, turning a little on
        // the way, and takes on the water's colour as it arrives.
        for (let i = 0; i < tree.dots.length; i++) {
          const d = tree.dots[i];
          const p = clamp01((cl - delay[i]) / 0.6);
          const e = p * p * (3 - 2 * p);
          const ink = p > 0.6 ? toInk[i] : d.ink;
          if (ink < 0 && p > 0.85) continue;
          const drawn = ink < 0 ? INK.mossLight : p > 0.6 ? shade(ink) : ink;
          const dx = (from[i * 2] - to[i * 2]) * (1 - e);
          const dy = (from[i * 2 + 1] - to[i * 2 + 1]) * (1 - e);
          const turn = 1.2 * e * (1 - e);
          const x = to[i * 2] + dx * Math.cos(turn) - dy * Math.sin(turn);
          const y = to[i * 2 + 1] + dx * Math.sin(turn) + dy * Math.cos(turn);
          dab(x, y, ((d.r * s) / cell) * (1 - e), drawn, d.part);
        }
      }

      // The ground: a dotted row of pixels, gone once the tree has drawn in.
      const groundRow = Math.floor(Y(0) / cell) + 1;
      if (cl < 0.3 && groundRow >= 0 && groundRow < gh)
        for (let cx = 0; cx < gw; cx += 2) if (!grid[groundRow * gw + cx] && hash2(cx, 1) >= cl / 0.3) put(cx, groundRow, INK.dust, 255);

      // The water: the drop fills in as the last of the tree arrives, falls, and goes in.
      const fall = clamp01((w - WATER.fall[0]) / (WATER.fall[1] - WATER.fall[0]));
      const under = clamp01((w - WATER.impact) / 0.02);
      const overhead = smooth(WATER.tilt[0], WATER.tilt[1], w);
      // Down the river, the camera follows the koi once it leaves its loop.
      const u = downstream();
      if (u > 0 && !journey && loops.length) setOff(headAngle(loopNow(1), t));
      else if (u <= 0 && journey) {
        // Back on its loop where it left it, carrying on from there.
        shift[1] = journey.angle - headAngle(loops[1], t);
        journey = null;
      }
      const descent = journey ? sample(journey.cam, STEP, u) : 0;
      surface = { x: vw / 2, y: lerp(splashY, pondY, overhead) - descent * flat, tilt: lerp(0.3, flat, overhead) };
      // Moving in whole pixels keeps what stands still on the water from shimmering.
      if (descent > 0) surface.y = Math.round(surface.y / cell) * cell;
      if (cl > 0.75 && under < 1) {
        // Stretched a little by the fall; once it meets the water it keeps going, and the water
        // hides what has gone under.
        const sy = 1 + 0.18 * fall;
        const sx = 1 - 0.08 * fall;
        const y = lerp(drop.y, splashY - drop.r * sy, fall * fall) + under * drop.r * sy * (TIP + 1.1);
        layDrop(drop.x, y, drop.r, sx, sy, Math.min(1, (cl - 0.75) / 0.25), w >= WATER.impact ? splashY : Infinity);
        // A short streak above it while it falls.
        if (fall > 0 && fall < 1) {
          const top = y - drop.r * sy * TIP;
          for (let k = 1; k <= 6; k++) if (hash2(k, 9) < (1 - k / 7) * fall * 1.4) put(Math.floor(drop.x / cell), Math.floor((top - k * cell * (1 + 2 * fall)) / cell), k < 3 ? INK.mossLight : INK.dust, POND.water, 2);
        }
      }
      if (w > WATER.impact) {
        const { x: cx, y: cy, tilt } = surface;
        const { drops, column } = splash(w, drop.r);
        for (const p of drops) {
          if (p.ring > 0) ring(cx + p.x, cy + p.z * tilt, p.ring, tilt, p.a, INK.mossLight, POND.water, 4, 3);
          else put(Math.floor((cx + p.x) / cell), Math.floor((cy + p.z * tilt - p.h) / cell), INK.moss, POND.water, 8);
        }
        for (let y = 0; y < column; y += cell) put(Math.floor(cx / cell), Math.floor((cy - y) / cell), y > column - cell * 2 ? INK.mossLight : INK.moss, POND.water, 8);
        for (const q of ripples(w, reach, drop.r)) ring(cx, cy, q.r, tilt, q.a, [INK.moss, INK.mossLight, INK.moss, INK.dust][q.k], POND.water, 6 - q.k, 11 + q.k);
      }

      /** Where a point on the water is on screen, and a pixel there. */
      const sx = (x: number) => surface.x + x;
      const sy = (y: number) => surface.y + y * surface.tilt;
      const plot = (x: number, y: number, ink: number, part: number, z: number) => put(Math.floor(sx(x) / cell), Math.floor(sy(y) / cell), ink, part, z);
      /** A shape on the water around (x, y), out to `reach` px: `ink` gives each pixel's ink from its offset and dither, or -1. */
      const raster = (x: number, y: number, reach: number, ink: (lx: number, ly: number, d: number, cx: number, cy: number) => number, part: number, z: number) => {
        const px = sx(x);
        const py = sy(y);
        const cx0 = Math.floor(px / cell);
        const cy0 = Math.floor(py / cell);
        const span = Math.ceil(reach / cell) + 1;
        if (cy0 + span < 0 || cy0 - span >= gh || cx0 + span < 0 || cx0 - span >= gw) return;
        for (let cy = Math.max(0, cy0 - span); cy <= Math.min(gh - 1, cy0 + span); cy++) {
          for (let cx = Math.max(0, cx0 - span); cx <= Math.min(gw - 1, cx0 + span); cx++) {
            const v = ink((cx + 0.5) * cell - px, ((cy + 0.5) * cell - py) / surface.tilt, bayer(cx - cx0, cy - cy0), cx - cx0, cy - cy0);
            if (v >= 0) put(cx, cy, v, part, z);
          // Shade on the water beneath it.
          else if (v === SHADOW) put(cx, cy, INK.dust, part, 1);
          }
        }
      };
      /** As raster, for a shape that has stopped changing: its cells are worked out once and kept, under `key`. */
      const keep = (key: object, x: number, y: number, reach: number, ink: (lx: number, ly: number) => number, part: number, z: number) => {
        const px = sx(x);
        const py = sy(y);
        const cx0 = Math.floor(px / cell);
        const cy0 = Math.floor(py / cell);
        const fx = px - cx0 * cell;
        const fy = py - cy0 * cell;
        let k = kept.get(key);
        if (!k || Math.abs(k.fx - fx) > 1e-6 || Math.abs(k.fy - fy) > 1e-6 || k.tilt !== surface.tilt || k.night !== night) {
          const span = Math.ceil(reach / cell) + 1;
          const cells: number[] = [];
          for (let oy = -span; oy <= span; oy++) {
            for (let ox = -span; ox <= span; ox++) {
              const v = ink((ox + 0.5) * cell - fx, ((oy + 0.5) * cell - fy) / surface.tilt);
              if (v >= 0 || v === SHADOW) cells.push(ox, oy, v);
            }
          }
          k = { fx, fy, tilt: surface.tilt, night, cells: Int32Array.from(cells) };
          kept.set(key, k);
        }
        const c = k.cells;
        for (let i = 0; i < c.length; i += 3) {
          if (c[i + 2] >= 0) put(cx0 + c[i], cy0 + c[i + 1], c[i + 2], part, z);
          else put(cx0 + c[i], cy0 + c[i + 1], INK.dust, part, 1);
        }
      };
      // The stretch of the water on screen.
      const yTop = -surface.y / surface.tilt;
      const yBot = (vh - surface.y) / surface.tilt;

      /** A koi along spine `sp`, at (ox, oy) on the water, `rise` of the way up from the deep. `flap` sets its fins' phase. */
      const drawKoi = (dots: KoiDot[], sp: Float64Array, len: number, rise: number, part: number, flap: number, ox = 0, oy = 0) => {
        const at = (s: number) => {
          const f = (s / TAIL) * (SPINE - 1);
          const i0 = Math.min(SPINE - 2, Math.floor(f));
          const a = i0 * 4;
          const b = a + 4;
          const v = f - i0;
          return [lerp(sp[a], sp[b], v), lerp(sp[a + 1], sp[b + 1], v), lerp(sp[a + 2], sp[b + 2], v), lerp(sp[a + 3], sp[b + 3], v)];
        };
        // Where each fin joins the body, and which way it points, this frame.
        const fins = FINS.map((F, i) => {
          if (!i) return null;
          const [px, py, nx, ny] = at(F.s);
          const side = i % 2 ? 1 : -1;
          const sweep = F.sweep + (i < 3 ? 0.22 : 0.12) * Math.sin(t * 3.6 + flap + (i < 3 ? 0 : 1.1));
          // Out to the side, swept back toward the tail.
          const dx = nx * side * Math.cos(sweep) - ny * Math.sin(sweep);
          const dy = ny * side * Math.cos(sweep) + nx * Math.sin(sweep);
          const root = koiHalf(F.s) * len * 0.85 * side;
          return { x: px + nx * root, y: py + ny * root, dx, dy, len: F.len * len, wid: F.wid * len };
        });
        for (const d of dots) {
          if (d.h > rise * 1.2) continue;
          let x: number;
          let y: number;
          if (d.fin === 0) {
            const [px, py, nx, ny] = at(d.s);
            x = px + nx * d.o * len;
            y = py + ny * d.o * len;
          } else {
            const f = fins[d.fin]!;
            x = f.x + f.dx * d.s * f.len - f.dy * d.o * f.wid;
            y = f.y + f.dy * d.s * f.len + f.dx * d.o * f.wid;
          }
          const ink = rise < 1 && d.h > rise * rise ? DEEP[d.ink] : d.ink;
          put(Math.floor(sx(ox + x) / cell), Math.floor(sy(oy + y) / cell), shade(ink), part, d.z);
        }
      };

      // The koi, each on its loop. They come up out of the deep a few dots at a time, pale at first.
      // The slow loop's koi may be off down the river.
      let headY = -Infinity;
      for (let k = 0; k < 2; k++) {
        const rise = smooth(WATER.koi[k][0], WATER.koi[k][1], w);
        if (rise <= 0) continue;
        const part = POND.koi(k);
        // The loop draws itself once its note is due, starting from the note's marker.
        const traced = smooth(WATER.notes[k] - 0.06, WATER.notes[k] + 0.02, w);
        if (traced > 0) {
          const start = k === 0 ? Math.PI : 0;
          const steps = Math.ceil((Math.PI * 2 * loops[k].r) / (cell * 3));
          for (let j = 0; j <= steps * traced; j++) {
            const [x, y] = loopAt(loops[k], start + (j / steps) * Math.PI * 2);
            plot(x, y, INK.dust, part, 1);
          }
        }
        const len = lens[k] * (0.86 + 0.14 * rise);
        let sp: Float64Array;
        if (k === 1 && journey) {
          const s = sample(journey.swum, STEP, u);
          // Its tail slows as it comes to rest. The beat is kept as a phase, so slowing never jumps it.
          const resting = smooth(journey.way.end - lens[1] * 0.9, journey.way.end, s);
          if (!still) tail += (dt / 1000) * lerp(1.05, 0.45, resting);
          sp = follow(journey.way.xy, journey.way.at, s, len, 1, tail, lerp(1, 0.6, resting), spines[k]);
          headY = sp[1];
        } else sp = swim(loopNow(k), len, BEATS[k], t, spines[k]);
        drawKoi(fish[k], sp, len, rise, part, k * 1.7);
        // Now and then a koi touches the surface.
        if (!still && rise >= 1 && now > nextRing[k]) {
          rings.push({ x: sp[0], z: sp[1], at: now, size: len * 0.5 });
          nextRing[k] = now + 3200 + hash2(k, Math.floor(now)) * 3200;
        }
      }

      // The river: its banks, the current, and the rocks, from where the banks close in to the mouth.
      if (river && journey) {
        const shown = smooth(0, vh * 0.25, u);
        for (let i = 0; i < bankDots.length; i += 2) {
          const y = bankDots[i + 1];
          if (y < yTop - 8 || y > yBot + 8 || (shown < 1 && hash2(i, 41) > shown)) continue;
          plot(bankDots[i], y, INK.dust, POND.water, 2);
        }
        pebbles.forEach((p, i) => {
          if (p.y > yTop - 8 && p.y < yBot + 8 && (shown >= 1 || hash2(i, 43) < shown)) plot(p.x, p.y, stone(p.ink), POND.water, 2);
        });
        if (yBot > river.top && yTop < river.bottom) {
          currents(river, t, yTop - 20, yBot + 20).forEach((c, i) => {
            if (c.fade < 1 && hash2(i, 47) > c.fade) return;
            for (let j = 0; j < 3; j++) plot(c.x + c.dx * cell * j, c.y + c.dy * cell * j, INK.mossLight, POND.water, 1);
          });
        }
        river.rocks.forEach((rock, i) => {
          if (rock.y + rock.r * 3.5 < yTop || rock.y - rock.r * 1.4 > yBot) return;
          const part = POND.rock(i);
          raster(rock.x, rock.y, rock.r * 1.5, (lx, ly, d, ox, oy) => {
            const ink = rockInk(lx, ly, rock, d, hash2(ox, oy + i * 97));
            // On a dark screen the wet blue side is half grey, or it would glow.
            if (ink === INK.navy && night && (ox + oy) & 1) return INK.dust;
            return ink >= 0 ? stone(ink) : ink;
          }, part, 10);
          // Water piling up on its upstream side, and its wake running off behind it.
          for (let j = 0; j < 15; j++) {
            if (hash2(j, Math.floor(t * 3) + i * 31) > 0.72) continue;
            const a = -Math.PI / 2 + (j / 14 - 0.5) * 2.7;
            const e = rockEdge(rock, a) + cell * 1.6;
            plot(rock.x + Math.cos(a) * e, rock.y + Math.sin(a) * e * 0.86, INK.mossLight, part, 3);
          }
          for (let j = 0; j < 10; j++) {
            const v = (j + ((t * 0.7 + i * 0.37) % 1)) / 10;
            for (const side of [-1, 1]) {
              if (hash2(j * 2 + (side > 0 ? 1 : 0), i + 5) > (1 - v) * 1.15) continue;
              plot(rock.x + side * rock.r * (0.96 + 0.55 * v), rock.y + rock.r * (0.2 + 2.6 * v), INK.mossLight, part, 3);
            }
          }
        });
      }

      // The pond at the bottom. It blooms from the mouth as the koi swims in.
      let bloom = 0;
      if (garden && journey && yBot > garden.top - 60) {
        const g0 = garden;
        bloom = clamp01((u - journey.mouthAt) / (((RIVER_VH - 8) * vh) / 100 - journey.mouthAt));
        const f = bloom;
        const part = POND.garden;
        // The bloom's front: rings running out into the pond from the mouth.
        if (f > 0 && f < 0.62) {
          const k = Math.sqrt(f / 0.62);
          for (const [lag, ink, strength] of [[0, INK.mossLight, 0.9], [cell * 6, INK.dust, 0.45]] as const) {
            const r = Math.max(0, k * g0.reach - lag);
            const steps = Math.ceil((Math.PI * r) / (cell * 0.8));
            for (let j = 0; j <= steps; j++) {
              if (hash2(j, 21 + lag) > (1 - k) * strength) continue;
              const a = (j / steps) * Math.PI;
              plot(g0.mouth.x + Math.cos(a) * r, g0.mouth.y + Math.sin(a) * r, ink, part, 4);
            }
          }
        }
        // Light on the water, catching and letting go.
        for (const g of g0.glints) {
          if (f < g.at || hash2(Math.round(g.x), 51) > smooth(g.at, g.at + 0.15, f)) continue;
          const x = g.x + g.rx * Math.sin(g.phase + g.speed * t);
          const on = still ? 1 : 0.5 + 0.5 * Math.sin(g.phase * 3 + t * g.speed * 2.2);
          for (let j = 0; j < g.len; j++) if (on > 0.3 + j * 0.2) plot(x + j * cell, g.y, g.ink, part, 2);
        }
        for (const b of g0.bushes) {
          const e = smooth(b.at, b.at + 0.2, f);
          if (e <= 0) continue;
          const cx0 = Math.floor(sx(b.x) / cell);
          const cy0 = Math.floor(sy(b.y) / cell);
          if (cy0 < -40 || cy0 > gh + 40) continue;
          for (const d of b.dots) if (d.h < e) put(cx0 + Math.round(d.x / cell), cy0 + Math.round(d.y / cell), d.ink, part, 10);
        }
        // Pads and flowers are worked out afresh only while they open.
        for (const p of g0.pads) {
          const e = smooth(p.at, p.at + 0.2, f);
          if (e <= 0) continue;
          const size = 1 + 2.2 * (e - 1) ** 3 + 1.2 * (e - 1) ** 2;
          const ink = (lx: number, ly: number) => {
            const v = padInk(lx, ly, p, size, cell);
            return v >= 0 ? shade(v) : v;
          };
          if (e < 1) raster(p.x, p.y, p.r * size + cell * 3, ink, part, 11);
          else keep(p, p.x, p.y, p.r + cell * 3, ink, part, 11);
        }
        for (const fl of g0.flowers) {
          const e = smooth(fl.at, fl.at + 0.22, f);
          const ink = (lx: number, ly: number) => flowerInk(lx, ly, fl, e, cell);
          if (e > 0 && e < 1) raster(fl.x, fl.y, fl.r + cell, ink, part, 13);
          else if (e >= 1) keep(fl, fl.x, fl.y, fl.r + cell, ink, part, 13);
        }
        g0.koi.forEach((k, i) => {
          const rise = smooth(k.at, k.at + 0.16, f);
          if (rise <= 0) return;
          const len = k.len * (0.86 + 0.14 * rise);
          drawKoi(fish[2 + i], swim(k.loop, len, 0.7, t, spines[2 + i]), len, rise, part, i * 2.3, k.x, k.y);
        });
        for (const p of g0.petals) {
          if (f < p.at) continue;
          const a = p.phase + p.speed * t;
          const x = p.x + p.rx * Math.cos(a);
          const y = p.y + p.ry * Math.sin(a);
          plot(x, y, p.ink, part, 12);
          if (f > p.at + 0.05) plot(x + (Math.cos(a * 2) > 0 ? cell : 0), y + (Math.cos(a * 2) > 0 ? 0 : cell), p.ink, part, 12);
        }
      }
      rings = rings.filter((q) => now - q.at < 1900);
      for (const q of rings) {
        const u = (now - q.at) / 1900;
        ring(surface.x + q.x, surface.y + q.z * surface.tilt, u * q.size, surface.tilt, (1 - u) * 0.9, INK.mossLight, POND.water, 4, 5);
        ring(surface.x + q.x, surface.y + q.z * surface.tilt, Math.max(0, u - 0.18) * q.size, surface.tilt, (1 - u) * 0.5, INK.dust, POND.water, 3, 6);
      }

      // Each cell becomes one pixel of a small image, faded toward the paper where out of focus. It
      // is drawn up to size in one go, and a hairline is cleared between neighbouring pixels.
      if (colorsFor.pal !== pal || colorsFor.focus !== focus) {
        for (let k = 0; k < INKS; k++) {
          colors[k * 2] = pixel(pal.inks[k], pal.bg, 0);
          colors[k * 2 + 1] = pixel(pal.inks[k], pal.bg, 0.8 * focus);
        }
        colorsFor = { pal, focus };
      }
      const total = gw * gh;
      const faded = focus > 0;
      for (let i = 0; i < total; i++) {
        const v = grid[i];
        px32[i] = v ? colors[(v - 1) * 2 + (faded && gpart[i] !== focusPart ? 1 : 0)] : 0;
      }
      pctx!.putImageData(img, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv!.width, cv!.height);
      ctx.imageSmoothingEnabled = false;
      const step = cell * dpr;
      ctx.drawImage(pix, 0, 0, gw * step, gh * step);
      if (hairlines) {
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = hairlines;
        ctx.fillRect(0, 0, cv!.width, cv!.height);
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const size = cell - 1 / dpr;

      const paper = `rgb(${pal.bg.join(" ")})`;
      /** Dotted pixels from a marker out to a label's first line, with one bend. */
      const leader = (cx: number, cy: number, ex: number, ey: number, left: boolean, color: string) => {
        if (narrow || (Math.abs(ex - cx) <= 3 && Math.abs(ey - cy) <= 1)) return;
        ctx.fillStyle = color;
        const bend = left ? Math.max(ex + 3, Math.min(cx - 3, ex + 6)) : Math.min(ex - 3, Math.max(cx + 3, ex - 6));
        const dots = (x0: number, y0: number, x1: number, y1: number) => {
          const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
          for (let k = 0; k <= steps; k += 2) ctx.fillRect(Math.round(lerp(x0, x1, k / steps || 0)) * cell, Math.round(lerp(y0, y1, k / steps || 0)) * cell, size, size);
        };
        dots(left ? cx - 2 : cx + 2, cy, bend, cy);
        dots(bend, cy, ex, ey);
      };
      /** A hollow square of pixels, solid while what it marks is in focus. */
      const marker = (cx: number, cy: number, color: string, solid: boolean) => {
        ctx.fillStyle = paper;
        ctx.fillRect((cx - 2) * cell, (cy - 2) * cell, cell * 5, cell * 5);
        ctx.fillStyle = color;
        for (let oy2 = -1; oy2 <= 1; oy2++) for (let ox2 = -1; ox2 <= 1; ox2++) if (oy2 || ox2 || solid) ctx.fillRect((cx + ox2) * cell, (cy + oy2) * cell, size, size);
      };

      // Labels. Roots and trunk sit beside their markers; findings stand in a column clear of the
      // canopy, pushed apart so they never overlap, with a dotted leader back to the tree. They all
      // go as the tree draws in.
      const gone = smooth(0, 0.035, w);
      const colLeft = X(tree.canopy.minX) - 22;
      const colRight = X(tree.canopy.maxX) + 22;
      type Placed = { node: Node; el: HTMLDivElement; vis: number; ax: number; ay: number; edge: number; top: number; h: number };
      const placed: Placed[] = [];
      let cents = 0;
      for (const node of nodes) {
        const el = nodeEls.current[node.key];
        if (!el) continue;
        let vis = smooth(node.at, node.at + 0.025, g) * (1 - gone);
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

      const dim = (part: number) => (focus > 0 && part !== focusPart ? 1 - 0.8 * focus : 1);
      for (const p of placed) {
        const { node, el, vis, ax, ay, edge, top } = p;
        const left = node.side === "left";
        el.style.opacity = String(vis * dim(node.part));
        el.style.transform = `translate(${Math.round(left && !narrow ? edge - W : edge)}px, ${Math.round(top)}px)`;
        el.style.pointerEvents = vis > 0.6 ? "auto" : "none";
        const shown = smooth(node.at, node.at + 0.025, g) * (1 - gone);
        if (shown <= 0.001) continue;
        ctx.globalAlpha = shown * dim(node.part);
        const color = pal.inks[node.cents ? INK.fruit : INK.moss];
        const cx = Math.floor(ax / cell);
        const cy = Math.floor(ay / cell);
        leader(cx, cy, Math.floor((left ? edge + 6 : edge - 6) / cell), Math.floor((top + 9) / cell), left, color);
        marker(cx, cy, color, focus > 0.5 && node.part === focusPart);
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

      // Notes on the water. Where the drop went in, while the ripples spread; then each loop, from a
      // marker on it that fills as its koi swims past. On the way down the river they go up and away
      // with the pond, fading before they reach the header.
      const away = (y: number) => (narrow ? 1 - smooth(0, vh * 0.12, u) : descent > 0 ? smooth(64, 140, y) : 1);
      const notes = NOTES.map((note, i) => {
        const el = noteEls.current[note.key];
        const vis =
          i === 0
            ? smooth(WATER.forecast[0], WATER.forecast[0] + 0.02, w) * (1 - smooth(WATER.forecast[1] - 0.03, WATER.forecast[1], w))
            : smooth(WATER.notes[i - 1], WATER.notes[i - 1] + 0.02, w);
        let ax = surface.x;
        let ay = surface.y;
        let edge = ax + 14;
        if (i > 0) {
          const [x, y] = loopAt(loops[i - 1], i === 1 ? Math.PI : 0);
          ax = surface.x + x;
          ay = surface.y + y * surface.tilt;
          // Clear of the outer loop and the fins of the koi that swims it.
          const outside = loops[1].r * 1.11 + lens[1] * 0.3 + 16;
          edge = i === 1 ? Math.max(16 + W, Math.min(ax - 24, surface.x - outside)) : Math.min(vw - 16 - W, Math.max(ax + 24, surface.x + outside));
        }
        return { note, el, vis, ax, ay, edge, top: ay - 9, left: i === 1 };
      });
      if (narrow) {
        let y = surface.y + loops[1].r * loops[1].squash * 1.11 * surface.tilt + lens[1] * 0.2 + 20;
        for (const n of notes) {
          if (n.vis <= 0.01 || !n.el) continue;
          n.edge = 16;
          n.top = y;
          y += n.el.offsetHeight + 12;
        }
      }
      for (const n of notes) {
        if (!n.el) continue;
        n.vis *= away(n.top);
        n.el.style.opacity = String(n.vis * dim(n.note.part));
        n.el.style.transform = `translate(${Math.round(n.left && !narrow ? n.edge - W : n.edge)}px, ${Math.round(n.top)}px)`;
        n.el.style.pointerEvents = n.vis > 0.6 ? "auto" : "none";
        if (n.vis <= 0.001) continue;
        ctx.globalAlpha = n.vis * dim(n.note.part);
        const k = n.note.part - POND.koi(0);
        const color = pal.inks[k === 1 ? INK.fruit : INK.moss];
        const cx = Math.floor(n.ax / cell);
        const cy = Math.floor(n.ay / cell);
        leader(cx, cy, Math.floor((n.left ? n.edge + 6 : n.edge - 6) / cell), Math.floor((n.top + 9) / cell), n.left, color);
        let passing = false;
        if (k === 0 || (k === 1 && !journey)) {
          const off = (((headAngle(loopNow(k), t) - (k === 0 ? Math.PI : 0)) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
          passing = Math.abs(off) < 0.16;
        }
        marker(cx, cy, color, passing || (focus > 0.5 && n.note.part === focusPart));
      }
      ctx.globalAlpha = 1;

      // The rocks' troubles, each beside its rock, from a marker that fills once the koi is past. On a
      // phone, the next one the koi comes to sits at the bottom of the screen.
      if (river) {
        const r0 = river;
        const placedRocks = r0.rocks.map((rock, i) => {
          const el = rockEls.current[i];
          const a = rock.side > 0 ? -0.7 : -Math.PI + 0.7;
          const e = rockEdge(rock, a) + cell * 3;
          const ax = sx(rock.x + Math.cos(a) * e);
          const ay = sy(rock.y + Math.sin(a) * e * 0.86);
          const right = rock.side > 0;
          // Clear of the bank all the way down the label, and of the screen's edge and the rail.
          const width = el?.offsetWidth ?? W;
          const bankAt = (y: number) => sx(centre(r0, (y - surface.y) / surface.tilt) + (right ? 1 : -1) * r0.half);
          const bank = right ? Math.max(bankAt(ay - 9), bankAt(ay + 40)) : Math.min(bankAt(ay - 9), bankAt(ay + 40));
          let edge = right ? Math.min(vw - 72 - width, Math.max(ax + 24, bank + 28)) : Math.max(16 + width, Math.min(ax - 24, bank - 28));
          let top = ay - 9;
          let vis = journey ? smooth(vh * 0.97, vh * 0.84, ay) * smooth(84, 150, ay) : 0;
          const passed = headY > rock.y + rock.r * 0.2;
          if (narrow) {
            // The rock nearest the koi, switching halfway between two.
            let near = 0;
            r0.rocks.forEach((q, j) => {
              if (Math.abs(q.y - headY) < Math.abs(r0.rocks[near].y - headY)) near = j;
            });
            vis = journey && i === near ? smooth(vh * 1.1, vh * 0.8, ay) * (1 - smooth(r0.bottom - r0.view * 0.1, r0.bottom + r0.view * 0.1, headY)) : 0;
            edge = 16;
            top = vh - (el?.offsetHeight ?? 40) - 28;
          }
          return { el, rock, i, ax, ay, edge, top, vis, right, passed, width };
        });
        for (const p of placedRocks) {
          if (!p.el) continue;
          const part = POND.rock(p.i);
          p.el.style.opacity = String(p.vis * dim(part));
          p.el.style.transform = `translate(${Math.round(!p.right && !narrow ? p.edge - p.width : p.edge)}px, ${Math.round(p.top)}px)`;
          p.el.style.pointerEvents = p.vis > 0.6 ? "auto" : "none";
          const shown = journey ? smooth(vh * 1.05, vh * 0.86, p.ay) * smooth(70, 130, p.ay) : 0;
          if (shown <= 0.001) continue;
          ctx.globalAlpha = shown * dim(part);
          const color = pal.inks[INK.fruit];
          const cx = Math.floor(p.ax / cell);
          const cy = Math.floor(p.ay / cell);
          if (p.vis > 0.001) leader(cx, cy, Math.floor((p.right ? p.edge - 6 : p.edge + 6) / cell), Math.floor((p.top + 9) / cell), !p.right, color);
          marker(cx, cy, color, p.passed || (focus > 0.5 && part === focusPart));
        }
        ctx.globalAlpha = 1;
      }

      if (status.current && found.current) {
        const f = format(cents);
        if (f !== lastFound) found.current.textContent = lastFound = f;
        status.current.style.opacity = String(cents > 0 ? 1 - smooth(CLOCK.yield - 0.01, CLOCK.yield + 0.03, g) : 0);
      }
      if (hero.current) {
        const out = smooth(START + 0.01, START + 0.08, g);
        hero.current.style.opacity = String(1 - out);
        hero.current.style.transform = `translateY(${-out * 40}px)`;
        hero.current.style.visibility = out >= 1 ? "hidden" : "visible";
      }
      if (cue.current) cue.current.style.opacity = String(1 - smooth(START, START + 0.03, g));
      const show = (el: HTMLElement | null, on: number) => {
        if (!el) return;
        el.style.opacity = String(on);
        el.style.transform = `translateY(${(1 - on) * 16}px)`;
        el.style.pointerEvents = on > 0.5 ? "auto" : "none";
        el.style.visibility = on <= 0 ? "hidden" : "visible";
      };
      show(yieldRef.current, smooth(CLOCK.yield, CLOCK.yield + 0.05, g) * (1 - smooth(0, 0.05, w)));
      // The closing words in the clearing the pond leaves for them, then the links along the bottom.
      show(closing.current, smooth(0.62, 0.8, bloom));
      if (closing.current && garden) closing.current.style.top = `${Math.round(sy(garden.clearing.y))}px`;
      show(foot.current, smooth(0.72, 0.9, bloom));
      if (rail.current) {
        const els = rail.current.children;
        const at = travel();
        for (let i = 0; i < els.length; i++) {
          const el = els[i] as HTMLElement;
          const from = Number(el.dataset.at);
          const to = i + 1 < els.length ? Number((els[i + 1] as HTMLElement).dataset.at) : Infinity;
          el.dataset.on = String(at >= from - 0.5 && at < to - 0.5);
        }
      }

      // The koi swim on their own time.
      if (!still && onScreen && w > WATER.koi[0][0]) request();
      else if (rings.length) request();
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
      gprio = new Uint8Array(gw * gh);
      pix.width = gw;
      pix.height = gh;
      img = pctx!.createImageData(gw, gh);
      px32 = new Uint32Array(img.data.buffer);
      // The tile spans as few pixels as come to a whole number of device pixels, or the whole canvas.
      const step = cell * dpr;
      let span = 1;
      while (span < 16 && Math.abs(span * step - Math.round(span * step)) > 0.01) span++;
      tile.width = span < 16 ? Math.round(span * step) : cv!.width;
      tile.height = span < 16 ? Math.round(span * step) : cv!.height;
      const tctx = tile.getContext("2d");
      for (let j = 1; tctx && Math.round(j * step) <= Math.max(tile.width, tile.height); j++) {
        tctx.fillRect(Math.round(j * step) - 1, 0, 1, tile.height);
        tctx.fillRect(0, Math.round(j * step) - 1, tile.width, 1);
      }
      hairlines = ctx!.createPattern(tile, "repeat");
      for (const el of [...Object.values(nodeEls.current), ...Object.values(noteEls.current)]) {
        if (!el) continue;
        el.style.width = `${W}px`;
        // Phone labels swap in and out by chapter, so they cross-fade.
        el.style.transition = vw < 640 ? "opacity 250ms" : "";
      }
      // The rocks' labels take the width they need, on a wide screen up to a little more than the others'.
      for (const el of rockEls.current) if (el) el.style.maxWidth = `${vw < 1100 ? W : W + 48}px`;
      if (opened) opened.twigs = null;

      // The water. The drop forms where the tree stood and is sized to the screen; the koi's loops
      // fit between the notes on either side.
      const narrow = vw < 640;
      const cam = camera(1);
      drop = { x: vw / 2, y: cam.oy - 0.4 * cam.s, r: Math.max(18, Math.min(46, Math.min(vw, vh) * (narrow ? 0.075 : 0.05))) };
      splashY = vh * (narrow ? 0.55 : 0.7);
      pondY = vh * (narrow ? 0.36 : 0.47);
      flat = 0.95;
      reach = Math.hypot(vw / 2, vh / 2 / flat) + 40;
      // On a wide screen the loops are ovals, so the koi stay round-bodied and the notes fit beside them.
      const squash = narrow ? 1 : 0.78;
      const r = narrow
        ? Math.min(vw * 0.4, (vh * 0.3) / flat)
        : Math.max(110, Math.min((vh * 0.36) / (squash * 1.11 * flat), (vw / 2 - W - 56) / (1.11 + 0.82 * 0.3)));
      loops = [
        { r: r * 0.5, squash, lap: 11, phase: 0.6, lumps: [0.8, 2.1] },
        { r, squash, lap: 28, phase: 3.4, lumps: [2.6, 0.4] },
      ];
      lens = [r * 0.48, r * 0.82];

      // Below the pond, the river, and the pond at its end. The camera stops with that pond filling
      // the screen, and on the way down holds the koi's snout about halfway down it.
      const view = vh / flat;
      river = layRiver({ width: vw, view, narrow, from: (vh - pondY) / flat, koi: lens[1] });
      const mouthX = centre(river, river.bottom);
      garden = layGarden({ width: vw, view, top: river.bottom - view * 0.1, mouthX, mouthY: river.bottom, open: river.open, half: river.half, narrow, cell, koi: lens[1] });
      riverPath = riverWay(river, lens[1] * 0.3 + 14, garden.path);
      bottomDescent = garden.top + pondY / flat;
      hold = ((narrow ? 0.46 : 0.48) * vh - pondY) / flat;
      // The banks as dots a few pixels apart along each, with a pebble on the land side now and then.
      const along: number[] = [];
      pebbles = [];
      for (const side of [0, 1]) {
        let walked = 0;
        let px = NaN;
        let py = NaN;
        let n = 0;
        for (let y = river.funnel; y <= river.open; y += 1) {
          const b = banks(river, y);
          if (!b) continue;
          const x = b[side];
          if (!Number.isNaN(px)) walked += Math.hypot(x - px, y - py);
          [px, py] = [x, y];
          if (walked < cell * 3) continue;
          walked = 0;
          along.push(x, y);
          if (++n % 9 === 0 && hash2(n, side) < 0.7) {
            const out = (side ? 1 : -1) * cell * (2 + Math.floor(hash2(n, 7) * 4));
            pebbles.push({ x: x + out, y, ink: hash2(n, 9) < 0.5 ? INK.bark : INK.dust });
            if (hash2(n, 11) < 0.5) pebbles.push({ x: x + out + cell, y: y + cell * 0.8, ink: INK.dust });
          }
        }
      }
      bankDots = Float32Array.from(along);
      if (journey) setOff(journey.angle);

      // Where each tree dot goes in the drop, and the ink of the pixel it lands on.
      const n = tree.dots.length;
      const xs = new Float32Array(n);
      const ys = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        xs[i] = cam.ox + tree.dots[i].x * cam.s;
        ys[i] = cam.oy + tree.dots[i].y * cam.s;
      }
      const heartY = drop.y + DROP_HEART * drop.r;
      const local = condense(xs, ys, drop.x, heartY);
      from = new Float32Array(n * 2);
      to = new Float32Array(n * 2);
      toInk = new Int8Array(n);
      delay = new Float32Array(n);
      const cx0 = Math.floor(drop.x / cell);
      const cy0 = Math.floor(drop.y / cell);
      let far = 1;
      for (let i = 0; i < n; i++) far = Math.max(far, Math.hypot(xs[i] - drop.x, ys[i] - heartY));
      for (let i = 0; i < n; i++) {
        from[i * 2] = xs[i];
        from[i * 2 + 1] = ys[i];
        const x = drop.x + local[i * 2] * drop.r;
        const y = drop.y + local[i * 2 + 1] * drop.r;
        to[i * 2] = x;
        to[i * 2 + 1] = y;
        const cx = Math.floor(x / cell);
        const cy = Math.floor(y / cell);
        toInk[i] = dropInk(((cx + 0.5) * cell - drop.x) / drop.r, ((cy + 0.5) * cell - drop.y) / drop.r, bayer(cx - cx0, cy - cy0), hash2(cx - cx0, cy - cy0));
        // The far reaches set off first, so it all arrives together.
        delay[i] = 0.4 * (0.5 * hash2(i, 77) + 0.5 * (1 - Math.hypot(xs[i] - drop.x, ys[i] - heartY) / far));
      }
      onScroll();
    }

    function onScroll() {
      const r = sec!.getBoundingClientRect();
      scrolled = clamp01(-r.top / Math.max(1, r.height - window.innerHeight));
      onScreen = r.bottom > 0 && r.top < window.innerHeight;
      // Evidence is a close look at one moment; moving on closes it.
      if (opened?.target && (Math.abs(clock() - opened.g) > 0.02 || water() > 0)) setOpen(null);
      request();
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = st.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
      // On the water, the pointer leaves rings behind it.
      if (!still && water() > WATER.koi[0][1] && (!lastRing || Math.hypot(pointer.x - lastRing.x, pointer.y - lastRing.y) > 36)) {
        lastRing = pointer;
        rings.push({ x: pointer.x - surface.x, z: (pointer.y - surface.y) / surface.tilt, at: performance.now(), size: 70 });
      }
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
          if (document.visibilityState !== "visible" || opened || pulse || !onScreen || water() > 0) return;
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
    const offScheme = onThemeChange(onScheme);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(introFrame);
      window.clearInterval(pulses);
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
      st.removeEventListener("pointermove", onMove);
      st.removeEventListener("pointerleave", onLeave);
      offScheme();
    };
  }, [tree, nodes, fish]);

  // Jump to a chapter: `at` is a distance into the section, in viewport heights.
  const jump = (at: number) => {
    const sec = section.current;
    if (!sec) return;
    const top = sec.getBoundingClientRect().top + window.scrollY;
    const travel = sec.offsetHeight - window.innerHeight;
    const to = top + (at / TRAVEL_VH) * travel;
    if (scroller) scroller.scrollTo(to, { duration: 1.6 });
    else window.scrollTo({ top: to, behavior: "smooth" });
  };

  const chapters = [
    { at: 0, name: "Roots" },
    { at: reachAt(CLOCK.trunk[0] + 0.04), name: "Engine" },
    { at: reachAt(CLOCK.limbs[0]), name: "Findings" },
    { at: reachAt(CLOCK.yield), name: "Yield" },
    { at: TREE_VH + HOLD_VH + WATER.notes[0] * WATER_VH, name: "Loops" },
    { at: RIVER_AT + 60, name: "River" },
    { at: TRAVEL_VH, name: "Pond" },
  ];

  return (
    <section ref={section} aria-label="How LedgerLens works" className="relative" style={{ height: `${100 + TRAVEL_VH}vh` }}>
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

        {NOTES.map((note, i) => (
          <div
            key={note.key}
            ref={(e) => void (noteEls.current[note.key] = e)}
            onPointerEnter={(e) => e.pointerType === "mouse" && ctl.current.hover(note.key, note.part)}
            onPointerLeave={() => ctl.current.hover("", -1)}
            className={cn("halo pointer-events-none absolute left-0 top-0 opacity-0 will-change-transform", i === 1 && "sm:text-right")}
          >
            <span className="block truncate text-[13px] font-medium leading-[18px] sm:text-[14px]">{note.name}</span>
            <span className="block truncate text-[11.5px] leading-snug text-faint sm:text-[12.5px]">{note.sub}</span>
            {note.tag && <span className={cn("mt-0.5 block font-mono text-[11px] sm:text-[12px]", i === 1 ? "text-signal" : "text-found")}>{note.tag}</span>}
          </div>
        ))}

        {ROCKS.map((rock, i) => (
          <div
            key={rock.key}
            ref={(e) => void (rockEls.current[i] = e)}
            onPointerEnter={(e) => e.pointerType === "mouse" && ctl.current.hover(rock.key, POND.rock(i))}
            onPointerLeave={() => ctl.current.hover("", -1)}
            className={cn("halo pointer-events-none absolute left-0 top-0 opacity-0 will-change-transform", i % 2 === 1 && "sm:text-right")}
          >
            <span className="block text-[13px] font-medium leading-[18px] sm:text-[14px]">{rock.name}</span>
            <span className="block text-[11.5px] leading-snug text-faint sm:text-[12.5px]">{rock.sub}</span>
          </div>
        ))}

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
          <Actions />
        </div>

        <div ref={closing} className="invisible absolute inset-x-0 top-1/2 flex -translate-y-1/2 flex-col items-center gap-6 px-4 text-center opacity-0">
          <p className="halo display text-[clamp(1.9rem,4.4vw,3.4rem)] leading-[1.02]">
            You run the business.
            <span className="block text-muted-foreground">It watches the money.</span>
          </p>
          <Actions />
        </div>

        <footer
          ref={foot}
          className="halo invisible absolute inset-x-0 bottom-0 flex flex-wrap gap-x-6 gap-y-1 px-4 pb-4 font-mono text-[11px] text-muted-foreground opacity-0 sm:px-8 sm:pb-5"
        >
          <Link href="/overview" className="hover:text-foreground">
            Overview
          </Link>
          <Link href="/activity" className="hover:text-foreground">
            Audit log
          </Link>
          <a href="https://github.com/aiden-guan/ledger" className="hover:text-foreground">
            Source
          </a>
          <span className="sm:ml-auto">Demo data. Acme Outdoor Co. is fictional.</span>
        </footer>

        <ol ref={rail} className="absolute right-4 top-1/2 hidden -translate-y-1/2 flex-col gap-3 sm:flex sm:right-8">
          {chapters.map((c, i) => (
            <li key={c.name} data-at={c.at} data-on={i === 0} className="group">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  jump(c.at);
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

function Actions() {
  return (
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
  );
}
