import { describe, expect, it } from "vitest";
import { POSES, figure, gait } from "@/lib/landing/fisher";
import { coralCells } from "@/lib/landing/reef";
import { BROOD, STORY, farBank, layStory, manAt, nearBank, pointAt, spearAt, spearHits } from "@/lib/landing/story";
import { SCREENS, lay } from "./lay";

/** The story after the pond, as the page lays it out for a screen vw by vh. */
function story(vw: number, vh: number) {
  const { garden, koi } = lay(vw, vh);
  const rest = garden.path[garden.path.length - 1];
  const before = garden.path[garden.path.length - 2];
  return layStory({ width: vw, height: vh, narrow: vw < 640, flat: 0.95, top: garden.top, view: vh / 0.95, rest, before, mouth: [garden.mouth.x, garden.mouth.y], koi, cell: vw < 640 ? 3 : 4 });
}

const times = Array.from({ length: Math.ceil(STORY.end / 0.5) + 1 }, (_, i) => i * 0.5);

describe("the story after the pond", () => {
  it("is the same for every visitor", () => {
    expect(story(1440, 900).reef).toEqual(story(1440, 900).reef);
  });

  it.each(SCREENS)("moves everyone smoothly and only ever forward along their ways, at %ix%i", (vw, vh) => {
    const s = story(vw, vh);
    const ways = [
      [s.orange, s.orangeAt],
      [s.blue, s.blueAt],
      [s.after, s.afterAt],
      ...s.kids.map((k) => [k.path, k.at] as const),
    ] as const;
    for (const [path, at] of ways) {
      // No jumps along the way itself.
      for (let i = 2; i < path.xy.length; i += 2) expect(Math.hypot(path.xy[i] - path.xy[i - 2], path.xy[i + 1] - path.xy[i - 1])).toBeLessThan(12);
      let last = -Infinity;
      for (const v of times) {
        const a = at(v);
        expect(a).toBeGreaterThanOrEqual(last - 1e-6);
        expect(a).toBeLessThanOrEqual(path.at[path.at.length - 1] + 1e-6);
        last = a;
      }
    }
    let x = -Infinity;
    for (const v of times) {
      expect(s.manX(v)).toBeGreaterThanOrEqual(x - 1e-6);
      x = s.manX(v);
    }
  });

  it.each(SCREENS)("throws every spear into the river, at %ix%i", (vw, vh) => {
    const s = story(vw, vh);
    STORY.spears.forEach((_, k) => {
      const hit = spearAt(s, k, spearHits(k));
      expect(hit).not.toBeNull();
      const [x, y, z] = hit!.p;
      expect(z).toBeCloseTo(0, 5);
      expect(y).toBeGreaterThan(farBank(s, x));
      expect(y).toBeLessThan(nearBank(s, x));
    });
  });

  it.each(SCREENS)("has young that come up while their parents circle, and settles all of them in the clearing, at %ix%i", (vw, vh) => {
    const s = story(vw, vh);
    expect(s.kids).toHaveLength(BROOD);
    for (const k of s.kids) {
      expect(k.born).toBeGreaterThanOrEqual(STORY.young[0]);
      expect(k.born).toBeLessThan(STORY.young[1]);
      const [x, y] = pointAt(k.path, k.at(STORY.end));
      expect(Math.hypot(x - s.home.x, y - s.home.y)).toBeCloseTo(s.home.ring, -1);
    }
    for (const [path, at] of [
      [s.orange, s.orangeAt],
      [s.after, s.afterAt],
    ] as const) {
      const [x, y] = pointAt(path, at(STORY.end));
      expect(Math.hypot(x - s.home.x, y - s.home.y)).toBeCloseTo(s.home.r, -1);
    }
  });

  it.each(SCREENS)("grows the reef in the water, clear of the family's rings, at %ix%i", (vw, vh) => {
    const s = story(vw, vh);
    expect(s.reef.corals.length).toBeGreaterThan(vw < 640 ? 40 : 80);
    for (const c of s.reef.corals) {
      expect(c.y).toBeGreaterThan(farBank(s, c.x));
      expect(c.y).toBeLessThan(nearBank(s, c.x));
      expect(Math.hypot(c.x - s.home.x, c.y - s.home.y)).toBeGreaterThan(s.home.ring + c.r);
      // Anemones sway, so they are drawn fresh each frame instead.
      if (c.kind !== "anemone") expect(coralCells(c, 4, false).length).toBeGreaterThan(0);
    }
  });

  it.each(SCREENS)("keeps the camera and the fisherman on the plane at every moment, at %ix%i", (vw, vh) => {
    const s = story(vw, vh);
    for (const v of times) {
      const c = s.camera(v);
      for (const k of [c.x, c.y, c.zoom, c.tilt]) expect(Number.isFinite(k)).toBe(true);
      const m = manAt(s, v);
      expect(Number.isFinite(m.x) && Number.isFinite(m.y)).toBe(true);
    }
  });
});

describe("the fisherman", () => {
  it("is drawn in every pose and every step of his walk", () => {
    for (const pose of [...Object.values(POSES), ...[0, 0.25, 0.5, 0.75].flatMap((p) => [gait(p, 0), gait(p, 1)])]) {
      const d = figure(pose, 60, 1, 0, { rod: { angle: 1, bend: 0.3 }, basket: { open: 0 }, quiver: 3 }, false);
      expect(d.cells.length).toBeGreaterThan(200);
      expect(d.rodTip).not.toBeNull();
      for (const c of d.cells) expect(Number.isInteger(c.x) && Number.isInteger(c.y)).toBe(true);
    }
  });
});
