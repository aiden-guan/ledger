"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, usePreloadedQuery, useQuery, type Preloaded } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { merchantKey } from "@/lib/finance/merchants";
import type { FieldData, FieldRecord } from "@/lib/field/model";
import type { DashboardData } from "@/lib/views/dashboard";
import type { AuditEntryDTO, InvestigationDTO, InvestigationEventDTO } from "@/lib/views/findings";

/*
 * Where the overview gets its data. Live: Convex subscriptions and mutations, so every step the
 * engine commits and every payment the feed screens reaches the screen as it happens. Replay: the
 * same shapes from an in-memory engine run, for development previews without a deployment.
 */

export type Feed = NonNullable<FunctionReturnType<typeof api.watch.feed>>;
export type FeedItem = Feed["items"][number];
export type Ask = FunctionReturnType<typeof api.ask.recent>[number];

export interface RunEvent {
  seq: number;
  eventType: string;
  message: string;
  at: number;
  metadata: Record<string, unknown>;
}

export interface Run {
  id: string;
  status: string;
  startedAt: number;
  completedAt: number | null;
  error: string | null;
  metadata: Record<string, unknown>;
  events: RunEvent[];
}

export interface Source {
  mode: "live" | "replay";
  dashboard: DashboardData | null;
  field: FieldData | null;
  /** The investigation started from this screen, or one already running when it opened. */
  run: Run | null;
  /** The timeline of the investigation the field shows. */
  shown: Run | null;
  feed: Feed | null | undefined;
  asks: Ask[] | undefined;
  audit: AuditEntryDTO[] | undefined;
  investigate(): Promise<void>;
  approve(recommendationId: string): Promise<void>;
  reject(recommendationId: string): Promise<void>;
  startFeed(): Promise<void>;
  decide(screeningId: string, decision: "release" | "block"): Promise<void>;
  ask(question: string): Promise<void>;
  reset(): Promise<void>;
}

export function errorText(e: unknown, fallback = "Something went wrong") {
  return e instanceof ConvexError ? String((e.data as { message?: string }).message ?? fallback) : e instanceof Error && e.message ? e.message : fallback;
}

function toRun(t: { investigation: InvestigationDTO; events: InvestigationEventDTO[] } | null | undefined): Run | null {
  if (!t) return null;
  const i = t.investigation;
  return {
    id: i.id,
    status: i.status,
    startedAt: Date.parse(i.startedAt),
    completedAt: i.completedAt ? Date.parse(i.completedAt) : null,
    error: i.errorMessage,
    metadata: i.metadata,
    events: t.events.map((e) => ({ seq: e.seq, eventType: e.eventType, message: e.message, at: Date.parse(e.createdAt), metadata: e.metadata })),
  };
}

export function useLiveSource(preloaded: { dashboard: Preloaded<typeof api.dashboard.get>; field: Preloaded<typeof api.field.get> }): Source {
  const dashboard = usePreloadedQuery(preloaded.dashboard);
  const field = usePreloadedQuery(preloaded.field);
  const active = dashboard?.activeInvestigationId ?? null;
  const [runId, setRunId] = useState<string | null>(active);
  // Pick up a run started in another tab or by the daily schedule.
  useEffect(() => {
    if (active) setRunId(active);
  }, [active]);

  const timeline = useQuery(api.investigations.timeline, runId ? { id: runId } : "skip");
  const shownId = field?.investigation?.id ?? null;
  const shownTimeline = useQuery(api.investigations.timeline, shownId && shownId !== runId ? { id: shownId } : "skip");
  const feed = useQuery(api.watch.feed, {});
  const asks = useQuery(api.ask.recent, {});
  const audit = useQuery(api.findings.auditTrail, { limit: 12 });

  const start = useMutation(api.investigations.start);
  const approve = useMutation(api.recommendations.approve);
  const reject = useMutation(api.recommendations.reject);
  const startFeed = useMutation(api.watch.start);
  const decide = useMutation(api.watch.decide);
  const ask = useMutation(api.ask.ask);
  const reset = useAction(api.engine.resetDemo);

  const run = useMemo(() => toRun(timeline), [timeline]);
  const shown = useMemo(() => (shownId && shownId === runId ? run : toRun(shownTimeline)), [shownId, runId, run, shownTimeline]);

  return {
    mode: "live",
    dashboard,
    field,
    run,
    shown,
    feed,
    asks,
    audit,
    investigate: async () => {
      const r = await start({});
      setRunId(r.investigation.id);
    },
    approve: async (id) => void (await approve({ id })),
    reject: async (id) => void (await reject({ id, reason: null })),
    startFeed: async () => void (await startFeed({})),
    decide: async (id, decision) => void (await decide({ id, decision })),
    ask: async (question) => void (await ask({ question })),
    reset: async () => {
      setRunId(null);
      await reset({});
    },
  };
}

// ---- Replay ------------------------------------------------------------------

export interface ReplaySnapshot {
  dashboard: DashboardData;
  field: FieldData;
  /** The offline run's timeline, replayed with pacing when the investigation is started. */
  events: RunEvent[];
  runMetadata: Record<string, unknown>;
  /** The demo bank feed in arrival order, already screened. */
  feed: { gapMs: number; item: FeedItem }[];
  policy: Feed["policy"];
  answer: Ask;
  audit: AuditEntryDTO[];
}

