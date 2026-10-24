/*
 * The landing page's tree, as dots that the page snaps to a pixel grid. Everything comes from a
 * fixed seed, so the server and every visitor see the same tree.
 *
 * World units: the ground is y = 0, up is negative, the trunk is about 0.66 tall. Each dot has a
 * time t in [0, 1] at which it appears; the page maps scroll position to that clock.
 *
 * Roots are the inputs, the trunk is the engine, each limb is one finding, and the share of a
 * limb's growth that is orange is proportional to how much money that finding recovers.
 */

/** What a dot is made of. The renderer maps each to a colour. */
export const INK = { bark: 0, shadow: 1, rust: 2, moss: 3, mossLight: 4, fruit: 5, fruitPale: 6, dust: 7, navy: 8 } as const;
export type Ink = (typeof INK)[keyof typeof INK];
/** When two dots land on one pixel, the higher one shows. */
export const INK_PRIORITY = [2, 4, 3, 6, 5, 8, 7, 1, 4];

/** Which part of the tree a dot belongs to: limbs are 0-3, then the trunk, crown and roots. */
export const PART = { trunk: 4, crown: 5, root: (i: number) => 6 + i } as const;

export interface Dot {
  x: number;
  y: number;
  r: number;
  ink: Ink;
  /** When it appears on the growth clock. */
  t: number;
  part: number;
}

export interface Anchor {
  x: number;
  y: number;
  /** When the part it marks has finished growing. */
  t: number;
}

type Box = { minX: number; maxX: number; minY: number; maxY: number };

export interface Tree {
  /** Sorted by t. */
  dots: Dot[];
  roots: Anchor[];
  limbs: Anchor[];
  engine: Anchor;
  model: Anchor;
  crown: Anchor;
  bounds: Box;
  /** Everything above ground, and everything below it. */
  canopy: Box;
  underground: Box;
}

/** The growth clock's chapters. Roots grow on load; scrolling drives the rest. */
export const CLOCK = {
  roots: [0, 0.12],
  trunk: [0.12, 0.24],
  limbs: [0.24, 0.74],
  crown: [0.72, 0.86],
  yield: 0.88,
} as const;

const TRUNK_TOP = 0.66;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** Light comes from the upper left: moss grows on that side, shadow falls on the other. */
const LIGHT = { x: -0.45, y: -0.89 };

