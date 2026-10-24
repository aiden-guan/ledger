import { afterEach, expect, it } from "vitest";
import { getEnv } from "@/lib/env";

const original = process.env.LLM_MODEL;
afterEach(() => {
  process.env.LLM_MODEL = original;
});

it("picks up a changed variable without a restart", () => {
  process.env.LLM_MODEL = "model-a";
  expect(getEnv().LLM_MODEL).toBe("model-a");
  process.env.LLM_MODEL = "model-b";
  expect(getEnv().LLM_MODEL).toBe("model-b");
});
