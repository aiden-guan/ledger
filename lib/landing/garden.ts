/*
 * The pond at the bottom of the river, where the koi comes to rest and the page ends. It blooms as
 * the koi swims in: lily pads open out across the water, flowers open on them, the banks flower,
 * and three more koi come up to meet it. Same plane and units as the river. Like everything else
 * on the page it is lit from the upper left, and its shadows are ink-blue.
 */

import type { KoiKind, Loop } from "./pond";
import { SHADOW } from "./river";
import { INK, type Ink, mulberry32 } from "./tree";

export interface Pad {
  x: number;
  y: number;
  r: number;
  /** Which way the pad's notch points, radians. */
  notch: number;
  /** A brighter blue pad among the ink-blue ones. */
  bright: boolean;
  /** When it opens on the bloom clock. */
  at: number;
}

export interface Flower {
  x: number;
  y: number;
  r: number;
  kind: "lily" | "lotus" | "bud";
  turn: number;
  at: number;
}

/** A flowering bush on the bank, as pixels: x and y px from its middle, the ink, and when on its own clock (0 to 1) it shows. */
export interface Bush {
  x: number;
  y: number;
  r: number;
  at: number;
  dots: { x: number; y: number; ink: Ink; h: number }[];
}

export interface PondKoi {
  kind: KoiKind;
  seed: number;
  /** Its loop, around (x, y). */
  loop: Loop;
  x: number;
  y: number;
  len: number;
  at: number;
}

/** Something adrift on the water, wandering round a small loop: a petal, or a glint of light. */
export interface Drift {
  x: number;
  y: number;
  rx: number;
  ry: number;
  /** Radians a second. */
  speed: number;
  phase: number;
  ink: Ink;
  /** Pixels long. */
  len: number;
  at: number;
}

export interface Garden {
  /** Where the pond's view starts down the plane, and how tall it is. */
  top: number;
  view: number;
  mouth: { x: number; y: number };
  /** Kept clear for the closing words. */
  clearing: { x: number; y: number; rx: number; ry: number };
  pads: Pad[];
  flowers: Flower[];
  bushes: Bush[];
  koi: PondKoi[];
  petals: Drift[];
  glints: Drift[];
  /** Where the river's koi swims once it is out of the mouth, ending where it comes to rest. */
  path: [number, number][];
  /** The furthest anything is from the mouth: the bloom's front runs out this far. */
  reach: number;
}

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const gauss = (rnd: () => number) => (rnd() + rnd() + rnd() + rnd() - 2) / 0.577;

/**
 * Lays out the pond. Its view starts `top` down the plane and is `view` tall; the river comes in
 * at (mouthX, mouthY), `half` wide either side, and its banks open out to the edges by `open`.
 * `koi` is the length of the koi that comes down the river; `cell` the page's pixel size, which
 * the bushes are drawn to.
 */
