/*
 * After the pond: the rest of the koi's story. The blue koi follows the orange one into the pond,
 * and the two travel on together, out through a gap in the bank into a wide river. There the view
 * tilts to look across the water at a fisherman on a jetty, who reels up the blue koi and walks off
 * with her in his basket. The orange koi goes after him down the river, dodging the spears he
 * throws, until he trips on a rock, the basket flies, and she falls back into the water. Overhead
 * again, the two have young, and swim on down and out to sea, to a reef (see reef.ts), where they
 * stay and the page ends.
 *
 * Same plane and units as the river and the pond. Heights (z) are px up from the water; the page
 * draws them up the screen by how far the view is tilted. Everything happens on a clock of scroll,
 * so scrolling back plays it backward.
 */

import { type Bush, bushDots } from "./garden";
import { POSES, type Gear, type Pose, gait, mix, stride } from "./fisher";
import { type Reef, layReef } from "./reef";
import { arcs } from "./river";
import { mulberry32 } from "./tree";

export type Pt = [number, number];
export interface Path {
  xy: Float64Array;
  at: Float64Array;
  /** Arc length at each point the path was laid through. */
  marks: number[];
}

/** The story's clock: viewport heights of scroll after the orange koi comes to rest in the pond. */
export const STORY = {
  /** The blue koi comes out of the river's mouth and swims to the orange one. */
  arrive: [0, 80],
  /** They circle each other. */
  meet: [80, 128],
  /** Out of the pond together, the view pulling back and tilting to look across the river. */
  out: [128, 240],
  /** The fisherman draws back his rod and casts; the float lands. */
  cast: [244, 274],
  /** The float goes under. */
  bite: [274, 286],
  /** She is pulled in to the jetty, then lifted out. */
  reel: [286, 332],
  lift: [332, 354],
  /** Into the basket at his hip. */
  bag: [354, 380],
  /** He lays down the rod and turns to go, and the orange koi thrashes. */
  turn: [380, 394],
  rage: [384, 420],
  /** He walks off along the bank, the orange koi after him. */
  walk: [394, 520],
  /** He stops and throws a spear back at it, three times. */
  spears: [520, 554, 588],
  /** He runs, and it swims harder. */
  run: [622, 672],
  /** He trips on a rock; the basket flies and she falls into the river. */
  trip: [672, 688],
  basket: [676, 692],
  fall: [690, 704],
  /** They swim to each other and circle, the view coming back overhead and in close. */
  reunite: [704, 776],
  close: [744, 800],
  /** Later, still circling: their young come up round them one by one, and the view pulls back. */
  young: [800, 852],
  /** Off together down the river and out to sea, to a reef. */
  home: [852, 985],
  /** Round and round in a clearing in the reef, for good. */
  settle: [985, 1030],
  end: 1050,
} as const;

/** How many young they have. */
export const BROOD = 7;

/** How long each throw takes, from turning round to walking on. */
export const THROW = 34;
/** Within a throw: drawn back by, let go at, and in the water at. */
const AIM = 14;
const LET_GO = 17;
const HITS = 23;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const smooth = (a: number, b: number, v: number) => {
  const u = clamp01((v - a) / (b - a));
  return u * u * (3 - 2 * u);
};
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const span = (r: readonly [number, number], v: number) => clamp01((v - r[0]) / (r[1] - r[0]));

/* ---------------------------------------------------------------- paths */

/**
 * A smooth path through points (centripetal Catmull-Rom), a point every 3 px or so, with the arc
 * length at each point it passes through. `lead` is where it is coming from before the first.
 */
export function spline(pts: Pt[], lead?: Pt): Path {
  const all: Pt[] = [lead ?? [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]], ...pts];
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  all.push([2 * last[0] - prev[0], 2 * last[1] - prev[1]]);
  const out: number[] = [pts[0][0], pts[0][1]];
  const at: number[] = [0];
  for (let i = 1; i < all.length - 2; i++) {
    segment(all[i - 1], all[i], all[i + 1], all[i + 2], out);
    at.push(out.length / 2 - 1);
  }
  const xy = Float64Array.from(out);
  const arc = arcs(xy);
  return { xy, at: arc, marks: at.map((i) => arc[i]) };
}

function segment(a: Pt, b: Pt, c: Pt, d: Pt, out: number[]) {
  const gap = (p: Pt, q: Pt) => Math.max(1e-6, Math.sqrt(Math.hypot(q[0] - p[0], q[1] - p[1])));
  const t1 = gap(a, b);
  const t2 = t1 + gap(b, c);
  const t3 = t2 + gap(c, d);
  const steps = Math.max(1, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / 3));
  const mixP = (p: number[], q: number[], ta: number, tb: number, t: number) => {
    const u = (t - ta) / (tb - ta);
    return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
  };
  for (let k = 1; k <= steps; k++) {
    const t = t1 + ((t2 - t1) * k) / steps;
    const a1 = mixP(a, b, 0, t1, t);
    const a2 = mixP(b, c, t1, t2, t);
    const a3 = mixP(c, d, t2, t3, t);
    const p = mixP(mixP(a1, a2, 0, t2, t), mixP(a2, a3, t1, t3, t), t1, t2, t);
    out.push(p[0], p[1]);
  }
}

