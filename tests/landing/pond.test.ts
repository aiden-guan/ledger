import { describe, expect, it } from "vitest";
import { DROP_HEART, GLINT, SPINE, TAIL, TIP, WATER, condense, dropHalf, dropInk, koiDots, koiHalf, loopAt, ripples, splash, swim } from "@/lib/landing/pond";
import { INK } from "@/lib/landing/tree";

describe("the drop", () => {
  it("is round below and comes to a point above", () => {
    expect(dropHalf(0)).toBeCloseTo(1);
    expect(dropHalf(-TIP + 0.05)).toBeLessThan(0.05);
    expect(dropHalf(-TIP - 0.1)).toBe(-1);
    expect(dropHalf(1.1)).toBe(-1);
  });

  it("is ink inside, paper outside, with a highlight on the lit side", () => {
    expect(dropInk(0.2, 0.2, 0, 0.5)).toBeGreaterThanOrEqual(0);
    expect(dropInk(1.2, 0, 0, 0.5)).toBe(-1);
    expect(dropInk(-0.46, -0.3, 0, 0.5)).toBe(GLINT);
  });

  it("takes in every dot of the tree, each on its own bearing", () => {
    const n = 2000;
    const xs = new Float32Array(n);
    const ys = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = 500 + Math.cos(i * 2.39) * (40 + (i % 300));
      ys[i] = 400 + Math.sin(i * 2.39) * (40 + (i % 300)) * 0.7;
    }
    const at = condense(xs, ys, 500, 400);
    for (let i = 0; i < n; i++) {
      const x = at[i * 2];
      const y = at[i * 2 + 1];
      expect(Math.abs(x)).toBeLessThanOrEqual(dropHalf(y) + 1e-6);
      // Same side of the heart as it started.
      expect(Math.sign(x) === Math.sign(xs[i] - 500) || Math.abs(x) < 1e-3).toBe(true);
    }
    expect(at[1]).toBeGreaterThan(-TIP);
    expect(DROP_HEART).toBeLessThan(0);
  });
});

describe("the splash", () => {
  it("does nothing until the drop goes in", () => {
    expect(ripples(WATER.impact - 0.01, 900, 40)).toEqual([]);
    expect(splash(WATER.impact - 0.01, 40).drops).toEqual([]);
  });

  it("spreads its rings outward and lets them die away", () => {
    const early = ripples(WATER.impact + 0.05, 900, 40);
    const late = ripples(WATER.impact + 0.25, 900, 40);
    expect(early.length).toBeGreaterThan(0);
    expect(Math.max(...late.map((r) => r.r))).toBeGreaterThan(Math.max(...early.map((r) => r.r)));
    expect(Math.max(...late.map((r) => r.a))).toBeLessThan(Math.max(...early.map((r) => r.a)));
  });

  it("throws droplets up that come back down", () => {
    const up = splash(WATER.impact + 0.02, 40).drops;
    expect(up.some((d) => d.h > 0)).toBe(true);
    const down = splash(WATER.impact + 0.07, 40).drops;
    expect(down.every((d) => d.h === 0 && d.ring > 0)).toBe(true);
  });
});

describe("the koi", () => {
  const fast = koiDots("fast", 31);
  const slow = koiDots("slow", 47);

  it("are the same for every visitor", () => {
    expect(koiDots("fast", 31)).toEqual(fast);
  });

  it("keep the body inside its outline and give every fin dots", () => {
    for (const d of fast.filter((q) => q.fin === 0 && q.s <= 0.8)) expect(Math.abs(d.o)).toBeLessThanOrEqual(koiHalf(d.s) + 1e-9);
    expect(new Set(fast.map((d) => d.fin))).toEqual(new Set([0, 1, 2, 3, 4]));
  });

  it("are mostly blue on the fast loop and mostly orange on the slow one", () => {
    const share = (dots: typeof fast, ink: number) => dots.filter((d) => d.fin === 0 && d.ink === ink).length / dots.filter((d) => d.fin === 0).length;
    expect(share(fast, INK.moss)).toBeGreaterThan(share(fast, INK.fruit));
    expect(share(slow, INK.fruit)).toBeGreaterThan(share(slow, INK.moss));
  });

  it("swim their loop, spine about as long as the fish", () => {
    const loop = { r: 300, squash: 0.78, lap: 20, phase: 0, lumps: [0.8, 2.1] as [number, number] };
    const len = 240;
    const sp = swim(loop, len, 1, 3);
    let walked = 0;
    for (let i = 1; i < SPINE; i++) walked += Math.hypot(sp[i * 4] - sp[i * 4 - 4], sp[i * 4 + 1] - sp[i * 4 - 3]);
    expect(walked).toBeGreaterThan(len * TAIL * 0.95);
    expect(walked).toBeLessThan(len * TAIL * 1.15);
    for (let i = 0; i < SPINE; i++) expect(Math.hypot(sp[i * 4 + 2], sp[i * 4 + 3])).toBeCloseTo(1);
    // A lap later the head is back where it was.
    const again = swim(loop, len, 1, 3 + loop.lap);
    expect(Math.hypot(again[0] - sp[0], again[1] - sp[1])).toBeLessThan(2);
    // Half a lap on, it is across the pond.
    const across = swim(loop, len, 1, 3 + loop.lap / 2);
    expect(Math.hypot(across[0] - sp[0], across[1] - sp[1])).toBeGreaterThan(loop.r);
    expect(Math.hypot(...loopAt(loop, 0))).toBeGreaterThan(0);
  });
});
