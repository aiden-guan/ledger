import { describe, expect, it } from "vitest";
import { flowerInk, padInk } from "@/lib/landing/garden";
import { loopAt } from "@/lib/landing/pond";
import { SHADOW } from "@/lib/landing/river";
import { INK } from "@/lib/landing/tree";
import { SCREENS, lay } from "./lay";

describe("the pond at the bottom", () => {
  it("is the same for every visitor", () => {
    expect(lay(1440, 900).garden).toEqual(lay(1440, 900).garden);
  });

  it.each(SCREENS)("keeps its lily pads apart, on screen, and clear of the closing words and the koi's resting place, at %ix%i", (vw, vh) => {
    const { garden: g, koi } = lay(vw, vh);
    const { clearing: c } = g;
    const rest = g.path[g.path.length - 1];
    expect(g.pads.length).toBeGreaterThanOrEqual(vw < 640 ? 8 : 14);
    g.pads.forEach((p, i) => {
      for (const q of g.pads.slice(i + 1)) expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(p.r + q.r);
      expect(Math.abs(p.x) + p.r).toBeLessThanOrEqual(vw / 2);
      expect(p.y - p.r).toBeGreaterThanOrEqual(g.top);
      expect(p.y + p.r).toBeLessThanOrEqual(g.top + g.view);
      expect(((p.x - c.x) / (c.rx + p.r)) ** 2 + ((p.y - c.y) / (c.ry + p.r)) ** 2).toBeGreaterThanOrEqual(1);
      expect(Math.hypot(p.x - rest[0], p.y - rest[1])).toBeGreaterThanOrEqual(koi * 0.66 + p.r);
    });
    // Nothing adrift over the words, and no glint on a pad.
    for (const d of g.petals) expect(((d.x - c.x) / c.rx) ** 2 + ((d.y - c.y) / c.ry) ** 2).toBeGreaterThanOrEqual(1);
    for (const d of g.glints) for (const p of g.pads) expect(Math.hypot(d.x - p.x, d.y - p.y)).toBeGreaterThanOrEqual(p.r);
  });

  it.each(SCREENS)("sets lotus on the two biggest pads, buds on the smallest, every flower on a pad, at %ix%i", (vw, vh) => {
    const { garden: g } = lay(vw, vh);
    const count = (kind: string) => g.flowers.filter((f) => f.kind === kind).length;
    expect(count("lotus")).toBe(2);
    expect(count("bud")).toBe(3);
    expect(count("lily")).toBeGreaterThan(0);
    for (const f of g.flowers) expect(g.pads.some((p) => Math.hypot(f.x - p.x, f.y - p.y) < p.r)).toBe(true);
  });

  it.each(SCREENS)("keeps its three koi on screen, at %ix%i", (vw, vh) => {
    const { garden: g } = lay(vw, vh);
    expect(g.koi.map((k) => k.kind)).toEqual(["fast", "gold", "slow"]);
    for (const k of g.koi) {
      for (let a = 0; a < Math.PI * 2; a += 0.1) {
        const [x, y] = loopAt(k.loop, a);
        expect(Math.abs(k.x + x)).toBeLessThan(vw / 2);
        expect(k.y + y).toBeGreaterThan(g.top);
        expect(k.y + y).toBeLessThan(g.top + g.view);
      }
    }
  });

  it("blooms outward from where the river comes in", () => {
    const { garden: g } = lay(1440, 900);
    const all = [...g.pads, ...g.flowers, ...g.bushes, ...g.koi, ...g.petals, ...g.glints];
    for (const p of all) {
      expect(p.at).toBeGreaterThanOrEqual(0);
      expect(p.at).toBeLessThan(1);
    }
    const byDistance = [...g.pads].sort((a, b) => Math.hypot(a.x - g.mouth.x, a.y - g.mouth.y) - Math.hypot(b.x - g.mouth.x, b.y - g.mouth.y));
    const third = Math.floor(byDistance.length / 3);
    const mean = (ps: typeof byDistance) => ps.reduce((s, p) => s + p.at, 0) / ps.length;
    expect(mean(byDistance.slice(0, third))).toBeLessThan(mean(byDistance.slice(-third)));
  });

  it("covers its bushes in flowers, within their outline", () => {
    const { garden: g } = lay(1440, 900);
    const flowerInks = new Set<number>([INK.petal, INK.petalPale, INK.rust, INK.gold, INK.mossLight, INK.violet, INK.navy, INK.fruit]);
    expect(g.bushes.length).toBeGreaterThan(50);
    for (const b of g.bushes) {
      expect(b.dots.length).toBeGreaterThan(0);
      for (const d of b.dots) {
        expect(Math.hypot(d.x, d.y)).toBeLessThanOrEqual(b.r * 1.2);
        expect(flowerInks.has(d.ink)).toBe(true);
      }
    }
  });
});

describe("a lily pad", () => {
  const { garden } = lay(1440, 900);
  const pad = garden.pads[0];
  const along = (k: number, turn = 0) => [Math.cos(pad.notch + turn) * pad.r * k, Math.sin(pad.notch + turn) * pad.r * k] as const;

  it("is inked across its body, with a notch cut to its edge", () => {
    expect([INK.navy, INK.moss]).toContain(padInk(...along(0.5, Math.PI), pad, 1, 4));
    expect(padInk(...along(0.8), pad, 1, 4)).toBe(-1);
  });

  it("shades the water below and to its right, and nothing further out", () => {
    expect(padInk(pad.r * Math.SQRT1_2 + 2, pad.r * Math.SQRT1_2 + 3, pad, 1, 4)).toBe(SHADOW);
    expect(padInk(pad.r * 2, 0, pad, 1, 4)).toBe(-1);
  });

  it("is not there before it opens", () => {
    expect(padInk(0, 0, pad, 0.01, 4)).toBe(-1);
  });
});

describe("a flower", () => {
  const { garden } = lay(1440, 900);
  const of = (kind: string) => garden.flowers.find((f) => f.kind === kind)!;

  it("has a gold heart, and petals out to its edge", () => {
    expect([INK.gold, INK.fruit]).toContain(flowerInk(0, 0, of("lotus"), 1, 4));
    expect(flowerInk(0, 0, of("lily"), 1, 4)).toBe(INK.gold);
    expect(flowerInk(0, 0, of("bud"), 1, 4)).toBe(INK.petalPale);
    for (const f of garden.flowers) expect(flowerInk(f.r * 1.1, 0, f, 1, 4)).toBe(-1);
  });

  it("is not there before it opens", () => {
    for (const f of garden.flowers) expect(flowerInk(0, 0, f, 0, 4)).toBe(-1);
  });
});