/** Points round a circle: from angle a0, `turns` times round (negative turns go the other way), a point every `every` radians. */
function round(c: Pt, r: number, a0: number, turns: number, squash = 1, every = 0.5): Pt[] {
  const n = Math.max(2, Math.ceil(Math.abs(turns * Math.PI * 2) / every));
  const pts: Pt[] = [];
  for (let k = 1; k <= n; k++) {
    const a = a0 + (turns * Math.PI * 2 * k) / n;
    pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r * squash]);
  }
  return pts;
}

/** Where along a path, as x, y, and the unit heading there. */
export function pointAt(p: { xy: Float64Array; at: Float64Array }, s: number): [number, number, number, number] {
  const n = p.at.length;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (p.at[mid] <= s) lo = mid;
    else hi = mid - 1;
  }
  const i = Math.min(n - 2, lo);
  const v = clamp01((s - p.at[i]) / Math.max(1e-9, p.at[i + 1] - p.at[i]));
  const dx = p.xy[i * 2 + 2] - p.xy[i * 2];
  const dy = p.xy[i * 2 + 3] - p.xy[i * 2 + 1];
  const l = Math.hypot(dx, dy) || 1;
  return [p.xy[i * 2] + dx * v, p.xy[i * 2 + 1] + dy * v, dx / l, dy / l];
}

/**
 * A clock from keys: (v, value) pairs with v rising, through which it moves smoothly, never
 * overshooting (monotone cubic). Flat between equal values, so equal keys make a stop.
 */
