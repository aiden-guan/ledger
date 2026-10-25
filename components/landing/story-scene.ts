/*
 * Drawing the story after the pond onto the page's pixel grid: the wide river and its banks, the
 * jetty, the fisherman, his rod and line, the spears and what they do to the water, the basket.
 * The koi are drawn by the page itself, like the others. Everything here goes through a painter
 * the page hands over, which knows where the plane is on screen this frame.
 */

import { type Cell, type Drawn, figure, spearCells } from "@/lib/landing/fisher";
import { bayer, hash2 } from "@/lib/landing/pond";
import { type Man, STORY, type Story, farBank, nearBank, spearAt, spearHits } from "@/lib/landing/story";
import { INK, mulberry32 } from "@/lib/landing/tree";

export interface Painter {
  cell: number;
  gw: number;
  gh: number;
  t: number;
  night: boolean;
  /** Where the plane's origin is on screen, how far it is tilted, how far heights rise, and the zoom. */
  surface: { x: number; y: number; tilt: number; zoom: number; lift: number };
  put: (cx: number, cy: number, ink: number, part: number, z?: number) => void;
  /** An ellipse of pixels on the water, thinned to `strength`. */
  ring: (x0: number, y0: number, r: number, tilt: number, strength: number, ink: number, part: number, z: number, salt: number) => void;
  /** Inks for things shaded by the light: on a dark page the deepest and palest blues trade places, and so do the greys. */
  shade: (ink: number) => number;
  stone: (ink: number) => number;
  part: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number) => {
  const u = clamp01((v - a) / (b - a));
  return u * u * (3 - 2 * u);
};
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** Screen px of a point on the plane, at height z. */
export const toX = (p: Painter, x: number) => p.surface.x + x * p.surface.zoom;
export const toY = (p: Painter, y: number, z = 0) => p.surface.y + (y * p.surface.tilt - z * p.surface.lift) * p.surface.zoom;
/** The plane's point under a screen px. */
const fromX = (p: Painter, sx: number) => (sx - p.surface.x) / p.surface.zoom;
const fromY = (p: Painter, sy: number) => (sy - p.surface.y) / (p.surface.tilt * p.surface.zoom);

// Soft value noise on a 64 x 64 lattice, for patches of light on the water.
const NOISE = (() => {
  const rnd = mulberry32(911);
  return Float32Array.from({ length: 64 * 64 }, () => rnd());
})();
function noise(x: number, y: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const at = (i: number, j: number) => NOISE[(j & 63) * 64 + (i & 63)];
  return lerp(lerp(at(x0, y0), at(x0 + 1, y0), ux), lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), ux), uy);
}

/** How much sky the water gives back: none looking straight down, more as the view tilts toward it. */
export const sheen = (tilt: number) => smooth(0.93, 0.66, tilt);

/**
 * The wide river: the water's sheen, the far bank's face and the land along it, the gap the pond
 * drains through, the jetty, the near bank, and the rock in the path.
 */
