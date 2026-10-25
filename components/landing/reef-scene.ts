/*
 * Drawing the reef at the end of the story onto the page's pixel grid: the sandy floor and the
 * light that moves over it, the deep water past the shelf, the corals with their shadows, the
 * anemones swaying with clownfish in them, and schools of small fish. Through the same painter as
 * the rest of the story. The koi are drawn by the page.
 */

import { hash2 } from "@/lib/landing/pond";
import { type Coral, type Sprite, anemoneCells, clownCells, coralCells, fishCells } from "@/lib/landing/reef";
import { type Story, farBank, nearBank } from "@/lib/landing/story";
import { INK } from "@/lib/landing/tree";
import { type Painter, toX, toY } from "./story-scene";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number) => {
  const u = clamp01((v - a) / (b - a));
  return u * u * (3 - 2 * u);
};

/** A painter for the reef that keeps what holds still between frames: the floor while the view is still, and each coral's pixels. */
export function reefPainter() {
  let key = "";
  // The sand under each pixel on screen: its ink, or -1.
  let floor = new Int8Array(0);
  const sprites = new WeakMap<Coral, { unit: number; dark: boolean; cells: Sprite }>();

  return function paintReef(p: Painter, s: Story) {
    const { cell, gw, gh, t, put, surface: S } = p;
    const reef = s.reef;
    const part = p.part;
    const unit = cell / S.zoom;
    const fromX = (sx: number) => (sx - S.x) / S.zoom;
    const fromY = (sy: number) => (sy - S.y) / (S.tilt * S.zoom);
    if (fromX(gw * cell) < reef.from) return;
    // Whole pixels of the plane under the screen's first, so the sand's grain stays put on the
    // plane as the view moves.
    const ox = Math.round(S.x / cell);
    const oy = Math.round(S.y / cell);

    const now = `${ox},${oy},${S.zoom.toFixed(4)},${S.tilt.toFixed(4)},${gw},${gh},${p.night}`;
    if (now !== key) {
      key = now;
      if (floor.length !== gw * gh) floor = new Int8Array(gw * gh);
      floor.fill(-1);
      const y0 = fromY(0);
      const y1 = fromY(gh * cell);
      for (let cx = 0; cx < gw; cx++) {
        const wx = fromX((cx + 0.5) * cell);
        const shown = smooth(reef.from, reef.full, wx);
        if (shown <= 0) continue;
        // The patches this column passes through.
        const near = reef.patches.filter(([px, py, pr]) => Math.abs(wx - px) < pr && py + pr > y0 && py - pr < y1);
        const c0 = Math.max(0, Math.ceil(toY(p, farBank(s, wx), 0) / cell) + 1);
        const c1 = Math.min(gh - 1, Math.floor(toY(p, nearBank(s, wx), s.bank) / cell) - 1);
        const wcx = cx - ox;
        for (let cy = c0; cy <= c1; cy++) {
          const wy = fromY((cy + 0.5) * cell);
          const wcy = cy - oy;
          const i = cy * gw + cx;
          // Clean sand, but for broken coral thick round the patches and thinning away from them.
          let rubble = 0;
          for (const [px, py, pr] of near) rubble = Math.max(rubble, smooth(1.12, 0.6, Math.hypot(wx - px, wy - py) / pr));
          const dens = shown * (0.004 + rubble * rubble * 0.16);
          const h = hash2(wcx * 3 + 1, wcy * 5 + 2);
          if (h < dens) floor[i] = h < dens * 0.25 ? INK.fruitPale : h < dens * 0.5 ? INK.bark : INK.dust;
        }
      }
    }

    for (let i = 0; i < gw * gh; i++) if (floor[i] >= 0) put(i % gw, Math.floor(i / gw), floor[i], part, 1);
    // Sun on the water: short dashes that catch and let go, on a lattice fixed to the plane.
    const step = 9;
    for (let gy = Math.floor(-oy / step) - 1; gy <= Math.ceil((gh - oy) / step); gy++) {
      for (let gx = Math.floor(-ox / step) - 1; gx <= Math.ceil((gw - ox) / step); gx++) {
        const h = hash2(gx, gy * 3 + 7);
        if (h > 0.22) continue;
        const cx = gx * step + ox + Math.floor(hash2(gx, gy) * step);
        const cy = gy * step + oy + Math.floor(hash2(gy, gx) * step);
        const wx = fromX((cx + 0.5) * cell);
        if (wx < reef.from) continue;
        const on = Math.sin(t * (0.8 + h * 3) + h * 40);
        const len = on > 0.75 ? 3 : on > 0.4 ? 2 : on > 0.1 ? 1 : 0;
        const drift = Math.round(Math.sin(t * 0.4 + h * 20) * 1.5);
        for (let k = 0; k < len; k++) put(cx + k + drift, cy, p.shade(INK.mossLight), part, 2);
      }
    }

    // The corals, each where it sits on the floor.
    const right = fromX(gw * cell);
    const left = fromX(0);
    const top = fromY(0);
    const bottom = fromY(gh * cell);
    for (const c of reef.corals) {
      if (c.x + c.r * 2 < left || c.x - c.r * 2 > right || c.y + c.r * 2 < top || c.y - c.r * 2 > bottom) continue;
      const cx0 = Math.floor(toX(p, c.x) / cell);
      const cy0 = Math.floor(toY(p, c.y) / cell);
      if (c.kind === "anemone") {
        anemoneCells(c, unit, p.night, t, (i, j, ink, z) => put(cx0 + i, cy0 + j, ink, part, 10 + z));
        // Its clownfish, in and out among the tentacles.
        for (let k = 0; k < c.clowns; k++) {
          const a = c.turn + k * 2.4 + t * (0.5 + k * 0.17) + Math.sin(t * 1.3 + k) * 0.6;
          const r = (c.r / unit) * (0.45 + 0.2 * Math.sin(t * 0.9 + k * 1.7));
          const hx = -Math.sin(a);
          const hy = Math.cos(a);
          clownCells(cx0 + Math.cos(a) * r, cy0 + Math.sin(a) * r, hx, hy, p.night, (i, j, ink) => put(i, j, ink, part, 24));
        }
        continue;
      }
      let sp = sprites.get(c);
      if (!sp || sp.unit !== unit || sp.dark !== p.night) {
        sp = { unit, dark: p.night, cells: coralCells(c, unit, p.night) };
        sprites.set(c, sp);
      }
      const cells = sp.cells;
      for (let k = 0; k < cells.length; k += 4) {
        const ink = cells[k + 2];
        if (ink < 0) put(cx0 + cells[k], cy0 + cells[k + 1], INK.dust, part, 3);
        else put(cx0 + cells[k], cy0 + cells[k + 1], ink, part, 10 + cells[k + 3]);
      }
    }

    // Small fish in schools, each school going round its loop, each fish keeping roughly its place.
    for (const sc of reef.schools) {
      const a = sc.phase + sc.speed * t;
      const dir = Math.sign(sc.speed);
      const mx = sc.x + Math.cos(a) * sc.rx;
      const my = sc.y + Math.sin(a) * sc.ry;
      if (mx + sc.spread * 3 < left || mx - sc.spread * 3 > right || my + sc.spread * 3 < top || my - sc.spread * 3 > bottom) continue;
      let hx = -Math.sin(a) * sc.rx * dir;
      let hy = Math.cos(a) * sc.ry * dir;
      const l = Math.hypot(hx, hy) || 1;
      hx /= l;
      hy /= l;
      for (let i = 0; i < sc.n; i++) {
        const along = (hash2(i, 3) - 0.5) * 2.6 * sc.spread + Math.sin(t * 1.9 + i) * sc.spread * 0.15;
        const across = (hash2(i, 7) - 0.5) * 1.5 * sc.spread + Math.cos(t * 1.4 + i * 2.1) * sc.spread * 0.18;
        const x = mx + hx * along - hy * across;
        const y = my + hy * along + hx * across;
        const w = Math.sin(t * 3.1 + i * 1.3) * 0.3;
        const fx = hx * Math.cos(w) - hy * Math.sin(w);
        const fy = hy * Math.cos(w) + hx * Math.sin(w);
        fishCells(toX(p, x) / cell, toY(p, y) / cell, fx, fy, sc.size, sc.hue, p.night, (ci, cj, ink) => put(ci, cj, ink, part, 26));
      }
    }
  };
}
