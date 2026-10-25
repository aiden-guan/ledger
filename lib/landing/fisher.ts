/*
 * The fisherman, drawn on the page's pixel grid. He is a jointed figure seen from the side: a pose
 * places his hips, leans his body and sets where his hands and feet go, and two-bone reach works
 * out his elbows and knees. Each part is a tapered capsule shaded like everything else on the page,
 * lit from the upper left, so he holds together at any size and any pose in between two others.
 *
 * Figure units: he stands 1 tall from the soles of his boots to the top of his head, u runs the
 * way he faces and v runs up.
 */

import { INK, type Ink } from "./tree";

export type Pt = [number, number];

export interface Pose {
  /** Where his hips are: forward, and up from the ground. */
  hip: Pt;
  /** His body's lean from upright, forward positive. */
  lean: number;
  /** His head's nod, forward positive, on top of the lean. */
  nod: number;
  /** The near foot then the far, as where the heel of each boot rests. */
  feet: [Pt, Pt];
  /** The near hand then the far. */
  hands: [Pt, Pt];
  /** Looking back over his shoulder: his head faces the other way. */
  back?: boolean;
}

/** Lengths, as shares of his height. */
const THIGH = 0.235;
const SHIN = 0.225;
const UPPER = 0.17;
const FORE = 0.155;
const TORSO = 0.33;
const NECK = 0.035;
const HEAD = 0.088;
/** How far below the top of his body his shoulders are. */
const SHOULDER = 0.055;

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** Two poses mixed, `u` of the way from a to b. */
export function mix(a: Pose, b: Pose, u: number): Pose {
  const p = (x: Pt, y: Pt): Pt => [lerp(x[0], y[0], u), lerp(x[1], y[1], u)];
  return {
    hip: p(a.hip, b.hip),
    lean: lerp(a.lean, b.lean, u),
    nod: lerp(a.nod, b.nod, u),
    feet: [p(a.feet[0], b.feet[0]), p(a.feet[1], b.feet[1])],
    hands: [p(a.hands[0], b.hands[0]), p(a.hands[1], b.hands[1])],
    back: u < 0.5 ? a.back : b.back,
  };
}

/**
 * Where the middle joint of a limb goes, from its root to its end, with two bones of length a
 * and b. It bends toward `side` (1 bends it forward, -1 back). If the end is out of reach the
 * limb goes straight toward it.
 */
export function reach(root: Pt, end: Pt, a: number, b: number, side: number): { joint: Pt; end: Pt } {
  const dx = end[0] - root[0];
  const dy = end[1] - root[1];
  let d = Math.hypot(dx, dy);
  const ux = dx / (d || 1);
  const uy = dy / (d || 1);
  const most = (a + b) * 0.999;
  if (d > most) d = most;
  const least = Math.abs(a - b) + 1e-4;
  if (d < least) d = least;
  // Law of cosines: how far along root->end the joint sits, and how far off to the side.
  const along = (a * a - b * b + d * d) / (2 * d);
  const off = Math.sqrt(Math.max(0, a * a - along * along));
  const joint: Pt = [root[0] + ux * along - uy * off * side, root[1] + uy * along + ux * off * side];
  return { joint, end: [root[0] + ux * d, root[1] + uy * d] };
}

/** The figure's joints for a pose. */
export function joints(p: Pose) {
  const hip = p.hip;
  const neck: Pt = [hip[0] + Math.sin(p.lean) * TORSO, hip[1] + Math.cos(p.lean) * TORSO];
  const shoulder: Pt = [neck[0] - Math.sin(p.lean) * SHOULDER, neck[1] - Math.cos(p.lean) * SHOULDER];
  const tilt = p.lean + p.nod;
  const head: Pt = [neck[0] + Math.sin(tilt) * (NECK + HEAD * 0.8), neck[1] + Math.cos(tilt) * (NECK + HEAD * 0.8)];
  // Knees bend forward, elbows back. Feet are given at the heel: the ankle is a little above.
  const legs = p.feet.map((f) => {
    const ankle: Pt = [f[0], f[1] + 0.035];
    return { ...reach(hip, ankle, THIGH, SHIN, 1), foot: f };
  });
  const arms = p.hands.map((h) => reach(shoulder, h, UPPER, FORE, -1));
  return { hip, neck, shoulder, head, tilt, legs, arms };
}