export function paintRiver(p: Painter, s: Story) {
  const { cell, gw, gh, t, put } = p;
  const S = p.surface;
  const glow = sheen(S.tilt);
  const part = p.part;
  const ink = (k: number) => p.shade(k);
  // Column by column: where the banks and the jetty are on screen.
  for (let cx = 0; cx < gw; cx++) {
    const wx = fromX(p, (cx + 0.5) * cell);
    const fy = farBank(s, wx);
    const ny = nearBank(s, wx);
    const gap = Math.abs(wx - s.outlet.x) < s.outlet.half ? 1 - Math.abs(wx - s.outlet.x) / s.outlet.half : 0;
    const inGap = gap > 0;
    const yLand = toY(p, fy, s.bank);
    const yWater = toY(p, fy, 0);
    const yNear = toY(p, ny, s.bank);
    if (yLand > gh * cell + 40 || yNear < -40) continue;

    // The water, from the far bank (or up the gap to the pond) to where the near bank hides it.
    const top = inGap ? toY(p, s.outlet.top, 0) : yWater;
    const c0 = Math.max(0, Math.floor(top / cell));
    const c1 = Math.min(gh - 1, Math.floor(yNear / cell));
    const onDeck = wx > s.deck.x0 && wx < s.deck.x1;
    const deckFront = toY(p, s.deck.front, 0);
    for (let cy = c0; cy <= c1; cy++) {
      const py = (cy + 0.5) * cell;
      const wy = fromY(p, py);
      const d = bayer(cx, cy) + 0.5;
      // Under the bank and the jetty, the water holds their dark reflection.
      const below = (py - (onDeck ? deckFront : yWater)) / Math.max(1, s.bank * S.lift * S.zoom);
      if (!inGap && below >= 0 && below < 1.2 && glow > 0) {
        const wob = Math.sin(py * 0.21 + t * 1.7 + cx * 0.05);
        if (d < glow * (0.62 - below * 0.35) + wob * 0.06) put(cx, cy, ink(onDeck ? INK.navy : INK.moss), part, 2);
        continue;
      }
      if (glow <= 0) continue;
      // Long, low swells of sky across the water, drifting downstream, sparser toward us.
      const n = noise(wx / 420 - t * 0.05, wy / 48 + t * 0.02) * 0.7 + noise(wx / 130 + 7, wy / 22) * 0.3;
      const far = clamp01((wy - fy) / s.width);
      const dens = glow * Math.max(0, n - 0.32) * 1.25 * (1 - far * 0.45);
      if (d < dens) put(cx, cy, ink(INK.mossLight), part, 1);
      // Now and then a glint of current: a short dash along the flow.
      else if (hash2(Math.floor(wx / 30 - t * 1.4), Math.floor(wy / 7)) < 0.006 * glow) put(cx, cy, ink(n > 0.5 ? INK.moss : INK.mossLight), part, 1);
    }

    if (inGap) continue;
    // The far bank's face, lit across the top, darker and wet at the waterline.
    const f0 = Math.max(0, Math.floor(yLand / cell));
    const f1 = Math.min(gh - 1, Math.floor(yWater / cell));
    for (let cy = f0; cy <= f1; cy++) {
      const u = (cy - f0) / Math.max(1, f1 - f0);
      const h = hash2(cx, cy * 7 + 3);
      let k: number = INK.bark;
      if (cy === f0) k = INK.dust;
      else if (cy === f1) k = INK.navy;
      else if (h < 0.18) k = INK.rust;
      else if (h > 0.86 && u < 0.6) k = INK.dust;
      else if (u > 0.7 && bayer(cx, cy) > 0) k = INK.rust;
      put(cx, cy, p.stone(k), part, 5);
    }
    // Dry grass along the top of the bank, moving a little in the wind.
    if (hash2(cx, 17) < 0.55) {
      const tall = 1 + Math.floor(hash2(cx, 19) * 3.2);
      const sway = Math.sin(t * 1.3 + cx * 0.37) > 0.6 ? 1 : 0;
      for (let k = 1; k <= tall; k++) put(cx + (k === tall ? sway : 0), f0 - k, k === tall ? INK.gold : hash2(cx, k) < 0.5 ? INK.bark : INK.gold, part, 6);
    }
    // The path along the bank: trodden earth, a dot here and there.
    const p0 = Math.floor(toY(p, fy - s.path * 2.2, s.bank) / cell);
    const p1 = Math.floor(toY(p, fy - s.path * 0.2, s.bank) / cell);
    for (let cy = Math.max(0, p0); cy <= Math.min(gh - 1, p1); cy++) if (hash2(cx * 5 + 1, cy * 3) < 0.12) put(cx, cy, p.stone(INK.dust), part, 3);

    // The near bank: a lip of earth and grass, the land rising toward us.
    const n0 = Math.floor(yNear / cell);
    if (n0 >= 0 && n0 < gh) {
      put(cx, n0, p.stone(INK.bark), part, 5);
      if (hash2(cx, 23) < 0.7) put(cx, n0 - 1, hash2(cx, 29) < 0.5 ? INK.gold : p.stone(INK.bark), part, 6);
      if (hash2(cx, 31) < 0.35) for (let k = 2; k < 2 + hash2(cx, 37) * 4; k++) put(cx + (Math.sin(t + cx) > 0.7 && k > 3 ? 1 : 0), n0 - k, k > 4 ? INK.gold : p.stone(INK.bark), part, 6);
      for (let cy = n0 + 1; cy < Math.min(gh, n0 + 3); cy++) if (hash2(cx, cy) < 0.25) put(cx, cy, p.stone(INK.dust), part, 3);
    }
  }
  paintDeck(p, s);
  // The rock in the path.
  const [rx, ry] = s.trip;
  const rr = s.h * 0.075;
  for (let cy = Math.floor(toY(p, ry, s.bank + rr * 1.3) / cell); cy <= Math.ceil(toY(p, ry, s.bank) / cell); cy++) {
    for (let cx = Math.floor(toX(p, rx - rr * 1.5) / cell); cx <= Math.ceil(toX(p, rx + rr * 1.5) / cell); cx++) {
      const lx = (fromX(p, (cx + 0.5) * cell) - rx) / (rr * 1.4);
      const ly = ((cy + 0.5) * cell - toY(p, ry, s.bank)) / (rr * S.lift * S.zoom * 1.2);
      if (lx * lx + (ly + 0.5) ** 2 * 1.3 > 1 || ly > 0.12) continue;
      const lit = -lx * 0.6 - (ly + 0.5) * 0.8 + bayer(cx, cy) * 0.4;
      put(cx, cy, p.stone(lit > 0.35 ? INK.dust : lit > -0.35 ? INK.bark : INK.navy), part, 9);
    }
  }
}

