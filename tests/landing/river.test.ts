import { describe, expect, it } from "vitest";
import { loopAt } from "@/lib/landing/pond";
import { SHADOW, banks, currents, pace, passing, rockEdge, rockInk, sample, track, wayOut } from "@/lib/landing/river";
import { INK } from "@/lib/landing/tree";
import { SCREENS, lay } from "./lay";

/** The longest step between neighbouring points of a path. */
function longestStep(xy: Float64Array) {
  let most = 0;
  for (let i = 1; i < xy.length / 2; i++) most = Math.max(most, Math.hypot(xy[i * 2] - xy[i * 2 - 2], xy[i * 2 + 1] - xy[i * 2 - 1]));
  return most;
}

describe("the river", () => {
  it.each(SCREENS)("puts its five rocks on alternate sides, inside the banks, at %ix%i", (vw, vh) => {
    const { river, clear } = lay(vw, vh);
    expect(river.rocks).toHaveLength(5);
    river.rocks.forEach((rock, i) => {
      if (i) expect(rock.side).toBe(-river.rocks[i - 1].side);
      const [left, right] = banks(river, rock.y)!;
      expect(rock.x - rock.r * 1.25).toBeGreaterThan(left);
      expect(rock.x + rock.r * 1.25).toBeLessThan(right);
      // The way past it is on its open side, between the rock and the bank.
      const by = passing(rock, clear);
      expect(Math.sign(by - rock.x)).toBe(-rock.side);
      expect(by).toBeGreaterThan(left);
      expect(by).toBeLessThan(right);
    });
  });

  it.each(SCREENS)("has a way down that clears every rock and keeps off the banks, at %ix%i", (vw, vh) => {
    const { river, koi, clear, path } = lay(vw, vh);
    const xy = path.xy;
    expect(longestStep(xy)).toBeLessThan(4);
    for (let i = 0; i < xy.length / 2; i++) {
      const x = xy[i * 2];
      const y = xy[i * 2 + 1];
      for (const rock of river.rocks) {
        const gap = Math.hypot(x - rock.x, (y - rock.y) / 0.86) - rockEdge(rock, Math.atan2((y - rock.y) / 0.86, x - rock.x));
        expect(gap).toBeGreaterThan(clear * 0.5);
      }
      if (y < river.top || y > river.bottom) continue;
      const [left, right] = banks(river, y)!;
      expect(Math.min(x - left, right - x)).toBeGreaterThan(koi * 0.25);
    }
    // It leaves the river by the mouth and ends in the pond.
    expect(path.mouth).toBeGreaterThan(0);
    expect(xy[xy.length - 1]).toBeGreaterThan(river.bottom);
  });

  it("carries its current between the banks", () => {
    const { river } = lay(1440, 900);
    const streaks = currents(river, 3.2, river.top, river.bottom);
    expect(streaks.length).toBeGreaterThan(50);
    for (const c of streaks) {
      const [left, right] = banks(river, c.y)!;
      expect(c.x).toBeGreaterThan(left);
      expect(c.x).toBeLessThan(right);
      expect(Math.hypot(c.dx, c.dy)).toBeCloseTo(1);
      // Downstream.
      expect(c.dy).toBeGreaterThan(0);
    }
    expect(currents(river, 3.2, river.top, river.bottom)).toEqual(streaks);
  });

  it("lights its rocks from the upper left and shades the water below and to the right", () => {
    const { river } = lay(1440, 900);
    const rock = river.rocks[0];
    expect([INK.dust, INK.bark]).toContain(rockInk(-rock.r * 0.3, -rock.r * 0.3, rock, 0, 0.5));
    // Out along the lower right: the wet rim, then its shadow on the water, then open water.
    const e = rockEdge(rock, Math.PI / 4);
    const out = (k: number) => [k * e * Math.SQRT1_2, k * e * Math.SQRT1_2 * 0.86] as const;
    expect(rockInk(...out(0.95), rock, 0, 0.5)).toBe(INK.navy);
    expect(rockInk(...out(1.05), rock, 0.3, 0.5)).toBe(SHADOW);
    expect(rockInk(...out(1.6), rock, 0.3, 0.5)).toBe(-1);
  });
});

describe("the koi's journey", () => {
  it.each([0, 1.3, 2.9, 4.4])("sets off from wherever it is on its loop (at %f radians) without a jump", (angle) => {
    const { loop, koi, path } = lay(1440, 900);
    const way = wayOut(loop, angle, koi, path);
    expect(longestStep(way.xy)).toBeLessThan(4);
    // Its snout is where it was on the loop, with its body along the loop behind it.
    let i = 0;
    while (way.at[i] < way.start) i++;
    const [hx, hy] = loopAt(loop, angle);
    expect(Math.hypot(way.xy[i * 2] - hx, way.xy[i * 2 + 1] - hy)).toBeLessThan(0.01);
    expect(way.start).toBeGreaterThan(koi);
    expect(way.river).toBeGreaterThan(way.start);
    expect(way.mouth).toBeGreaterThan(way.river);
    expect(way.end).toBeGreaterThan(way.mouth);
    expect(way.end).toBeCloseTo(way.at[way.at.length - 1]);
  });

  it("swims on with the scroll, never back, and stops at the end of its way", () => {
    const { loop, koi, path, vh } = lay(1440, 900);
    const way = wayOut(loop, 1.3, koi, path);
    const budget = (335 * vh) / 100;
    const swum = pace(way, budget, 2, (380 * vh) / 100);
    expect(swum[0]).toBeCloseTo(way.start);
    for (let k = 1; k < swum.length; k++) expect(swum[k]).toBeGreaterThanOrEqual(swum[k - 1]);
    expect(sample(swum, 2, budget)).toBeCloseTo(way.end);
    // Held at rest for the rest of the scroll.
    expect(sample(swum, 2, (380 * vh) / 100)).toBeCloseTo(way.end);
    expect(sample(swum, 2, 1e9)).toBeCloseTo(way.end);
  });

  it("is followed by a camera that never goes back up and stops over the pond", () => {
    const { loop, koi, path, vh, hold, bottom } = lay(1440, 900);
    const way = wayOut(loop, 2.9, koi, path);
    const swum = pace(way, (335 * vh) / 100, 2, (380 * vh) / 100);
    const cam = track(way, swum, hold, bottom, 2);
    expect(cam[0]).toBeCloseTo(0);
    for (let k = 1; k < cam.length; k++) {
      expect(cam[k]).toBeGreaterThanOrEqual(cam[k - 1]);
      expect(cam[k]).toBeLessThanOrEqual(bottom);
    }
    expect(cam[cam.length - 1]).toBeCloseTo(bottom);
  });
});
