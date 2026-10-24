/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { resetDemoData, type EngineCtx } from "@/convex/engine";
import schema from "@/convex/schema";

/* The overview's field query against Convex's in-memory backend, on the seeded demo company. */

const modules = import.meta.glob("../../convex/**/*.*s");
const t = convexTest(schema, modules);
const ctx = { runQuery: t.query, runMutation: t.mutation } as unknown as EngineCtx;

beforeAll(async () => {
  await resetDemoData(ctx, { anchorDate: Date.parse("2026-10-18T00:00:00Z") });
});

describe("field.get", () => {
  it("returns every record and links each finding to stored records", async () => {
    const field = await t.query(api.field.get, {});
    expect(field).not.toBeNull();
    const ids = new Set(field!.records.map((r) => r.id));
    expect(field!.records.length).toBe(field!.counts.sales + field!.counts.transactions);
    expect(field!.leaks).toHaveLength(4);
    for (const leak of field!.leaks) {
      expect(leak.records.length).toBeGreaterThan(0);
      expect(leak.records.every((id) => ids.has(id))).toBe(true);
      expect(leak.recommendationId).not.toBeNull();
      expect(leak.recommendationStatus).toBe("PROPOSED");
    }
  });

  it("shows an approval as soon as it is made", async () => {
    const before = await t.query(api.field.get, {});
    const leak = before!.leaks[0];
    await t.mutation(api.recommendations.approve, { id: leak.recommendationId! });
    const after = await t.query(api.field.get, {});
    expect(after!.leaks.find((l) => l.findingId === leak.findingId)?.recommendationStatus).toBe("READY_FOR_EXECUTION");
  });
});