/** The jetty along the far bank: planks, its front edge, and the posts down into the water. */
function paintDeck(p: Painter, s: Story) {
  const { cell, put } = p;
  const S = p.surface;
  const { x0, x1, front } = s.deck;
  const back = farBank(s, (x0 + x1) / 2) - s.h * 0.16;
  const c0 = Math.floor(toX(p, x0) / cell);
  const c1 = Math.ceil(toX(p, x1) / cell);
  const plank = Math.max(2, Math.round((s.h * 0.075 * S.zoom) / cell));
  const thick = Math.max(1, Math.round((s.bank * 0.4 * S.lift * S.zoom) / cell));
  for (let cx = c0; cx <= c1; cx++) {
    const top = Math.floor(toY(p, back, s.bank) / cell);
    const edge = Math.floor(toY(p, front, s.bank) / cell);
    const k = cx - c0;
    const gapCol = k % plank === 0;
    for (let cy = top; cy <= edge; cy++) {
      // Planks lit along their tops, a dark seam between each.
      const grain = hash2(cx, cy * 3 + 1);
      let ink: number = gapCol ? INK.rust : grain < 0.12 ? INK.rust : (Math.floor(k / plank) & 1) === 0 ? INK.dust : INK.bark;
      if (cy === top) ink = INK.dust;
      put(cx, cy, p.stone(ink), p.part, 7);
    }
    for (let cy = edge + 1; cy <= edge + thick; cy++) put(cx, cy, p.stone(cy === edge + thick ? INK.navy : INK.rust), p.part, 7);
  }
  // Posts, every so often along the front, down to the water and a little way into it.
  const every = s.h * 0.5;
  for (let x = x0 + every * 0.15; x < x1; x += every) {
    const cx = Math.floor(toX(p, x) / cell);
    const top = Math.floor(toY(p, front, s.bank) / cell) + thick;
    const water = Math.floor(toY(p, front, 0) / cell);
    for (let cy = top; cy <= water + 3; cy++) {
      const under = cy > water;
      for (let w = 0; w < 2; w++) {
        if (under && bayer(cx + w, cy) > 0.1 - (cy - water) * 0.1) continue;
        put(cx + w, cy, under ? p.shade(INK.moss) : p.stone(w ? INK.navy : INK.rust), p.part, 8);
      }
    }
    // Its reflection, broken up by the water.
    for (let k = 4; k < 4 + thick + 5; k++) if (bayer(cx, water + k) < 0.1 && Math.sin(k * 1.3 + p.t * 2 + x) > -0.2) put(cx + (Math.sin(k + p.t * 1.5) > 0.5 ? 1 : 0), water + k, p.shade(INK.navy), p.part, 2);
  }
}

