/*
 * What happens after the tree. It condenses into a drop, the drop falls into still water, and two
 * koi come up and swim the product's two loops: the fast one screens each payment as it arrives,
 * the slow one investigates the books every morning. Like the tree, this is geometry on a clock,
 * seeded so every visitor sees the same thing, and the page snaps it to the same pixel grid.
 *
 * Drop units are radii of the drop's round part. Water units are pixels on the water's surface,
 * a plane the page tilts toward the viewer.
 */

import { INK, type Ink, mulberry32 } from "./tree";

/** The water clock. It runs from 0 to 1 once the tree is fully grown. */
export const WATER = {
  condense: [0, 0.15],
  fall: [0.15, 0.26],
  impact: 0.26,
  /** The view swings from the side to overhead while the ripples spread. */
  tilt: [0.28, 0.5],
  forecast: [0.29, 0.44],
  koi: [
    [0.42, 0.52],
    [0.47, 0.58],
  ],
  notes: [0.52, 0.6],
  close: 0.78,
} as const;

/** A stable random number in [0, 1) for a pair of integers. */
export function hash2(x: number, y: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
/** Ordered dither for a pixel, -0.5 to 0.5: lets two inks blend on a grid without noise. */
export const bayer = (cx: number, cy: number) => BAYER[(cy & 3) * 4 + (cx & 3)];

/* ---------------------------------------------------------------- the drop */

/** How far the drop's tip is above the centre of its round part. */
export const TIP = 2.1;
const SIDE_Y = -1 / TIP;
const SIDE_X = Math.sqrt(1 - SIDE_Y * SIDE_Y);

/** Half the drop's width at height y (down is positive), or -1 above the tip or below the bottom. */
export function dropHalf(y: number) {
  if (y < -TIP || y > 1) return -1;
  if (y >= SIDE_Y) return Math.sqrt(1 - y * y);
  // The sides run up from where they leave the circle, curving in to a fine tip.
  return SIDE_X * ((y + TIP) / (SIDE_Y + TIP)) ** 1.3;
}

/** The drop's highlight, which the page leaves as paper on a light screen and fills on a dark one. */
export const GLINT = -2;

/**
 * The drop's ink at a point, -1 outside it, or GLINT in the highlight. It is lit from the upper
 * left like the tree, and carries the money found as flecks of orange. `d` is the pixel's dither
 * offset, `h` a stable random number for it.
 */
export function dropInk(x: number, y: number, d: number, h: number): Ink | -1 | -2 {
  const half = dropHalf(y);
  if (half < 0 || Math.abs(x) > half) return -1;
  // The highlight: a slanted sliver along the lit side.
  const hx = (x + 0.46) * 0.8 + (y + 0.3) * 0.6;
  const hy = -(x + 0.46) * 0.6 + (y + 0.3) * 0.8;
  if ((hx / 0.13) ** 2 + (hy / 0.36) ** 2 < 1) return GLINT;
  const across = x / Math.max(half, 1e-6);
  const down = ((y + TIP) / (1 + TIP)) * 2 - 1;
  // The shadowed rim, then light gathering in the bottom, then the body.
  if (Math.abs(across) > 0.82 && (across > 0 || down > 0.55)) return INK.navy;
  if (down > 0.5 && down < 0.86 && Math.abs(across) < 0.55) return h < 0.55 ? INK.mossLight : INK.moss;
  if (h < 0.07 && down > -0.4) return h < 0.04 ? INK.fruit : INK.fruitPale;
  const light = 0.5 - 0.42 * across - 0.3 * down + d * 0.4;
  return light > 0.7 ? INK.mossLight : light > 0.16 ? INK.moss : INK.navy;
}

/** The point the tree shrinks toward: a little above the centre of the drop's round part. */
export const DROP_HEART = -0.35;

/**
 * Where each of the tree's dots ends up in the drop, in drop units. `xs` and `ys` are the dots on
 * screen and (cx, cy) the drop's heart there. A dot keeps its bearing from the heart and its share
 * of the tree's reach on that bearing, so the tree shrinks into the drop instead of scrambling.
 */
export function condense(xs: Float32Array, ys: Float32Array, cx: number, cy: number) {
  const BINS = 90;
  const bin = (a: number) => ((Math.round((a / (Math.PI * 2)) * BINS) % BINS) + BINS) % BINS;
  const reach = new Float32Array(BINS);
  for (let i = 0; i < xs.length; i++) {
    const b = bin(Math.atan2(ys[i] - cy, xs[i] - cx));
    reach[b] = Math.max(reach[b], Math.hypot(xs[i] - cx, ys[i] - cy));
  }
  const edge = new Float32Array(BINS);
  for (let b = 0; b < BINS; b++) {
    const a = (b / BINS) * Math.PI * 2;
    let r = 0;
    for (;;) {
      const x = Math.cos(a) * (r + 0.02);
      const y = DROP_HEART + Math.sin(a) * (r + 0.02);
      const half = dropHalf(y);
      if (half < 0 || Math.abs(x) > half) break;
      r += 0.02;
    }
    edge[b] = r;
  }
  const out = new Float32Array(xs.length * 2);
  for (let i = 0; i < xs.length; i++) {
    const a = Math.atan2(ys[i] - cy, xs[i] - cx);
    const b = bin(a);
    const u = reach[b] ? Math.hypot(xs[i] - cx, ys[i] - cy) / reach[b] : 0;
    const r = u ** 0.75 * edge[b] * 0.96;
    out[i * 2] = Math.cos(a) * r;
    out[i * 2 + 1] = DROP_HEART + Math.sin(a) * r;
  }
  return out;
}

/* ---------------------------------------------------------------- the splash */

export interface Ring {
  /** Radius on the water, px. */
  r: number;
  /** Strength, 0 to 1: the share of the ring's pixels drawn. */
  a: number;
  /** Which crest of its wave it is, from the front. */
  k: number;
}

/**
 * The ripples from the drop at water time w: each crest's radius and strength. `reach` is how far
 * the first wave travels before the water is still, `size` the drop's radius. A second, smaller
 * wave follows from the droplet that bounces back up.
 */
export function ripples(w: number, reach: number, size: number): Ring[] {
  const rings: Ring[] = [];
  const wave = (start: number, span: number, power: number) => {
    const u = (w - start) / span;
    if (u <= 0 || u >= 1) return;
    const front = (1 - (1 - u) ** 1.7) * reach;
    const gap = size * 0.45 + front * 0.025;
    for (let k = 0; k < 4; k++) {
      const r = front - k * gap;
      if (r <= size * 0.6) break;
      rings.push({ r, a: power * (1 - k * 0.24) * (1 - u) ** 0.8, k });
    }
  };
  wave(WATER.impact, 0.34, 1);
  wave(WATER.impact + 0.07, 0.3, 0.55);
  return rings;
}

export interface Droplet {
  /** Offset from the impact on the water, px. */
  x: number;
  z: number;
  /** Height above the water, px. */
  h: number;
  /** Once it has landed: the radius of the ring it makes, and that ring's strength. */
  ring: number;
  a: number;
}

/** The crown of droplets the drop throws up, and the column that rises behind it, at water time w. */
export function splash(w: number, size: number): { drops: Droplet[]; column: number } {
  const drops: Droplet[] = [];
  const t = (w - WATER.impact) / 0.06;
  if (t <= 0 || t > 3) return { drops, column: 0 };
  const rnd = mulberry32(2611);
  for (let i = 0; i < 11; i++) {
    const ang = (i / 11) * Math.PI * 2 + rnd() * 0.5;
    const out = size * (1.4 + rnd() * 1.4);
    const up = size * (1.6 + rnd() * 1.6);
    const land = 0.55 + rnd() * 0.45;
    const u = Math.min(t, land);
    const x = Math.cos(ang) * out * u;
    const z = Math.sin(ang) * out * u;
    const h = up * 4 * (u / land) * (1 - u / land);
    const after = t - land;
    drops.push({ x, z, h, ring: after > 0 ? after * size * 1.6 : 0, a: after > 0 ? Math.max(0, 1 - after / 1.4) : 0 });
  }
  // The column of water that jumps up once the drop is under, then falls back.
  const c = (t - 0.45) / 0.9;
  return { drops, column: c > 0 && c < 1 ? Math.sin(Math.PI * c) * size * 1.5 : 0 };
}

/* ---------------------------------------------------------------- the koi */

export interface KoiDot {
  /** Along the body from the snout, as a share of its length; on a fin, along the fin from its root, 0 to 1. */
  s: number;
  /** Across: off the spine as a share of length; on a fin, -1 to 1 across it. */
  o: number;
  ink: Ink;
  /** 0 is the body and tail, 1 and 2 the pectoral fins, 3 and 4 the pelvic fins. */
  fin: number;
  /** Which shows when two dots share a pixel: higher wins. */
  z: number;
  /** A stable random number, for coming up out of the deep a few dots at a time. */
  h: number;
}

/** The fast loop's koi is mostly the books' blue; the slow loop's is mostly money-found orange. */
export type KoiKind = "fast" | "slow";

/** Where the tail ends, as a share of length from the snout. */
export const TAIL = 1.1;
/** Where the tail fin starts. */
const ROOT = 0.78;

/** The body's half-width at s, as a share of its length: a blunt round head, widest behind it, then a long taper. */
export function koiHalf(s: number) {
  if (s < 0 || s > ROOT + 0.02) return 0;
  if (s < 0.28) return 0.12 * Math.sqrt(1 - ((0.28 - s) / 0.28) ** 2);
  return 0.12 * (1 - 0.66 * ((s - 0.28) / (ROOT - 0.28)) ** 1.5);
}

/** Fins by index: where they join the body, their length and width (shares of the body's length), and how far they sweep back from straight out. */
export const FINS = [
  { s: 0, len: 0, wid: 0, sweep: 0 },
  { s: 0.24, len: 0.21, wid: 0.075, sweep: 0.72 },
  { s: 0.24, len: 0.21, wid: 0.075, sweep: 0.72 },
  { s: 0.52, len: 0.11, wid: 0.045, sweep: 0.85 },
  { s: 0.52, len: 0.11, wid: 0.045, sweep: 0.85 },
];

/** A fin's half-width at a, 0 to 1 along it, as a share of its width: narrow at the root, then a rounded paddle. */
export const finHalf = (a: number) => Math.min(1, 1.25 * Math.sqrt(a)) * Math.sqrt(Math.max(0, 1 - a ** 4));

export function koiDots(kind: KoiKind, seed: number): KoiDot[] {
  const rnd = mulberry32(seed);
  const dots: KoiDot[] = [];
  const blue = kind === "fast";
  const [p1, p2, p3] = [rnd() * 9, rnd() * 9, rnd() * 9];
  // Patches of the other colour: a slow field over the body decides where.
  const patch = (s: number, o: number) => Math.sin(s * 11 + p1) * Math.sin(o * 30 + s * 5 + p2) + 0.5 * Math.sin(s * 23 - o * 19 + p3);
  const main = blue ? INK.moss : INK.fruit;
  const pale = blue ? INK.mossLight : INK.fruitPale;
  const other = blue ? INK.fruitPale : INK.mossLight;

  // The body, on a jittered lattice so it fills without holes at any size the page draws it.
  const STEP = 0.009;
  for (let s = 0; s <= ROOT + 0.02; s += STEP) {
    for (let o = -0.12; o <= 0.12; o += STEP) {
      const ds = s + (rnd() - 0.5) * STEP * 0.8;
      const dd = o + (rnd() - 0.5) * STEP * 0.8;
      const half = koiHalf(ds);
      if (Math.abs(dd) > half) continue;
      const e = Math.abs(dd) / half;
      const h = rnd();
      let ink: Ink = main;
      let z = 6;
      // The ridge along the back and the eyes are ink-blue on both.
      if (Math.abs(dd) < 0.013 && ds > 0.3 && ds < 0.7) [ink, z] = [INK.navy, 9];
      else if (Math.hypot(ds - 0.07, Math.abs(dd) - 0.062) < 0.016) [ink, z] = [INK.navy, 9];
      else if (patch(ds, dd) > 0.55) [ink, z] = [blue ? (h < 0.7 ? INK.fruit : INK.fruitPale) : h < 0.7 ? INK.moss : INK.navy, 7];
      else if (e > 0.8) [ink, z] = [pale, 5];
      dots.push({ s: ds, o: dd, ink, fin: 0, z, h: rnd() });
    }
  }

  // The tail: a broad fan with a shallow fork, finer and paler than the body. Rays run out from
  // its root, and dots thin out between them.
  for (let n = 0; n < 620; ) {
    const ang = (rnd() * 2 - 1) * 0.62;
    const reach = (TAIL - ROOT) * (0.7 + 0.3 * (Math.abs(ang) / 0.62) ** 1.4);
    const r = Math.sqrt(rnd()) * reach;
    if (rnd() > 0.45 + 0.55 * Math.abs(Math.sin(ang * 11))) continue;
    n++;
    const h = rnd();
    const ink = h < 0.55 ? pale : h < 0.8 ? other : main;
    dots.push({ s: ROOT - 0.02 + Math.cos(ang) * r, o: Math.sin(ang) * r, ink, fin: 0, z: 3, h: rnd() });
  }

  for (let fin = 1; fin < FINS.length; fin++) {
    const count = fin < 3 ? 300 : 110;
    for (let n = 0; n < count; ) {
      const a = rnd();
      const b = rnd() * 2 - 1;
      if (Math.abs(b) > finHalf(a)) continue;
      // Streaks run out along the fin.
      if (rnd() > 0.5 + 0.5 * Math.abs(Math.sin((b / Math.max(finHalf(a), 0.05)) * 4 + a))) continue;
      n++;
      const h = rnd();
      dots.push({ s: a, o: b, ink: h < 0.6 ? pale : h < 0.82 ? other : main, fin, z: 2, h: rnd() });
    }
  }
  return dots;
}

export interface Loop {
  /** Radius on the water, px, across; down the screen it is `squash` of that. */
  r: number;
  squash: number;
  /** Seconds a lap takes. */
  lap: number;
  /** Where on the loop the koi is at time 0, radians. */
  phase: number;
  /** Two lumps that keep the loop from looking drawn with a compass. */
  lumps: [number, number];
}

/** A point on a loop at angle a, from its centre, on the water. */
export function loopAt(loop: Loop, a: number): [number, number] {
  const r = loop.r * (1 + 0.07 * Math.sin(2 * a + loop.lumps[0]) + 0.035 * Math.sin(3 * a + loop.lumps[1]));
  return [r * Math.cos(a), r * loop.squash * Math.sin(a)];
}

/** Where the koi's head is on its loop at time t, radians. */
export const headAngle = (loop: Loop, t: number) => loop.phase + (t / loop.lap) * Math.PI * 2;

/** Points along a koi's spine, snout first. */
export const SPINE = 24;

/**
 * A koi's spine at time t (seconds), on the water: SPINE points from snout to tail tip, each as
 * x, y and a unit normal. It follows its loop, with a swimming wave that grows toward the tail;
 * `len` is its length in px and `beat` its tail beats a second.
 */
export function swim(loop: Loop, len: number, beat: number, t: number, out = new Float64Array(SPINE * 4)) {
  // Walk back along the loop from the head, setting down a spine point at each step of its length.
  let a = headAngle(loop, t);
  let [x, y] = loopAt(loop, a);
  let walked = 0;
  const step = 1.5 / loop.r;
  for (let i = 0; i < SPINE; i++) {
    const want = (i / (SPINE - 1)) * TAIL * len;
    while (walked < want) {
      const [nx, ny] = loopAt(loop, a - step);
      walked += Math.hypot(nx - x, ny - y);
      a -= step;
      [x, y] = [nx, ny];
    }
    out[i * 4] = x;
    out[i * 4 + 1] = y;
  }
  normals(out);
  for (let i = 0; i < SPINE; i++) {
    const s = (i / (SPINE - 1)) * TAIL;
    const wave = len * (0.008 + 0.055 * s * s) * Math.sin(Math.PI * 2 * (beat * t - s / 0.95));
    out[i * 4] += out[i * 4 + 2] * wave;
    out[i * 4 + 1] += out[i * 4 + 3] * wave;
  }
  normals(out);
  return out;
}

function normals(p: Float64Array) {
  for (let i = 0; i < SPINE; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(SPINE - 1, i + 1);
    const tx = p[a * 4] - p[b * 4];
    const ty = p[a * 4 + 1] - p[b * 4 + 1];
    const l = Math.hypot(tx, ty) || 1;
    p[i * 4 + 2] = -ty / l;
    p[i * 4 + 3] = tx / l;
  }
}

/** Focus groups for the water, after the tree's parts (0-9): each koi with its loop, then the water itself. */
export const POND = { koi: (i: number) => 10 + i, water: 12 } as const;
