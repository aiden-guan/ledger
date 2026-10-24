/*
 * After the loops, the slow loop's koi swims off down a river. Each rock in it is a kind of trouble
 * a small business runs into, and the koi finds its way around every one to the pond at the
 * bottom. Positions are on the water plane, in pixels from the centre of the pond the koi leave,
 * y down the screen. The page moves its camera down this plane as the koi goes.
 */

import { type Loop, TAIL, loopAt, search } from "./pond";
import { INK, type Ink, mulberry32 } from "./tree";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number) => {
  const u = clamp01((v - a) / (b - a));
  return u * u * (3 - 2 * u);
};
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

export interface Rock {
  x: number;
  y: number;
  r: number;
  /** Which side of the river it stands on; the koi passes on the other. */
  side: -1 | 1;
  seed: number;
}

export interface River {
  /** The screen's width, and its height on the water plane. */
  width: number;
  view: number;
  /** Where the banks start to close in, where the river proper starts and ends, and where the banks have opened out again. */
  funnel: number;
  top: number;
  bottom: number;
  open: number;
  /** Half the river's width, how far its middle swings from side to side, and over what length. */
  half: number;
  amp: number;
  wave: number;
  rocks: Rock[];
}

/** The river's middle at y. */
export function centre(r: River, y: number) {
  const settle = smooth(r.top, r.top + r.wave * 0.25, y) * (1 - smooth(r.bottom - r.wave * 0.3, r.bottom, y));
  return r.amp * settle * Math.sin(((y - r.top) / r.wave) * Math.PI * 2);
}

/** The left and right banks at y, or null where there are none: above the funnel, and below the mouth, where the pond's own shore takes over. */
export function banks(r: River, y: number): [number, number] | null {
  if (y < r.funnel || y > r.open) return null;
  const off = r.width / 2 + 40;
  if (y < r.top) {
    const u = smooth(r.funnel, r.top, y);
    const c = centre(r, r.top);
    return [lerp(-off, c - r.half, u), lerp(off, c + r.half, u)];
  }
  const c = centre(r, Math.min(y, r.bottom));
  if (y <= r.bottom) return [c - r.half, c + r.half];
  const u = smooth(r.bottom, r.open, y);
  return [lerp(c - r.half, -off, u), lerp(c + r.half, off, u)];
}

/**
 * Lays out the river below a pond whose view ends at `from` on the water plane. `koi` is the
 * length of the koi that swims it, which sets how wide the river is and how far around each
 * rock it goes.
 */
export function layRiver(o: { width: number; view: number; narrow: boolean; from: number; koi: number }): River {
  const { width, view, narrow } = o;
  const half = narrow ? width * 0.38 : Math.max(o.koi * 0.78, Math.min(width * 0.17, 250));
  const gap = view * 0.46;
  const top = o.from + view * 0.42;
  const bottom = top + gap * 5.6;
  const river: River = { width, view, funnel: o.from, top, bottom, open: bottom + view * 0.16, half, amp: width * (narrow ? 0.04 : 0.035), wave: gap * 2.3, rocks: [] };
  const rnd = mulberry32(1709);
  for (let i = 0; i < 5; i++) {
    const y = top + gap * (0.8 + i);
    const side = i % 2 ? -1 : 1;
    river.rocks.push({ x: centre(river, y) + side * half * 0.22, y, r: half * (0.28 + 0.06 * rnd()), side, seed: rnd() * Math.PI * 2 });
  }
  return river;
}

/** How far the koi keeps from a rock's middle as it passes, given how far it keeps from the rock. */
export const passing = (rock: Rock, clear: number) => rock.x - rock.side * (rock.r + clear);

/**
 * The koi's way down: from the head of the river, around each rock on its open side with
 * `clear` px to spare, out of the mouth and on through `then` to where it comes to rest. As x, y
 * pairs a few px apart, with the arc length at the mouth.
 */