/** The fisherman: his shadow on the ground, himself, and his reflection where the water is below him. Returns what the page needs to hang things off him. */
export function paintMan(p: Painter, s: Story, m: Man): Drawn & { hx: number; hy: number } {
  const { cell, put } = p;
  const S = p.surface;
  const size = (s.h * S.lift * S.zoom) / cell;
  const d = figure(m.pose, size, m.face, m.roll, m.gear, p.night);
  const hx = Math.floor(toX(p, m.x) / cell);
  const hy = Math.floor(toY(p, m.y, s.bank) / cell);
  // His shadow, cast down and to the right.
  const sw = Math.max(3, Math.round(size * (m.roll > 1 ? 0.5 : 0.22)));
  for (let k = -sw; k <= sw + 2; k++) for (let j = 0; j < 2; j++) if (bayer(hx + k, hy + j) < 0.2 - Math.abs(k / sw) * 0.3) put(hx + k + (m.roll > 1 ? m.face * Math.round(size * 0.45) : 2), hy + j, p.stone(INK.dust), p.part, 4);
  for (const c of d.cells) put(hx + c.x, hy + c.y, c.ink, p.part, 20 + c.z);
  // In the water in front of the jetty, upside down and broken by ripples.
  const water = Math.floor(toY(p, s.deck.front, 0) / cell) + 2;
  const wy = Math.floor(toY(p, m.y, -s.bank) / cell);
  if (m.x < s.deck.x1 && sheen(S.tilt) > 0.1) {
    for (const c of d.cells) {
      const ry = wy - c.y;
      if (ry <= water) continue;
      const wob = Math.round(Math.sin(ry * 0.6 + p.t * 2.2) * 0.8);
      if (bayer(hx + c.x, ry) > 0.05 - (ry - water) * 0.012) continue;
      put(hx + c.x + wob, ry, p.shade(c.ink === INK.gold || c.ink === INK.fruitPale ? INK.mossLight : INK.moss), p.part, 2);
    }
  }
  return { ...d, hx, hy };
}

/** A line from (ax, ay) to (bx, by) in screen px, sagging by `sag` px in the middle, dashed. */
export function paintLine(p: Painter, ax: number, ay: number, bx: number, by: number, sag: number, z = 30) {
  const { cell, put } = p;
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2 + sag;
  const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / (cell * 0.7)));
  let last = -1;
  for (let k = 0; k <= n; k++) {
    const u = k / n;
    const x = (1 - u) * (1 - u) * ax + 2 * (1 - u) * u * mx + u * u * bx;
    const y = (1 - u) * (1 - u) * ay + 2 * (1 - u) * u * my + u * u * by;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    const key = cy * 4096 + cx;
    if (key === last) continue;
    last = key;
    if (k % 6 === 5) continue;
    put(cx, cy, p.night ? INK.dust : INK.shadow, p.part, z);
  }
}

/** The float: red over white, sat on the water or flying. */
export function paintFloat(p: Painter, x: number, y: number) {
  const cx = Math.floor(x / p.cell);
  const cy = Math.floor(y / p.cell);
  p.put(cx, cy - 1, INK.petal, p.part, 32);
  p.put(cx + 1, cy - 1, INK.petal, p.part, 32);
  p.put(cx, cy, p.night ? INK.shadow : INK.dust, p.part, 32);
  p.put(cx + 1, cy, p.night ? INK.shadow : INK.dust, p.part, 32);
}

/**
 * Water thrown up where something goes in at (x, y) on the plane, `age` story-vh after: for a
 * moment a dark hole, then a crown of water standing up round it whose rim breaks into drops,
 * spray flung up and out (more of it the way it was going), a column that jumps up once the hole
 * closes and falls back, and rings spreading on the surface.
 */
