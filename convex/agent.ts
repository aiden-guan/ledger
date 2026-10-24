"use node";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { v } from "convex/values";
import { answerQuestion } from "../lib/ask/agent";
import { getEnv } from "../lib/env";
import { logger, timedExternalCall } from "../lib/utils/logger";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/*
 * Answers one question with Claude and the read-only books tools. Each tool call is written back
 * as a step while the model works; the final text is grounded against what the tools returned.
 */

export const answer = internalAction({
  args: { askId: v.id("asks") },
  handler: async (ctx, { askId }) => {
    const ask = await ctx.runQuery(internal.ask.get, { id: askId });
    if (!ask || ask.status !== "thinking") return;
    const env = getEnv();
    const fail = (error: string) => ctx.runMutation(internal.ask.finish, { id: askId, status: "failed", answer: null, citations: [], figures: null, model: null, error });
    if (env.LLM_PROVIDER === "none" || !env.LLM_API_KEY) {
      await fail("No model is connected to this deployment yet, so questions can't be answered.");
      return;
    }
    try {
      const books = await ctx.runQuery(internal.ask.books, { organizationId: ask.organizationId });
      const client = new Anthropic({ apiKey: env.LLM_API_KEY, timeout: env.LLM_TIMEOUT_MS, maxRetries: 1 });
      const result = await answerQuestion({
        question: ask.question,
        books,
        today: new Date().toISOString().slice(0, 10),
        onStep: (tool, summary) => ctx.runMutation(internal.ask.step, { id: askId, tool, summary }),
        model: async ({ system, question, tools }) => {
          const final = await timedExternalCall("anthropic", "ask", () =>
            client.beta.messages
              .toolRunner({
                model: env.LLM_MODEL,
                max_tokens: 4000,
                max_iterations: 8,
                betas: ["server-side-fallback-2026-07-01"],
                fallbacks: "default",
                thinking: { type: "adaptive" },
                output_config: { effort: "low" },
                system,
                messages: [{ role: "user", content: question }],
                tools: tools.map((t) => betaZodTool({ name: t.name, description: t.description, inputSchema: t.inputSchema, run: t.run })),
              })
              .runUntilDone(),
          );
          if (final.stop_reason === "refusal") throw new Error("model declined");
          const text = final.content
            .flatMap((b) => (b.type === "text" ? [b.text] : []))
            .join("")
            .trim();
          if (!text) throw new Error(`no answer text (stop_reason ${final.stop_reason})`);
          return { text, model: final.model };
        },
      });
      await ctx.runMutation(internal.ask.finish, { id: askId, status: "done", ...result, error: null });
    } catch (error) {
      logger.error("ask_failed", { error: error instanceof Error ? error.message : String(error) });
      await fail("Couldn't answer that just now. Try again in a moment.");
    }
  },
});