const PACE: Record<string, number> = { ingest: 700, duplicates: 900, recurring: 900, margins: 900, hypotheses: 500, market: 2200, correlate: 700, validate: 900, impact: 500, recommend: 500 };

export function useReplaySource(snapshot: ReplaySnapshot): Source {
  const [field, setField] = useState(snapshot.field);
  const [run, setRun] = useState<Run | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [feedRunning, setFeedRunning] = useState(false);
  const [asks, setAsks] = useState<Ask[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => void timers.current.push(setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const feed: Feed = useMemo(
    () => ({
      running: feedRunning,
      cursor: items.length,
      total: snapshot.feed.length,
      policy: snapshot.policy,
      stoppedCents: items.filter((i) => i.status === "held" || i.status === "blocked").reduce((s, i) => s + i.amountCents, 0),
      waiting: items.filter((i) => i.status === "held" || i.status === "awaiting").length,
      items: [...items].reverse(),
    }),
    [items, feedRunning, snapshot],
  );

  // Like the backend, a payment that posts (or is released) becomes a record in the books.
  const postRecord = (item: FeedItem) =>
    setField((f) => ({
      ...f,
      records: [
        ...f.records,
        {
          id: `tx:feed-${item.id}`,
          kind: item.transactionType === "CREDIT" ? "in" : "out",
          at: Date.now(),
          cents: item.amountCents,
          label: item.merchantName,
          ref: item.invoiceReference,
          group: merchantKey(item.merchantName),
          live: true,
        } satisfies FieldRecord,
      ],
    }));
  const clearLive = () => setField((f) => ({ ...f, records: f.records.filter((r) => !r.live) }));

  const setRecommendation = (id: string, status: "READY_FOR_EXECUTION" | "REJECTED") =>
    setField((f) => ({
      ...f,
      leaks: f.leaks.map((l) => (l.recommendationId === id ? { ...l, recommendationStatus: status, status: status === "REJECTED" ? "DISMISSED" : "ACTIONED" } : l)),
    }));

  return {
    mode: "replay",
    dashboard: snapshot.dashboard,
    field,
    run,
    shown: run ?? {
      id: "offline",
      status: "COMPLETED",
      startedAt: snapshot.events[0]?.at ?? 0,
      completedAt: snapshot.events.at(-1)?.at ?? 0,
      error: null,
      metadata: snapshot.runMetadata,
      events: snapshot.events,
    },
    feed,
    asks,
    audit: snapshot.audit,
    investigate: async () => {
      if (run && run.status !== "COMPLETED") return;
      const startedAt = Date.now();
      setRun({ id: "replay", status: "INGESTING", startedAt, completedAt: null, error: null, metadata: {}, events: [] });
      let t = 300;
      snapshot.events.forEach((e) => {
        const step = String(e.metadata.step ?? "");
        t += e.eventType === "STEP_STARTED" ? (PACE[step] ?? 400) : e.metadata.leak ? 650 : 120;
        const at = t;
        later(at, () =>
          setRun(
            (r) =>
              r && {
                ...r,
                status: e.eventType === "STATE_CHANGED" ? String(e.metadata.state) : r.status,
                completedAt: e.eventType === "COMPLETED" ? startedAt + at : r.completedAt,
                metadata: e.eventType === "COMPLETED" ? snapshot.runMetadata : r.metadata,
                events: [...r.events, { ...e, at: startedAt + at }],
              },
          ),
        );
      });
    },
    approve: async (id) => setRecommendation(id, "READY_FOR_EXECUTION"),
    reject: async (id) => setRecommendation(id, "REJECTED"),
    startFeed: async () => {
      if (feedRunning) return;
      setItems([]);
      clearLive();
      setFeedRunning(true);
      let t = 0;
      snapshot.feed.forEach(({ gapMs, item }, i) => {
        t += gapMs;
        later(t, () => {
          setItems((xs) => [...xs, { ...item, at: Date.now() }]);
          if (item.status === "posted" || item.status === "flagged") postRecord(item);
          if (i === snapshot.feed.length - 1) setFeedRunning(false);
        });
      });
    },
    decide: async (id, decision) => {
      const item = items.find((i) => i.id === id);
      if (!item || (item.status !== "held" && item.status !== "awaiting")) return;
      if (decision === "release") postRecord(item);
      setItems((xs) => xs.map((i) => (i.id === id ? { ...i, status: decision === "release" ? "released" : "blocked" } : i)));
    },
    ask: async (question) => {
      const id = `ask-${Date.now()}`;
      const base = { ...snapshot.answer, id, question, at: Date.now() };
      setAsks((xs) => [{ ...base, status: "thinking" as const, steps: [], answer: null, citations: [], figures: null }, ...xs].slice(0, 4));
      snapshot.answer.steps.forEach((s, k) => later(700 * (k + 1), () => setAsks((xs) => xs.map((a) => (a.id === id ? { ...a, steps: [...a.steps, s] } : a)))));
      later(700 * (snapshot.answer.steps.length + 1), () => setAsks((xs) => xs.map((a) => (a.id === id ? base : a))));
    },
    reset: async () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      setField(snapshot.field);
      setRun(null);
      setItems([]);
      setFeedRunning(false);
      setAsks([]);
    },
  };
}
