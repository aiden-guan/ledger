"use client";

import Link from "next/link";
import { ForecastChart } from "@/components/dashboard/forecast-chart";
import { isCredible, isFixed, type FieldLeak } from "@/lib/field/model";
import { AUDIT_ACTION_LABELS } from "@/lib/ui/labels";
import { cn } from "@/lib/utils/cn";
import { withDecisions } from "./forecast";
import { STEP_NAMES, marketSource, ms } from "./panels";
import type { Source } from "./source";
import type { TraceStep } from "./system";

/*
 * For the technical reader: what the engine did on the run the wall shows, step by step, the
 * arithmetic behind the fix in focus, where each input came from, what was decided, and which
 * backend functions the screen is subscribed to.
 */

const STACK = [
  ["field.get", "records, findings"],
  ["dashboard.get", "forecast"],
  ["investigations.timeline", "engine steps"],
  ["watch.feed", "screened payments"],
  ["ask.recent", "answers"],
] as const;

const MUTATIONS = ["investigations.start", "recommendations.approve", "watch.start", "watch.decide", "ask.ask"];

const STEP_NODE: Record<TraceStep["status"], string> = {
  pending: "border-border-strong",
  running: "cursor-blink border-foreground bg-foreground",
  done: "border-muted-foreground bg-muted-foreground",
  warning: "border-warning bg-warning",
  failed: "border-negative",
};

