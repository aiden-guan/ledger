/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { resetDemoData, type EngineCtx } from "@/convex/engine";
import schema from "@/convex/schema";
import { answerQuestion, type ModelRunner } from "@/lib/ask/agent";
import { buildTools, finalizeAnswer, Registry, type BooksContext } from "@/lib/ask/tools";

/* Ask your books: the tools over real stored books, grounding of answers, and the stored flow. */

const modules = import.meta.glob("../../convex/**/*.*s");
const t = convexTest(schema, modules);
const ctx = { runQuery: t.query, runMutation: t.mutation } as unknown as EngineCtx;
let books: BooksContext;

beforeAll(async () => {
  const { organizationId } = await resetDemoData(ctx, { anchorDate: Date.parse("2026-10-18T00:00:00Z") });
  books = await t.query(internal.ask.books, { organizationId: organizationId as Id<"organizations"> });
});

const run = (name: string, input: unknown, registry = new Registry()) => {
  const tool = buildTools(books, registry).find((x) => x.name === name)!;
  return JSON.parse(tool.run(tool.inputSchema.parse(input) as never));
};

describe("books tools", () => {
  it("searches transactions with an exact total", () => {
    const out = run("search_transactions", { merchant: "summit", limit: 3 });
    expect(out.matched).toBe(7);
    expect(out.rows).toHaveLength(3);
    expect(out.rows[0].ref).toMatch(/^tx:/);
    // 742.50 + 819.00 + 698.75 + 883.40 + 1,058.00 (twice) + 926.10
    expect(out.total_out).toBe("$6,185.75");
  });

  it("profiles a vendor with its account on file", () => {
    const out = run("vendor_profile", { merchant: "Summit Packaging" });
    expect(out).toMatchObject({ found: true, payments: 7, accounts_on_file: ["••4410"] });
  });

  it("lists the findings with links", () => {
    const registry = new Registry();
    const out = run("list_findings", {}, registry);
    expect(out.findings).toHaveLength(4);
    const ref = out.findings[0].ref as string;
    expect(registry.refs.get(ref)?.href).toBe(`/findings/${ref.slice("finding:".length)}`);
  });

  it("runs the forecast and product economics", () => {
    expect(run("cash_forecast", {}).cash_now).toMatch(/^\$/);
    const bottle = run("product_economics", { product: "alpine" }).products[0];
    expect(bottle).toMatchObject({ price: "$49", unit_cost: "$29", competitor_median: expect.stringMatching(/^\$/) });
  });
});

describe("grounding", () => {
  it("numbers citations, drops unknown refs and traces figures", () => {
    const registry = new Registry();
    const out = run("search_transactions", { invoice: "INV-20418" }, registry);
    const [a, b] = out.rows.map((r: { ref: string }) => r.ref);
    const text = `INV-20418 was paid twice for $1,058.00 [${a}] [${b}], once via PayPal [${b}]. Also $12.34 [tx:madeup].`;
    const result = finalizeAnswer(text, registry);
    expect(result.answer).toBe("INV-20418 was paid twice for $1,058.00 [1] [2], once via PayPal [2]. Also $12.34.");
    expect(result.citations.map((c) => c.ref)).toEqual([a, b]);
    expect(result.figures).toEqual({ total: 2, traced: 1 });
  });

  it("reports each tool call as a step and grounds the final text", async () => {
    const steps: string[] = [];
    const fake: ModelRunner = async ({ tools }) => {
      const out = JSON.parse(await tools.find((x) => x.name === "vendor_profile")!.run({ merchant: "relay" }));
      return { text: `You have paid Relay Inbox ${out.total} across ${out.payments} charges [${out.recent[0].ref}].`, model: "fake" };
    };
    const result = await answerQuestion({ question: "How much for Relay?", books, today: "2026-10-18", model: fake, onStep: async (tool, summary) => steps.push(`${tool}: ${summary}`) });
    expect(steps).toEqual(['vendor_profile: pulled the payment history for "relay"']);
    expect(result.citations).toHaveLength(1);
    expect(result.figures).toEqual({ total: 1, traced: 1 });
  });
});

describe("stored questions", () => {
  it("fails clearly when no model is connected", async () => {
    vi.useFakeTimers();
    await t.mutation(api.ask.ask, { question: "Why did you hold the Summit payment?" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
    const [latest] = await t.query(api.ask.recent, {});
    expect(latest).toMatchObject({ status: "failed", answer: null });
    expect(latest.error).toMatch(/No model/);
  });

  it("rejects empty and overlong questions", async () => {
    await expect(t.mutation(api.ask.ask, { question: " " })).rejects.toThrow();
    await expect(t.mutation(api.ask.ask, { question: "x".repeat(301) })).rejects.toThrow();
  });
});
