/*
 * Where the story ends: the river runs out into the sea, over sand in clear shallow water, and on
 * it a reef: patches of coral with sand between, thickest round a clearing where the koi and their
 * young come to rest and stay. Seen from straight overhead, like the pond.
 *
 * Same plane and units as the river. Each coral is worked out once as pixels at the size the page
 * draws it (`unit` px of the plane to a pixel), lit from the upper left like everything else, with
 * its shadow falling to the lower right on the sand. No greens: the reef is pinks, oranges, golds,
 * violets and blues.
 */

import { INK, type Ink, mulberry32 } from "./tree";

type Pt = [number, number];

export type CoralKind = "brain" | "branch" | "table" | "anemone" | "tubes" | "star" | "urchin" | "clam";

export interface Coral {
  kind: CoralKind;
  x: number;
  y: number;
  /** Radius in pixels as drawn. */
  r: number;
  seed: number;
  hue: Hue;
  turn: number;
  /** Clownfish living in it (anemones only). */
  clowns: number;
}

/** A school of small fish going round a loop: its middle, its radii, how many, and how fast (radians a second). */
export interface School {
  x: number;
  y: number;
  rx: number;
  ry: number;
  n: number;
  hue: Hue;
  speed: number;
  phase: number;
  /** How far the school spreads around its middle, px of the plane. */
  spread: number;
  /** Fish length in pixels. */
  size: number;
}

export interface Reef {
  /** The floor shows from `from` and fully by `full`, along the way downstream. */
  from: number;
  full: number;
  /** Where the coral grows thick: middles and radii. */
  patches: [number, number, number][];
  corals: Coral[];
  schools: School[];
}

export type Hue = "pink" | "orange" | "gold" | "violet" | "blue";

/** Each hue as shadow, body and lit inks, on a light page and a dark one (where the pale inks are the dim ones). */
const HUES: Record<Hue, { light: [Ink, Ink, Ink]; dark: [Ink, Ink, Ink] }> = {
  pink: { light: [INK.rust, INK.petal, INK.petalPale], dark: [INK.petalPale, INK.petal, INK.petal] },
  orange: { light: [INK.rust, INK.fruit, INK.fruitPale], dark: [INK.fruitPale, INK.fruit, INK.gold] },
  gold: { light: [INK.rust, INK.gold, INK.fruitPale], dark: [INK.fruitPale, INK.gold, INK.gold] },
  violet: { light: [INK.navy, INK.violet, INK.petalPale], dark: [INK.mossLight, INK.violet, INK.navy] },
  blue: { light: [INK.navy, INK.moss, INK.mossLight], dark: [INK.mossLight, INK.moss, INK.navy] },
};
export const ramp = (hue: Hue, dark: boolean) => HUES[hue][dark ? "dark" : "light"];

/** What grows where: [kind, weight in the middle of a patch, weight at its edge, weight out on the sand, radius range in pixels, the hues it comes in]. */
const KINDS: [CoralKind, number, number, number, [number, number], Hue[]][] = [
  ["table", 5, 1, 0, [10, 16], ["blue", "violet", "gold"]],
  ["brain", 6, 3, 0, [7, 12], ["gold", "violet", "pink", "orange"]],
  ["branch", 5, 6, 0, [7, 12], ["pink", "violet", "orange", "blue"]],
  ["anemone", 2, 5, 0.3, [5, 8], ["pink", "orange", "violet"]],
  ["tubes", 2, 4, 0, [4, 7], ["orange", "violet", "gold"]],
  ["star", 0, 2, 3, [2.5, 4], ["orange", "pink", "gold"]],
  ["urchin", 0, 2, 1.5, [2.5, 3.6], ["violet", "blue"]],
  ["clam", 0, 1.5, 1, [3, 4.5], ["blue", "violet"]],
];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number) => {
  const u = clamp01((v - a) / (b - a));
  return u * u * (3 - 2 * u);
};
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