export function riverWay(r: River, clear: number, then: [number, number][]): { xy: Float64Array; mouth: number } {
  const head: [number, number] = [centre(r, r.top), r.top];
  const pts: [number, number][] = [[head[0], head[1] - r.view * 0.3], head, ...r.rocks.map((k): [number, number] => [passing(k, clear), k.y]), [centre(r, r.bottom), r.bottom], ...then];
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  pts.push([last[0] + (last[0] - prev[0]) * 0.5, last[1] + (last[1] - prev[1]) * 0.5]);
  const out: number[] = [];
  let mouth = 0;
  const mouthAt = r.rocks.length + 2;
  for (let i = 1; i < pts.length - 2; i++) {
    if (i === mouthAt) mouth = out.length / 2 - 1;
    segment(pts[i - 1], pts[i], pts[i + 1], pts[i + 2], out, i > 1);
  }
  const xy = Float64Array.from(out);
  return { xy, mouth: arcs(xy)[mouth] };
}

/** One centripetal Catmull-Rom segment from b to c, a point every 3 px or so. */
function segment(a: [number, number], b: [number, number], c: [number, number], d: [number, number], out: number[], skipFirst: boolean) {
  const span = (p: [number, number], q: [number, number]) => Math.max(1e-6, Math.sqrt(Math.hypot(q[0] - p[0], q[1] - p[1])));
  const t1 = span(a, b);
  const t2 = t1 + span(b, c);
  const t3 = t2 + span(c, d);
  const steps = Math.max(1, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / 3));
  const mix = (p: number[], q: number[], ta: number, tb: number, t: number) => {
    const u = (t - ta) / (tb - ta);
    return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
  };
  for (let k = skipFirst ? 1 : 0; k <= steps; k++) {
    const t = t1 + ((t2 - t1) * k) / steps;
    const a1 = mix(a, b, 0, t1, t);
    const a2 = mix(b, c, t1, t2, t);
    const a3 = mix(c, d, t2, t3, t);
    const p = mix(mix(a1, a2, 0, t2, t), mix(a2, a3, t1, t3, t), t1, t2, t);
    out.push(p[0], p[1]);
  }
}

/** Arc length from the start to each point of a path. */
export function arcs(xy: Float64Array) {
  const at = new Float64Array(xy.length / 2);
  for (let i = 1; i < at.length; i++) at[i] = at[i - 1] + Math.hypot(xy[i * 2] - xy[i * 2 - 2], xy[i * 2 + 1] - xy[i * 2 - 1]);
  return at;
}

/** The koi's whole way from its loop to rest, with where along it the snout starts, reaches the river, passes the mouth, and stops. */
export interface Way {
  xy: Float64Array;
  at: Float64Array;
  start: number;
  river: number;
  mouth: number;
  end: number;
}

/**
 * The way from where the koi is on its loop, at `angle`, to rest: the stretch of loop behind it
 * (where its body still is), a curve from there down to the head of the river, then the river.
 */
export function wayOut(loop: Loop, angle: number, len: number, river: { xy: Float64Array; mouth: number }): Way {
  const behind: number[] = [];
  let a = angle;
  let [x, y] = loopAt(loop, a);
  behind.push(x, y);
  const step = 1.5 / loop.r;
  for (let walked = 0; walked < TAIL * len + 40; ) {
    const [nx, ny] = loopAt(loop, a - step);
    walked += Math.hypot(nx - x, ny - y);
    a -= step;
    [x, y] = [nx, ny];
    behind.push(x, y);
  }
  const out: number[] = [];
  for (let i = behind.length - 2; i >= 0; i -= 2) out.push(behind[i], behind[i + 1]);

  // Off the loop the way it is heading, and into the river from straight above.
  const [px, py] = loopAt(loop, angle);
  const [fx, fy] = loopAt(loop, angle + 0.01);
  const [bx, by] = loopAt(loop, angle - 0.01);
  const tl = Math.hypot(fx - bx, fy - by) || 1;
  const ex = river.xy[0];
  const ey = river.xy[1];
  const dist = Math.hypot(ex - px, ey - py);
  const c1 = [px + ((fx - bx) / tl) * dist * 0.4, py + ((fy - by) / tl) * dist * 0.4];
  const c2 = [ex, ey - dist * 0.45];
  const steps = Math.ceil(dist / 2);
  for (let k = 1; k < steps; k++) {
    const u = k / steps;
    const v = 1 - u;
    out.push(v * v * v * px + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * ex, v * v * v * py + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * ey);
  }
  const offRiver = out.length / 2;
  for (let i = 0; i < river.xy.length; i++) out.push(river.xy[i]);
  const xy = Float64Array.from(out);
  const at = arcs(xy);
  const start = at[behind.length / 2 - 1];
  return { xy, at, start, river: at[offRiver], mouth: at[offRiver] + river.mouth, end: at[at.length - 1] };
}

