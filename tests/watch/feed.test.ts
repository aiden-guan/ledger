/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { api } from "@/convex/_generated/api";
import { resetDemoData, type EngineCtx } from "@/convex/engine";
import schema from "@/convex/schema";

/* The live feed end to end in Convex's in-memory backend: scheduled ticks, screening, decisions. */

const modules = import.meta.glob("../../convex/**/*.*s");
const t = convexTest(schema, modules);
const ctx = { runQuery: t.query, runMutation: t.mutation } as unknown as EngineCtx;

async function replay() {
  vi.useFakeTimers();
  await t.mutation(api.watch.start, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
  const feed = await t.query(api.watch.feed, {});
  if (!feed) throw new Error("no feed");
  return { ...feed, items: [...feed.items].reverse() };
}

const feedTransactions = () =>
  t.run(async (c) => (await c.db.query("transactions").collect()).filter((x) => x.source === "live_feed"));

beforeAll(async () => {
  await resetDemoData(ctx, { anchorDate: Date.parse("2026-10-18T00:00:00Z") });
});

describe("live feed", () => {
  it("posts routine payments and holds the ones the policy says to", async () => {
    const feed = await replay();
    expect(feed.running).toBe(false);
    expect(feed.items.map((i) => i.status)).toEqual(["posted", "posted", "posted", "held", "posted", "flagged", "held", "awaiting", "posted", "posted"]);
    expect(feed.stoppedCents).toBe(105840 + 92610);
    expect(feed.waiting).toBe(3);
    expect(await feedTransactions()).toHaveLength(7);
  });

  it("records what autopilot did in the audit log", async () => {
    const actions = await t.run(async (c) => (await c.db.query("auditLog").collect()).filter((a) => a.actorType === "AGENT" && a.action.startsWith("payment.")).map((a) => a.action));
    expect(actions.sort()).toEqual(["payment.escalated", "payment.flagged", "payment.held", "payment.held"]);
  });

  it("posts a payment only when a person releases it", async () => {
    const { items } = await t.query(api.watch.feed, {}).then((f) => f!);
    const impersonator = items.find((i) => i.merchantName === "SUMMIT PACKAGNG SUPPLY")!;
    const northwind = items.find((i) => i.status === "awaiting")!;
    await t.mutation(api.watch.decide, { id: impersonator.id, decision: "block" });
    await t.mutation(api.watch.decide, { id: northwind.id, decision: "release" });
    await expect(t.mutation(api.watch.decide, { id: impersonator.id, decision: "release" })).rejects.toThrow(/already blocked/);
    const posted = await feedTransactions();
    expect(posted.map((p) => p.merchantName)).toContain("ACH DEBIT NORTHWIND TEXTILES");
    expect(posted.map((p) => p.merchantName)).not.toContain("SUMMIT PACKAGNG SUPPLY");
  });

  it("applies a stricter policy to the next replay and clears the last one", async () => {
    await t.mutation(api.watch.setPolicy, { holdAt: 0.4, reviewAt: 0.3, approvalLimitCents: 200_000 });
    const feed = await replay();
    expect(feed.items).toHaveLength(10);
    expect(feed.items.map((i) => i.status)).toEqual(["posted", "posted", "posted", "held", "posted", "held", "held", "posted", "posted", "posted"]);
    expect(await feedTransactions()).toHaveLength(7);
  });

  it("rejects a policy where flagging sits above holding", async () => {
    await expect(t.mutation(api.watch.setPolicy, { holdAt: 0.4, reviewAt: 0.6, approvalLimitCents: 0 })).rejects.toThrow();
  });
});