/** Brushes that lay dots into `dots`. */
function painter(rnd: () => number, dots: Dot[]) {
  const gauss = () => {
    let s = 0;
    for (let i = 0; i < 4; i++) s += rnd();
    return (s - 2) / 0.577;
  };
  const p1 = rnd() * 10;
  const p2 = rnd() * 10;
  // Moss grows in clumps: a slow field over the world decides where.
  const mossy = (x: number, y: number) => Math.sin(x * 21.3 + y * 7.1 + p1) * Math.sin(y * 17.7 - x * 5.3 + p2) > 0.05;

  /** A length of wood (or root) from one point to another. `fruit` is the chance moss is orange instead. */
  function stroke(x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, t0: number, t1: number, part: number, fruit: number, root = false, moss = 1) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (!len) return;
    const nx = -(y1 - y0) / len;
    const ny = (x1 - x0) / len;
    const n = Math.ceil(len * (w0 + w1) * 0.5 * 26000 + len * 150);
    const lit = nx * LIGHT.x + ny * LIGHT.y;
    for (let i = 0; i < n; i++) {
      const u = rnd();
      const w = lerp(w0, w1, u);
      const twig = w < 0.007;
      const off = Math.max(-1, Math.min(1, gauss() * 0.45));
      const e = Math.abs(off);
      const onLit = off * lit > 0;
      const x = lerp(x0, x1, u) + nx * off * w * 0.5;
      const y = lerp(y0, y1, u) + ny * off * w * 0.5;
      const m = !root && mossy(x, y) && rnd() < moss;
      let ink: Ink;
      if (root) {
        // Roots are the books: ink-blue at the core, fraying to grey.
        const r = rnd();
        if (e < 0.45) ink = r < 0.6 ? INK.navy : r < 0.8 ? INK.shadow : INK.bark;
        else ink = twig || r < 0.5 ? INK.dust : r < 0.8 ? INK.bark : INK.navy;
      }
      else if (twig) ink = m && rnd() < 0.3 ? INK.mossLight : rnd() < 0.7 ? INK.dust : INK.bark;
      else if (e < 0.5) ink = rnd() < 0.04 ? INK.rust : INK.bark;
      else if (!onLit) ink = rnd() < 0.8 ? INK.shadow : INK.bark;
      else if (m) ink = rnd() < fruit ? (rnd() < 0.55 ? INK.fruit : INK.fruitPale) : rnd() < 0.55 ? INK.moss : INK.mossLight;
      else ink = rnd() < 0.6 ? INK.bark : INK.dust;
      const t = lerp(t0, t1, u) + rnd() * 0.004;
      dots.push({ x, y, r: (twig ? 0.003 : 0.0036) + rnd() * 0.004 * Math.min(1, w / 0.02 + 0.3), ink, t, part });
      // Moss overgrows the lit side of anything thicker than a twig.
      if (m && !twig && onLit && rnd() < 0.55) {
        const lift = (0.5 + rnd() * 0.9) * w * Math.sign(off);
        const orange = rnd() < fruit;
        dots.push({
          x: lerp(x0, x1, u) + nx * lift,
          y: lerp(y0, y1, u) + ny * lift,
          r: 0.0035 + rnd() * 0.004,
          ink: orange ? (rnd() < 0.5 ? INK.fruit : INK.fruitPale) : rnd() < 0.5 ? INK.moss : INK.mossLight,
          t: t + 0.006 + rnd() * 0.01,
          part,
        });
      }
    }
  }

  /** A loose clump of growth at a twig's end. */
  function bud(x: number, y: number, t: number, part: number, fruit: number, size: number) {
    const n = Math.round((16 + rnd() * 20) * size);
    const rad = (0.018 + rnd() * 0.016) * size;
    for (let i = 0; i < n; i++) {
      const gx = gauss() * rad;
      const gy = gauss() * rad * 0.75;
      const ink: Ink = rnd() < fruit ? (rnd() < 0.5 ? INK.fruit : INK.fruitPale) : rnd() < 0.45 ? INK.moss : rnd() < 0.8 ? INK.mossLight : INK.dust;
      dots.push({ x: x + gx, y: y + gy, r: 0.0034 + rnd() * 0.0045, ink, t: t + rnd() * 0.03, part });
    }
  }

  return { stroke, bud };
}

type Tip = { x: number; y: number; t: number };

/**
 * Grow the tree. `weights` are the findings' sizes, 0..1, one limb each (at most four); they set
 * how much of each limb's growth turns orange.
 */
