/*
 * The landing page's sound: what you would hear standing in the scene. Wind in the tree, a drop
 * landing in still water, a pond, a brook running past rocks, the fisherman's reel and steps,
 * spears going in, the sea, and a reef heard from just under the surface.
 *
 * Nothing is recorded. Every sound is made here with Web Audio from noise and sine bubbles, the
 * way water actually sounds: a brook is thousands of tiny bubbles ringing as they form, each one a
 * short sine that rises in pitch (Minnaert resonance), over a bed of filtered noise. Wind is noise
 * through a wide band that swells in gusts; leaves are the top of that band, fluttering.
 *
 * Beds play all the time and are faded by where the page is scrolled (see `levels`). One-shot
 * sounds are tied to moments of the story's scroll clock and play when the page is scrolled down
 * past them, so they land with the picture.
 */

import { HOLD_VH, REST_VH, RIVER_AT, RIVER_VH, STORY_AT, TREE_VH, WATER_VH } from "./clocks";
import { WATER } from "./pond";
import { STORY, THROW, spearHits } from "./story";

const smooth = (a: number, b: number, v: number) => {
  const u = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

/** Where the drop hits the pond, in vh of travel. */
export const IMPACT_AT = TREE_VH + HOLD_VH + WATER.impact * WATER_VH;

export interface Levels {
  /** Wind through the tree's crown. */
  wind: number;
  /** Leaves, the top of the wind. */
  leaves: number;
  /** Still water lapping. */
  pond: number;
  /** Running water: the brook past the rocks, then the wide river. */
  stream: number;
  /** Waves on the open sea. */
  sea: number;
  /** Under the surface at the reef. */
  under: number;
}

/** How loud each bed is at a point of travel (vh scrolled into the story), each 0 to 1. */
export function levels(t: number): Levels {
  const v = t - STORY_AT;
  const tree = 1 - smooth(TREE_VH + HOLD_VH - 10, IMPACT_AT - 15, t);
  // The brook: the koi's river, then the rest in the pond, then the wide river across the tilt.
  const brook = smooth(RIVER_AT + 4, RIVER_AT + 70, t) * (1 - smooth(RIVER_AT + RIVER_VH - REST_VH - 40, RIVER_AT + RIVER_VH - REST_VH, t));
  const wide = smooth(STORY.out[0], STORY.out[1], v) * (1 - smooth(STORY.home[0] + 20, STORY.home[0] + 90, v));
  const pondIn = smooth(IMPACT_AT - 2, IMPACT_AT + 30, t);
  const pond = pondIn * (1 - 0.7 * brook) * (1 - 0.85 * wide) * (1 - smooth(STORY.home[0], STORY.home[0] + 60, v));
  const sea = smooth(STORY.home[0] + 30, STORY.home[0] + 100, v);
  const under = smooth(STORY.home[0] + 90, STORY.settle[0], v);
  return {
    wind: Math.max(tree * (0.55 + 0.45 * smooth(0, TREE_VH * 0.6, t)), 0.35 * wide),
    leaves: Math.max(tree * smooth(40, TREE_VH * 0.7, t), 0.18 * wide),
    pond,
    stream: Math.max(brook, 0.6 * wide),
    sea: sea * (1 - 0.6 * under),
    under,
  };
}

/** A moment in the story's clock (story vh) and the sound it makes. */
export interface Cue {
  v: number;
  play: (s: Soundscape, t: number) => void;
}

/** Sounds tied to moments, in story vh. */
export function cues(): Cue[] {
  const list: Cue[] = [];
  const at = (v: number, play: Cue["play"]) => list.push({ v, play });
  const [c0, c1] = STORY.cast;
  // The cast: the rod swishes over, the line runs off the reel, the float lands.
  at(c0 + 13, (s, t) => s.whoosh(t, 0.32, 700, 2600, 0.5));
  at(c0 + 14, (s, t) => s.ratchet(t, 0.9, 26, 0.5));
  at(c1 - 2, (s, t) => s.plip(t, 0.7, 0.4));
  // The bite: the float bobs.
  [STORY.bite[0] + 2, STORY.bite[0] + 6, STORY.bite[1] - 3].forEach((v, i) => at(v, (s, t) => s.splash(t, 0.18 + 0.08 * i, 0.4)));
  // Reeling her in: she fights at the surface.
  for (let v = STORY.reel[0] + 6; v < STORY.reel[1]; v += 9) at(v, (s, t) => s.splash(t, 0.25, 0.3));
  // Lifted out: water pours off her.
  at(STORY.lift[0] + 3, (s, t) => s.splash(t, 0.8, 0.2));
  at(STORY.lift[0] + 8, (s, t) => s.drips(t, 1.6, 0.25));
  // Into the basket.
  at(STORY.bag[0] + 12, (s, t) => s.thud(t, 0.35, 0.3));
  // The orange koi thrashes.
  [STORY.rage[0] + 3, STORY.rage[0] + 10, STORY.rage[0] + 16, STORY.rage[0] + 25, STORY.rage[0] + 31].forEach((v, i) =>
    at(v, (s, t) => s.splash(t, 0.45 + 0.1 * (i % 2), 0.6)),
  );
  // Spears: the throw, and in.
  STORY.spears.forEach((_, k) => {
    const hit = spearHits(k);
    at(hit - 6, (s, t) => s.whoosh(t, 0.22, 1200, 3200, 0.3));
    at(hit, (s, t) => s.spear(t, 0.5));
  });
  // The trip: down on the gravel, the basket lands, and she falls back in.
  at(STORY.trip[0] + 8, (s, t) => s.thud(t, 1, 0.3));
  at(STORY.basket[1] - 2, (s, t) => s.thud(t, 0.4, 0.6));
  at(STORY.fall[1], (s, t) => s.splash(t, 1, 0.5));
  // The young come up, one by one.
  for (let k = 0; k < 7; k++) at(STORY.young[0] + 4 + k * 6.5, (s, t) => s.plip(t, 0.35 + 0.05 * (k % 3), 0.2 + 0.1 * (k % 4)));
  return list.sort((a, b) => a.v - b.v);
}

/** Spans of the story's clock where he walks or runs, and how far (story vh) each step takes. */
export function strides(): { from: number; to: number; every: number; hard: number }[] {
  const firstThrow = STORY.spears[0] - 2;
  const lastThrow = STORY.spears[STORY.spears.length - 1] + THROW;
  return [
    { from: STORY.walk[0] + 4, to: firstThrow, every: 5.5, hard: 0.5 },
    { from: lastThrow, to: STORY.trip[0] + 6, every: 3.4, hard: 1 },
  ];
}

/* ------------------------------------------------------------------ the engine */

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function noise(ctx: BaseAudioContext, kind: "white" | "pink" | "brown", seconds = 6) {
  const n = Math.round(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === "white") d[i] = w * 0.5;
    else if (kind === "brown") {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else {
      // Paul Kellet's pink filter.
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  // Cross-fade the ends so the loop has no seam.
  const fade = Math.round(ctx.sampleRate * 0.05);
  for (let i = 0; i < fade; i++) {
    const u = i / fade;
    d[i] = d[i] * u + d[n - fade + i] * (1 - u);
  }
  return buf;
}

/** A room-less outdoor tail: a short, dark, diffuse impulse. */
function air(ctx: BaseAudioContext, seconds: number) {
  const n = Math.round(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      lp += 0.25 * (Math.random() * 2 - 1 - lp);
      d[i] = lp * Math.exp((-4.5 * i) / n) * (i < 200 ? i / 200 : 1);
    }
  }
  return buf;
}

type Bed = { gain: GainNode; mod: GainNode[] };

/**
 * All of the page's sound, on one audio context. `update(travel)` sets the beds for where the page
 * is scrolled and plays any cue scrolled past; the timer keeps the beds alive (gusts, waves,
 * bubbles) in between.
 */
export class Soundscape {
  readonly ctx: BaseAudioContext;
  private out: GainNode;
  private dry: GainNode;
  private wet: GainNode;
  private white: AudioBuffer;
  private pink: AudioBuffer;
  private brown: AudioBuffer;
  private beds: Record<keyof Levels, Bed>;
  private level: Levels = { wind: 0, leaves: 0, pond: 0, stream: 0, sea: 0, under: 0 };
  private cueList = cues();
  private strideList = strides();
  private last: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ahead = 0;
  private gust = 0.5;
  private gustTo = 0.5;
  private nextWave = [0, 0];

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.white = noise(ctx, "white");
    this.pink = noise(ctx, "pink", 7);
    this.brown = noise(ctx, "brown", 8);
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.005;
    comp.release.value = 0.3;
    this.out.connect(comp).connect(ctx.destination);
    this.dry = ctx.createGain();
    this.dry.connect(this.out);
    const verb = ctx.createConvolver();
    verb.buffer = air(ctx, 1.6);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.35;
    this.wet.connect(verb).connect(this.out);
    this.beds = {
      wind: this.bed([["bandpass", 420, 0.5], ["lowpass", 1400, 0.7]], "pink", 0.5, 0.7),
      leaves: this.bed([["highpass", 2600, 0.7], ["lowpass", 7500, 0.7]], "pink", 0.8, 0.6),
      pond: this.bed([["lowpass", 320, 0.6], ["highpass", 60, 0.7]], "brown", 0.3, 0.23),
      stream: this.bed([["bandpass", 900, 0.35], ["lowpass", 3800, 0.7]], "pink", 0.6, 0.5),
      sea: this.bed([["lowpass", 500, 0.6]], "pink", 0.7, 0.6),
      under: this.bed([["lowpass", 170, 0.8], ["highpass", 30, 0.7]], "brown", 0, 0.33),
    };
  }

  /** A pair of looping noise sources, panned apart, through filters, each with its own swell. */
  private bed(filters: [BiquadFilterType, number, number][], kind: "white" | "pink" | "brown", width: number, gain: number): Bed {
    const g = this.ctx.createGain();
    g.gain.value = 0;
    const trim = this.ctx.createGain();
    trim.gain.value = gain;
    g.connect(trim).connect(this.dry);
    const mod: GainNode[] = [];
    for (const side of [-1, 1]) {
      const src = this.ctx.createBufferSource();
      src.buffer = kind === "white" ? this.white : kind === "pink" ? this.pink : this.brown;
      src.loop = true;
      let node: AudioNode = src;
      for (const [type, f, q] of filters) {
        const b = this.ctx.createBiquadFilter();
        b.type = type;
        b.frequency.value = f * (side < 0 ? 0.93 : 1.07);
        b.Q.value = q;
        node = node.connect(b);
      }
      const m = this.ctx.createGain();
      m.gain.value = 0.7;
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = side * width;
      node.connect(m).connect(pan).connect(g);
      src.start(0, rand(0, src.buffer!.duration));
      mod.push(m);
    }
    return { gain: g, mod };
  }

  /** Fade in and keep the beds moving. */
  start() {
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(0.9, now, 1.2);
    this.ahead = now;
    this.nextWave = [now + 0.5, now + 4];
    if (!this.timer) this.timer = setInterval(() => this.tick(), 50);
    this.tick();
  }

  /** Fade out; `then` runs once it is quiet. */
  stop(then?: () => void) {
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(0, now, 0.25);
    setTimeout(() => {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      then?.();
    }, 1200);
  }

  /** Where the page is now, in vh of travel. */
  update(travel: number) {
    const now = this.ctx.currentTime;
    this.level = levels(travel);
    for (const k of Object.keys(this.beds) as (keyof Levels)[]) this.beds[k].gain.gain.setTargetAtTime(this.level[k], now, 0.6);
    const was = this.last;
    this.last = travel;
    // Only scrolling down past a moment plays it, and not when the page jumps a long way.
    if (was === null || travel <= was || travel - was > 30) return;
    if (was < IMPACT_AT && travel >= IMPACT_AT) this.drop(now + 0.02);
    const prev = was - STORY_AT;
    const v = travel - STORY_AT;
    let n = 0;
    for (const c of this.cueList) if (c.v > prev && c.v <= v && n++ < 4) c.play(this, now + 0.02 + n * 0.03);
    for (const st of this.strideList) {
      if (v < st.from || prev > st.to) continue;
      const a = Math.floor((Math.max(prev, st.from) - st.from) / st.every);
      const b = Math.floor((Math.min(v, st.to) - st.from) / st.every);
      for (let i = 0; i < Math.min(3, b - a); i++) this.step(now + 0.02 + i * 0.09, st.hard);
    }
  }

  /* ---------------------------------------------------------------- living beds */

  private tick() {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const L = this.level;
    // Wind: a slow random walk toward new gust targets; leaves flutter on top of the gusts.
    if (Math.random() < 0.025) this.gustTo = rand(0.25, 1);
    this.gust += (this.gustTo - this.gust) * 0.04;
    this.beds.wind.mod.forEach((m, i) => m.gain.setTargetAtTime(this.gust * (0.85 + 0.15 * Math.sin(now * (0.3 + i * 0.17))), now, 0.3));
    this.beds.leaves.mod.forEach((m) => m.gain.setTargetAtTime(this.gust ** 2 * rand(0.35, 1), now, 0.03));
    // The pond laps slowly; the brook churns.
    this.beds.pond.mod.forEach((m, i) => m.gain.setTargetAtTime(0.6 + 0.4 * Math.sin(now * (0.45 + 0.2 * i) + i), now, 0.4));
    this.beds.stream.mod.forEach((m) => m.gain.setTargetAtTime(rand(0.75, 1), now, 0.12));
    // Waves: each swells for a few seconds and draws back.
    this.nextWave.forEach((at, i) => {
      if (now < at || L.sea < 0.01) return;
      const m = this.beds.sea.mod[i].gain;
      const up = rand(2.2, 3.4);
      const peak = rand(0.6, 1);
      m.cancelScheduledValues(now);
      m.setValueAtTime(m.value, now);
      m.linearRampToValueAtTime(peak, now + up);
      m.setTargetAtTime(0.12, now + up, rand(1.4, 2.2));
      this.nextWave[i] = now + up + rand(4, 7);
    });
    // Bubbles, scheduled a little ahead: thousands make a brook, a few make a pond.
    const until = now + 0.15;
    const from = Math.max(this.ahead, now);
    const span = until - from;
    if (span <= 0) return;
    this.ahead = until;
    const brook = L.stream * 55;
    const pond = L.pond * 0.6;
    const reef = L.under * 2.2;
    const shrimp = L.under * 30;
    for (let i = poisson(brook * span); i-- > 0; ) {
      const size = Math.random() ** 2.2;
      this.bubble(from + Math.random() * span, 2100 - 1700 * size, 0.012 + 0.05 * size, L.stream * 0.07 * (0.15 + Math.random() ** 3), rand(-0.8, 0.8), rand(1.3, 2.2));
    }
    for (let i = poisson(pond * span); i-- > 0; ) this.plip(from + Math.random() * span, rand(0.2, 0.5), rand(-0.6, 0.6), L.pond * 0.6);
    for (let i = poisson(reef * span); i-- > 0; ) this.stream(from + Math.random() * span, L.under);
    for (let i = poisson(shrimp * span); i-- > 0; ) this.snap(from + Math.random() * span, L.under);
  }

  /* ---------------------------------------------------------------- sounds */

  /** One bubble ringing as it forms: a sine that rises as it nears the surface. */
  bubble(t: number, f: number, dur: number, amp: number, pan: number, rise = 1.6, into: AudioNode = this.dry) {
    if (amp < 0.0005) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * rise, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(g).connect(p).connect(into);
    o.start(t);
    o.stop(t + dur + 0.01);
  }

  /** A short burst of filtered noise. */
  private burst(t: number, o: { type: BiquadFilterType; f: number; q?: number; f1?: number; attack: number; dur: number; amp: number; pan?: number; buf?: AudioBuffer; wet?: number }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = o.buf ?? this.white;
    const b = ctx.createBiquadFilter();
    b.type = o.type;
    b.frequency.setValueAtTime(o.f, t);
    if (o.f1) b.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    b.Q.value = o.q ?? 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.amp, t + o.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.attack + o.dur);
    const p = ctx.createStereoPanner();
    p.pan.value = o.pan ?? 0;
    src.connect(b).connect(g).connect(p);
    p.connect(this.dry);
    if (o.wet) {
      const w = ctx.createGain();
      w.gain.value = o.wet;
      p.connect(w).connect(this.wet);
    }
    src.start(t, Math.random() * (src.buffer.duration - 1));
    src.stop(t + o.attack + o.dur + 0.05);
  }

  /** A single drop into still water: a tick, then one clear bubble. */
  plip(t: number, size: number, pan = 0, amp = 1) {
    const f = 1500 - 900 * size;
    this.burst(t, { type: "highpass", f: 2500, attack: 0.001, dur: 0.006, amp: 0.05 * amp * size, pan });
    this.bubble(t + 0.004, f, 0.03 + 0.08 * size, 0.18 * amp * (0.4 + size), pan, rand(1.6, 2.4));
    const w = this.ctx.createGain();
    w.gain.value = 0.6;
    w.connect(this.wet);
    this.bubble(t + 0.004, f, 0.03 + 0.08 * size, 0.08 * amp * size, pan, 2, w);
  }

  /** The big drop the tree became, landing in the pond. */
  drop(t: number) {
    this.burst(t, { type: "lowpass", f: 900, attack: 0.002, dur: 0.18, amp: 0.25, buf: this.brown, wet: 0.5 });
    this.bubble(t + 0.01, 260, 0.22, 0.32, 0, 2.1);
    this.plip(t + 0.02, 1, 0, 0.9);
    for (let i = 0; i < 9; i++) this.plip(t + rand(0.18, 0.9), rand(0.15, 0.45), rand(-0.7, 0.7), rand(0.15, 0.4));
  }

  /** Water broken by something: a fish at the surface (small) up to a koi dropped from a height (1). */
  splash(t: number, size: number, pan = 0) {
    this.burst(t, { type: "bandpass", f: 1400 + 800 * (1 - size), q: 0.6, attack: 0.004, dur: 0.12 + 0.35 * size, amp: 0.12 + 0.25 * size, pan, wet: 0.4 });
    this.burst(t, { type: "lowpass", f: 380, attack: 0.003, dur: 0.1 + 0.15 * size, amp: 0.15 * size, buf: this.brown, pan });
    const n = Math.round(4 + 14 * size);
    for (let i = 0; i < n; i++) this.bubble(t + rand(0, 0.25 + 0.3 * size), rand(350, 1600), rand(0.02, 0.07), rand(0.03, 0.09) * (0.5 + size), pan + rand(-0.3, 0.3), rand(1.4, 2.2));
    if (size > 0.4) for (let i = 0; i < n / 2; i++) this.plip(t + rand(0.2, 0.7) * size + 0.1, rand(0.1, 0.35), pan + rand(-0.4, 0.4), 0.3 * size);
  }

  /** Water running off something lifted out. */
  drips(t: number, seconds: number, pan = 0) {
    this.burst(t, { type: "bandpass", f: 2200, q: 0.5, attack: 0.05, dur: 0.6, amp: 0.06, pan });
    for (let i = 0; i < 14; i++) {
      const at = Math.random() ** 1.6 * seconds;
      this.plip(t + at, rand(0.1, 0.3), pan + rand(-0.2, 0.2), 0.35 * (1 - at / seconds / 1.3));
    }
  }

  /** Air moving fast past something: a rod, a spear. */
  whoosh(t: number, dur: number, f0: number, f1: number, amp: number, pan = 0) {
    this.burst(t, { type: "bandpass", f: f0, f1, q: 1.6, attack: dur * 0.55, dur: dur * 0.6, amp: amp * 0.3, buf: this.pink, pan });
  }

  /** The reel's pawl clicking as line runs off: fast, then slowing. */
  ratchet(t: number, seconds: number, clicks: number, amp: number) {
    let at = 0;
    for (let i = 0; i < clicks; i++) {
      const gap = 0.012 + (0.06 * i) / clicks;
      at += gap;
      if (at > seconds) break;
      this.burst(t + at, { type: "bandpass", f: 3800, q: 3, attack: 0.0005, dur: 0.006, amp: amp * 0.18 * (1 - at / seconds / 1.5) });
    }
  }

  /** A spear going into the water: a hard, clean entry, then a trail of bubbles following it down. */
  spear(t: number, pan = 0) {
    this.burst(t, { type: "highpass", f: 1800, attack: 0.002, dur: 0.05, amp: 0.16, pan, wet: 0.5 });
    this.burst(t, { type: "bandpass", f: 900, q: 0.8, attack: 0.003, dur: 0.12, amp: 0.1, pan });
    this.bubble(t + 0.01, 420, 0.14, 0.18, pan, 1.9);
    for (let i = 0; i < 10; i++) {
      const at = 0.05 + i * rand(0.03, 0.06);
      this.bubble(t + at, rand(500, 1100) + i * 60, rand(0.02, 0.05), 0.08 * (1 - i / 11), pan + rand(-0.15, 0.15), rand(1.4, 1.9));
    }
  }

  /** Something heavy landing on the bank. */
  thud(t: number, weight: number, pan = 0) {
    this.burst(t, { type: "lowpass", f: 140 + 60 * (1 - weight), attack: 0.004, dur: 0.12 + 0.18 * weight, amp: 0.45 * weight, buf: this.brown, pan });
    for (let i = 0; i < 6 + 16 * weight; i++) this.grain(t + Math.random() ** 2 * 0.25 * (0.5 + weight), 0.05 * weight, pan);
  }

  /** A boot on gravel. */
  step(t: number, hard: number) {
    const pan = rand(0.2, 0.45);
    this.burst(t, { type: "lowpass", f: 160, attack: 0.003, dur: 0.05, amp: 0.12 + 0.08 * hard, buf: this.brown, pan });
    for (let i = 0; i < 7 + 5 * hard; i++) this.grain(t + rand(0, 0.07), 0.035 + 0.02 * hard, pan);
  }

  /** One stone moving against another. */
  private grain(t: number, amp: number, pan: number) {
    this.burst(t, { type: "bandpass", f: rand(1600, 4200), q: rand(2, 5), attack: 0.0005, dur: rand(0.004, 0.012), amp, pan: pan + rand(-0.1, 0.1) });
  }

  /** Bubbles rising from somewhere on the reef: low, slow, a few in a row. */
  private stream(t: number, amp: number) {
    const pan = rand(-0.8, 0.8);
    const f = rand(180, 420);
    for (let i = 0, at = 0; i < 3 + Math.floor(Math.random() * 5); i++, at += rand(0.07, 0.2)) this.bubble(t + at, f * rand(0.9, 1.2), rand(0.06, 0.12), 0.09 * amp, pan, rand(1.2, 1.5));
  }

  /** Snapping shrimp: the crackle under every reef. */
  private snap(t: number, amp: number) {
    this.burst(t, { type: "highpass", f: rand(2500, 5000), attack: 0.0003, dur: rand(0.002, 0.005), amp: amp * 0.06 * Math.random() ** 2, pan: rand(-0.9, 0.9) });
  }
}

function poisson(mean: number) {
  if (mean <= 0) return 0;
  if (mean > 30) return Math.max(0, Math.round(mean + Math.sqrt(mean) * (Math.random() * 2 - 1) * 1.7));
  const l = Math.exp(-mean);
  let k = 0;
  for (let p = Math.random(); p > l; p *= Math.random()) k++;
  return k;
}
