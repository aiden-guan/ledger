import type { z } from "zod";
import { buildTools, finalizeAnswer, Registry, systemPrompt, type BooksContext, type Citation } from "./tools";

/*
 * One answer, independent of the model vendor: the books tools are wrapped so each call is
 * reported as a step, the model runs its tool loop, and the text is grounded before it is stored.
 */

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  run: (input: unknown) => Promise<string>;
}

export type ModelRunner = (args: { system: string; question: string; tools: AgentTool[] }) => Promise<{ text: string; model: string }>;

export interface AnswerResult {
  answer: string;
  citations: Citation[];
  figures: { total: number; traced: number };
  model: string;
}

export async function answerQuestion(args: {
  question: string;
  books: BooksContext;
  today: string;
  model: ModelRunner;
  onStep: (tool: string, summary: string) => Promise<unknown>;
}): Promise<AnswerResult> {
  const registry = new Registry();
  const tools: AgentTool[] = buildTools(args.books, registry).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    run: async (input) => {
      const parsed = t.inputSchema.parse(input) as never;
      const out = t.run(parsed);
      await args.onStep(t.name, t.summarize(parsed, out));
      return out;
    },
  }));
  const { text, model } = await args.model({ system: systemPrompt(args.books.organizationName, args.today), question: args.question, tools });
  return { ...finalizeAnswer(text, registry), model };
}