export function layGarden(o: { width: number; view: number; top: number; mouthX: number; mouthY: number; open: number; half: number; narrow: boolean; cell: number; koi: number }): Garden {
  const { width, view, top, narrow, cell } = o;
  const rnd = mulberry32(4243);
  const unit = Math.min(width, view);
  const W2 = width / 2;
  const shore = width * 0.1;
  const mouth = { x: o.mouthX, y: o.mouthY };
  const clearing = narrow
    ? { x: 0, y: top + view * 0.45, rx: width * 0.47, ry: view * 0.15 }
    : { x: 0, y: top + view * 0.5, rx: Math.min(width * 0.27, 380), ry: view * 0.14 };
  const inClearing = (x: number, y: number, pad: number) => ((x - clearing.x) / (clearing.rx + pad)) ** 2 + ((y - clearing.y) / (clearing.ry + pad)) ** 2 < 1;
  const path: [number, number][] = narrow
    ? [
        [width * 0.12, top + view * 0.3],
        [-width * 0.06, top + view * 0.64],
        [-width * 0.14, top + view * 0.8],
      ]
    : [
        [width * 0.15, top + view * 0.3],
        [width * 0.28, top + view * 0.56],
        [width * 0.21, top + view * 0.77],
      ];
  const rest = path[path.length - 1];
  // The page's own furniture: its header above, and the links along the bottom.
  const header = top + (narrow ? 64 : 76);
  const foot = top + view - (narrow ? 64 : 52);

  // Where the land is: beyond the river's banks at the top, then beyond a wavy shore down each side.
  const bankAt = (y: number) => {
    if (y <= o.mouthY) return o.half + Math.abs(o.mouthX);
    const u = Math.min(1, (y - o.mouthY) / (o.open - o.mouthY));
    return o.half + Math.abs(o.mouthX) + (W2 + 40 - o.half) * u * u * (3 - 2 * u);
  };
  const shoreAt = (x: number, y: number) => W2 - shore * (1 + 0.22 * Math.sin(y / (unit * 0.12) + (x < 0 ? 0 : 2.1)) + 0.12 * Math.sin(y / (unit * 0.047) + 1.3));
  const land = (x: number, y: number) => Math.abs(x) > Math.min(bankAt(y), shoreAt(x, y));

  // Bushes, thrown down until the banks are full, kinds coming in patches. Lower ones are drawn
  // later, in front.
  const bushes: Bush[] = [];
  const kindAt = (x: number, y: number) => {
    const v = Math.sin(x / (unit * 0.11) + 0.7) + Math.sin(y / (unit * 0.15) - x / (unit * 0.29) + 2.2);
    return v > 0.95 ? 2 : v > 0.05 ? 0 : v > -0.8 ? 3 : 1;
  };
  for (let tries = 0; tries < (narrow ? 1400 : 3200); tries++) {
    const x = (rnd() * 2 - 1) * (W2 + 20);
    const y = top + rnd() * view;
    const r = unit * (narrow ? lerp(0.035, 0.06, rnd() ** 1.4) : lerp(0.028, 0.056, rnd() ** 1.4));
    if (!land(x, y) || !land(x - Math.sign(x) * r * 0.5, y)) continue;
    if (y + r > foot || (y - r < header && Math.abs(x) > W2 - (narrow ? 150 : 240) && x < 0)) continue;
    if (bushes.some((b) => Math.hypot(b.x - x, b.y - y) < (b.r + r) * 0.62)) continue;
    bushes.push({ x, y, r, at: 0, dots: bushDots(kindAt(x, y), r, cell, rnd) });
  }
  bushes.sort((a, b) => a.y - b.y);

  // Lily pads, in loose clusters, clear of the words, the river's way in, and the koi's resting place.
  const pads: Pad[] = [];
  const clusters = narrow
    ? [
        [-0.2, 0.26],
        [0.24, 0.23],
        [0.2, 0.7],
        [-0.25, 0.7],
      ]
    : [
        [-0.28, 0.3],
        [0.33, 0.26],
        [-0.1, 0.8],
        [0.36, 0.84],
        [-0.34, 0.72],
      ];
  const want = narrow ? 10 : 17;
  for (let tries = 0; tries < 5000 && pads.length < want; tries++) {
    const [cx, cy] = clusters[Math.floor(rnd() * clusters.length)];
    const r = narrow ? lerp(15, 36, rnd() ** 1.5) : lerp(28, 76, rnd() ** 1.6);
    const x = cx * width + gauss(rnd) * unit * 0.065;
    const y = top + cy * view + gauss(rnd) * unit * 0.06;
    if (land(x, y) || land(x - Math.sign(x) * r * 0.6, y)) continue;
    if (y < top + view * 0.2 + r * 0.3 || y > foot - r) continue;
    if (inClearing(x, y, r + 10)) continue;
    // The way in from the river's mouth stays open.
    if (Math.abs(x - mouth.x) < Math.min(o.half, W2 * 0.4) + r * 0.5 && y < top + view * 0.34) continue;
    if (Math.hypot(x - rest[0], y - rest[1]) < o.koi * 0.66 + r) continue;
    if (pads.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r + 4)) continue;
    pads.push({ x, y, r, notch: rnd() * Math.PI * 2, bright: rnd() < 0.3, at: 0 });
  }

  // Flowers: lotus on the two biggest pads, lilies on every other one after, and buds on the smallest.
  const flowers: Flower[] = [];
  const bySize = [...pads].sort((a, b) => b.r - a.r);
  bySize.forEach((p, i) => {
    // Set toward the side away from the notch.
    const a = p.notch + Math.PI + (rnd() - 0.5) * 1.4;
    const at = (k: number, r: number, kind: Flower["kind"]) => flowers.push({ x: p.x + Math.cos(a) * p.r * k, y: p.y + Math.sin(a) * p.r * k, r, kind, turn: rnd() * 6.3, at: 0 });
    if (i < 2) at(0.22, p.r * 0.8, "lotus");
    else if (i >= bySize.length - 3) at(0.34, Math.max(cell * 1.8, p.r * 0.3), "bud");
    else if (i % 2 === 0) at(0.28, p.r * 0.66, "lily");
  });

  // Three koi live here already, each on its own lazy loop.
  const koi: PondKoi[] = (
    narrow
      ? [
          { kind: "fast" as const, seed: 53, x: -0.2, y: 0.27, r: 0.17, squash: 0.62, lap: 21 },
          { kind: "gold" as const, seed: 71, x: 0.14, y: 0.76, r: 0.24, squash: 0.42, lap: 27 },
          { kind: "slow" as const, seed: 89, x: 0.22, y: 0.24, r: 0.14, squash: 0.7, lap: 19 },
        ]
      : [
          { kind: "fast" as const, seed: 53, x: -0.25, y: 0.33, r: 0.085, squash: 0.62, lap: 22 },
          { kind: "gold" as const, seed: 71, x: -0.2, y: 0.78, r: 0.12, squash: 0.42, lap: 28 },
          { kind: "slow" as const, seed: 89, x: 0.27, y: 0.3, r: 0.075, squash: 0.66, lap: 19 },
        ]
  ).map((k) => ({
    kind: k.kind,
    seed: k.seed,
    x: k.x * width,
    y: top + k.y * view,
    len: o.koi * (narrow ? 0.62 : 0.5),
    loop: { r: k.r * width, squash: k.squash, lap: k.lap, phase: rnd() * 6.3, lumps: [rnd() * 3, rnd() * 3] as [number, number] },
    at: 0,
  }));

  // Petals adrift, and short glints where the light catches the water.
  const open = (x: number, y: number, pad: number) => !land(x, y) && !inClearing(x, y, pad) && y > top + view * 0.18 && y < foot - 10;
  const petals: Drift[] = [];
  for (let tries = 0; tries < 400 && petals.length < (narrow ? 8 : 14); tries++) {
    const x = (rnd() * 2 - 1) * (W2 - shore);
    const y = top + view * (0.2 + rnd() * 0.72);
    if (!open(x, y, 20)) continue;
    petals.push({ x, y, rx: unit * (0.01 + rnd() * 0.03), ry: unit * (0.008 + rnd() * 0.02), speed: (0.08 + rnd() * 0.12) * (rnd() < 0.5 ? -1 : 1), phase: rnd() * 6.3, ink: rnd() < 0.6 ? INK.petalPale : INK.petal, len: 2, at: 0 });
  }
  const glints: Drift[] = [];
  for (let tries = 0; tries < 900 && glints.length < (narrow ? 22 : 54); tries++) {
    const x = (rnd() * 2 - 1) * (W2 - shore);
    const y = top + view * (0.12 + rnd() * 0.84);
    if (!open(x, y, 6) || pads.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + 8)) continue;
    glints.push({ x, y, rx: 3 + rnd() * 6, ry: 0, speed: 0.25 + rnd() * 0.35, phase: rnd() * 6.3, ink: INK.mossLight, len: 2 + Math.floor(rnd() * 3), at: 0 });
  }

  // Everything opens as the bloom's front reaches it, running out from the mouth.
  const far = (x: number, y: number) => Math.hypot(x - mouth.x, (y - mouth.y) * 1.15);
  let reach = 1;
  for (const p of [...bushes, ...pads, ...koi, ...petals]) reach = Math.max(reach, far(p.x, p.y));
  const when = (x: number, y: number) => Math.min(0.6, (far(x, y) / reach) * 0.52 + rnd() * 0.06);
  for (const b of bushes) b.at = when(b.x, b.y);
  for (const p of pads) p.at = when(p.x, p.y);
  for (const f of flowers) f.at = Math.min(0.7, when(f.x, f.y) + 0.12);
  for (const k of koi) k.at = Math.min(0.66, when(k.x, k.y) + 0.06);
  for (const g of glints) g.at = when(g.x, g.y);
  for (const p of petals) p.at = 0.55 + rnd() * 0.25;

  return { top, view, mouth, clearing, pads, flowers, bushes, koi, petals, glints, path, reach };
}

