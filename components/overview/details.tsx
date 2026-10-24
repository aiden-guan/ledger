"use client";

import Link from "next/link";
import { useMemo } from "react";
import { INVESTIGATION_STEPS } from "@/lib/investigation/state-machine";
import { AUDIT_ACTION_LABELS } from "@/lib/ui/labels";
import { cn } from "@/lib/utils/cn";
import { STEP_NAMES, marketSource } from "./panels";
import type { Source } from "./source";

/*
 * For the technical reader: what the engine did on the run the field shows, where each input
 * came from, what was decided, and which backend functions the screen is subscribed to.
 */

const STACK = [
  ["field.get", "records, findings"],
  ["dashboard.get", "forecast"],
  ["investigations.timeline", "engine steps"],
  ["watch.feed", "screened payments"],
  ["ask.recent", "answers"],
] as const;

const MUTATIONS = ["investigations.start", "recommendations.approve", "watch.start", "watch.decide", "ask.ask"];

export function Details({ source, onClose }: { source: Source; onClose: () => void }) {
  const run = source.run && source.run.status !== "COMPLETED" ? source.run : (source.shown ?? source.run);
  const steps = useMemo(() => {
    if (!run) return [];
    return INVESTIGATION_STEPS.map((s) => {
      const evs = run.events.filter((e) => e.metadata.step === s.key);
      const start = evs.find((e) => e.eventType === "STEP_STARTED");
      const end = [...evs].reverse().find((e) => e.eventType !== "STEP_STARTED" && e.eventType !== "STEP_PROGRESS");
      return { key: s.key, ms: start && end ? end.at - start.at : null, status: end ? String(end.metadata.status) : start ? "running" : "pending", message: end?.message ?? start?.message ?? "" };
    });
  }, [run]);
  const field = source.field;
  const meta = run?.metadata ?? {};
  const intel = (meta.externalIntel ?? {}) as Record<string, unknown>;
  const ai = (meta.ai ?? {}) as Record<string, unknown>;

  return (
    <aside className="animate-fade-up fixed inset-y-0 right-0 top-14 z-20 w-full max-w-[400px] overflow-y-auto border-l bg-background px-6 pb-10 pt-6 sm:w-[400px]">
      <div className="flex items-baseline justify-between">
        <p className="label text-foreground">details</p>
        <button onClick={onClose} className="font-mono text-[11px] text-muted-foreground hover:text-foreground">
          close <kbd className="ml-1 border border-border-strong px-1">esc</kbd>
        </button>
      </div>

      <section className="mt-6">
        <p className="label mb-2">
          engine · {run ? (run.status === "COMPLETED" ? `${((run.completedAt! - run.startedAt) / 1000).toFixed(2)}s` : run.status.toLowerCase().replace(/_/g, " ")) : "no run yet"}
        </p>
        <ol className="grid gap-1 font-mono text-[11.5px]">
          {steps.map((s, i) => (
            <li key={s.key} className="flex items-baseline gap-2" title={s.message}>
              <span className="tabular text-faint">{String(i + 1).padStart(2, "0")}</span>
              <span className={cn(s.status === "pending" ? "text-faint" : s.status === "warning" || s.status === "failed" ? "text-found" : "text-foreground")}>{STEP_NAMES[s.key]}</span>
              <span className="leader" />
              <span className="tabular text-muted-foreground">{s.ms === null ? (s.status === "running" ? "…" : "") : `${(s.ms / 1000).toFixed(2)}s`}</span>
            </li>
          ))}
        </ol>
        <p className="mt-2 font-mono text-[11px] leading-relaxed text-faint">
          States advance one way: created → ingesting → analyzing → hypotheses → evidence → validating → impact → recommendations → completed.
        </p>
      </section>

      <section className="mt-7">
        <p className="label mb-2">inputs</p>
        <dl className="grid gap-1 font-mono text-[11.5px]">
          <Row k="money math" v="integer cents, deterministic rules" />
          <Row k="market data" v={field ? marketSource(field) : "none"} />
          {field?.investigation?.marketMode === "live" && typeof intel.runId === "string" && <Row k="apify run" v={intel.runId} />}
          <Row k="narrative" v={Number(ai.modelExplanations ?? 0) > 0 ? String(ai.model) : "rules-based"} />
          <Row k="the model" v="explains findings, never sets amounts" />
        </dl>
      </section>

      <section className="mt-7">
        <p className="label mb-2">decisions · audit trail</p>
        <ol className="grid gap-1 font-mono text-[11.5px]">
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
        <ul className="grid gap-1 font-mono text-[11.5px]">
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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="shrink-0 text-muted-foreground">{k}</dt>
      <span className="leader" />
      <dd className="truncate text-right">{v}</dd>
    </div>
  );
}