/**
 * How far along its way the koi has swum after `u` px of scrolling, as a table every `step` px
 * of scroll up to `total`. It comes to rest after `budget`: it sets off gently, darts from the
 * loop down to the river, keeps a steady pace down it, and slows into the pond.
 */
export function pace(way: Way, budget: number, step = 2, total = budget): Float64Array {
  const speed = (s: number) => {
    if (s < way.river) {
      const k = (s - way.start) / Math.max(1, way.river - way.start);
      return lerp(lerp(0.6, 2.2, smooth(0, 0.25, k)), 1.3, smooth(0.65, 1, k));
    }
    if (s < way.mouth) return 1.3;
    return lerp(1.3, 0.2, smooth(way.mouth, way.end, s));
  };
  // Time to each point of the way at those speeds, then scaled to fit the budget.
  const ds = 2;
  const n = Math.max(2, Math.ceil((way.end - way.start) / ds) + 1);
  const us = new Float64Array(n);
  for (let i = 1; i < n; i++) us[i] = us[i - 1] + ds / speed(way.start + (i - 0.5) * ds);
  const scale = budget / us[n - 1];
  const table = new Float64Array(Math.ceil(Math.max(budget, total) / step) + 1);
  for (let k = 0, i = 0; k < table.length; k++) {
    const u = Math.min(budget, k * step) / scale;
    while (i < n - 2 && us[i + 1] < u) i++;
    const v = clamp01((u - us[i]) / (us[i + 1] - us[i]));
    table[k] = Math.min(way.end, way.start + (i + v) * ds);
  }
  return table;
}

/** A value from a table sampled every `step`, held at its last value beyond the end. */
export function sample(table: ArrayLike<number>, step: number, u: number) {
  const f = Math.max(0, u / step);
  const i = Math.min(table.length - 1, Math.floor(f));
  if (i >= table.length - 1) return table[table.length - 1];
  return lerp(table[i], table[i + 1], f - i);
}

/**
 * Where the camera is, as it follows the koi down: how far down the water plane it has moved,
 * for each entry of `swum` (the pace table). It keeps the snout near `hold` below the view's
 * old centre, never moves back up, starts and stops smoothly, and stops at `end`.
 */
export function track(way: Way, swum: Float64Array, hold: number, end: number, step: number): Float64Array {
  const headY = (s: number) => {
    const i = Math.max(0, Math.min(way.at.length - 2, search(way.at, s)));
    const v = clamp01((s - way.at[i]) / Math.max(1e-9, way.at[i + 1] - way.at[i]));
    return lerp(way.xy[i * 2 + 1], way.xy[i * 2 + 3], v);
  };
  const y0 = headY(swum[0]);
  const settleIn = 160;
  // A critically damped follow: smooth, never past what it follows, and never back up.
  const w = 1 / 70;
  const out = new Float64Array(swum.length);
  let x = 0;
  let v = 0;
  let want = 0;
  for (let k = 0; k < swum.length; k++) {
    // Until the koi is under way, hold the snout where it was when it left.
    const at = lerp(Math.max(y0, hold), hold, smooth(0, settleIn, k * step));
    want = Math.max(want, Math.min(end, headY(swum[k]) - at));
    for (let j = 0; j < step; j++) {
      v += (w * w * (want - x) - 2 * w * v) * 1;
      x += v;
    }
    out[k] = Math.max(0, Math.min(end, x));
  }
  return out;
}