/** Each kind of bush's flowers in light, middle and shade, their hearts, and the shadow between them: azalea, iris, marigold, blossom. */
const BUSHES: { light: Ink; mid: Ink; dark: Ink; eye: Ink }[] = [
  { light: INK.petalPale, mid: INK.petal, dark: INK.rust, eye: INK.gold },
  { light: INK.mossLight, mid: INK.violet, dark: INK.navy, eye: INK.gold },
  { light: INK.gold, mid: INK.fruit, dark: INK.rust, eye: INK.rust },
  { light: INK.petalPale, mid: INK.petalPale, dark: INK.petal, eye: INK.gold },
];

/**
 * A bush, as pixels on the page's grid: a lobed mound covered in small flowers, each a few pixels
 * round its heart with shadow between them, lit from the upper left like a dome. Each pixel's `h`
 * is when, as the bush opens, it shows: the mound grows out from its middle, hearts last.
 */
export function bushDots(kind: number, r: number, cell: number, rnd: () => number) {
  const tone = BUSHES[kind];
  const dots: Bush["dots"] = [];
  const s1 = rnd() * 6.3;
  const s2 = rnd() * 6.3;
  const edge = (a: number) => r * (1 + 0.1 * Math.sin(3 * a + s1) + 0.07 * Math.sin(7 * a + s2));
  const n = Math.ceil((r * 1.2) / cell);
  // Flower hearts on a jittered grid, three pixels apart, in grid units.
  const G = 3;
  const m = Math.ceil(n / G) + 1;
  const hearts = new Map<number, [number, number]>();
  for (let j = -m; j <= m; j++) for (let i = -m; i <= m; i++) hearts.set(j * 1000 + i, [i * G + (j & 1) * 1.5 + (rnd() - 0.5) * 1.2, j * G + (rnd() - 0.5) * 1.2]);
  for (let gy = -n; gy <= n; gy++) {
    for (let gx = -n; gx <= n; gx++) {
      const x = gx * cell;
      const y = gy * cell;
      const e = edge(Math.atan2(y, x));
      const ux = x / e;
      const uy = y / e;
      const q = ux * ux + uy * uy;
      if (q > 1) continue;
      const lit = -0.5 * ux - 0.6 * uy + 0.62 * Math.sqrt(1 - q);
      // The nearest heart, and where this pixel is from it: each flower is lit from the upper left too.
      const hi = Math.round(gx / G);
      const hj = Math.round(gy / G);
      let near = Infinity;
      let ox = 0;
      let oy = 0;
      let eye = false;
      for (let j = hj - 1; j <= hj + 1; j++) {
        for (let i = hi - 1; i <= hi + 1; i++) {
          const h = hearts.get(j * 1000 + i);
          if (!h) continue;
          const dd = Math.hypot(gx - h[0], gy - h[1]);
          if (dd < near) [near, ox, oy, eye] = [dd, gx - h[0], gy - h[1], (i * 7 + j * 13) % 5 < 2];
        }
      }
      const l = lit - 0.32 * ((ox * 0.55 + oy * 0.7) / 1.3);
      let ink: Ink;
      if (q > 0.86 && ux * 0.55 + uy * 0.7 > 0.2) ink = tone.dark;
      else if (near < 0.55 && eye && lit > -0.1) ink = tone.eye;
      else if (near < 1.45) ink = l > 0.42 ? tone.light : l > -0.05 ? tone.mid : tone.dark;
      else ink = lit > 0.7 ? tone.mid : tone.dark;
      dots.push({ x, y, ink, h: Math.sqrt(q) * 0.8 + (near < 0.55 ? 0.15 : 0) });
    }
  }
  return dots;
}