export interface ReefInput {
  /** Where the river opens into the sea, and the middle of the screen once the view settles in the reef. */
  sea: number;
  view: Pt;
  /** The screen in px of the plane at the reef's zoom, and px of the plane per pixel. */
  across: number;
  down: number;
  unit: number;
  /** Corals keep this far off the screen-sized boxes and circles given (the words, the koi's rings), and off the channel they swim in along. */
  keepOff: { boxes: [number, number, number, number][]; circles: [number, number, number][]; channel: Pt[]; half: number };
  /** The water's edges, so nothing grows on land. */
  water: (x: number) => [number, number];
  /** Coral sizes scale with the screen. */
  scale: number;
}

/** How thick the coral is at a point: 1 in the middle of a patch, falling to 0 at its edge. */
export function patchAt(reef: Pick<Reef, "patches">, x: number, y: number) {
  let best = 0;
  for (const [px, py, pr] of reef.patches) best = Math.max(best, smooth(1, 0.35, Math.hypot(x - px, y - py) / pr));
  return best;
}

/**
 * Patches round where the view comes to rest, as shares of the screen across and down from its
 * top left, and radii as shares of its width; then smaller ones out along the way in.
 */
const PATCHES: [number, number, number][] = [
  [0.08, 0.5, 0.2],
  [0.26, 0.94, 0.12],
  [0.93, 0.48, 0.2],
  [0.74, 0.95, 0.12],
  [0.18, 0.04, 0.1],
  [0.83, 0.03, 0.11],
  [0.5, 1.08, 0.09],
  [-0.28, 0.16, 0.12],
  [-0.42, 0.9, 0.13],
  [-0.72, 0.28, 0.1],
  [-0.86, 0.95, 0.1],
  [-1.12, 0.12, 0.08],
  [-1.3, 0.82, 0.07],
  [1.25, 0.3, 0.16],
  [1.2, 0.95, 0.14],
];

export function layReef(o: ReefInput): Reef {
  const rnd = mulberry32(4241);
  const A = o.across;
  const D = o.down;
  const [vx, vy] = o.view;
  const reef: Reef = {
    from: o.sea + A * 0.05,
    full: o.sea + A * 0.75,
    patches: PATCHES.map(([u, w, r]) => [vx + (u - 0.5) * A + (rnd() - 0.5) * A * 0.03, vy + (w - 0.5) * D + (rnd() - 0.5) * D * 0.03, r * A]),
    corals: [],
    schools: [],
  };
  /** A kind of coral for a spot `thick` into a patch. */
  const pick = (thick: number) => {
    const weight = (k: (typeof KINDS)[number]) => (thick > 0.6 ? lerp(k[2], k[1], (thick - 0.6) / 0.4) : thick > 0 ? lerp(k[3], k[2], thick / 0.6) : k[3]);
    const total = KINDS.reduce((s, k) => s + weight(k), 0);
    let w = rnd() * total;
    for (const k of KINDS) {
      w -= weight(k);
      if (w <= 0) return k;
    }
    return KINDS[KINDS.length - 1];
  };
  const nearChannel = (x: number, y: number, r: number) => {
    const c = o.keepOff.channel;
    for (let i = 0; i < c.length - 1; i++) {
      const [ax, ay] = c[i];
      const [bx, by] = c[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const u = clamp01(((x - ax) * dx + (y - ay) * dy) / Math.max(1e-9, dx * dx + dy * dy));
      if (Math.hypot(x - ax - dx * u, y - ay - dy * u) < o.keepOff.half + r) return true;
    }
    return false;
  };
  const x0 = o.sea;
  const x1 = vx + A * 1.6;
  const corals: Coral[] = [];
  for (let tries = 0; tries < 16000 && corals.length < 320; tries++) {
    const x = lerp(x0, x1, rnd());
    const y = lerp(vy - D * 0.75, vy + D * 0.75, rnd());
    const thick = patchAt(reef, x, y) * smooth(x0, reef.full, x);
    // Mostly in the patches; now and then something small out on the sand.
    if (rnd() > thick * 0.97 + 0.05) continue;
    const [kind, , , , [r0, r1], hues] = pick(thick);
    const r = lerp(r0, r1, rnd() ** (thick > 0.7 ? 0.7 : 1.6)) * o.scale * o.unit;
    const small = kind === "star" || kind === "urchin" || kind === "clam";
    const [top, bottom] = o.water(x);
    if (y < top + r * 1.6 || y > bottom - r * 1.6) continue;
    if (o.keepOff.boxes.some(([bx0, by0, bx1, by1]) => x > bx0 - r && x < bx1 + r && y > by0 - r && y < by1 + r)) continue;
    if (o.keepOff.circles.some(([qx, qy, qr]) => Math.hypot(x - qx, y - qy) < qr + r)) continue;
    if (!small && nearChannel(x, y, r)) continue;
    if (small && nearChannel(x, y, -o.keepOff.half * 0.6)) continue;
    if (corals.some((c) => Math.hypot(c.x - x, c.y - y) < (c.r + r) * (small || c.kind === "star" ? 0.95 : 0.84))) continue;
    corals.push({
      kind,
      x,
      y,
      r,
      seed: Math.floor(rnd() * 1e6),
      hue: hues[Math.floor(rnd() * hues.length)],
      turn: rnd() * Math.PI * 2,
      clowns: kind === "anemone" && rnd() < 0.6 ? 1 + (rnd() < 0.4 ? 1 : 0) : 0,
    });
  }
  // Those further down the screen are drawn over those above.
  reef.corals = corals.sort((a, b) => a.y - b.y);

  // Schools of small fish, going round loops by the patches, clear of the words: middles as shares
  // of the screen once the view settles, radii as shares of its width and height.
  const schools: [number, number, number, number, number, Hue, number][] = [
    [0.2, 0.62, 0.08, 0.14, 13, "gold", 0.3],
    [0.8, 0.66, 0.08, 0.13, 10, "violet", -0.26],
    [0.62, 0.86, 0.1, 0.05, 9, "blue", 0.36],
    [-0.35, 0.5, 0.14, 0.18, 12, "orange", -0.22],
  ];
  reef.schools = schools.map(([u, w, frx, fry, n, hue, speed], i) => ({
    x: vx + (u - 0.5) * A,
    y: vy + (w - 0.5) * D,
    rx: frx * A,
    ry: fry * D,
    n,
    hue,
    speed,
    phase: i * 1.7,
    spread: o.unit * o.scale * 7,
    size: o.scale > 0.8 ? 3 : 2,
  }));
  return reef;
}

/* ---------------------------------------------------------------- corals as pixels */

/** A sprite: x and y pixel offsets from the coral's middle, the ink (or -1 for shadow on the sand), and its height for drawing order. */
export type Sprite = Int16Array;

const LX = -0.6;
const LY = -0.8;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
const dither = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];

