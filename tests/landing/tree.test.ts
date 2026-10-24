import { describe, expect, it } from "vitest";
import { CLOCK, INK, growTree, sprout, visibleCount } from "@/lib/landing/tree";

describe("growTree", () => {
  const tree = growTree([1, 0.4, 0.2, 0.1]);

  it("is deterministic", () => {
    const again = growTree([1, 0.4, 0.2, 0.1]);
    expect(again.dots.length).toBe(tree.dots.length);
    expect(again.dots[500]).toEqual(tree.dots[500]);
  });

  it("grows one limb per finding and one root per input", () => {
    expect(tree.limbs).toHaveLength(4);
    expect(tree.roots).toHaveLength(4);
    expect(growTree([1, 0.5]).limbs).toHaveLength(2);
  });

  it("keeps roots below ground and limbs above it", () => {
    for (const r of tree.roots) expect(r.y).toBeGreaterThan(0);
    for (const l of tree.limbs) expect(l.y).toBeLessThan(0);
  });

  it("shows only the roots before the scroll starts", () => {
    const n = visibleCount(tree.dots, CLOCK.roots[1]);
    expect(n).toBeGreaterThan(0);
    for (const d of tree.dots.slice(0, n)) expect(d.y).toBeGreaterThan(-0.01);
    expect(visibleCount(tree.dots, 1)).toBe(tree.dots.length);
  });

  it("gives bigger findings more orange", () => {
    const orange = (i: number) => {
      const l = tree.limbs[i];
      const near = tree.dots.filter((d) => Math.hypot(d.x - l.x, d.y - l.y) < 0.12);
      return near.filter((d) => d.ink === INK.fruit || d.ink === INK.fruitPale).length / near.length;
    };
    expect(orange(0)).toBeGreaterThan(orange(3));
  });

  it("tags every dot with the part it belongs to", () => {
    expect(new Set(tree.dots.map((d) => d.part))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
  });

  it("sprouts a twig that ends where it was asked to", () => {
    const twig = sprout(0, 0, 0.2, -0.1, 0, 0.5, 7);
    const last = twig.filter((d) => d.t >= 0.8);
    const cx = last.reduce((s, d) => s + d.x, 0) / last.length;
    expect(cx).toBeCloseTo(0.2, 1);
    expect(twig.every((d) => d.t >= 0 && d.t <= 1)).toBe(true);
  });

  it("stays within a renderable budget", () => {
    expect(tree.dots.length).toBeLessThan(30_000);
  });
});
