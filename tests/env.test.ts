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

it("reads variables that cannot be enumerated, as in Convex's default runtime", () => {
  const real = process.env;
  const hidden = new Proxy({ ...real, LLM_MODEL: "model-hidden" }, { ownKeys: () => [], getOwnPropertyDescriptor: () => undefined });
  process.env = hidden;
  try {
    expect(Object.keys(process.env)).toHaveLength(0);
    expect(getEnv().LLM_MODEL).toBe("model-hidden");
  } finally {
    process.env = real;
  }
});