/** The pixels of a coral that holds still, worked out once: `unit` is px of the plane per pixel. */
export function coralCells(c: Coral, unit: number, dark: boolean): Sprite {
  const R = c.r / unit;
  const [shadowInk, body, lit] = ramp(c.hue, dark);
  const rnd = mulberry32(c.seed);
  const cells = new Map<number, [number, number]>();
  const key = (x: number, y: number) => (y + 512) * 1024 + (x + 512);
  const set = (x: number, y: number, ink: number, z: number) => {
    const k = key(x, y);
    const was = cells.get(k);
    if (!was || z >= was[1]) cells.set(k, [ink, z]);
  };
  const shade = (k: number) => (k > 0.45 ? lit : k > -0.4 ? body : shadowInk);
  const span = Math.ceil(R) + 3;

  if (c.kind === "brain") {
    // A dome with a maze of thin grooves over it: ridges catch the light on the upper left, the
    // lower right edge goes dark.
    const [s1, s2, s3, s4, s5] = [rnd() * 6, rnd() * 6, rnd() * 6, rnd() * 6, rnd() * 6];
    const edge = (a: number) => R * (1 + 0.07 * Math.sin(3 * a + s1) + 0.05 * Math.sin(5 * a + s2) + 0.03 * Math.sin(9 * a + s3));
    const ca = Math.cos(c.turn);
    const sa = Math.sin(c.turn);
    const lift = R * 0.24;
    for (let j = -span; j <= span + 2; j++) {
      for (let i = -span; i <= span + 2; i++) {
        const a = Math.atan2(j, i);
        const d = Math.hypot(i, j);
        const e = edge(a);
        if (d <= e) {
          const u = d / e;
          const k = (LX * i + LY * j) / e;
          const warp = 3.1 * Math.sin(0.41 * i + 0.23 * j + s4) + 2.7 * Math.sin(0.37 * j - 0.19 * i + s5) + 1.6 * Math.sin(0.53 * i - 0.47 * j + s1);
          const groove = Math.abs(Math.sin((i * ca + j * sa) * 0.95 + warp)) < 0.3;
          let ink: number = body;
          if (u > 0.9 && k < 0.1) ink = shadowInk;
          else if (groove) ink = k > 0.55 ? body : shadowInk;
          else if (k + dither(i, j) * 0.2 > 0.38) ink = lit;
          set(i, j, ink, groove ? 7 : 8);
        } else {
          // Its shadow on the sand, to the lower right.
          const si = i - lift;
          const sj = j - lift;
          if (Math.hypot(si, sj) <= edge(Math.atan2(sj, si)) && dither(i, j) < 0.05) set(i, j, -1, 2);
        }
      }
    }
  } else if (c.kind === "table") {
    // A flat plate up on a stalk: fine ridges out from the middle to a scalloped rim, lit along
    // its upper left edge, and a broad shadow under it.
    const [s1, s2, s3] = [rnd() * 6, rnd() * 6, rnd() * 6];
    const edge = (a: number) => R * (1 + 0.05 * Math.sin(11 * a + s1) + 0.04 * Math.sin(17 * a + s2));
    const lift = R * 0.34;
    const ribs = Math.max(10, Math.round(R * 1.5));
    for (let j = -span; j <= span + Math.ceil(lift) + 1; j++) {
      for (let i = -span; i <= span + Math.ceil(lift) + 1; i++) {
        const a = Math.atan2(j, i);
        const d = Math.hypot(i, j);
        const e = edge(a);
        if (d <= e) {
          const u = d / e;
          const k = (LX * i + LY * j) / e;
          const rib = u > 0.25 && Math.abs(Math.sin((a * ribs) / 2 + s3 + u * 0.8)) < 0.22;
          let ink: number = body;
          if (u > 0.88) ink = k > 0 ? lit : shadowInk;
          else if (u < 0.14) ink = k > 0.05 ? lit : shadowInk;
          else if (rib) ink = shadowInk;
          else if (k > 0.45 && u > 0.6 && dither(i, j) > -0.2) ink = lit;
          set(i, j, ink, 8);
        } else {
          const si = i - lift;
          const sj = j - lift * 1.1;
          if (Math.hypot(si, sj) <= edge(Math.atan2(sj, si)) * 0.96 && dither(i, j) < 0.1) set(i, j, -1, 2);
        }
      }
    }
  } else if (c.kind === "branch") {
    // Staghorn from above: branches out from the middle, forking, their tips pale.
    type Seg = { x0: number; y0: number; x1: number; y1: number; w0: number; w1: number; tip: boolean; depth: number };
    const segs: Seg[] = [];
    const grow = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
      const x1 = x + Math.cos(a) * len;
      const y1 = y + Math.sin(a) * len;
      const end = depth >= 2 || len < 1.6;
      segs.push({ x0: x, y0: y, x1, y1, w0: w, w1: end ? 0.55 : w * 0.78, tip: end, depth });
      if (end) return;
      const spread = 0.35 + rnd() * 0.3;
      grow(x1, y1, a - spread, len * (0.6 + rnd() * 0.2), w * 0.78, depth + 1);
      if (rnd() < 0.85) grow(x1, y1, a + spread, len * (0.55 + rnd() * 0.2), w * 0.74, depth + 1);
    };
    const n = 5 + Math.floor(rnd() * 3);
    for (let b = 0; b < n; b++) grow(0, 0, c.turn + (b / n) * Math.PI * 2 + (rnd() - 0.5) * 0.5, R * (0.36 + rnd() * 0.16), 1.25, 0);
    const lift = 1.6;
    for (const s of segs) {
      const dx = s.x1 - s.x0;
      const dy = s.y1 - s.y0;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const steps = Math.ceil(len / 0.35);
      for (let q = 0; q <= steps; q++) {
        const u = q / steps;
        const px = s.x0 + dx * u;
        const py = s.y0 + dy * u;
        const w = lerp(s.w0, s.w1, u);
        const r = Math.ceil(w);
        for (let oy = -r; oy <= r; oy++) {
          for (let ox = -r; ox <= r; ox++) {
            const i = Math.round(px + ox);
            const j = Math.round(py + oy);
            const across = (i - px) * nx + (j - py) * ny;
            if (Math.abs(across) > w + 0.15 || Math.hypot(i - px, j - py) > w + 0.5) continue;
            const side = (across * (nx * LX + ny * LY)) / Math.max(0.5, w);
            const tip = s.tip && u > 0.62;
            const level = tip ? 1 : side * 1.1 + 0.15 * (s.depth - 1) + dither(i, j) * 0.4;
            set(i, j, shade(level), 6 + s.depth);
            if (dither(i + 1, j) < 0.1) set(Math.round(i + lift), Math.round(j + lift), -1, 2);
          }
        }
      }
    }
  } else if (c.kind === "tubes") {
    const n = 3 + Math.floor(rnd() * 4);
    const tubes: [number, number, number][] = [];
    for (let k = 0; k < n * 6 && tubes.length < n; k++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * R * 0.55;
      const tr = R * (0.28 + rnd() * 0.16);
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      if (tubes.some(([qx, qy, qr]) => Math.hypot(qx - x, qy - y) < (qr + tr) * 0.9)) continue;
      tubes.push([x, y, tr]);
    }
    for (const [tx, ty, tr] of tubes) {
      const hole = tr * 0.5;
      const lift = tr * 0.9;
      const s = Math.ceil(tr) + 2;
      for (let j = -s; j <= s + Math.ceil(lift); j++) {
        for (let i = -s; i <= s + Math.ceil(lift); i++) {
          const x = Math.round(tx) + i;
          const y = Math.round(ty) + j;
          const d = Math.hypot(x - tx, y - ty);
          if (d <= tr) {
            if (d < hole) {
              set(x, y, (x - tx) * LX + (y - ty) * LY < -0.2 * hole ? shadowInk : dark ? INK.shadow : INK.navy, 9);
              continue;
            }
            const k = ((x - tx) * LX + (y - ty) * LY) / tr;
            set(x, y, shade(k * 1.2 + dither(x, y) * 0.4 - (d > tr - 0.8 && k < 0 ? 0.4 : 0)), 9);
          } else if (Math.hypot(x - tx - lift, y - ty - lift) <= tr && dither(x, y) < 0.1) set(x, y, -1, 2);
        }
      }
    }
  } else if (c.kind === "star") {
    for (let j = -span; j <= span; j++) {
      for (let i = -span; i <= span; i++) {
        const a = Math.atan2(j, i) - c.turn;
        const d = Math.hypot(i, j);
        const arm = (0.5 + 0.5 * Math.cos(5 * a)) ** 2.4;
        const edge = R * (0.3 + 0.7 * arm);
        if (d > edge) continue;
        const spots = (i * 3 + j * 5) % 4 === 0 && d > R * 0.35;
        set(i, j, d < R * 0.22 ? shadowInk : spots ? lit : shade((LX * i + LY * j) / R + 0.1), 4);
      }
    }
  } else if (c.kind === "urchin") {
    const core = R * 0.42;
    for (let j = -span; j <= span; j++) {
      for (let i = -span; i <= span; i++) {
        const d = Math.hypot(i, j);
        if (d <= core) set(i, j, (LX * i + LY * j) / core > 0.35 ? body : shadowInk, 6);
      }
    }
    const spikes = 12;
    for (let k = 0; k < spikes; k++) {
      const a = c.turn + (k / spikes) * Math.PI * 2;
      for (let d = core; d <= R; d += 0.5) {
        const i = Math.round(Math.cos(a) * d);
        const j = Math.round(Math.sin(a) * d);
        set(i, j, d > R - 0.8 ? body : shadowInk, 5);
      }
    }
  } else if (c.kind === "clam") {
    const ca = Math.cos(c.turn);
    const sa = Math.sin(c.turn);
    for (let j = -span; j <= span; j++) {
      for (let i = -span; i <= span; i++) {
        const u = (i * ca + j * sa) / R;
        const w = (-i * sa + j * ca) / (R * 0.58);
        const wave = 0.08 * Math.sin(u * 9);
        const d = u * u + w * w;
        if (d > 1 + wave) continue;
        let ink: number = Math.sin(u * 7 + w * 3) > 0.3 ? lit : Math.sin(u * 11 - w * 5) > 0.5 ? (dark ? INK.violet : INK.violet) : body;
        if (Math.abs(w) < 0.16 && Math.abs(u) < 0.75) ink = dark ? INK.shadow : INK.navy;
        set(i, j, ink, 5);
      }
    }
  }
  // Anemones sway, so they are drawn fresh each frame (see anemoneCells).

  const out: number[] = [];
  cells.forEach(([ink, z], k) => out.push((k % 1024) - 512, Math.floor(k / 1024) - 512, ink, z));
  return Int16Array.from(out);
}

