import { describe, expect, it } from "vitest";
import { RIVER_AT, STORY_AT, TRAVEL_VH } from "@/lib/landing/clocks";
import { IMPACT_AT, cues, levels, strides } from "@/lib/landing/sound";
import { STORY, spearHits } from "@/lib/landing/story";

describe("landing sound", () => {
  it("keeps every bed between silent and full, and moves smoothly with scroll", () => {
    let prev = levels(0);
    for (let t = 0; t <= TRAVEL_VH; t += 0.5) {
      const l = levels(t);
      for (const [k, v] of Object.entries(l)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        expect(Math.abs(v - prev[k as keyof typeof l])).toBeLessThan(0.05);
      }
      prev = l;
    }
  });

  it("plays each scene's bed in its scene", () => {
    expect(levels(200).wind).toBeGreaterThan(0.5);
    expect(levels(200).pond).toBe(0);
    expect(levels(IMPACT_AT - 20).pond).toBe(0);
    expect(levels(IMPACT_AT + 60).pond).toBeGreaterThan(0.9);
    expect(levels(IMPACT_AT + 60).wind).toBe(0);
    expect(levels(RIVER_AT + 150).stream).toBe(1);
    expect(levels(STORY_AT + 500).stream).toBeGreaterThan(0.5);
    expect(levels(STORY_AT + STORY.end).under).toBe(1);
    expect(levels(STORY_AT + STORY.end).stream).toBe(0);
  });

  it("times the spears and the fall to the story", () => {
    const vs = cues().map((c) => c.v);
    STORY.spears.forEach((_, k) => expect(vs).toContain(spearHits(k)));
    expect(vs).toContain(STORY.fall[1]);
    for (const s of strides()) expect(s.to).toBeGreaterThan(s.from);
  });
});