const VEIN = (Math.PI * 2) / 9;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * A lily pad's ink at x, y px from its middle, -1 off it, or SHADOW where it shades the water.
 * `size` is how far it has opened, 0 to a little over 1; `cell` the page's pixel size, for
 * one-pixel veins and rims.
 */
export function padInk(x: number, y: number, pad: Pad, size: number, cell: number): Ink | -1 | -2 {
  const r = pad.r * size;
  if (r < cell) return -1;
  const dist = Math.hypot(x, y);
  const rho = dist / r;
  const off = wrap(Math.atan2(y, x) - pad.notch);
  // The notch: a slit from the stem to the edge, opening a little toward the edge.
  if (rho > 1 || Math.abs(off) < 0.03 + 0.2 * rho) {
    // A pixel of shadow down and to the right of it.
    return Math.hypot(x - cell, y - cell * 1.2) < r && rho > 1 ? SHADOW : -1;
  }
  const lit = -(x * 0.55 + y * 0.7) / Math.max(dist, 1e-6);
  const rim = dist > r - cell * 1.05;
  const body = pad.bright ? INK.moss : INK.navy;
  const light = pad.bright ? INK.mossLight : INK.moss;
  // Lit along the upper left edge.
  if (rim) return lit > 0.25 ? light : body;
  if (dist > r - cell * 2.05 && lit > 0.6) return light;
  // Veins from the stem, every other pixel.
  const k = Math.round(off / VEIN);
  if (k !== 0 && rho > 0.16 && rho < 0.8 && Math.abs(Math.sin(off - k * VEIN)) * dist < cell * 0.5 && Math.round(dist / cell) % 2 === 0) return light;
  return rho < 0.08 ? light : body;
}