export function paintSplash(p: Painter, x: number, y: number, age: number, size: number, salt: number, dir: [number, number] = [0, 0], z = 45) {
  if (age < 0 || age > 26) return;
  const { cell, put } = p;
  const S = p.surface;
  const rnd = mulberry32(salt);
  const u = age / 26;
  const cx0 = Math.floor(toX(p, x) / cell);
  // The hole, open for a moment.
  const hole = age < 3 ? Math.sin((Math.PI * age) / 3) * size * 0.7 : 0;
  if (hole > 0) {
    const r = Math.ceil((hole * S.zoom) / cell);
    const cy0 = Math.floor(toY(p, y) / cell);
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        const e = Math.hypot(i / r, j / Math.max(1, r * S.tilt));
        if (e <= 0.75) put(cx0 + i, cy0 + j, p.shade(INK.navy), p.part, z - 8);
        else if (e <= 1) put(cx0 + i, cy0 + j, p.shade(INK.moss), p.part, z - 8);
      }
    }
  }
  // The crown: a wall of water round the hole, up and out and back down, its rim breaking into drops.
  const crown = 16;
  const c0 = age / 9;
  if (c0 > 0 && c0 < 1) {
    for (let j = 0; j < crown; j++) {
      const a = ((j + rnd() * 0.5) / crown) * Math.PI * 2;
      const lean = 1 + 0.6 * (Math.cos(a) * dir[0] + Math.sin(a) * dir[1]);
      const r = size * (0.55 + c0 * 1.1) * lean;
      const tall = size * (1.4 + rnd() * 0.9) * Math.sin(Math.PI * Math.min(1, c0 * 1.25)) * lean;
      const wx = x + Math.cos(a) * r;
      const wy = y + Math.sin(a) * r;
      const front = Math.sin(a) > 0;
      const sx = Math.floor(toX(p, wx) / cell);
      const top = Math.floor(toY(p, wy, tall) / cell);
      const foot = Math.floor(toY(p, wy, 0) / cell);
      // The wall, thin and clear, and its rim.
      for (let cy = top + 1; cy <= foot; cy++) if ((cy + j) % 2 === 0 || cy - top < 2) put(sx, cy, p.shade(INK.mossLight), p.part, front ? z - 1 : z - 10);
      put(sx, top, p.shade(INK.moss), p.part, front ? z : z - 9);
      // The rim lets go of a drop as the wall falls.
      if (c0 > 0.45) {
        const k = (c0 - 0.45) / 0.55;
        put(sx + Math.round(Math.cos(a) * k * 2), Math.floor(toY(p, wy, tall + size * (0.5 + rnd()) * k * (1 - k) * 2) / cell), p.shade(INK.moss), p.part, front ? z : z - 9);
      }
    }
  }
  // Spray.
  const drops = 22;
  for (let i = 0; i < drops; i++) {
    const a = rnd() * Math.PI * 2;
    const out = size * (0.6 + rnd() * 1.6) * (1 + 0.8 * (Math.cos(a) * dir[0] + Math.sin(a) * dir[1]));
    const up = size * (1.6 + rnd() * 2.4);
    const life = 0.3 + rnd() * 0.3;
    const k = u / life;
    if (k >= 1) continue;
    const dx = Math.cos(a) * out * k;
    const dy = Math.sin(a) * out * k;
    const h = up * 4 * k * (1 - k);
    const sx = toX(p, x + dx);
    const sy = toY(p, y + dy, h);
    put(Math.floor(sx / cell), Math.floor(sy / cell), p.shade(i % 3 ? INK.mossLight : INK.moss), p.part, z);
    // Drops trail a pixel behind them while they rise.
    if (k < 0.4) put(Math.floor(sx / cell), Math.floor(sy / cell) + 1, p.shade(INK.mossLight), p.part, z - 1);
  }
  // The column: up once the hole closes, then back down.
  const c = (age - 3) / 9;
  if (c > 0 && c < 1) {
    const tall = Math.sin(Math.PI * c) * size * 2.8;
    for (let h = 0; h < tall; h += cell / (S.lift * S.zoom || 1)) {
      const cy = Math.floor(toY(p, y, h) / cell);
      put(cx0, cy, p.shade(h > tall - size * 0.6 ? INK.mossLight : INK.moss), p.part, z);
      if (h < tall * 0.5) put(cx0 + 1, cy, p.shade(INK.mossLight), p.part, z - 1);
      if (h < tall * 0.2) put(cx0 - 1, cy, p.shade(INK.mossLight), p.part, z - 1);
    }
    // A drop breaks off the top as it falls back.
    if (c > 0.55) put(cx0, Math.floor(toY(p, y, tall + size * (c - 0.55) * 2) / cell) - 1, p.shade(INK.moss), p.part, z);
  }
  // Rings on the water.
  for (let k = 0; k < 3; k++) {
    const r = Math.max(0, (age - k * 2.2) / 26) ** 0.6 * size * 7;
    if (r <= 0) continue;
    p.ring(toX(p, x), toY(p, y), r * S.zoom, S.tilt, (1 - u) * (1 - k * 0.25), k ? INK.dust : p.shade(INK.mossLight), p.part, 4, 30 + k + salt);
  }
}