export function growTree(weights: number[], seed = 20261025): Tree {
  const rnd = mulberry32(seed);
  const dots: Dot[] = [];
  const { stroke, bud } = painter(rnd, dots);

  /**
   * A branch and its children. Time runs along the path: a point `dist` from the branch system's
   * origin appears at t0 + dist / reach * (t1 - t0).
   */
  function branch(
    x: number,
    y: number,
    ang: number,
    len: number,
    w: number,
    depth: number,
    o: { t0: number; t1: number; reach: number; dist: number; fruit: number; root: boolean; part: number; budSize: number },
    tips: Tip[],
  ) {
    const steps = 5;
    const phase = rnd() * Math.PI * 2;
    let cx = x;
    let cy = y;
    let a = ang;
    let d = o.dist;
    const wEnd = w * 0.6;
    for (let s = 0; s < steps; s++) {
      // A slow wave plus a little noise keeps branches from looking ruled.
      a += (rnd() - 0.5) * 0.16 + Math.sin(phase + s * 1.3) * 0.11;
      // Branches bend back toward the sky; roots toward the ground.
      a = o.root ? lerp(a, Math.PI * Math.sign(a || 1), 0.05) : a * 0.95;
      const seg = len / steps;
      const nx = cx + Math.sin(a) * seg;
      const ny = cy - Math.cos(a) * seg;
      const ta = o.t0 + (d / o.reach) * (o.t1 - o.t0);
      const tb = o.t0 + ((d + seg) / o.reach) * (o.t1 - o.t0);
      stroke(cx, cy, nx, ny, lerp(w, wEnd, s / steps), lerp(w, wEnd, (s + 1) / steps), ta, tb, o.part, o.fruit, o.root);
      cx = nx;
      cy = ny;
      d += seg;
    }
    const tEnd = o.t0 + (d / o.reach) * (o.t1 - o.t0);
    if (depth === 0) {
      if (!o.root) bud(cx, cy, tEnd, o.part, o.fruit, o.budSize);
      tips.push({ x: cx, y: cy, t: tEnd });
      return;
    }
    const kids = rnd() < 0.3 ? 3 : 2;
    for (let k = 0; k < kids; k++) {
      const spread = (k / (kids - 1) - 0.5) * (0.75 + rnd() * 0.4);
      branch(cx, cy, a + spread, len * (0.7 + rnd() * 0.12), wEnd, depth - 1, { ...o, dist: d }, tips);
    }
  }

  const reachOf = (len: number, depth: number) => {
    let r = 0;
    for (let k = 0; k <= depth; k++) r += len * Math.pow(0.82, k);
    return r;
  };

  // Roots: four main roots, one per input.
  const roots: Anchor[] = [];
  const rootAngles = [Math.PI + 1.15, Math.PI + 0.45, Math.PI - 0.45, Math.PI - 1.15];
  rootAngles.forEach((ang, i) => {
    const tips: Tip[] = [];
    const len = 0.13;
    branch(0, 0.005, ang, len, 0.034, 3, { t0: CLOCK.roots[0], t1: CLOCK.roots[1], reach: reachOf(len, 3), dist: 0, fruit: 0, root: true, part: PART.root(i), budSize: 1 }, tips);
    // The anchor is the tip that reaches farthest in the root's own direction.
    const along = (p: Tip) => p.x * Math.sin(ang) - p.y * Math.cos(ang);
    const far = tips.reduce((b, p) => (along(p) > along(b) ? p : b), tips[0]);
    roots.push({ x: far.x, y: far.y, t: CLOCK.roots[1] });
  });

  // The trunk grows in step with the limbs: each limb starts when the trunk reaches it.
  const limbCount = Math.min(4, weights.length);
  const span = (CLOCK.limbs[1] - CLOCK.limbs[0]) / Math.max(1, limbCount);
  const limbStart = (i: number) => CLOCK.limbs[0] + i * span;
  const heightKeys: [number, number][] = [[0, CLOCK.trunk[0]]];
  for (let i = 0; i < limbCount; i++) heightKeys.push([LIMBS[i].h, limbStart(i)]);
  heightKeys.push([TRUNK_TOP, CLOCK.crown[0]]);
  const trunkTime = (h: number) => {
    for (let i = 1; i < heightKeys.length; i++) {
      const [h0, t0] = heightKeys[i - 1];
      const [h1, t1] = heightKeys[i];
      if (h <= h1) return lerp(t0, t1, (h - h0) / (h1 - h0 || 1));
    }
    return CLOCK.crown[0];
  };
  const trunkX = (h: number) => Math.sin(h * 5.2) * 0.018;
  const trunkW = (h: number) => lerp(0.078, 0.03, h / TRUNK_TOP) * (h < 0.05 ? 1 + (0.05 - h) * 9 : 1);
  const STEPS = 40;
  for (let i = 0; i < STEPS; i++) {
    const h0 = (i / STEPS) * TRUNK_TOP;
    const h1 = ((i + 1) / STEPS) * TRUNK_TOP;
    stroke(trunkX(h0), -h0, trunkX(h1), -h1, trunkW(h0), trunkW(h1), trunkTime(h0), trunkTime(h1), PART.trunk, 0, false, 0.15);
  }

  // Limbs: one per finding.
  const limbs: Anchor[] = [];
  for (let i = 0; i < limbCount; i++) {
    const L = LIMBS[i];
    const tips: Tip[] = [];
    const t0 = limbStart(i);
    const t1 = t0 + span + 0.04;
    const fruit = 0.12 + 0.6 * Math.max(0, Math.min(1, weights[i]));
    branch(trunkX(L.h), -L.h, L.ang, L.len, 0.03, 4, { t0, t1, reach: reachOf(L.len, 4), dist: 0, fruit, root: false, part: i, budSize: 1 }, tips);
    const out = tips.reduce((b, p) => (Math.abs(p.x) > Math.abs(b.x) ? p : b), tips[0]);
    limbs.push({ x: out.x, y: out.y, t: t1 });
  }

  // Crown: where the trunk ends.
  const crownTips: Tip[] = [];
  for (const ang of [-0.42, 0.05, 0.46]) {
    const len = 0.17;
    branch(trunkX(TRUNK_TOP), -TRUNK_TOP, ang, len, 0.026, 4, { t0: CLOCK.crown[0], t1: CLOCK.crown[1], reach: reachOf(len, 4), dist: 0, fruit: 0.05, root: false, part: PART.crown, budSize: 1.1 }, crownTips);
  }
  const top = crownTips.reduce((b, p) => (p.y < b.y ? p : b), crownTips[0]);

  dots.sort((p, q) => p.t - q.t);
  const box = (list: Dot[]): Box => {
    const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (const d of list) {
      b.minX = Math.min(b.minX, d.x);
      b.maxX = Math.max(b.maxX, d.x);
      b.minY = Math.min(b.minY, d.y);
      b.maxY = Math.max(b.maxY, d.y);
    }
    return b;
  };

  return {
    dots,
    roots,
    limbs,
    engine: { x: trunkX(0.12) + 0.02, y: -0.12, t: trunkTime(0.12) },
    model: { x: trunkX(0.19) - 0.02, y: -0.19, t: trunkTime(0.19) },
    crown: { x: top.x, y: top.y, t: CLOCK.crown[1] },
    bounds: box(dots),
    canopy: box(dots.filter((d) => d.part < PART.root(0) && d.y < 0)),
    underground: box(dots.filter((d) => d.part >= PART.root(0))),
  };
}