/** Whether a point at rho, a (polar, in flower radii) is on one of a ring of n petals; how far along it if so (0 to 1, past 1 on its edge), else -1. `round` is 1 for pointed petals, lower for rounder ones. */
function onPetal(rho: number, a: number, n: number, len: number, wid: number, off: number, round: number, edge: number) {
  const step = (Math.PI * 2) / n;
  const da = a - off - Math.round((a - off) / step) * step;
  const along = rho * Math.cos(da);
  if (along <= 0 || along >= len) return -1;
  const hw = wid * Math.sin((Math.PI * along) / len) ** round;
  const across = Math.abs(rho * Math.sin(da));
  if (across >= hw) return -1;
  return across > hw - edge || along > len - edge ? 1 + along / len : along / len;
}

/**
 * A flower's ink at x, y px from its middle, or -1 off it, `open` of the way open. Petals are
 * outlined in deep pink so each one reads, pale at the base and deepening to the tip.
 */
export function flowerInk(x: number, y: number, f: Flower, open: number, cell: number): Ink | -1 {
  if (open <= 0) return -1;
  if (f.kind === "bud") {
    const R = f.r * Math.min(1, open * 1.6);
    const rho = Math.hypot(x, y) / R;
    if (rho > 1) return -1;
    return rho > 1 - cell / R || -(x * 0.55 + y * 0.7) / R < -0.1 ? INK.petal : INK.petalPale;
  }
  const R = f.r * (0.3 + 0.7 * open);
  const rho = Math.hypot(x, y) / R;
  if (rho > 1) return -1;
  const a = Math.atan2(y, x) - f.turn;
  const edge = (cell * 0.9) / R;
  if (f.kind === "lotus") {
    // A seed head pocked with seeds, a ring of stamens, then three rings of broad petals, the
    // inner ones palest.
    if (rho < 0.2) return rho < 0.2 - edge && Math.round(x / cell) % 2 === 0 && Math.round(y / cell) % 2 === 0 ? INK.fruit : INK.gold;
    if (rho < 0.28) return INK.gold;
    const rings: [number, number, number, number, Ink][] = [
      [5, 0.56, 0.24, 0.3, INK.petalPale],
      [7, 0.8, 0.27, 0.9, INK.petalPale],
      [9, 1, 0.24, 0.2, INK.petal],
    ];
    for (const [n, len, wid, off, tip] of rings) {
      const p = onPetal(rho, a, n, len * open ** 0.3, wid, off, 0.5, edge);
      if (p < 0) continue;
      if (p >= 1) return INK.petal;
      return p > 0.7 ? tip : INK.petalPale;
    }
    return -1;
  }
  // A water lily: pointed petals in two rings round a gold heart.
  if (rho < 0.18) return rho < 0.18 - edge ? INK.gold : INK.fruit;
  const rings: [number, number, number, number][] = [
    [7, 0.7, 0.2, 0.25],
    [9, 1, 0.19, 0],
  ];
  for (const [n, len, wid, off] of rings) {
    const p = onPetal(rho, a, n, len * open ** 0.3, wid, off, 0.8, edge);
    if (p < 0) continue;
    return p >= 1 || p > 0.75 ? INK.petal : INK.petalPale;
  }
  return -1;
}