/**
 * Spear k at story time v: in the air, its path traced behind it and its shadow on the water, or
 * in the water, where what is under the surface is seen bent toward us and fading with depth, the
 * shaft above shivering as it stops, and a trail of bubbles going up.
 */
export function paintSpear(p: Painter, s: Story, k: number, v: number) {
  const st = spearAt(s, k, v);
  if (!st) return;
  const { cell, put } = p;
  const S = p.surface;
  const L = s.h * 0.95;
  const [px, py, pz] = st.p;
  const [dx, dy, dz] = st.d;
  // Screen px of a point; below the surface, depth shows at three quarters (the water bends it).
  const scr = (x: number, y: number, z: number): [number, number] => [toX(p, x), toY(p, y, z < 0 ? z * 0.75 : z)];
  const tipUnder = pz < 0;
  // Its way through the air, traced behind the head and fading.
  if (!tipUnder) {
    for (let j = 1; j <= 14; j++) {
      const was = spearAt(s, k, v - j * 0.45);
      if (!was || was.p[2] < 0) break;
      const [sx, sy] = scr(...was.p);
      const cx = Math.floor(sx / cell);
      const cy = Math.floor(sy / cell);
      if (j % 2 === 0 && bayer(cx, cy) < 0.5 - j / 14) put(cx, cy, p.stone(INK.dust), p.part, 6);
    }
  }
  // Once in, the part still out of the water shivers, less and less.
  const under = st.under;
  const shiver = under > 0 ? Math.exp(-under / 2.4) * Math.sin(under * 2.6) * s.h * 0.07 * S.zoom : 0;
  const [tx0, ty0] = scr(px, py, pz);
  const [bx0, by0] = scr(px - dx * L, py - dy * L, pz - dz * L);
  const sl = Math.hypot(tx0 - bx0, ty0 - by0) || 1;
  const nx = -(ty0 - by0) / sl;
  const ny = (tx0 - bx0) / sl;
  const n = Math.ceil((L * S.zoom) / (cell * 0.6));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = px - dx * L * (1 - u);
    const y = py - dy * L * (1 - u);
    const z = pz - dz * L * (1 - u);
    let [sx, sy] = scr(x, y, z);
    if (z > 0 && shiver !== 0) {
      const up = clamp01(z / Math.max(1e-6, -dz * L + pz));
      sx += nx * shiver * up;
      sy += ny * shiver * up;
    }
    const cx = Math.floor(sx / cell);
    const cy = Math.floor(sy / cell);
    const tip = u > 0.86;
    if (z < 0) {
      // Under the water: bluer and dimmer the deeper it goes.
      const deep = clamp01(-z / (s.h * 0.45));
      if (bayer(cx, cy) > 0.5 - deep * 0.8) continue;
      put(cx, cy, p.shade(tip ? INK.navy : deep < 0.3 ? INK.moss : INK.mossLight), p.part, 15);
    } else {
      const ink = tip ? (p.night ? INK.shadow : INK.navy) : u > 0.82 ? INK.rust : i % 5 === 0 ? INK.rust : INK.bark;
      put(cx, cy, p.stone(ink), p.part, 40);
      if (!tip && i % 2 === 0) put(cx, cy - 1, p.stone(INK.bark), p.part, 39);
    }
    // Its shadow on the water, while it flies.
    if (!tipUnder && z > 0) {
      const [hx, hy] = scr(x + s.h * 0.08, y + s.h * 0.05, 0);
      if (bayer(Math.floor(hx / cell), Math.floor(hy / cell)) < -0.05) put(Math.floor(hx / cell), Math.floor(hy / cell), p.shade(INK.navy), p.part, 3);
    }
  }
  // Barbs at the head, while it is still in the air.
  if (!tipUnder) {
    for (const c of spearCells(Math.atan2(ty0 - by0, tx0 - bx0), 3, p.night).slice(-2)) put(Math.floor(tx0 / cell) + c.x, Math.floor(ty0 / cell) + c.y, c.ink, p.part, 40);
  }
  if (under <= 0) return;
  const hit = spearHits(k);
  const [tx, ty] = s.spears[k];
  paintSplash(p, tx, ty, v - hit, s.h * 0.085, 400 + k * 17, [dx, dy]);
  // Where the shaft stands out of the water, the water rings it.
  const ringR = (s.h * 0.035 + Math.sin(p.t * 3 + k) * s.h * 0.008) * S.zoom;
  p.ring(toX(p, tx - dx * s.h * 0.02), toY(p, ty - dy * s.h * 0.02), ringR, S.tilt, 0.8, p.shade(INK.mossLight), p.part, 5, 60 + k);
  // Bubbles off the shaft, up to the surface: a rush as it goes in, then a few.
  const rnd = mulberry32(700 + k);
  for (let i = 0; i < 16; i++) {
    const born = i < 10 ? rnd() * 2.5 : 2.5 + rnd() * 10;
    const life = 3 + rnd() * 4;
    const age = under - born;
    const at = 0.25 + rnd() * 0.75;
    if (age < 0 || age > life) continue;
    const u = age / life;
    const z0 = pz * at;
    const z = z0 * (1 - u);
    const wob = Math.sin(age * 2 + i) * s.h * 0.02;
    const [bx, by] = scr(px - dx * (1 - at) * s.h * 0.4 + wob, py - dy * (1 - at) * s.h * 0.4, z);
    const cx = Math.floor(bx / cell);
    const cy = Math.floor(by / cell);
    if (u > 0.9) p.ring(bx, toY(p, py, 0), cell * 1.5, S.tilt, 0.6, p.shade(INK.mossLight), p.part, 5, 80 + i);
    else {
      put(cx, cy, p.shade(INK.mossLight), p.part, 16);
      if (i % 3 === 0) {
        put(cx + 1, cy, p.shade(INK.mossLight), p.part, 16);
        put(cx, cy - 1, p.shade(INK.moss), p.part, 16);
      }
    }
  }
}

