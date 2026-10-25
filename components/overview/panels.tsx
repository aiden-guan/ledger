"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "@/lib/finance/money";
import { isFixed, type FieldData, type FieldLeak } from "@/lib/field/model";
import type { FixDraft } from "@/lib/investigation/drafts";
import { cn } from "@/lib/utils/cn";
import type { Ask, Feed, FeedItem } from "./source";
import { CHECKS, TOOLS, type TraceStep } from "./system";

/* What sits under the field in each beat. Each asks for one thing, at most. */

export const STEP_NAMES: Record<string, string> = {
  ingest: "read the books",
  duplicates: "duplicates",
  recurring: "recurring charges",
  margins: "margins",
  hypotheses: "plan",
  market: "competitor prices",
  correlate: "correlate",
  validate: "explain",
  impact: "measure",
  recommend: "draft fixes",
};

export function marketSource(field: FieldData) {
  const i = field.investigation;
  if (i?.marketMode !== "live") return "demo dataset";
  return i.sandbox ? "Apify, demo storefront" : "read live by Apify";
}

const Swatch = ({ className }: { className: string }) => <span aria-hidden className={cn("inline-block size-2.5", className)} />;

export function BooksPanel({ field }: { field: FieldData }) {
  const sources = [
    { name: "Sales", value: field.counts.sales, sub: "orders" },
    {
      name: "Bank feed",
      value: field.counts.transactions,
      sub: "transactions",
    },
    { name: "Supplier costs", value: field.counts.costs, sub: "unit costs" },
    {
      name: "Competitor prices",
      value: field.counts.prices,
      sub: marketSource(field),
    },
  ];
  return (
    <div className="grid gap-8 md:grid-cols-[1fr_auto]">
      <dl className="grid grid-cols-2 gap-x-10 gap-y-6 sm:grid-cols-4">
        {sources.map((s, i) => (
          <div key={s.name} className="animate-fade-up" style={{ animationDelay: `${i * 70}ms` }}>
            <dt className="text-[13.5px] font-medium">{s.name}</dt>
            <dd className="mt-1 font-mono text-[24px] leading-none tabular">{s.value.toLocaleString("en-US")}</dd>
            <dd className="mt-1.5 text-[12px] text-faint">{s.sub}</dd>
          </div>
        ))}
      </dl>
      <ul className="grid content-start gap-1.5 font-mono text-[11px] text-muted-foreground">
        <li className="flex items-center gap-2">
          <Swatch className="bg-[#86b4f6] dark:bg-[#2f5fc0]" /> sale
        </li>
        <li className="flex items-center gap-2">
          <Swatch className="bg-[#1f63e6] dark:bg-[#4f8dff]" /> deposit
        </li>
        <li className="flex items-center gap-2">
          <Swatch className="bg-[#13307a] dark:bg-[#9db8ff]" /> payment
        </li>
        <li className="flex items-center gap-2">
          <Swatch className="bg-[#ee7f2d] dark:bg-[#ff9440]" /> money found
        </li>
      </ul>
    </div>
  );
}

export const ms = (n: number) => (n < 1000 ? `${Math.max(0, Math.round(n))}ms` : `${(n / 1000).toFixed(1)}s`);

const STEP_FILL: Record<TraceStep["status"], string> = {
  pending: "border-border-strong",
  running: "cursor-blink border-foreground bg-foreground",
  done: "border-muted-foreground bg-muted-foreground",
  warning: "border-warning bg-warning",
  failed: "border-negative",
};

/** The engine's ten steps as ten squares: grey when done, orange when one turned up money. */
function Steps({ trace, elapsed, running, found }: { trace: TraceStep[]; elapsed: number | null; running: boolean; found: number }) {
  // Between two steps, the line stays on the one that just finished.
  const active = trace.find((t) => t.status === "running") ?? (running ? trace.findLast((t) => t.status !== "pending") : undefined);
  const n = trace.findIndex((t) => t === active) + 1;
  const ran = trace.some((t) => t.status !== "pending");
  return (
    <div className="min-w-0">
      <ol className="flex gap-1.5" aria-label="Engine steps">
        {trace.map((t) => (
          <li
            key={t.key}
            title={`${STEP_NAMES[t.key]} · ${t.who}${t.result ? ` · ${t.result}` : ""}`}
            className={cn("size-3.5 border transition-colors duration-300", t.found ? "border-found bg-found" : STEP_FILL[t.status])}
          />
        ))}
      </ol>
      <p className="mt-2.5 truncate font-mono text-[12px] text-muted-foreground">
        {active ? (
          <>
            <span className="tabular text-faint">{String(n).padStart(2, "0")}/10</span> <span className="text-foreground">{active.who}</span> · {STEP_NAMES[active.key]}
            {active.result && ` · ${active.result}`}
            {active.status === "running" && <span className="cursor-blink text-signal">_</span>}
          </>
        ) : ran && !running ? (
          <>
            10 steps · <span className="tabular">{elapsed !== null ? ms(elapsed) : ""}</span> · {found} {found === 1 ? "leak" : "leaks"} measured to the cent
          </>
        ) : (
          "Ten steps, from reading the books to drafting fixes."
        )}
      </p>
    </div>
  );
}