export function keyed(keys: [number, number][]) {
  const n = keys.length;
  const xs = keys.map((k) => k[0]);
  const ys = keys.map((k) => k[1]);
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-9, xs[i + 1] - xs[i]));
  const m: number[] = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  m[0] = n > 1 ? d[0] * 0.5 : 0;
  m[n - 1] = n > 1 ? d[n - 2] * 0.5 : 0;
  return (v: number) => {
    if (v <= xs[0]) return ys[0];
    if (v >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && v > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (v - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

/* ---------------------------------------------------------------- the world */

export interface StoryInput {
  width: number;
  height: number;
  narrow: boolean;
  /** The overhead view's tilt, and the pond's view on the plane. */
  flat: number;
  top: number;
  view: number;
  /** Where the orange koi rests in the pond, and the way it came in (the point before). */
  rest: Pt;
  before: Pt;
  /** Where the river comes into the pond. */
  mouth: Pt;
  /** The orange koi's length, and the page's pixel size. */
  koi: number;
  cell: number;
}

export interface Story {
  /** The view across the river: its tilt, how far heights rise up the screen, and its zoom. */
  tilt: number;
  lift: number;
  zoom: number;
  /** How tall the fisherman is, in px of height. */
  h: number;
  /** The koi's lengths once they are out in the river. */
  koi: number;
  wife: number;
  /** The river: the far bank's line (see farBank), its width, and the bank's height above the water. */
  far: number;
  width: number;
  bank: number;
  waves: [number, number, number, number];
  /** The gap in the bank the pond drains through, `half` either side of x. */
  outlet: { x: number; top: number; half: number };
  /** The jetty along the far bank: from x0 to x1, out over the water to `front`. */
  deck: { x0: number; x1: number; front: number };
  /** Where he stands to fish, the path he walks along the bank, and the rock he trips on. */
  stand: Pt;
  path: number;
  trip: Pt;
  /** Where the float lands, where she comes out of the water, where the basket lands, and where she falls back in. */
  bite: Pt;
  hook: Pt;
  basket: Pt;
  splash: Pt;
  /** The circle they swim when they meet in the pond, and again once she is back. */
  meet: { x: number; y: number; r: number };
  reunion: { x: number; y: number; r: number };
  /** Where the blue koi stops beside the orange one in the pond (the end of her way down). */
  beside: Pt;
  /** Where the man is, by story time. */
  manX: (v: number) => number;
  /** Where each spear lands. */
  spears: Pt[];
  /** The koi's ways on from the pond: the orange one's from its resting place, the blue one's from beside it, and hers again from where she falls in. */
  orange: Path;
  blue: Path;
  after: Path;
  /** How far along those ways each is, by story time. */
  orangeAt: (v: number) => number;
  blueAt: (v: number) => number;
  afterAt: (v: number) => number;
  /** More garden round the pond, and the land along the river. */
  bushes: Bush[];
  /** Their young: each one's way, how far along it by story time, and when it comes up out of the deep. */
  kids: { path: Path; at: (v: number) => number; born: number }[];
  kid: number;
  /** The clearing in the reef where they settle: its middle, their circle and the young's ring round it, and how fast each goes round, in radians per unit of story time. */
  home: { x: number; y: number; r: number; ring: number; spin: number; kidSpin: number };
  /** Where the river opens into the sea, how sharply its banks turn away, and the reef. */
  sea: number;
  bend: number;
  reef: Reef;
  /** Where the camera looks: a point on the plane at the middle of the screen, the zoom and the tilt. */
  camera: (v: number) => { x: number; y: number; zoom: number; tilt: number };
}

type Banks = Pick<Story, "far" | "waves"> & Partial<Pick<Story, "sea" | "bend">>;
/** How far the banks have turned away from the river, out where it opens into the sea. */
const opened = (s: Banks, x: number) => (s.sea !== undefined && s.bend && x > s.sea ? (x - s.sea) ** 2 / (2 * s.bend) : 0);

/** The far bank's line at x. */
export function farBank(s: Banks, x: number) {
  const [a1, w1, a2, w2] = s.waves;
  return s.far + a1 * Math.sin(x / w1 + 0.7) + a2 * Math.sin(x / w2 + 2.3) - opened(s, x);
}

/** The near bank's line at x. */
export function nearBank(s: Banks & Pick<Story, "width">, x: number) {
  const [a1, w1, a2, w2] = s.waves;
  return s.far + s.width + a1 * 0.8 * Math.sin(x / (w1 * 1.3) + 2.9) + a2 * Math.sin(x / (w2 * 0.8) + 0.4) + opened(s, x);
}

export function layStory(o: StoryInput): Story {
  const { width: vw, height: vh, narrow, flat } = o;
  const tilt = 0.62;
  const lift = Math.sqrt(1 - tilt * tilt);
  const zoom = narrow ? 0.6 : 0.52;
  // Sizes from what they should come to on screen in the view across the river.
  const h = (narrow ? 0.15 * vh : Math.min(0.25 * vh, 0.15 * vw)) / (lift * zoom);
  const width = ((narrow ? 0.34 : 0.37) * vh) / (tilt * zoom);
  const bank = (0.026 * vh) / (lift * zoom);
  const koi = Math.min(o.koi * 0.85, h * 0.62);
  const wife = koi * 0.8;
  const yB = o.top + o.view;
  const far = yB + o.view * (narrow ? 0.3 : 0.36);
  const waves: Story["waves"] = [width * 0.025, width * 0.9, width * 0.012, width * 0.31];
  const fb = (x: number) => farBank({ far, waves }, x);

  // Across the screen in the view across the river: the gap the pond drains through near the left,
  // the fisherman right of the middle facing back toward it.
  const W = vw / zoom;
  const outletX = o.rest[0] + (narrow ? 0 : o.koi * 0.3);
  const standX = outletX + W * (narrow ? 0.62 : 0.5);
  const deck = { x0: standX - h * 0.45, x1: standX + h * (narrow ? 1.2 : 1.7), front: 0 };
  deck.front = fb(standX) + h * 0.2;
  const stand: Pt = [standX, fb(standX) + h * 0.07];
  const outlet = { x: outletX, top: yB, half: o.koi * 0.55 };
  const bite: Pt = [standX - W * (narrow ? 0.34 : 0.26), fb(standX) + width * 0.34];
  const liftAt: Pt = [standX - h * 0.5, deck.front + width * 0.07];
  const path = h * 0.12;

  // Where the man is: standing, then walking, stopping for each throw, then running.
  const walkSpeed = (W * (narrow ? 0.5 : 0.62)) / (STORY.walk[1] - STORY.walk[0]);
  const speed = (v: number) => {
    if (v < STORY.walk[0]) return 0;
    let s = walkSpeed * smooth(STORY.walk[0], STORY.walk[0] + 8, v);
    for (const a of STORY.spears) s *= 1 - smooth(a - 2, a + 3, v) * (1 - smooth(a + THROW - 5, a + THROW, v));
    s *= 1 + 1.6 * smooth(STORY.run[0], STORY.run[0] + 10, v);
    // Down: he slides a little way on, then lies still.
    if (v > STORY.trip[0]) s *= 1 - smooth(STORY.trip[0], STORY.trip[0] + 12, v);
    return s;
  };
  const DV = 0.25;
  const xs: number[] = [];
  let x = standX;
  for (let v = 0; v <= STORY.end + DV; v += DV) {
    xs.push(x);
    x += speed(v + DV / 2) * DV;
  }
  const manX = (v: number) => {
    const f = Math.max(0, v / DV);
    const i = Math.min(xs.length - 2, Math.floor(f));
    return lerp(xs[i], xs[i + 1], Math.min(1, f - i));
  };
  const tripX = manX(STORY.trip[0]) + h * 0.32;
  const trip: Pt = [tripX, fb(tripX) - path];

  // The orange koi in the river after him: it gains while he stops, and never quite catches him.
  const lane = (x: number) => fb(x) + width * 0.17;
  const gapMin = h * 0.62;
  const koiXs: number[] = [];
  let kx = liftAt[0];
  for (let i = 0; i < xs.length; i++) {
    const v = i * DV;
    if (v > STORY.rage[1]) {
      const run = smooth(STORY.run[0], STORY.run[1], v);
      const swim = walkSpeed * lerp(1.18, 2.6 * 1.04, run);
      kx = Math.min(kx + swim * DV, xs[i] - gapMin * lerp(1, 0.75, run));
      kx = Math.max(kx, liftAt[0]);
    }
    koiXs.push(kx);
  }
  const koiX = (v: number) => {
    const f = Math.max(0, v / DV);
    const i = Math.min(koiXs.length - 2, Math.floor(f));
    return lerp(koiXs[i], koiXs[i + 1], Math.min(1, f - i));
  };
  // Each spear lands where the koi's snout would have been, a little ahead; the koi swerves out
  // toward the middle of the river just before.
  const spears: Pt[] = STORY.spears.map((a) => {
    const at = a + HITS;
    const sx = koiX(at) + koi * 0.15;
    return [sx, lane(sx)];
  });
  const dodge = (v: number) => {
    let d = 0;
    STORY.spears.forEach((a, k) => {
      const at = a + HITS;
      const u = (v - (at - 3)) / 7;
      if (u > -1 && u < 1) d += Math.cos((u * Math.PI) / 2) ** 2 * width * (0.16 + k * 0.03) * (k % 2 ? 0.8 : 1);
    });
    return d;
  };

  // Where the basket lands, and where she falls in.
  const basket: Pt = [tripX + h * 0.95, fb(tripX + h * 0.95) - path * 0.2];
  const splash: Pt = [tripX + h * 1.45, fb(tripX + h * 1.45) + width * 0.2];
  const reunion = { x: tripX + h * 1.2, y: fb(tripX + h * 1.2) + width * 0.42, r: koi * 0.42 };

  // Later, overhead and at one zoom (so the reef's pixels can be worked out once): the young's ring
  // round the two of them, the way down the river and out to sea, and the clearing in the reef.
  const zr = narrow ? 0.72 : 0.7;
  const A = vw / zr;
  const D = vh / (flat * zr);
  const r0 = reunion.r;
  const ring = r0 * 2.3;
  const kid = koi * 0.36;
  const sea = reunion.x + A * 0.8;
  const bend = A * 0.9;
  // Round together twice and a quarter from meeting until they set off, so he leaves heading
  // downstream, she half a circle behind him all the way; the young go round faster.
  const met = STORY.reunite[0] + 26;
  const spin = (Math.PI * 4.5) / (STORY.young[1] - met);
  const kidSpin = spin * 2.02;
  const behind = Math.PI / spin;
  const spacing = (Math.PI * 2) / BROOD / kidSpin;
  const home = { x: reunion.x + A * 2.2, y: reunion.y + D * 0.04, r: r0, ring, spin, kidSpin };
  const route: Pt[] = [
    [reunion.x + A * 0.32, reunion.y - r0 + D * 0.02],
    [reunion.x + A * 0.8, reunion.y + D * 0.08],
    [reunion.x + A * 1.3, reunion.y - D * 0.02],
    [home.x - A * 0.48, home.y + D * 0.16],
    [home.x - ring * 1.9, home.y + ring * 0.8],
  ];
  /** The way, `o` px to its left. */
  const side = (o: number): Pt[] =>
    route.map((p, i) => {
      const a = route[Math.max(0, i - 1)];
      const b = route[Math.min(route.length - 1, i + 1)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [p[0] + ((b[1] - a[1]) / l) * o, p[1] - ((b[0] - a[0]) / l) * o];
    });
  /** When someone leaving at t0 and arriving at t1 passes each distance along their way, easing up to speed and down again. */
  const timed = (at: number[], t0: number, t1: number) => {
    const N = 240;
    const run = [0];
    for (let k = 1; k <= N; k++) {
      const u = (k - 0.5) / N;
      run.push(run[k - 1] + 0.3 + 0.7 * smooth(0, 0.22, u) * smooth(1, 0.8, u));
    }
    const total = at[at.length - 1] - at[0];
    return at.map((s) => {
      const want = ((s - at[0]) / total) * run[N];
      let k = 0;
      while (k < N - 1 && run[k + 1] < want) k++;
      return lerp(t0, t1, (k + clamp01((want - run[k]) / (run[k + 1] - run[k]))) / N);
    });
  };

  // In the pond: she comes to rest beside him, they circle once, and set off for the gap.
  const [rx, ry] = o.rest;
  const hx = rx - o.before[0];
  const hy = ry - o.before[1];
  const hl = Math.hypot(hx, hy) || 1;
  // To his left as he faces, half a length back.
  const beside: Pt = [rx + (hy / hl) * o.koi * 0.5 - (hx / hl) * o.koi * 0.25, ry - (hx / hl) * o.koi * 0.5 - (hy / hl) * o.koi * 0.25];
  const meet = { x: (rx + beside[0]) / 2, y: (ry + beside[1]) / 2, r: Math.hypot(rx - beside[0], ry - beside[1]) / 2 };
  const aO = Math.atan2(ry - meet.y, rx - meet.x);
  // Round the way he is heading: clockwise on screen is positive angles.
  const dir = (hx / hl) * Math.sin(aO) - (hy / hl) * Math.cos(aO) < 0 ? 1 : -1;
  const gapIn: Pt = [outletX, yB - o.view * 0.06];
  const gapOut: Pt = [outletX + koi * 0.2, fb(outletX) + width * 0.12];

  // The orange koi: round the meeting circle, out through the gap, along the river to near the
  // float, and in after her to the jetty; round under it while she is lifted out; then off after
  // the man, and round with her once she is back.
  const oPts: Pt[] = [];
  const mark: Record<string, number> = {};
  const add = (name: string | null, ...p: Pt[]) => {
    oPts.push(...p);
    if (name) mark[name] = oPts.length - 1;
  };
  add("rest", [rx, ry]);
  add("met", ...round([meet.x, meet.y], meet.r, aO, 1.15 * dir));
  add("gap", gapIn);
  add("river", gapOut);
  add("near", [bite[0] - koi * 1.1, bite[1] + width * 0.08]);
  add("follow", [lerp(bite[0], liftAt[0], 0.5) - koi * 0.3, lerp(bite[1], liftAt[1], 0.5) + width * 0.06]);
  add("under", [liftAt[0] - koi * 0.2, liftAt[1] + width * 0.12]);
  add("circled", ...round([liftAt[0], liftAt[1] + width * 0.16], koi * 0.42, -Math.PI / 2, -1.05, 0.7));
  // The chase, sampled from the clock: along the lane, swerving at each spear.
  const chase: Pt[] = [];
  const chaseV: number[] = [];
  for (let v = STORY.rage[1]; v <= STORY.reunite[0]; v += 2) {
    const cx = koiX(v);
    if (chase.length && cx - chase[chase.length - 1][0] < 4 && v < STORY.reunite[0]) continue;
    chase.push([cx, lane(cx) + dodge(v)]);
    chaseV.push(v);
  }
  const chaseFrom = oPts.length;
  add(null, ...chase);
  add("meet2", [reunion.x - reunion.r * 1.6, reunion.y - reunion.r * 0.4]);
  add("round2", ...round([reunion.x, reunion.y], r0, Math.PI, 2.25, 1));
  // Then off downstream, leading them, and round in the clearing.
  route.forEach((p, i) => add(`way${i}`, p));
  add("pre", [home.x - r0 * 1.5, home.y + r0 * 1.1]);
  add("in", [home.x - r0, home.y]);
  add("round3", ...round([home.x, home.y], r0, Math.PI, 4, 1));
  const orange = spline(oPts, o.before);

  const ok = (name: string) => orange.marks[mark[name]];
  const oKeys: [number, number][] = [
    [0, 0],
    [STORY.meet[0], 0],
    [STORY.meet[1], ok("met")],
    [lerp(STORY.out[0], STORY.out[1], 0.4), ok("gap")],
    [lerp(STORY.out[0], STORY.out[1], 0.7), ok("river")],
    [STORY.out[1] + 10, ok("near")],
    [STORY.reel[0] + 20, ok("follow")],
    [STORY.lift[0], ok("under")],
    [STORY.rage[1], ok("circled")],
  ];
  chase.forEach((_, i) => {
    if (i > 0) oKeys.push([chaseV[i], orange.marks[chaseFrom + i]]);
  });
  oKeys.push([met, ok("meet2")]);
  oKeys.push([STORY.young[1], ok("round2")]);
  const wayAt = [ok("round2"), ...route.map((_, i) => ok(`way${i}`)), ok("pre"), ok("in")];
  const wayT = timed(wayAt, STORY.young[1], STORY.settle[0]);
  for (let i = 1; i < wayAt.length; i++) oKeys.push([wayT[i], wayAt[i]]);
  oKeys.push([STORY.end, ok("in") + r0 * spin * (STORY.end - STORY.settle[0])]);
  const orangeAt = keyed(oKeys);

  // The blue koi: round the circle opposite him, out ahead of him, and on to the float.
  const bPts: Pt[] = [];
  const bMark: Record<string, number> = {};
  const addB = (name: string, ...p: Pt[]) => {
    bPts.push(...p);
    bMark[name] = bPts.length - 1;
  };
  const aB = aO + Math.PI;
  addB("beside", beside);
  addB("met", ...round([meet.x, meet.y], meet.r, aB, 1.15 * dir));
  addB("gap", [gapIn[0] + koi * 0.1, gapIn[1] + koi * 0.3]);
  addB("river", [gapOut[0] + koi * 0.6, gapOut[1] + width * 0.06]);
  addB("bite", [bite[0] - wife * 0.15, bite[1] + wife * 0.05]);
  // Pulled in to the jetty, thrashing.
  addB("lift", liftAt);
  const blue = spline(bPts, [beside[0] - (hx / hl) * 30, beside[1] - (hy / hl) * 30]);
  const bk = (name: string) => blue.marks[bMark[name]];
  const blueAt = keyed([
    [STORY.meet[0], 0],
    [STORY.meet[1], bk("met")],
    [lerp(STORY.out[0], STORY.out[1], 0.36), bk("gap")],
    [lerp(STORY.out[0], STORY.out[1], 0.66), bk("river")],
    [STORY.bite[0] + 4, bk("bite")],
    [STORY.bite[1], bk("bite")],
    [STORY.reel[1], bk("lift")],
  ]);

  // Hers again from where she falls in: down into the water, up, and round with him; then after
  // him and the young, a little to one side, and round in the clearing half a circle behind him.
  const fallDir: Pt = [0.55, 0.84];
  const aPts: Pt[] = [
    splash,
    [splash[0] + fallDir[0] * wife * 0.6, splash[1] + fallDir[1] * wife * 0.6],
    [reunion.x + r0 * 1.4, reunion.y + r0 * 0.3],
    ...round([reunion.x, reunion.y], r0, 0, 2.75, 1),
  ];
  const aRound = aPts.length - 1;
  aPts.push(...side(-koi * 0.22), [home.x - r0 * 1.5, home.y + r0 * 1.1], [home.x - r0, home.y]);
  const aIn = aPts.length - 1;
  aPts.push(...round([home.x, home.y], r0, Math.PI, 4, 1));
  const after = spline(aPts, [splash[0] - fallDir[0] * wife * 1.4, splash[1] - fallDir[1] * wife * 1.4]);
  const am = after.marks;
  const aKeys: [number, number][] = [
    [STORY.fall[1], 0],
    [met, am[2]],
    [STORY.young[1] + behind, am[aRound]],
  ];
  for (let i = 1; i < wayAt.length; i++) aKeys.push([wayT[i] + behind, am[aRound + i]]);
  aKeys.push([STORY.end, am[aIn] + r0 * spin * (STORY.end - STORY.settle[0] - behind)]);
  const afterAt = keyed(aKeys);

  // The young: each comes up on a ring round the two of them, already swimming, and leaves it at
  // the top, one after another; down the way after him, weaving a little; then round the clearing,
  // evenly spaced, outside the two of them.
  const kids = Array.from({ length: BROOD }, (_, j) => {
    const born = STORY.young[0] + 4 + j * 5;
    const leaves = STORY.young[1] + 2 + j * spacing;
    const lag = leaves - STORY.young[1];
    const aBorn = Math.PI * 1.5 - kidSpin * (leaves - born);
    const aFrom = aBorn - (kid * 1.4) / ring;
    const onRing = (a: number): Pt => [reunion.x + Math.cos(a) * ring, reunion.y + Math.sin(a) * ring];
    const pts: Pt[] = [onRing(aFrom), onRing(aBorn), ...round([reunion.x, reunion.y], ring, aBorn, (Math.PI * 1.5 - aBorn) / (Math.PI * 2), 1)];
    const top = pts.length - 1;
    pts.push(...side((j % 2 ? 1 : -1) * koi * (0.08 + 0.06 * (j % 3))), [home.x - ring, home.y]);
    const into = pts.length - 1;
    pts.push(...round([home.x, home.y], ring, Math.PI, 5, 1));
    const path = spline(pts, onRing(aFrom - 0.3));
    const m = path.marks;
    const keys: [number, number][] = [
      [born, m[1]],
      [leaves, m[top]],
    ];
    for (let i = 1; i <= route.length; i++) keys.push([wayT[i] + lag, m[top + i]]);
    keys.push([STORY.settle[0] + lag, m[into]]);
    keys.push([STORY.end, m[into] + ring * kidSpin * (STORY.end - STORY.settle[0] - lag)]);
    return { path, at: keyed(keys), born };
  });

  // The reef, laid out round where the view comes to rest: clear of the closing words, of their
  // rings, and of the channel they swim in along.
  const rest = { x: home.x, y: home.y - D * (narrow ? 0.14 : 0.12) };
  const onScreen = (u: number, w: number): Pt => [rest.x + (u - 0.5) * A, rest.y + (w - 0.5) * D];
  const [w0, w1] = narrow ? [onScreen(0.02, 0.15), onScreen(0.98, 0.42)] : [onScreen(0.22, 0.17), onScreen(0.78, 0.41)];
  const banks = { far, waves, width, sea, bend };
  const reef = layReef({
    sea,
    view: [rest.x, rest.y],
    across: A,
    down: D,
    unit: o.cell / zr,
    keepOff: {
      boxes: [[w0[0], w0[1], w1[0], w1[1]]],
      circles: [[home.x, home.y, ring + kid * 0.9]],
      channel: [...route.slice(1), [home.x - ring, home.y]],
      half: koi * 0.55,
    },
    water: (x) => [farBank(banks, x), nearBank(banks, x)],
    scale: narrow ? 0.75 : Math.min(1.2, Math.max(0.8, vw / 1440)),
  });

  // More garden: a frame of bushes round the bottom and sides of the pond, then a strip along the
  // far bank, and a few on the near bank.
  const bushes: Bush[] = [];
  const rnd = mulberry32(5023);
  const unit = Math.min(vw, o.view);
  const W2 = vw / 2;
  const land = (bx: number, by: number) => {
    // Round the pond, but none on the land he walks along, or they would stand behind him.
    if (bx > standX - h * 0.6) return false;
    if (by < yB - o.view * 0.04) return Math.abs(bx) > W2 + unit * 0.06;
    if (Math.abs(bx - outletX) < outlet.half + unit * 0.06) return false;
    // Clear of the bank by more than his height, so nothing stands behind him as he goes along it.
    return by < fb(bx) - h * 1.45;
  };
  const left = outletX - W * 0.75;
  const right = standX + W * 0.6;
  for (let tries = 0; tries < (narrow ? 1400 : 2600); tries++) {
    const bx = lerp(left, right, rnd());
    const by = lerp(o.top, fb(bx), rnd());
    const r = unit * lerp(0.03, 0.06, rnd() ** 1.4);
    if (!land(bx, by)) continue;
    // Thinning away from the pond, so the land opens out along the river.
    const fromPond = Math.max(0, by - yB) / (far - yB);
    const wide = Math.max(0, Math.abs(bx) - W2) / (W * 0.5);
    if (rnd() < Math.max(fromPond * 0.55, wide * 0.8)) continue;
    if (bushes.some((b) => Math.hypot(b.x - bx, b.y - by) < (b.r + r) * 0.66)) continue;
    const kind = Math.floor(rnd() * 4);
    bushes.push({ x: bx, y: by, r, at: 0, dots: bushDots(kind, r, o.cell, rnd) });
  }
  bushes.sort((a, b) => a.y - b.y);

  // The camera: on the pond while they meet, then pulled back and tilted to look across the river
  // at the jetty; following the chase; in close and overhead for the reunion; back out for the young.
  const pond = { x: 0, y: o.top + o.view / 2, zoom: 1, tilt: flat };
  const across = (cx: number) => ({ x: cx, y: fb(standX) + (0.06 * vh) / (tilt * zoom), zoom, tilt });
  const jetty = across(standX - W * (narrow ? 0.18 : 0.12));
  const follow = (v: number) => {
    const between = (manX(v) + koiX(v)) / 2;
    return across(Math.max(jetty.x, between + W * (narrow ? 0.02 : 0.04)));
  };
  const close = { x: reunion.x, y: reunion.y, zoom: narrow ? 1.05 : 0.95, tilt: flat };
  const overhead = { x: reunion.x, y: reunion.y, zoom: zr, tilt: flat };
  const settled = { x: rest.x, y: rest.y, zoom: zr, tilt: flat };
  // Between him at the front and her at the back.
  const family = (v: number) => {
    const a = pointAt(orange, orangeAt(v));
    const b = pointAt(after, afterAt(v));
    const x = Math.max(overhead.x, (a[0] + b[0]) / 2);
    return { x, y: lerp(overhead.y, rest.y, smooth(overhead.x, rest.x, x)), zoom: zr, tilt: flat };
  };
  const blendCam = (a: ReturnType<typeof across>, b: ReturnType<typeof across>, u: number) => ({
    x: lerp(a.x, b.x, u),
    y: lerp(a.y, b.y, u),
    zoom: Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), u)),
    tilt: lerp(a.tilt, b.tilt, u),
  });
  const pairAt = (v: number) => {
    const p = pointAt(orange, orangeAt(v));
    return p;
  };
  const camera = (v: number) => {
    if (v <= STORY.out[0]) return pond;
    if (v < STORY.out[1]) {
      // Out with the koi: following them down, then settling on the jetty.
      const u = span(STORY.out, v);
      const [px, py] = pairAt(v);
      const mid = { x: px * 0.6, y: py, zoom: lerp(1, zoom, smooth(0.15, 0.85, u)), tilt: lerp(flat, tilt, smooth(0.25, 0.95, u)) };
      if (u < 0.5) return blendCam(pond, mid, smooth(0, 0.5, u));
      return blendCam(mid, jetty, smooth(0.5, 1, u));
    }
    if (v < STORY.turn[1]) return jetty;
    if (v < STORY.reunite[0]) return blendCam(jetty, follow(v), smooth(STORY.turn[1], STORY.walk[0] + 30, v));
    const chaseEnd = follow(STORY.reunite[0]);
    if (v < STORY.close[1]) return blendCam(chaseEnd, close, smooth(STORY.close[0], STORY.close[1], v));
    if (v < STORY.young[1]) return blendCam(close, overhead, smooth(STORY.young[0], STORY.young[0] + 36, v));
    const going = blendCam(overhead, family(v), smooth(STORY.young[1], STORY.young[1] + 30, v));
    return blendCam(going, settled, smooth(STORY.settle[0] - 45, STORY.settle[0] + 8, v));
  };

  return {
    tilt,
    lift,
    zoom,
    h,
    koi,
    wife,
    far,
    width,
    bank,
    waves,
    outlet,
    deck,
    stand,
    path,
    trip,
    bite,
    hook: liftAt,
    basket,
    splash,
    meet,
    reunion,
    beside,
    manX,
    spears,
    orange,
    blue,
    after,
    orangeAt,
    blueAt,
    afterAt,
    bushes,
    kids,
    kid,
    home,
    sea,
    bend,
    reef,
    camera,
  };
}

/* ---------------------------------------------------------------- the fisherman */

export interface Man {
  x: number;
  y: number;
  /** 1 faces right, -1 left. */
  face: number;
  pose: Pose;
  /** Turned forward about his heels, radians: 0 upright, a quarter turn flat on his front. */
  roll: number;
  gear: Gear;
  /** The rod laid down on the jetty. */
  rodDown: boolean;
}

/** The fisherman at story time v. */
export function manAt(s: Story, v: number): Man {
  const x = s.manX(v);
  const fb = farBank(s, x);
  // On the jetty, then back onto the path along the bank.
  const y = x < s.deck.x1 ? s.stand[1] : lerp(s.stand[1], fb - s.path, smooth(s.deck.x1, s.deck.x1 + s.h * 0.8, x));
  const gear: Gear = {};
  let pose: Pose = POSES.stand;
  let face = -1;
  let roll = 0;
  let rodDown = false;
  const rod = { angle: 1.05, bend: 0 };
  const [c0, c1] = STORY.cast;
  if (v < c0) {
    pose = POSES.stand;
  } else if (v < STORY.bite[0]) {
    // Back over his shoulder, then out: quick, after a slow draw.
    const back = smooth(c0, c0 + 13, v);
    const out = smooth(c0 + 13, c0 + 18, v);
    const settle = smooth(c0 + 18, c1, v);
    pose = mix(mix(mix(POSES.stand, POSES.castBack, back), POSES.castOut, out), POSES.stand, settle * 0.6);
    rod.angle = lerp(lerp(lerp(1.05, 2.35, back), 0.3, out), 0.62, settle);
    rod.bend = 0.25 * (back - out * 0.6);
  } else if (v < STORY.reel[0]) {
    const bit = smooth(STORY.bite[1] - 4, STORY.bite[1], v);
    pose = mix(mix(POSES.castOut, POSES.stand, 0.6), POSES.reel, bit);
    rod.angle = lerp(0.62, 0.9, bit);
    rod.bend = bit;
  } else if (v < STORY.lift[0]) {
    // Reeling: the near hand winds at the reel.
    const w = (v - STORY.reel[0]) * 0.9;
    pose = POSES.reel;
    pose = { ...pose, hands: [[pose.hands[0][0] + Math.cos(w) * 0.025, pose.hands[0][1] + Math.sin(w) * 0.025], pose.hands[1]], hip: [pose.hip[0] - 0.01 * Math.sin(w * 0.5), pose.hip[1]] };
    rod.angle = 0.9 + 0.06 * Math.sin(w * 0.7);
    rod.bend = 0.9;
  } else if (v < STORY.bag[0]) {
    const u = span(STORY.lift, v);
    pose = mix(POSES.reel, POSES.lift, smooth(0, 0.7, u));
    rod.angle = lerp(0.9, 1.75, smooth(0, 0.8, u));
    rod.bend = lerp(0.9, 0.55, u);
  } else if (v < STORY.turn[0]) {
    const u = span(STORY.bag, v);
    pose = mix(POSES.lift, POSES.stoop, smooth(0.3, 0.75, u));
    pose = mix(pose, POSES.rest, smooth(0.85, 1, u));
    rod.angle = lerp(1.75, 2.15, smooth(0, 0.5, u));
    rod.bend = lerp(0.55, 0.15, smooth(0.6, 0.85, u));
    gear.basket = { open: smooth(0.2, 0.4, u) * (1 - smooth(0.78, 0.92, u)) };
  } else {
    gear.basket = { open: 0 };
    gear.quiver = 3;
    rodDown = true;
  }
  if (v < STORY.turn[0]) {
    gear.rod = rod;
    gear.quiver = 3;
    if (!gear.basket) gear.basket = { open: 0 };
  }
  if (v >= STORY.turn[0]) {
    // Turned to go, then walking; stopping to throw; running; down.
    face = v < STORY.turn[0] + 8 ? -1 : 1;
    pose = POSES.rest;
    const walked = (x - s.stand[0]) / s.h;
    const run = smooth(STORY.run[0], STORY.run[0] + 10, v);
    const going = smooth(STORY.walk[0] - 2, STORY.walk[0] + 6, v);
    if (going > 0) {
      // The gait's phase from how far he has gone, so his feet never slide.
      const phase = walked / stride(run);
      pose = mix(POSES.rest, gait(phase, run), going);
    }
    // Looking back over his shoulder before the first throw.
    if (v > STORY.spears[0] - 16 && v < STORY.spears[0] + 2) pose = { ...pose, back: true };
    STORY.spears.forEach((a, k) => {
      if (v < a - 2 || v > a + THROW) return;
      const t = v - a;
      const turned = t > 3 && t < THROW - 4;
      face = turned ? -1 : 1;
      const draw = smooth(4, AIM, t);
      const hurl = smooth(AIM, LET_GO, t);
      const back = smooth(LET_GO + 3, THROW - 5, t);
      const still = mix(POSES.rest, mix(POSES.aim, POSES.hurl, hurl), draw);
      pose = mix(pose, mix(still, POSES.rest, back), smooth(-2, 3, t) * (1 - smooth(THROW - 5, THROW, t)));
      gear.quiver = 3 - k - (t > 6 ? 1 : 0);
      if (t > 6 && t < LET_GO) gear.spear = lerp(0.35, -0.25, hurl);
    });
    if (v > STORY.spears[STORY.spears.length - 1] + THROW) gear.quiver = 0;
    // Tripped: pitching forward over the rock, then flat out.
    if (v > STORY.trip[0]) {
      const fallU = smooth(STORY.trip[0], STORY.trip[0] + 9, v);
      const flatU = smooth(STORY.trip[0] + 7, STORY.trip[1], v);
      pose = mix(mix(pose, POSES.stumble, fallU), POSES.sprawl, flatU);
      roll = lerp(lerp(0, 0.75, fallU), Math.PI / 2, flatU);
      if (v > STORY.basket[0]) delete gear.basket;
    }
  }
  return { x, y, face, pose, roll, gear, rodDown };
}

/** Where the spear `k` is at story time v: its point in the air or water and its heading, or null before it is thrown. */
export function spearAt(s: Story, k: number, v: number): { p: [number, number, number]; d: [number, number, number]; under: number } | null {
  const a = STORY.spears[k];
  const t = v - a;
  if (t < LET_GO) return null;
  const from: [number, number, number] = [s.manX(a + LET_GO) - s.h * 0.3, farBank(s, s.manX(a + LET_GO)) - s.path, s.bank + s.h * 0.78];
  const [tx, ty] = s.spears[k];
  const fly = HITS - LET_GO;
  if (t < HITS) {
    const u = (t - LET_GO) / fly;
    const arc = s.h * 0.5;
    const p: [number, number, number] = [lerp(from[0], tx, u), lerp(from[1], ty, u), lerp(from[2], 0, u) + arc * 4 * u * (1 - u)];
    const d: [number, number, number] = [tx - from[0], ty - from[1], -from[2] + arc * 4 * (1 - 2 * u)];
    const l = Math.hypot(...d);
    return { p, d: [d[0] / l, d[1] / l, d[2] / l], under: 0 };
  }
  // In the water: on along the way it came, slowing fast, a little steeper.
  const d0: [number, number, number] = [tx - from[0], ty - from[1], -from[2] - s.h * 0.5 * 2];
  const l = Math.hypot(...d0);
  const d: [number, number, number] = [d0[0] / l, d0[1] / l, (d0[2] / l) * 1.15];
  const go = s.h * 0.55 * (1 - Math.exp(-(t - HITS) / 2.2));
  return { p: [tx + d[0] * go, ty + d[1] * go, d[2] * go], d, under: t - HITS };
}

/** When spear k goes into the water, in story time. */
export const spearHits = (k: number) => STORY.spears[k] + HITS;
