/*
 * Guilloché: the woven line patterns engraved on banknotes and cheques to make forgery hard.
 * LedgerLens uses them as its visual language: an intact pattern is healthy books, a break
 * in the weave is money leaking out. Everything here is pure geometry in unit space
 * (radius 1 = the rosette's outer edge), shared by the canvas hero and the SVG marks.
 */

export interface Band {
  /** Mean radius of the band. */
  r: number;
  /** Radial swing of each line. */
  amp: number;
  /** Lobes around the circle. */
  lobes: number;
  /** Slower modulation that makes the band breathe in and out around the circle. */
  mod: number;
  modAmp: number;
  /** Number of interleaved copies; their phase offsets produce the weave. */
  lines: number;
  /** Phase drift per second, in radians, for the live shimmer. */
  drift: number;
}

export const ROSETTE: Band[] = [
  { r: 0.9, amp: 0.055, lobes: 36, mod: 6, modAmp: 0.35, lines: 14, drift: 0.16 },
  { r: 0.72, amp: 0.085, lobes: 24, mod: 4, modAmp: 0.5, lines: 18, drift: -0.12 },
  { r: 0.5, amp: 0.09, lobes: 15, mod: 5, modAmp: 0.45, lines: 16, drift: 0.1 },
  { r: 0.27, amp: 0.1, lobes: 9, mod: 3, modAmp: 0.4, lines: 12, drift: -0.14 },
];

/** Radius of line `i` of a band at angle `theta`, at time `t` seconds. */
export function bandRadius(band: Band, i: number, theta: number, t: number, breathe = 1): number {
  const phase = (i / band.lines) * Math.PI * 2 + band.drift * t;
  const envelope = 1 - band.modAmp + band.modAmp * Math.cos(band.mod * theta + band.drift * t * 0.35);
  return band.r + band.amp * breathe * envelope * Math.sin(band.lobes * theta + phase);
}

/** A break in the weave: where a leak sits on the rosette. */
export interface Fracture {
  /** Angle in radians, 0 = 3 o'clock, increasing clockwise (canvas y points down). */
  angle: number;
  /** Half-width of the break, in radians. */
  spread: number;
  /** Which band carries the break. */
  band: number;
}

/** 0 outside the fracture, rising smoothly to 1 at its centre. */
export function fractureWeight(f: Fracture, theta: number): number {
  let d = Math.abs(theta - f.angle) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  if (d >= f.spread) return 0;
  const x = 1 - d / f.spread;
  return x * x * (3 - 2 * x);
}

/**
 * Sampled points for one line. In a fracture the line shears off its path, which reads as a
 * tear in the pattern. Returns flat [x, y, w] triples where w is the fracture weight.
 */
export function linePoints(band: Band, bandIndex: number, i: number, t: number, steps: number, fractures: Fracture[], breathe = 1): Float32Array {
  const out = new Float32Array(steps * 3 + 3);
  for (let s = 0; s <= steps; s++) {
    const theta = (s / steps) * Math.PI * 2;
    let r = bandRadius(band, i, theta, t, breathe);
    let w = 0;
    for (const f of fractures) {
      if (f.band !== bandIndex) continue;
      const fw = fractureWeight(f, theta);
      if (fw > 0) {
        // The weave loosens: lines lose their swing and fan apart into a gap.
        r -= (bandRadius(band, i, theta, t, breathe) - band.r) * fw * 0.75;
        r += fw * band.amp * 2.2 * (i / (band.lines - 1) - 0.5);
        w = Math.max(w, fw);
      }
    }
    out[s * 3] = Math.cos(theta) * r;
    out[s * 3 + 1] = Math.sin(theta) * r;
    out[s * 3 + 2] = w;
  }
  return out;
}

/** SVG path data for a small static rosette (logo marks, seals). Unit space scaled to `size`. */
export function rosettePath(size: number, opts: { lobes?: number; lines?: number; r?: number; amp?: number; steps?: number } = {}): string {
  const { lobes = 12, lines = 10, r = 0.62, amp = 0.3, steps = 240 } = opts;
  const c = size / 2;
  const parts: string[] = [];
  for (let i = 0; i < lines; i++) {
    const phase = (i / lines) * Math.PI * 2;
    let d = "";
    for (let s = 0; s <= steps; s++) {
      const theta = (s / steps) * Math.PI * 2;
      const rr = (r + amp * Math.sin(lobes * theta + phase) * 0.5) * c;
      d += `${s ? "L" : "M"}${(c + Math.cos(theta) * rr).toFixed(2)} ${(c + Math.sin(theta) * rr).toFixed(2)}`;
    }
    parts.push(d + "Z");
  }
  return parts.join("");
}