/* ------------------------------------------------------------------ poses */

const P = (hip: Pt, lean: number, nod: number, near: Pt, far: Pt, hn: Pt, hf: Pt, back = false): Pose => ({ hip, lean, nod, feet: [near, far], hands: [hn, hf], back });

/** Named poses. Hands and feet are where they would be for a man facing right. */
export const POSES = {
  /** Standing at the end of the jetty, the rod up in front of him in both hands. */
  stand: P([0, 0.465], 0.04, 0.05, [0.06, 0], [-0.07, 0], [0.15, 0.57], [0.1, 0.64]),
  /** The cast drawn back: rod over his shoulder, leaning back. */
  castBack: P([-0.02, 0.455], -0.2, -0.12, [0.11, 0], [-0.1, 0], [0.0, 0.93], [0.06, 0.86]),
  /** The cast let go: arms out, leaning in. */
  castOut: P([0.05, 0.45], 0.24, 0.12, [0.13, 0], [-0.1, 0], [0.33, 0.72], [0.26, 0.66]),
  /** Playing a fish: sat back on his heels, rod high, the near hand at the reel. */
  reel: P([-0.06, 0.42], -0.22, 0.05, [0.13, 0], [-0.14, 0], [0.09, 0.6], [0.17, 0.74]),
  /** Lifting it clear of the water. */
  lift: P([-0.04, 0.45], -0.18, -0.25, [0.12, 0], [-0.12, 0], [0.04, 0.9], [0.1, 0.98]),
  /** Bent to the basket at his hip. */
  stoop: P([0.0, 0.43], 0.34, 0.2, [0.1, 0], [-0.08, 0], [0.24, 0.42], [0.18, 0.5]),
  /** Upright with empty hands. */
  rest: P([0, 0.465], 0.02, 0, [0.05, 0], [-0.05, 0], [0.05, 0.36], [-0.04, 0.37]),
  /** A spear drawn back over his shoulder, the other arm out to aim. */
  aim: P([-0.02, 0.455], -0.14, 0.05, [0.13, 0], [-0.12, 0], [-0.16, 0.9], [0.24, 0.72]),
  /** The spear let go. */
  hurl: P([0.06, 0.44], 0.32, 0.15, [0.16, 0], [-0.12, 0.02], [0.32, 0.66], [-0.08, 0.5]),
  /** A foot caught: pitching forward, arms thrown out. */
  stumble: P([0.08, 0.43], 0.55, -0.2, [0.22, 0.04], [-0.08, 0.09], [0.36, 0.62], [0.3, 0.74]),
  /** Flat on the ground (drawn turned onto his front by the caller). */
  sprawl: P([0, 0.465], 0.05, -0.3, [0.02, 0.0], [-0.04, 0.05], [0.18, 1.02], [0.12, 0.96]),
} satisfies Record<string, Pose>;

/**
 * A walk or run at `phase` (cycles, any real number), as a pose. `run` goes from 0 (an easy walk)
 * to 1 (a run). The feet plant and push off so that, moved forward `stride(run)` per cycle, they
 * hold still on the ground while they bear his weight.
 */