/** Trunk attach heights and outward angles (0 is straight up) for up to four limbs. */
const LIMBS = [
  { h: 0.25, ang: -1.05, len: 0.27 },
  { h: 0.35, ang: 1.0, len: 0.27 },
  { h: 0.45, ang: -0.78, len: 0.25 },
  { h: 0.54, ang: 0.74, len: 0.23 },
];

/**
 * A twig from one point to another that curves on the way, with a bud at its end. Its dots run
 * on their own clock, 0 to 1, so the page can grow it when someone opens a finding.
 */
export function sprout(x0: number, y0: number, x1: number, y1: number, part: number, fruit: number, seed: number, withBud = true): Dot[] {
  const rnd = mulberry32(seed);
  const dots: Dot[] = [];
  const { stroke, bud } = painter(rnd, dots);
  const len = Math.hypot(x1 - x0, y1 - y0);
  // Bow the twig sideways by a fraction of its length.
  const bow = (rnd() - 0.5) * 0.5 * len;
  const cx = (x0 + x1) / 2 + (-(y1 - y0) / len) * bow;
  const cy = (y0 + y1) / 2 + ((x1 - x0) / len) * bow;
  const at = (u: number) => [(1 - u) ** 2 * x0 + 2 * (1 - u) * u * cx + u * u * x1, (1 - u) ** 2 * y0 + 2 * (1 - u) * u * cy + u * u * y1];
  const STEPS = 10;
  for (let i = 0; i < STEPS; i++) {
    const [ax, ay] = at(i / STEPS);
    const [bx, by] = at((i + 1) / STEPS);
    stroke(ax, ay, bx, by, lerp(0.009, 0.004, i / STEPS), lerp(0.009, 0.004, (i + 1) / STEPS), (i / STEPS) * 0.8, ((i + 1) / STEPS) * 0.8, part, fruit);
  }
  if (withBud) bud(x1, y1, 0.8, part, fruit, 0.7);
  return dots.sort((p, q) => p.t - q.t);
}

/** Index of the first dot that has not appeared by time g (dots are sorted by t). */
export function visibleCount(dots: Dot[], g: number) {
  let lo = 0;
  let hi = dots.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dots[mid].t <= g) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