export function InvestigatePanel({
  trace,
  elapsed,
  running,
  leaks,
  total,
  busy,
  started,
  onInvestigate,
  onFocus,
}: {
  trace: TraceStep[];
  elapsed: number | null;
  running: boolean;
  leaks: FieldLeak[];
  total: number;
  busy: boolean;
  started: boolean;
  onInvestigate: () => void;
  onFocus: (fingerprint: string | null) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col items-start gap-5">
        <Steps trace={trace} elapsed={elapsed} running={running} found={total} />
        <Button size="lg" onClick={onInvestigate} disabled={busy || running}>
          {running ? "Investigating" : started ? "Investigate again" : "Investigate"}
          <span aria-hidden className="text-[11px] opacity-60">
            ↵
          </span>
        </Button>
      </div>
      <div className="min-w-0">
        {leaks.length > 0 ? (
          <ul>
            {leaks.map((l) => (
              <li
                key={l.fingerprint}
                className="animate-fade-up flex items-baseline gap-3 border-b py-1.5 last:border-b-0"
                onPointerEnter={() => onFocus(l.fingerprint)}
                onPointerLeave={() => onFocus(null)}
              >
                <span className="shrink-0 text-[14px] font-medium">{l.kind}</span>
                <span className="truncate text-[13px] text-faint">{l.subject}</span>
                <span className="leader" />
                <span className={cn("shrink-0 font-mono text-[13px] tabular", isFixed(l) ? "text-signal" : "text-found")}>
                  {format(l.annualCents)}
                  <span className="text-faint">{l.oneTime ? " once" : "/yr"}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-1.5 font-mono text-[12px] text-faint">{running ? "nothing measured yet" : "nothing found yet"}</p>
        )}
      </div>
    </div>
  );
}

function Draft({ fix }: { fix: FixDraft }) {
  if (fix.kind === "price") {
    return (
      <p className="font-mono text-[12px] text-muted-foreground">
        {fix.sku} · <span className="text-faint line-through">{format(fix.fromCents)}</span> → <span className="text-signal">{format(fix.toCents)}</span> · {fix.note.replace(/\.$/, "").toLowerCase()}
      </p>
    );
  }
  const lines = fix.body.split("\n").filter(Boolean);
  return (
    <div className="frame px-4 py-3">
      <span className="frame-title">email draft</span>
      <dl className="grid grid-cols-[4rem_1fr] gap-y-0.5 font-mono text-[11.5px]">
        <dt className="text-faint">to</dt>
        <dd className="truncate">{fix.to}</dd>
        <dt className="text-faint">subject</dt>
        <dd className="truncate">{fix.subject}</dd>
      </dl>
      <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{lines.slice(1, -2).join(" ")}</p>
    </div>
  );
}

export function DecidePanel({
  leaks,
  open,
  decision,
  index,
  busy,
  onApprove,
  onReject,
  onSkip,
}: {
  leaks: FieldLeak[];
  open: FieldLeak[];
  decision: FieldLeak | null;
  index: number;
  busy: string | null;
  onApprove: (l: FieldLeak) => void;
  onReject: (l: FieldLeak) => void;
  onSkip: () => void;
}) {
  if (!decision) {
    return (
      <div className="animate-fade-up max-w-xl">
        <p className="label">every fix decided</p>
        <ul className="mt-3">
          {leaks.map((l) => (
            <li key={l.fingerprint} className="flex items-baseline gap-3 border-b py-2 last:border-b-0">
              <span className="text-[14px] font-medium">{l.kind}</span>
              <span className="truncate text-[13px] text-faint">{l.subject}</span>
              <span className="leader" />
              <span className={cn("font-mono text-[12px]", isFixed(l) ? "text-signal" : "text-faint")}>{isFixed(l) ? "approved" : "not yet"}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const fixed = isFixed(decision);
  return (
    <div key={decision.fingerprint} className="animate-fade-up grid grid-cols-1 gap-x-12 gap-y-4 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 max-w-2xl">
        <p className="label">
          {fixed ? "approved" : `${index + 1} of ${open.length}`} · {decision.kind.toLowerCase()} · {decision.subject}
        </p>
        <h2 className="mt-1 text-[19px] font-medium tracking-[-0.01em]">{decision.recommendationTitle}</h2>
        <ul className="mt-1.5 grid gap-0.5 font-mono text-[11.5px] leading-[16px] text-muted-foreground">
          {decision.evidence.slice(0, 2).map((line) => (
            <li key={line} className="truncate">
              {line}
            </li>
          ))}
        </ul>
        {decision.fix && (
          <div className="mt-3">
            <Draft fix={decision.fix} />
          </div>
        )}
        {fixed ? (
          <p className="animate-stamp mt-4 inline-flex h-9 items-center gap-2 border border-signal px-3 font-mono text-[12px] text-signal">approved · ready for you to send</p>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button disabled={busy !== null} onClick={() => onApprove(decision)}>
              Approve <span className="text-[11px] opacity-60">↵</span>
            </Button>
            <Button variant="outline" disabled={busy !== null} onClick={onSkip}>
              {index < open.length - 1 ? "Next" : "Later"} <span className="text-[11px] opacity-60">→</span>
            </Button>
            <Button variant="ghost" disabled={busy !== null} onClick={() => onReject(decision)}>
              Reject
            </Button>
            <span className="ml-2 hidden font-mono text-[11px] text-faint md:inline">LedgerLens drafts it. You send it.</span>
          </div>
        )}
      </div>
      <p className="sm:text-right">
        <span className={cn("display block text-[38px] leading-none tabular transition-colors duration-500", fixed ? "text-signal" : "text-found")}>{format(decision.annualCents)}</span>
        <span className="mt-1.5 block font-mono text-[11px] text-faint">{fixed ? "recovered" : decision.oneTime ? "once" : "a year"}</span>
      </p>
    </div>
  );
}

const STATUS: Record<FeedItem["status"], { label: string; className: string }> = {
  posted: { label: "posted", className: "text-muted-foreground" },
  flagged: { label: "posted · flagged", className: "text-warning" },
  held: { label: "held", className: "text-found" },
  awaiting: { label: "needs you", className: "text-found" },
  released: { label: "released", className: "text-signal" },
  blocked: { label: "blocked", className: "text-faint" },
};

const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour12: false });

export function ScreenPanel({ feed, busy, onStart, onDecide }: { feed: Feed | null | undefined; busy: string | null; onStart: () => void; onDecide: (id: string, d: "release" | "block") => void }) {
  const items = feed?.items ?? [];
  const waiting = items.filter((i) => i.status === "held" || i.status === "awaiting");
  // One payment to decide at a time, the one waiting longest; the rest of the feed is a short log.
  const first = waiting.at(-1);
  const log = items.filter((i) => i !== first).slice(0, first ? 2 : 4);
  return (
    <div className="grid grid-cols-1 gap-x-12 gap-y-5 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 max-w-2xl">
        {items.length === 0 && <p className="font-mono text-[13px] text-muted-foreground">The next ten payments from the bank feed, each screened the moment it arrives.</p>}
        {first && (
          <div key={first.id} className="animate-fade-up mb-3">
            <div className="flex items-baseline gap-3">
              <span className="shrink-0 font-mono text-[11px] text-found">{STATUS[first.status].label}</span>
              <span className="truncate text-[17px] font-medium">{first.merchantName}</span>
              <span className="leader" />
              <span className="figure shrink-0 text-[17px] tabular">{format(first.amountCents)}</span>
            </div>
            <ul className="mt-1 grid gap-0.5 font-mono text-[11.5px] leading-[16px] text-muted-foreground">
              {first.signals.slice(0, 2).map((sig) => (
                <li key={sig.signal} className="truncate">
                  {sig.detail}
                </li>
              ))}
              {first.status === "awaiting" && feed && <li className="text-faint">above your {format(feed.policy.approvalLimitCents)} limit</li>}
            </ul>
            <div className="mt-2.5 flex items-center gap-2">
              <Button size="sm" disabled={busy !== null} onClick={() => onDecide(first.id, "block")}>
                Block <kbd className="text-[10px] opacity-60">b</kbd>
              </Button>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => onDecide(first.id, "release")}>
                Release <kbd className="text-[10px] opacity-60">r</kbd>
              </Button>
              {waiting.length > 1 && <span className="pl-2 font-mono text-[11px] text-faint">{waiting.length - 1} more waiting</span>}
            </div>
          </div>
        )}
        {log.length > 0 && (
          <ol className="grid grid-cols-1 font-mono text-[11.5px] leading-[20px]">
            {log.map((item) => (
              <li key={item.id} className={cn("animate-fade-up flex items-baseline gap-3", item.status === "blocked" && "opacity-60")}>
                <span className="hidden w-[4.2rem] shrink-0 text-faint sm:block">{clock(item.at)}</span>
                <span className={cn("min-w-0 truncate text-muted-foreground", item.status === "blocked" && "line-through")}>{item.merchantName}</span>
                <span className="leader" />
                <span className={cn("shrink-0", STATUS[item.status].className)}>{STATUS[item.status].label}</span>
                <span className={cn("w-[5.5rem] shrink-0 text-right tabular", item.transactionType === "CREDIT" && "text-signal")}>
                  {item.transactionType === "CREDIT" ? "+" : ""}
                  {format(item.amountCents)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <aside className="flex flex-col items-start gap-2.5">
        <Button size="lg" variant={items.length ? "outline" : "default"} disabled={busy !== null || Boolean(feed?.running) || !feed} onClick={onStart}>
          {feed?.running ? `Screening ${feed.cursor}/${feed.total}` : items.length ? "Replay the feed" : "Start the feed"}
          {!feed?.running && <span className="text-[11px] opacity-60">↵</span>}
        </Button>
        {feed && (
          <p className="font-mono text-[11px] text-faint" title={`Clear payments over ${format(feed.policy.approvalLimitCents)} also wait for you`}>
            {CHECKS.length} checks a payment · holds at {feed.policy.holdAt.toFixed(2)}
          </p>
        )}
      </aside>
    </div>
  );
}

const SUGGESTIONS = ["Why was a Summit payment held?", "What will cash look like in 90 days?", "Which product has the thinnest margin?"];

export function AskPanel({ asks, busy, onAsk }: { asks: Ask[] | undefined; busy: boolean; onAsk: (q: string) => void }) {
  const [question, setQuestion] = useState("");
  const latest = asks?.[0] ?? null;
  const thinking = latest?.status === "thinking";
  const submit = (q: string) => {
    const text = q.trim();
    if (!text || thinking) return;
    onAsk(text);
    setQuestion("");
  };
  const suggestions = SUGGESTIONS.filter((s) => s !== latest?.question);
  return (
    <div className="grid grid-cols-1 gap-x-12 gap-y-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="min-w-0">
        <form
          className="flex items-center gap-3 border-b pb-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit(question);
          }}
        >
          <span aria-hidden className="font-mono text-[15px] text-signal">
            ›
          </span>
          <input
            id="ask-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={300}
            placeholder="ask anything about the money"
            aria-label="Ask a question about the books"
            className="min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-faint"
          />
          <button type="submit" disabled={!question.trim() || thinking || busy} className="font-mono text-[12px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40">
            ask ↵
          </button>
        </form>
        {latest && (
          <div key={latest.id} className="animate-fade-up pt-3">
            <p className="text-[14px]">{latest.question}</p>
            <ol className="mt-1.5 grid grid-cols-1 gap-0.5 font-mono text-[11px] leading-[16px]">
              {latest.steps.map((s, i) => (
                <li key={i} className="animate-fade-up flex items-baseline gap-2" title={s.summary}>
                  <span className="shrink-0 text-signal">{s.tool}</span>
                  <span className="min-w-0 truncate text-faint">{s.summary}</span>
                </li>
              ))}
              {thinking && (
                <li className="text-signal">
                  {latest.steps.length ? "reading the results" : "choosing a tool"}
                  <span className="cursor-blink">_</span>
                </li>
              )}
            </ol>
          </div>
        )}
        {!thinking && (
          <div className="flex flex-wrap gap-2 pt-3">
            {suggestions.slice(0, latest ? 2 : 3).map((s) => (
              <button
                key={s}
                onClick={() => submit(s)}
                className="border border-border-strong px-2.5 py-1 text-left font-mono text-[12px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="min-w-0">
        {latest?.answer || latest?.status === "failed" ? (
          <Answer ask={latest} />
        ) : (
          !thinking && <p className="pt-1 font-mono text-[12px] leading-[18px] text-faint">Claude answers with {TOOLS.length} read-only tools. Sums are done in code, and every figure is traced to a record.</p>
        )}
      </div>
    </div>
  );
}

function Answer({ ask }: { ask: Ask }) {
  if (ask.status === "failed") return <p className="font-mono text-[12px] text-negative">{ask.error}</p>;
  if (!ask.answer) return null;
  return (
    <article key={ask.id} className="animate-fade-up">
      <p className="display text-[18px] leading-[1.55] tracking-[-0.015em]">
        {ask.answer.split(/(\[\d+\])/g).map((part, i) => {
          const m = /^\[(\d+)\]$/.exec(part);
          if (!m) return <Fragment key={i}>{part}</Fragment>;
          return (
            <sup key={i} className="ml-0.5 border border-signal px-[3px] font-mono text-[10px] text-signal">
              {m[1]}
            </sup>
          );
        })}
      </p>
      {ask.citations.length > 0 && (
        <ol className="mt-2.5 grid grid-cols-1 gap-0.5 font-mono text-[11.5px] text-muted-foreground">
          {ask.citations.map((c, i) => (
            <li key={c.ref} className="flex gap-2">
              <span className="text-signal">{i + 1}</span>
              {c.href ? (
                <Link href={c.href} className="truncate underline-offset-4 hover:text-foreground hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span className="truncate">{c.label}</span>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="mt-1.5 font-mono text-[11px] text-faint">
        {ask.figures && ask.figures.total > 0 && (
          <span className={cn(ask.figures.traced < ask.figures.total && "text-warning")}>
            {ask.figures.traced === ask.figures.total
              ? ask.figures.total === 1
                ? "figure traced to a record"
                : `all ${ask.figures.total} figures traced to records`
              : `${ask.figures.traced} of ${ask.figures.total} figures traced to records`}
            {ask.model && " · "}
          </span>
        )}
        {ask.model}
        {ask.steps.length > 0 && ` · ${ask.steps.length} ${ask.steps.length === 1 ? "tool call" : "tool calls"}`}
      </p>
    </article>
  );
}

export function EndPanel({
  found,
  approved,
  stopped,
  onRestart,
}: {
  found: { cents: number; n: number };
  approved: { cents: number; n: number };
  stopped: { cents: number; n: number };
  onRestart: () => void;
}) {
  const figures = [
    { name: "Found", cents: found.cents, sub: `${found.n} ${found.n === 1 ? "leak" : "leaks"}`, tone: "text-found" },
    { name: "Approved", cents: approved.cents, sub: `${approved.n} ${approved.n === 1 ? "fix" : "fixes"}, drafted for you`, tone: "text-signal" },
    { name: "Stopped", cents: stopped.cents, sub: `${stopped.n} ${stopped.n === 1 ? "payment" : "payments"}, before posting`, tone: "text-found" },
  ];
  return (
    <div className="flex flex-wrap items-end justify-between gap-8">
      <dl className="grid grid-cols-2 gap-x-12 gap-y-6 sm:grid-cols-3">
        {figures.map((f, i) => (
          <div key={f.name} className="animate-fade-up" style={{ animationDelay: `${i * 90}ms` }}>
            <dt className="text-[13.5px] font-medium">{f.name}</dt>
            <dd className={cn("mt-1 font-mono text-[24px] leading-none tabular", f.cents ? f.tone : "text-faint")}>{format(f.cents)}</dd>
            <dd className="mt-1.5 text-[12px] text-faint">{f.sub}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="lg" onClick={onRestart}>
          From the top <span className="text-[11px] opacity-60">↵</span>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a href="https://github.com/aiden-guan/ledger">
            Source <ArrowRight />
          </a>
        </Button>
        <Button asChild size="lg" variant="ghost">
          <Link href="/activity">Audit trail</Link>
        </Button>
      </div>
    </div>
  );
}