export function gait(phase: number, run: number, carry = 0): Pose {
  const p = phase - Math.floor(phase);
  const S = stride(run) / 2;
  const stance = lerp(0.6, 0.38, run);
  const lift = lerp(0.06, 0.2, run);
  const foot = (q: number): Pt => {
    const k = q - Math.floor(q);
    if (k < stance) return [S - (2 * S * k) / stance, 0];
    // The swing, as a curve: up off the toe behind, through under the hips (running, the heel
    // comes up high behind first), and down onto the heel in front.
    const w = (k - stance) / (1 - stance);
    const c1: Pt = [lerp(-S * 0.35, -S * 0.55, run), lift * lerp(1.1, 1.7, run)];
    const c2: Pt = [lerp(S * 0.6, S * 0.9, run), lift * lerp(0.7, 1.1, run)];
    const v = 1 - w;
    return [v * v * v * -S + 3 * v * v * w * c1[0] + 3 * v * w * w * c2[0] + w * w * w * S, 3 * v * v * w * c1[1] + 3 * v * w * w * c2[1]];
  };
  const near = foot(p);
  const far = foot(p + 0.5);
  const bob = lerp(0.012, 0.03, run) * Math.cos(p * Math.PI * 4);
  const lean = lerp(0.06, 0.32, run);
  const swing = lerp(0.1, 0.2, run);
  const arm = (q: number, side: number): Pt => {
    const a = Math.sin(q * Math.PI * 2) * swing;
    // Running, the arms bend at the elbow and pump.
    const bend = run * 0.12;
    return [Math.sin(lean) * 0.3 + a * side + bend * 0.6, 0.5 + bend * (0.8 + Math.max(0, a * side) * 1.6)];
  };
  const hn = arm(p, -1);
  const hf = arm(p, 1);
  // Carrying something in the near hand keeps it from swinging.
  return {
    hip: [0.02 + Math.sin(lean) * 0.05, lerp(0.465, 0.44, run) - bob],
    lean,
    nod: -lean * 0.4,
    feet: [near, far],
    hands: [[lerp(hn[0], 0.08, carry), lerp(hn[1], 0.46, carry)], hf],
  };
}

/** How far he goes, in heights, per cycle of the gait. */
export const stride = (run: number) => lerp(0.5, 0.86, run);

/* ------------------------------------------------------------------ drawing */

/** Light, middle and shade inks for each material, for a light page and a dark one. */
type Ramp = [Ink, Ink, Ink];
const RAMPS: Record<string, { light: Ramp; dark: Ramp }> = {
  coat: { light: [INK.fruitPale, INK.gold, INK.rust], dark: [INK.gold, INK.gold, INK.fruitPale] },
  trousers: { light: [INK.moss, INK.navy, INK.shadow], dark: [INK.navy, INK.moss, INK.mossLight] },
  boots: { light: [INK.bark, INK.shadow, INK.shadow], dark: [INK.bark, INK.dust, INK.dust] },
  skin: { light: [INK.fruitPale, INK.fruitPale, INK.fruit], dark: [INK.fruit, INK.fruit, INK.fruitPale] },
  beard: { light: [INK.fruit, INK.rust, INK.shadow], dark: [INK.fruit, INK.rust, INK.fruitPale] },
  hat: { light: [INK.fruitPale, INK.gold, INK.rust], dark: [INK.gold, INK.gold, INK.fruitPale] },
  wicker: { light: [INK.dust, INK.bark, INK.rust], dark: [INK.bark, INK.dust, INK.rust] },
  wood: { light: [INK.dust, INK.bark, INK.rust], dark: [INK.shadow, INK.bark, INK.dust] },
};

/** A pixel of the figure: cell offset from his heel point, ink, and draw order. */
export type Cell = { x: number; y: number; ink: Ink; z: number };

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
const bayer = (cx: number, cy: number) => BAYER[(cy & 3) * 4 + (cx & 3)];

/** Where the props he carries are. */
export interface Gear {
  /** The rod in his hands, at this angle above the way he faces, bent by `bend` (0 slack, 1 a fish on). */
  rod?: { angle: number; bend: number };
  /** The basket slung at his hip; `open` lifts its lid. */
  basket?: { open: number };
  /** Spears in the quiver on his back. */
  quiver?: number;
  /** A spear in his near hand, at this angle above the way he faces. */
  spear?: number;
}

/** A drawn figure: its pixels, and points the page needs on screen (in cells from his heel point). */
export interface Drawn {
  cells: Cell[];
  rodTip: Pt | null;
  hand: Pt;
  basket: Pt | null;
  head: Pt;
}

/**
 * The figure in a pose, `size` cells tall, facing `face` (1 right, -1 left), turned `roll` radians
 * about his heel point (forward positive: onto his face). `dark` picks the ramps for a dark page.
 */
