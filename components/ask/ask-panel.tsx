"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils/cn";

export type Ask = FunctionReturnType<typeof api.ask.recent>[number];

const SUGGESTIONS = ["Why was a Summit payment held?", "What will cash look like in 90 days?", "Which product has the thinnest margin?"];

/** Questions answered by Claude from the books tools, with each claim cited to a record. */
export function AskPanel({ preview }: { preview?: Ask[] }) {
  const live = useQuery(api.ask.recent, preview ? "skip" : {});
  const asks = preview ?? live;
  const ask = useMutation(api.ask.ask);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = asks?.some((a) => a.status === "thinking") ?? false;

  const submit = async (q: string) => {
    const text = q.trim();
    if (!text) return;
    setError(null);
    try {
      await ask({ question: text });
      setQuestion("");
    } catch (e) {
      setError(e instanceof ConvexError ? String((e.data as { message?: string }).message) : "Could not send the question");
    }
  };

  return (
    <section className="mt-16">
      <p className="label border-b pb-3">
        <span className="text-foreground">05</span> &nbsp;ask your books
      </p>
      <form
        className="flex items-center gap-3 border-b py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(question);
        }}
      >
        <span aria-hidden className="font-mono text-[14px] text-signal">›</span>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={300}
          placeholder="ask anything about the money"
          aria-label="Ask a question about the books"
          className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint"
        />
        <button type="submit" disabled={!question.trim() || busy} className="font-mono text-[12px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40">
          ask ↵
        </button>
      </form>
      {asks?.length === 0 && (
        <div className="flex flex-wrap gap-2 py-3">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => void submit(s)} className="border border-border-strong px-2.5 py-1 font-mono text-[12px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground">
              {s}
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-3 font-mono text-[12px] text-negative">{error}</p>}
      {asks?.map((a) => <Answer key={a.id} ask={a} />)}
    </section>
  );
}

function Answer({ ask }: { ask: Ask }) {
  return (
    <article className="animate-fade-up border-b py-5">
      <p className="text-[15px] text-muted-foreground">{ask.question}</p>
      {ask.steps.length > 0 && (
        <ol className="mt-3 grid gap-0.5 font-mono text-[12px] text-faint">
          {ask.steps.map((s, i) => (
            <li key={i}>→ {s.summary}</li>
          ))}
        </ol>
      )}
      {ask.status === "thinking" && (
        <p className="mt-2 font-mono text-[12px] text-signal">
          reading the books<span className="cursor-blink">_</span>
        </p>
      )}
      {ask.status === "failed" && <p className="mt-3 font-mono text-[12px] text-negative">{ask.error}</p>}
      {ask.answer && (
        <>
          <p className="display mt-3 max-w-3xl text-[19px] leading-relaxed">
            <Cited text={ask.answer} citations={ask.citations} />
          </p>
          {ask.citations.length > 0 && (
            <ol className="mt-4 grid gap-1 font-mono text-[12px] text-muted-foreground">
              {ask.citations.map((c, i) => (
                <li key={c.ref} className="flex gap-2">
                  <span className="text-signal">[{i + 1}]</span>
                  {c.href ? (
                    <Link href={c.href} className="underline-offset-4 hover:text-foreground hover:underline">
                      {c.label}
                    </Link>
                  ) : (
                    <span>{c.label}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 font-mono text-[11px] text-faint">
            {ask.figures && ask.figures.total > 0 && (
              <span className={cn(ask.figures.traced < ask.figures.total && "text-warning")}>
                {ask.figures.traced === ask.figures.total
                  ? ask.figures.total === 1
                    ? "figure traced to a record"
                    : `all ${ask.figures.total} figures traced to records`
                  : `${ask.figures.traced} of ${ask.figures.total} figures traced to records`}
                {" · "}
              </span>
            )}
            {ask.model}
          </p>
        </>
      )}
    </article>
  );
}

/** Renders [n] markers as superscript citation numbers. */
function Cited({ text, citations }: { text: string; citations: Ask["citations"] }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = /^\[(\d+)\]$/.exec(part);
        if (!m) return <Fragment key={i}>{part}</Fragment>;
        const c = citations[Number(m[1]) - 1];
        return (
          <sup key={i} className="ml-0.5 font-mono text-[10px] text-signal" title={c?.label}>
            {m[1]}
          </sup>
        );
      })}
    </>
  );
}