/** The basket on its own, tumbling: a wicker box `w` cells wide, turned `angle`, its lid `open`. */
export function paintBasket(p: Painter, sx: number, sy: number, w: number, angle: number, open: number) {
  const { cell, put } = p;
  const cx0 = sx / cell;
  const cy0 = sy / cell;
  const h = w * 0.75;
  const cs = Math.cos(angle);
  const sn = Math.sin(angle);
  const R = Math.ceil(Math.hypot(w, h) / 2) + 2;
  const [hi, mid, lo] = p.night ? [INK.bark, INK.dust, INK.rust] : [INK.dust, INK.bark, INK.rust];
  for (let oy = -R; oy <= R; oy++) {
    for (let ox = -R; ox <= R; ox++) {
      const u = ((ox + 0.5) * cs + (oy + 0.5) * sn) / (w / 2);
      const vv = (-(ox + 0.5) * sn + (oy + 0.5) * cs) / (h / 2);
      if (Math.abs(u) > 1 || vv > 1) continue;
      // The lid, hinged at the back, lifting open.
      if (vv < -1) {
        const lidV = -1 - (1 - u) * open * 0.5;
        if (vv < lidV - 0.28 || vv > -1) continue;
        put(Math.floor(cx0 + ox), Math.floor(cy0 + oy), lo, p.part, 36);
        continue;
      }
      const weave = ((Math.floor((vv + 1) * h * 0.5) & 1) === 0) !== ((Math.floor((u + 1) * w * 0.5) & 1) === 0);
      let ink: number = weave ? mid : hi;
      if (u > 0.8 || vv > 0.82) ink = lo;
      put(Math.floor(cx0 + ox), Math.floor(cy0 + oy), ink, p.part, 35);
    }
  }
}

/** A small sign of anger over the koi's head: four short strokes, like a vein standing out. */
export function paintAnger(p: Painter, sx: number, sy: number, strength: number) {
  if (strength <= 0.05) return;
  const cx = Math.floor(sx / p.cell);
  const cy = Math.floor(sy / p.cell);
  const ink = INK.petal;
  const on = (k: number) => hash2(k, 5) < strength * 1.2;
  const pts: [number, number][] = [
    [-2, -1],
    [-1, -2],
    [1, -2],
    [2, -1],
    [2, 1],
    [1, 2],
    [-1, 2],
    [-2, 1],
  ];
  pts.forEach(([x, y], k) => {
    if (on(k)) p.put(cx + x, cy + y, ink, p.part, 50);
  });
}

export { STORY };
export type { Cell };