export function figure(pose: Pose, size: number, face: number, roll: number, gear: Gear, dark: boolean): Drawn {
  const j = joints(pose);
  const cs = Math.cos(roll);
  const sn = Math.sin(roll);
  // Figure units to cells: forward is face, up is up the screen (down the grid), then the roll.
  const to = (q: Pt): Pt => {
    const u = q[0] * size;
    const v = q[1] * size;
    const ru = u * cs + v * sn;
    const rv = -u * sn + v * cs;
    return [ru * face, -rv];
  };
  const buf = new Map<number, Cell>();
  const set = (x: number, y: number, ink: Ink, z: number) => {
    const key = (y + 4096) * 8192 + (x + 4096);
    const had = buf.get(key);
    if (!had || z >= had.z) buf.set(key, { x, y, ink, z });
  };
  const ramp = (name: string) => RAMPS[name][dark ? "dark" : "light"];
  // The light comes from the upper left of the screen, whichever way he faces.
  const LX = -0.6;
  const LY = -0.8;

  /** A tapered capsule from a to b (figure units), radii ra and rb, shaded with `name`'s ramp. */
  const capsule = (a: Pt, b: Pt, ra: number, rb: number, name: string, z: number, rim = true) => {
    const [ax, ay] = to(a);
    const [bx, by] = to(b);
    const r0 = ra * size;
    const r1 = rb * size;
    const R = Math.max(r0, r1);
    const x0 = Math.floor(Math.min(ax, bx) - R - 1);
    const x1 = Math.ceil(Math.max(ax, bx) + R + 1);
    const y0 = Math.floor(Math.min(ay, by) - R - 1);
    const y1 = Math.ceil(Math.max(ay, by) + R + 1);
    const dx = bx - ax;
    const dy = by - ay;
    const L2 = dx * dx + dy * dy || 1e-9;
    const [hi, mid, lo] = ramp(name);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const px = cx + 0.5;
        const py = cy + 0.5;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
        const qx = ax + dx * t;
        const qy = ay + dy * t;
        const r = lerp(r0, r1, t);
        const ox = px - qx;
        const oy = py - qy;
        const d = Math.hypot(ox, oy);
        if (d > Math.max(r, 0.5)) continue;
        const nx = ox / (r || 1);
        const ny = oy / (r || 1);
        const k = nx * LX + ny * LY + bayer(cx, cy) * 0.5;
        let ink = mid;
        if (k > 0.42) ink = hi;
        else if (rim && (k < -0.55 || (d > r - 0.9 && nx * 0.6 + ny * 0.8 > 0.35))) ink = lo;
        set(cx, cy, ink, z);
      }
    }
  };
  /** A disc, shaded the same way. */
  const disc = (c: Pt, r: number, name: string, z: number) => capsule(c, c, r, r, name, z);

  // Draw order: far limbs, quiver, body, near leg, basket, head, near arm and what it holds.
  const [near, far] = j.legs;
  const [armN, armF] = j.arms;
  const boot = (leg: (typeof j.legs)[number], z: number) => {
    const ankle = leg.end;
    const toe: Pt = [ankle[0] + 0.075, Math.max(0.008, ankle[1] - 0.03)];
    capsule([ankle[0] - 0.012, ankle[1] - 0.012], toe, 0.034, 0.028, "boots", z);
  };
  // The far side, a step darker.
  capsule(j.hip, far.joint, 0.062, 0.05, "trousers", 1);
  capsule(far.joint, far.end, 0.05, 0.04, "trousers", 1);
  boot(far, 1);
  capsule(j.shoulder, armF.joint, 0.042, 0.036, "coat", 2);
  capsule(armF.joint, armF.end, 0.036, 0.03, "coat", 2);
  disc(armF.end, 0.03, "skin", 2);

  // Spears in a quiver across his back, tips up over the far shoulder.
  if (gear.quiver) {
    const back: Pt = [j.hip[0] - Math.sin(pose.lean) * 0.02 - 0.08, j.hip[1] + 0.12];
    for (let i = 0; i < gear.quiver; i++) {
      const a = 0.42 + i * 0.07;
      const top: Pt = [back[0] + Math.sin(a) * 0.62 + i * 0.012, back[1] + Math.cos(a) * 0.62];
      line(back, top, 0, "wood");
      const tip: Pt = [top[0] + Math.sin(a) * 0.07, top[1] + Math.cos(a) * 0.07];
      line(top, tip, 1, null);
    }
  }

  // The coat: chest to hips, wider at the hem.
  const chest: Pt = [j.neck[0] - Math.sin(pose.lean) * 0.07, j.neck[1] - Math.cos(pose.lean) * 0.07];
  const hem: Pt = [j.hip[0] - Math.sin(pose.lean) * 0.06 + 0.005, j.hip[1] - Math.cos(pose.lean) * 0.06];
  capsule(chest, hem, 0.088, 0.096, "coat", 4);
  capsule(j.neck, chest, 0.06, 0.085, "coat", 4);

  capsule(j.hip, near.joint, 0.064, 0.052, "trousers", 5);
  capsule(near.joint, near.end, 0.052, 0.042, "trousers", 5);
  boot(near, 6);

  // The basket, slung at his near hip: a wicker box with a lid.
  let basketAt: Pt | null = null;
  if (gear.basket) {
    const c: Pt = [j.hip[0] + 0.05, j.hip[1] - 0.02];
    basketAt = to(c);
    const [bx, by] = basketAt;
    const w = 0.16 * size;
    const h = 0.12 * size;
    const [hi, mid, lo] = ramp("wicker");
    for (let cy = Math.floor(by - h * 0.5); cy <= Math.ceil(by + h * 0.5); cy++) {
      for (let cx = Math.floor(bx - w * 0.5); cx <= Math.ceil(bx + w * 0.5); cx++) {
        const u = (cx + 0.5 - bx) / (w * 0.5);
        const v = (cy + 0.5 - by) / (h * 0.5);
        if (Math.abs(u) > 1 || Math.abs(v) > 1) continue;
        // Rounded at the bottom corners.
        if (v > 0.55 && Math.abs(u) > 0.8 && (Math.abs(u) - 0.8) ** 2 + (v - 0.55) ** 2 > 0.04) continue;
        const weave = (cy & 1) === 0 ? ((cx + (cy >> 1)) & 1) === 0 : false;
        let ink = weave ? lo : mid;
        if (u * LX + v * LY > 0.55 && !weave) ink = hi;
        if (u > 0.82 || v > 0.86) ink = lo;
        set(cx, cy, ink, 7);
      }
    }
    // The lid, lifted at the back.
    const lift = gear.basket.open * h * 0.6;
    for (let cx = Math.floor(bx - w * 0.55); cx <= Math.ceil(bx + w * 0.55); cx++) {
      const u = (cx + 0.5 - bx) / (w * 0.55);
      const yy = Math.round(by - h * 0.5 - 1 - lift * (0.5 - (u * face) / 2));
      set(cx, yy, ramp("wicker")[2], 8);
      set(cx, yy + 1, ramp("wicker")[1], 8);
    }
    // The strap, up to the far shoulder.
    line([c[0] - 0.02, c[1] + 0.05], [j.shoulder[0] - 0.04, j.shoulder[1] + 0.01], 2, null, 7);
  }

  // The head: face, beard, eye, and a sou'wester.
  const dir = pose.back ? -1 : 1;
  const h = j.head;
  const t = j.tilt;
  const fwd = (q: Pt): Pt => [h[0] + (q[0] * Math.cos(t) + q[1] * Math.sin(t)) * dir, h[1] - q[0] * Math.sin(t) * dir + q[1] * Math.cos(t)];
  disc(h, HEAD, "skin", 9);
  // The beard, over the jaw and chin.
  capsule(fwd([0.006, -0.052]), fwd([0.058, -0.06]), 0.046, 0.036, "beard", 10);
  // Nose and eye.
  const [nx, ny] = to(fwd([0.088, 0.012]));
  set(Math.floor(nx), Math.floor(ny), ramp("skin")[2], 11);
  const [ex, ey] = to(fwd([0.045, 0.03]));
  set(Math.floor(ex), Math.floor(ey), dark ? INK.dust : INK.shadow, 12);
  // The hat: a low crown and a brim that dips at the back.
  capsule(fwd([-0.012, 0.055]), fwd([0.022, 0.06]), 0.075, 0.07, "hat", 12);
  capsule(fwd([-0.13, 0.0]), fwd([0.1, 0.048]), 0.024, 0.018, "hat", 13);

  // The near arm, and what is in its hand.
  capsule(j.shoulder, armN.joint, 0.046, 0.04, "coat", 14);
  capsule(armN.joint, armN.end, 0.04, 0.033, "coat", 14);
  disc(armN.end, 0.032, "skin", 15);

  let rodTip: Pt | null = null;
  if (gear.rod) {
    // From the butt below his hands, out past them, bending down toward the line as it pulls.
    const a = gear.rod.angle;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const butt: Pt = [armN.end[0] - ux * 0.16, armN.end[1] - uy * 0.16];
    const L = 1.35;
    const steps = Math.ceil(L * size * 1.5);
    let prev: Pt | null = null;
    for (let k = 0; k <= steps; k++) {
      const s = k / steps;
      // Bent: the tip droops toward the way the line pulls.
      const droop = gear.rod.bend * 0.42 * s * s;
      const q: Pt = [butt[0] + ux * L * s + Math.sin(a) * droop * 0.5, butt[1] + uy * L * s - Math.cos(a) * droop * 0.5 - droop * 0.6];
      const [cx, cy] = to(q);
      const ink: Ink = s < 0.13 ? ramp("wicker")[1] : s < 0.16 ? (dark ? INK.dust : INK.shadow) : s < 0.6 ? ramp("wood")[2] : dark ? INK.bark : INK.shadow;
      set(Math.floor(cx), Math.floor(cy), ink, 16);
      // Thicker at the butt.
      if (s < 0.3) set(Math.floor(cx), Math.floor(cy) + 1, ink, 16);
      if (k === steps) rodTip = [cx, cy];
      prev = q;
    }
    void prev;
    // The reel, under his hands.
    const reelAt: Pt = [butt[0] + ux * 0.1 + Math.sin(a) * 0.035, butt[1] + uy * 0.1 - Math.cos(a) * 0.035];
    disc(reelAt, 0.026, "trousers", 16);
  }
  if (gear.spear !== undefined) {
    const a = gear.spear;
    const hand = armN.end;
    const tail: Pt = [hand[0] - Math.cos(a) * 0.45, hand[1] - Math.sin(a) * 0.45];
    const head: Pt = [hand[0] + Math.cos(a) * 0.42, hand[1] + Math.sin(a) * 0.42];
    line(tail, head, 0, "wood", 16);
    const tip: Pt = [head[0] + Math.cos(a) * 0.08, head[1] + Math.sin(a) * 0.08];
    line(head, tip, 1, null, 17);
  }

  /** A one-pixel line in figure units: wood (`name`), a dark tip (kind 1), or a strap (kind 2). */
  function line(a: Pt, b: Pt, kind: number, name: string | null, z = 3) {
    const [ax, ay] = to(a);
    const [bx, by] = to(b);
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 1.4));
    for (let k = 0; k <= n; k++) {
      const x = Math.floor(lerp(ax, bx, k / n));
      const y = Math.floor(lerp(ay, by, k / n));
      const ink: Ink = kind === 1 ? (dark ? INK.shadow : INK.navy) : kind === 2 ? (dark ? INK.rust : INK.rust) : name ? ramp(name)[k % 5 === 0 ? 2 : 1] : INK.bark;
      set(x, y, ink, z);
    }
  }

  const cells = [...buf.values()];
  return { cells, rodTip, hand: to(armN.end), basket: basketAt, head: to(j.head) };
}