/* ---------------------------------------------------------------- the water */

/** A stable random number in [0, 1) for a pair of integers. */
function hash2(x: number, y: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Where water at x, y is pushed aside by the rocks: it bunches up and runs past their sides. */
export function around(r: River, x: number, y: number) {
  for (const k of r.rocks) {
    const reach = k.r * 2.4;
    const dy = y - k.y;
    if (Math.abs(dy) > reach) continue;
    const dx = x - k.x;
    const wide = k.r * 1.3;
    if (Math.abs(dx) >= wide) continue;
    const fall = Math.cos(((dy / reach) * Math.PI) / 2) ** 2;
    x = k.x + (dx < 0 ? -1 : 1) * (Math.abs(dx) + (wide - Math.abs(dx)) * fall);
  }
  return x;
}

/**
 * The current: short streaks carried down the river at time t, as x, y and a unit heading,
 * for those between `from` and `to` down the plane. They come and go at the river's ends.
 */
export function currents(r: River, t: number, from: number, to: number) {
  const len = r.bottom - r.top;
  const n = Math.round((len * r.half * 2) / 9000);
  const out: { x: number; y: number; dx: number; dy: number; fade: number }[] = [];
  for (let i = 0; i < n; i++) {
    const lane = (hash2(i, 1) * 2 - 1) * 0.86;
    const speed = 34 + 22 * hash2(i, 2);
    const y = r.top + ((((hash2(i, 3) * len + t * speed) % len) + len) % len);
    if (y < from || y > to) continue;
    const x = around(r, centre(r, y) + lane * r.half, y);
    const x2 = around(r, centre(r, y + 3) + lane * r.half, y + 3);
    const l = Math.hypot(x2 - x, 3);
    out.push({ x, y, dx: (x2 - x) / l, dy: 3 / l, fade: smooth(r.top, r.top + 60, y) * (1 - smooth(r.bottom - 60, r.bottom, y)) });
  }
  return out;
}

/** How far a rock reaches from its middle toward angle a, across; it is 0.86 of that up and down. */
export const rockEdge = (rock: Rock, a: number) => rock.r * (1 + 0.12 * Math.sin(2 * a + rock.seed) + 0.07 * Math.sin(3 * a + rock.seed * 1.7) + 0.04 * Math.sin(5 * a + rock.seed * 2.3));

/** What rockInk and padInk give for a pixel of the water they shade. */
export const SHADOW = -2;

/**
 * A rock's ink at x, y px from its middle, -1 off it, or SHADOW where it shades the water: stone
 * lit from the upper left like the tree, wet and blue at the waterline on its shaded side. `d` is
 * the pixel's dither offset and `h` a stable random number for it.
 */
export function rockInk(x: number, y: number, rock: Rock, d: number, h: number): Ink | -1 | -2 {
  const sy = y / 0.86;
  const edge = rockEdge(rock, Math.atan2(sy, x));
  const ux = x / edge;
  const uy = sy / edge;
  const q = ux * ux + uy * uy;
  if (q > 1) {
    // Its shadow on the water, down and to the right.
    const tx = x - rock.r * 0.14;
    const ty = (y - rock.r * 0.18) / 0.86;
    return Math.hypot(tx, ty) < rockEdge(rock, Math.atan2(ty, tx)) && d > -0.15 ? SHADOW : -1;
  }
  const nz = Math.sqrt(1 - q);
  // Facets: the stone's face turns a little from patch to patch.
  const facet = hash2(Math.floor((x + 400) / (rock.r * 0.42)), Math.floor((y + 400) / (rock.r * 0.42)) + Math.round(rock.seed * 100)) - 0.5;
  const light = 0.15 - 0.5 * ux - 0.6 * uy + 0.5 * nz + facet * 0.24 + d * 0.3 + (h - 0.5) * 0.1;
  if (q > 0.86 && ux * 0.55 + uy * 0.7 > 0.3) return INK.navy;
  if (light > 0.78) return INK.dust;
  if (light > 0.1) return INK.bark;
  return light > -0.22 && d > 0 ? INK.bark : INK.navy;
}