/**
 * An anemone this moment: tentacles from a ring round its mouth, each swaying on its own a little
 * behind the one before, their tips pale. Calls `set` for each pixel.
 */
export function anemoneCells(c: Coral, unit: number, dark: boolean, t: number, set: (i: number, j: number, ink: number, z: number) => void) {
  const R = c.r / unit;
  const [shadowInk, body, lit] = ramp(c.hue, dark);
  const disc = R * 0.34;
  const s = Math.ceil(disc) + 1;
  for (let j = -s; j <= s; j++) {
    for (let i = -s; i <= s; i++) {
      const d = Math.hypot(i, j);
      if (d > disc) continue;
      set(i, j, d < disc * 0.4 ? shadowInk : (LX * i + LY * j) / disc > 0.2 ? lit : body, 7);
    }
  }
  const n = Math.max(12, Math.round(R * 2.6));
  for (let k = 0; k < n; k++) {
    const a0 = c.turn + (k / n) * Math.PI * 2;
    const len = R * (0.82 + 0.18 * Math.sin(k * 2.7 + c.seed));
    const phase = t * 1.5 + k * 0.55 + c.seed * 0.001;
    let x = Math.cos(a0) * disc;
    let y = Math.sin(a0) * disc;
    let a = a0;
    for (let d = disc; d < len; d += 0.6) {
      const u = (d - disc) / (len - disc);
      a = a0 + Math.sin(phase - u * 2.2) * 0.42 * u;
      x += Math.cos(a) * 0.6;
      y += Math.sin(a) * 0.6;
      const ink = u > 0.8 ? (k % 3 === 0 && !dark ? INK.gold : lit) : u < 0.25 ? shadowInk : body;
      set(Math.round(x), Math.round(y), ink, 8 + (u > 0.8 ? 1 : 0));
    }
  }
}