/** A spear's pixels, from its butt at (0, 0) along `angle` (screen radians, y down), `len` cells long. */
export function spearCells(angle: number, len: number, dark: boolean): Cell[] {
  const out: Cell[] = [];
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const n = Math.ceil(len * 1.4);
  const seen = new Set<number>();
  for (let k = 0; k <= n; k++) {
    const s = k / n;
    const x = Math.floor(ux * len * s);
    const y = Math.floor(uy * len * s);
    const key = y * 8192 + x;
    if (seen.has(key)) continue;
    seen.add(key);
    const ink: Ink = s > 0.88 ? (dark ? INK.shadow : INK.navy) : s > 0.84 ? INK.rust : (x + y) % 4 === 0 ? (dark ? INK.dust : INK.rust) : INK.bark;
    out.push({ x, y, ink, z: 20 });
  }
  // Barbs, swept back from the head.
  for (const side of [-1, 1]) {
    const bx = ux * len * 0.92 - (ux * 0.9 - uy * side * 0.9) * 2;
    const by = uy * len * 0.92 - (uy * 0.9 + ux * side * 0.9) * 2;
    out.push({ x: Math.floor(bx), y: Math.floor(by), ink: dark ? INK.shadow : INK.navy, z: 20 });
  }
  return out;
}