export function Details({ source, trace, elapsed, focus, onClose }: { source: Source; trace: TraceStep[]; elapsed: number | null; focus: FieldLeak | null; onClose: () => void }) {
  const field = source.field;
  const run = source.run && source.run.status !== "COMPLETED" ? source.run : (source.shown ?? source.run);
  const meta = run?.metadata ?? {};
  const intel = (meta.externalIntel ?? {}) as Record<string, unknown>;
  const ai = (meta.ai ?? {}) as Record<string, unknown>;
  const forecast = source.dashboard?.forecast ? withDecisions(source.dashboard.forecast, (field?.leaks ?? []).filter(isCredible)) : null;

  return (
    <aside className="animate-fade-up fixed inset-y-0 right-0 top-14 z-20 w-full max-w-[420px] overflow-y-auto border-l bg-background px-6 pb-10 pt-6 sm:w-[420px]">
      <div className="flex items-baseline justify-between">
        <p className="label text-foreground">details</p>
        <button onClick={onClose} className="font-mono text-[11px] text-muted-foreground hover:text-foreground">
          close <kbd className="ml-1 border border-border-strong px-1">esc</kbd>
        </button>
      </div>

      <section className="mt-6">
        <div className="mb-2 flex items-baseline gap-3 font-mono text-[11px] text-faint">
          <span className="label">engine trace</span>
          <span className="leader" />
          <span className="tabular">{run ? (elapsed !== null ? ms(elapsed) : run.status.toLowerCase().replace(/_/g, " ")) : "no run yet"}</span>
        </div>
        <ol className="grid grid-cols-1 gap-1.5 font-mono text-[11px] leading-[15px]">
          {trace.map((t, i) => (
            <li key={t.key} title={t.message || undefined} className={cn(t.status === "pending" ? "text-faint" : t.status === "running" ? "text-foreground" : "text-muted-foreground")}>
              <div className="flex items-baseline gap-2">
                <span className="tabular text-faint">{String(i + 1).padStart(2, "0")}</span>
                <span aria-hidden className={cn("size-[7px] shrink-0 self-center border", STEP_NODE[t.status])} />
                <span className="w-[3.4rem] shrink-0">{t.who}</span>
                <span className="min-w-0 truncate text-foreground">{STEP_NAMES[t.key]}</span>
                <span className="leader" />
                <span className={cn("max-w-[9.5rem] shrink-0 truncate text-right", t.found && "text-found", t.status === "failed" && "text-negative")}>{t.result}</span>
                <span className="w-[2.6rem] shrink-0 text-right tabular text-faint">{t.ms !== null && (t.status === "done" || t.status === "warning") ? ms(t.ms) : ""}</span>
              </div>
              <p className="truncate pl-[5.6rem] text-faint">{t.check}</p>
            </li>
          ))}
        </ol>
        <p className="mt-2 font-mono text-[11px] leading-relaxed text-faint">
          States advance one way: created → ingesting → analyzing → hypotheses → evidence → validating → impact → recommendations → completed.
        </p>
      </section>

      {focus && <Proof leak={focus} />}

      {forecast && (
        <section className="mt-7">
          <p className="label mb-3">cash, next 90 days</p>
          <ForecastChart forecast={forecast} />
        </section>
      )}

      <section className="mt-7">
        <p className="label mb-2">inputs</p>
        <dl className="grid grid-cols-1 gap-1 font-mono text-[11.5px]">
          <Row k="money math" v="integer cents, deterministic rules" />
          <Row k="market data" v={field ? marketSource(field) : "none"} />
          {field?.investigation?.marketMode === "live" && typeof intel.runId === "string" && <Row k="apify run" v={intel.runId} />}
          <Row k="narrative" v={Number(ai.modelExplanations ?? 0) > 0 ? String(ai.model) : "rules-based"} />
          <Row k="the model" v="explains findings, never sets amounts" />
        </dl>
      </section>

      <section className="mt-7">
        <p className="label mb-2">decisions · audit trail</p>
        <ol className="grid grid-cols-1 gap-1 font-mono text-[11.5px]">
          {(source.audit ?? []).slice(0, 10).map((a) => (
            <li key={a.id} className="flex items-baseline gap-2">
              <span className="tabular shrink-0 text-faint">{new Date(a.createdAt).toLocaleTimeString("en-US", { hour12: false })}</span>
              <span className={cn("shrink-0", a.actorType === "USER" ? "text-signal" : "text-faint")}>{a.actorType.toLowerCase()}</span>
              <span className="truncate text-muted-foreground">{AUDIT_ACTION_LABELS[a.action] ?? a.action}</span>
            </li>
          ))}
          {source.audit?.length === 0 && <li className="text-faint">nothing yet</li>}
        </ol>
        <Link href="/activity" className="mt-2 inline-block font-mono text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          full audit trail
        </Link>
      </section>

      <section className="mt-7">
        <p className="label mb-2">{source.mode === "live" ? "live subscriptions · convex" : "replay · the same queries, served in memory"}</p>
        <ul className="grid grid-cols-1 gap-1 font-mono text-[11.5px]">
          {STACK.map(([fn, what]) => (
            <li key={fn} className="flex items-baseline gap-2">
              <span>{fn}</span>
              <span className="leader" />
              <span className="truncate text-faint">{what}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 font-mono text-[11px] leading-relaxed text-faint">Mutations: {MUTATIONS.join(", ")}. No polling; every change is pushed.</p>
      </section>
    </aside>
  );
}

// A long derivation keeps the lines that carry it; the rest stay in the finding's evidence.
const MINOR_ROWS = new Set(["Cost absorbed per month", "Gap to median", "Monthly upside", "Annual upside"]);

/** The arithmetic behind a fix's amount, as the engine computed it. Hover a line for its formula. */
function Proof({ leak }: { leak: FieldLeak }) {
  const rows = leak.calculations.length > 7 ? leak.calculations.filter((c) => !MINOR_ROWS.has(c.label)) : leak.calculations;
  if (!rows.length) return null;
  return (
    <section className="mt-7">
      <div className="mb-2 flex items-baseline gap-3 font-mono text-[11px] text-faint">
        <span className="label">the math · {leak.kind.toLowerCase()}</span>
        <span className="leader" />
        <span>rules · cents</span>
      </div>
      <dl className="grid grid-cols-1 gap-[3px] font-mono text-[11.5px] leading-[16px]">
        {rows.map((c, i) => {
          const last = i === rows.length - 1;
          return (
            <div key={c.label} title={`${c.label}: ${c.formula}`} className="flex items-baseline gap-2">
              <dt className={cn("min-w-0 truncate", last ? "text-foreground" : "text-muted-foreground")}>{c.label}</dt>
              <span className="leader" />
              <dd className={cn("shrink-0 tabular", last ? (isFixed(leak) ? "text-signal" : "text-found") : "text-foreground")}>{c.result}</dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-1.5 font-mono text-[11px] leading-[15px] text-faint">= {rows.at(-1)!.formula}</p>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="shrink-0 text-muted-foreground">{k}</dt>
      <span className="leader" />
      <dd className="truncate text-right">{v}</dd>
    </div>
  );
}