/** A small fish as pixels along its heading: head, body, tail; `n` long. */
export function fishCells(x: number, y: number, hx: number, hy: number, n: number, hue: Hue, dark: boolean, set: (i: number, j: number, ink: number) => void) {
  const [deep, body, lit] = ramp(hue, dark);
  for (let k = 0; k < n + 1; k++) {
    const ink = k === 0 ? lit : k < n ? body : deep;
    set(Math.round(x - hx * k), Math.round(y - hy * k), ink);
  }
  // A fin either side behind the head, on the longer ones.
  if (n >= 3) {
    set(Math.round(x - hx * 1.5 - hy), Math.round(y - hy * 1.5 + hx), body);
    set(Math.round(x - hx * 1.5 + hy), Math.round(y - hy * 1.5 - hx), body);
  }
}

/** A clownfish: orange, with two pale bands, its tail fin dark. */
export function clownCells(x: number, y: number, hx: number, hy: number, dark: boolean, set: (i: number, j: number, ink: number) => void) {
  const band = dark ? INK.shadow : INK.petalPale;
  const along: [number, number][] = [
    [0, INK.fruit],
    [1, band],
    [2, INK.fruit],
    [3, band],
    [4, dark ? INK.fruitPale : INK.rust],
  ];
  for (const [k, ink] of along) {
    set(Math.round(x - hx * k), Math.round(y - hy * k), ink);
    if (k >= 1 && k <= 3) {
      set(Math.round(x - hx * k - hy), Math.round(y - hy * k + hx), ink);
      set(Math.round(x - hx * k + hy), Math.round(y - hy * k - hx), ink);
    }
  }
}
