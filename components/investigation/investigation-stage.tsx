"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Scramble } from "@/components/financial/scramble";
import { AsciiRiver } from "@/components/river/ascii-river";
import type { FindingListItem, RiverData } from "@/lib/db/queries/dashboard";
import { format } from "@/lib/finance/money";
import { INVESTIGATION_STEPS } from "@/lib/investigation/state-machine";
import type { RiverLeak } from "@/lib/river/model";
import type { LeakStream } from "@/lib/river/streams";
import { cn } from "@/lib/utils/cn";

interface EventDTO {
  seq: number;
  eventType: string;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface InvestigationDTO {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  totalRecoveryAnnualCents: number;
}

const POLL_MS = 1000;

function leakState(f: FindingListItem): RiverLeak["state"] {
  if (f.status === "DISMISSED" || f.status === "NEEDS_REVIEW" || f.recommendationStatus === "REJECTED") return "dismissed";
  if (f.recommendationStatus === "APPROVED" || f.recommendationStatus === "READY_FOR_EXECUTION") return "sealed";
  return "open";
}

function useInvestigation(activeInvestigationId: string | null) {
  const router = useRouter();
  const [investigationId, setInvestigationId] = useState<string | null>(activeInvestigationId);
  const [investigation, setInvestigation] = useState<InvestigationDTO | null>(null);
  const [events, setEvents] = useState<EventDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const lastSeq = useRef(0);
  const refreshed = useRef(false);

  const finished = investigation?.status === "COMPLETED" || investigation?.status === "FAILED";

  const poll = useCallback(async (id: string) => {
    const res = await fetch(`/api/investigations/${id}/events?after=${lastSeq.current}`, { cache: "no-store" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error?.message ?? "Could not load investigation progress");
    }
    const data: { investigation: InvestigationDTO; events: EventDTO[] } = await res.json();
    if (data.events.length) {
      lastSeq.current = data.events[data.events.length - 1].seq;
      setEvents((prev) => [...prev, ...data.events]);
    }
    setInvestigation(data.investigation);
    return data.investigation;
  }, []);

  useEffect(() => {
    if (!investigationId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      try {
        const inv = await poll(investigationId);
        if (cancelled) return;
        setError(null);
        if (inv.status === "COMPLETED" || inv.status === "FAILED") {
          if (!refreshed.current) {
            refreshed.current = true;
            router.refresh();
          }
          return;
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Connection problem; retrying");
      }
      if (!cancelled) timer = setTimeout(loop, POLL_MS);
    };
    loop();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [investigationId, poll, router]);

  useEffect(() => {
    if (!investigationId || finished) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [investigationId, finished]);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/investigations", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Could not start the investigation");
      lastSeq.current = 0;
      refreshed.current = false;
      setEvents([]);
      setInvestigation(null);
      setNow(Date.now());
      setInvestigationId(body.investigation.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the investigation");
    } finally {
      setStarting(false);
    }
  }

  function dismiss() {
    setInvestigationId(null);
    setInvestigation(null);
    setEvents([]);
  }

  const elapsed = investigation
    ? Math.max(0, ((investigation.completedAt ? new Date(investigation.completedAt).getTime() : now) - new Date(investigation.startedAt).getTime()) / 1000)
    : 0;

  return { investigationId, investigation, events, error, starting, finished, running: Boolean(investigationId) && !finished, elapsed, start, dismiss };
}

export function InvestigationStage({
  organizationName,
  activeInvestigationId,
  river,
  findings,
  hasInvestigation,
}: {
  organizationName: string;
  activeInvestigationId: string | null;
  river: RiverData;
  findings: FindingListItem[];
  hasInvestigation: boolean;
}) {
  const run = useInvestigation(activeInvestigationId);
  const [preview, setPreview] = useState(false);

  const serverLeaks: RiverLeak[] = useMemo(
    () =>
      findings.map((f) => ({
        key: f.fingerprint,
        findingId: f.id,
        type: f.findingType,
        stream: f.stream,
        title: shortTitle(f.findingType, f.title),
        annualCents: f.annualImpactCents,
        recoveryKind: f.recoveryKind === "one_time" ? "one_time" : "recurring",
        state: leakState(f),
      })),
    [findings],
  );

  // While a run is in progress the river shows what the agent has traced so far.
  const liveLeaks: RiverLeak[] = useMemo(() => {
    const suspects: RiverLeak[] = [];
    const found: RiverLeak[] = [];
    for (const e of run.events) {
      const m = e.metadata;
      if (Array.isArray(m.suspects)) {
        for (const s of m.suspects as { type: string; stream: LeakStream; label: string }[]) {
          suspects.push({ key: `suspect:${s.type}:${s.label}`, type: s.type, stream: s.stream, title: s.label, annualCents: 0, recoveryKind: "recurring", state: "suspect" });
        }
      }
      if (m.leak && typeof m.leak === "object") {
        const l = m.leak as { fingerprint: string; type: string; stream: LeakStream | null; title: string; annualCents: number; recoveryKind: string };
        const known = serverLeaks.find((s) => s.key === l.fingerprint);
        found.push({
          key: l.fingerprint,
          findingId: known?.findingId,
          type: l.type,
          stream: l.stream ?? "overhead",
          title: shortTitle(l.type, l.title),
          annualCents: l.annualCents,
          recoveryKind: l.recoveryKind === "one_time" ? "one_time" : "recurring",
          state: known?.state === "sealed" ? "sealed" : "open",
        });
      }
    }
    const foundTypes = new Set(found.map((f) => `${f.type}:${f.stream}`));
    return [...suspects.filter((s) => !foundTypes.has(`${s.type}:${s.stream}`)), ...found];
  }, [run.events, serverLeaks]);

  const liveKeys = liveLeaks.filter((l) => l.state !== "suspect").map((l) => l.key);
  const serverCaughtUp = liveKeys.length > 0 && liveKeys.every((k) => serverLeaks.some((s) => s.key === k && s.findingId));
  const showLive = run.running || (run.finished && run.investigation?.status === "COMPLETED" && liveLeaks.length > 0 && !serverCaughtUp);
  const leaks = showLive ? liveLeaks : serverLeaks;

  const open = serverLeaks.filter((l) => l.state === "open");
  const sealed = serverLeaks.filter((l) => l.state === "sealed");
  const leakingAnnual = open.filter((l) => l.recoveryKind === "recurring").reduce((s, l) => s + l.annualCents, 0);
  const paidTwice = open.filter((l) => l.recoveryKind === "one_time").reduce((s, l) => s + l.annualCents, 0);
  const baseProfit = river.streams.find((s) => s.key === "profit")?.annualCents ?? 0;
  const sealedGain = sealed.filter((l) => l.recoveryKind === "recurring").reduce((s, l) => s + l.annualCents, 0);
  const potentialGain = open.filter((l) => l.recoveryKind === "recurring").reduce((s, l) => s + l.annualCents, 0);
  const currentProfit = baseProfit + sealedGain;
  const potentialProfit = currentProfit + potentialGain;
  const upliftPct = currentProfit > 0 ? Math.round((potentialGain / currentProfit) * 100) : null;
  const state = run.running ? "running" : hasInvestigation && open.length > 0 ? "leaking" : hasInvestigation && sealed.length > 0 ? "sealed" : "intro";

  return (
    <div>
      <section className="relative grid gap-10 border-b pb-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-12">
        <div aria-hidden className="grid-paper pointer-events-none absolute inset-x-0 -top-14 bottom-0 -z-10" />
        <div className="min-w-0">
          <p className="label flex items-center gap-2">
            <span className={cn("inline-block size-1.5", run.running ? "cursor-blink bg-signal" : "bg-foreground")} />
            {run.running ? `tracing ${organizationName}` : organizationName}
          </p>

          {state === "leaking" ? (
            <h1 key="leaking" className="animate-fade-up mt-5 text-[38px] font-medium leading-[1.02] tracking-[-0.035em] sm:text-[60px]">
              Leaking <Scramble text={format(leakingAnnual)} className="tabular text-signal" /> a year
              {paidTwice > 0 && (
                <>
                  , and <Scramble text={format(paidTwice)} className="tabular text-signal" /> paid twice
                </>
              )}
              .
            </h1>
          ) : state === "sealed" ? (
            <h1 key="sealed" className="animate-fade-up mt-5 text-[38px] font-medium leading-[1.02] tracking-[-0.035em] sm:text-[60px]">
              Every leak sealed. <Scramble text={`+${format(sealedGain)}`} className="tabular text-positive" /> a year.
            </h1>
          ) : (
            <h1 key="intro" className="animate-fade-up mt-5 text-[38px] font-medium leading-[1.02] tracking-[-0.035em] sm:text-[60px]">
              {run.running ? (
                <>
                  Following every dollar<span className="cursor-blink text-signal">_</span>
                </>
              ) : (
                <>See where your money actually goes.</>
              )}
            </h1>
          )}

          {state === "leaking" && upliftPct !== null ? (
            <dl className="mt-8 grid max-w-lg gap-1.5 font-mono text-[13px]">
              <Row k="profit today" v={`${format(currentProfit, { compact: true })}/yr`} />
              <Row k="profit with every fix" v={`${format(potentialProfit, { compact: true })}/yr`} strong />
              <Row k="change" v={`+${upliftPct}%`} strong />
            </dl>
          ) : (
            <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-muted-foreground">
              LedgerLens draws your business as a river of money, traces every leak to its source, checks competitor prices with Apify, and prepares each fix for you to approve.
            </p>
          )}

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={run.start} disabled={run.starting || run.running}>
              {run.running ? "Investigating" : hasInvestigation ? "Investigate again" : "Run investigation"}
              <span aria-hidden className="text-[11px] opacity-60">↵</span>
            </Button>
            {open.length > 0 && !run.running && (
              <Button variant="outline" size="lg" onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
                <span aria-hidden className={cn("inline-block size-2 border border-current", preview && "bg-positive border-positive")} />
                Preview with fixes
              </Button>
            )}
            {run.error && <span className="font-mono text-[12px] text-signal">{run.error}</span>}
          </div>
        </div>

        <AgentLog run={run} onDismiss={run.dismiss} />
      </section>

      <section className="pt-10">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
          <p className="label">
            <span className="text-foreground">01</span> &nbsp;money river · trailing 90 days × 4
            {preview && <span className="text-positive"> · preview: every fix approved</span>}
          </p>
          <p className="label flex gap-4">
            <span><span className="text-signal">◆</span> leak</span>
            <span><span className="text-warning">?</span> tracing</span>
            <span><span className="text-positive">■</span> sealed</span>
          </p>
        </div>
        <AsciiRiver river={river} leaks={leaks} scanning={run.running} preview={preview && !run.running} />
      </section>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <span className="leader" />
      <dd className={cn("tabular", strong && "text-positive")}>
        <Scramble text={v} />
      </dd>
    </div>
  );
}

export function shortTitle(type: string, title: string) {
  if (type === "DUPLICATE_PAYMENT") return title.replace(/^Duplicate payment to /, "paid twice: ");
  if (type === "MARGIN_EROSION") return title.replace(/^Margin erosion on /, "margin slipping: ");
  if (type === "PRICING_OPPORTUNITY") return title.replace(/^Pricing opportunity on /, "underpriced: ");
  if (type === "SUBSCRIPTION_CREEP") return title.replace(/ subscription price increase$/, " price creep");
  return title;
}

const SPINNER = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

function AgentLog({ run, onDismiss }: { run: ReturnType<typeof useInvestigation>; onDismiss: () => void }) {
  const lines = useMemo(() => {
    const started = run.investigation ? new Date(run.investigation.startedAt).getTime() : 0;
    const out: { key: string; at: number; status: string; message: string; step: string }[] = [];
    for (const s of INVESTIGATION_STEPS) {
      const evs = run.events.filter((e) => e.metadata.step === s.key && e.metadata.status !== "info");
      const last = evs[evs.length - 1];
      if (!last) continue;
      out.push({ key: s.key, at: Math.max(0, new Date(last.createdAt).getTime() - started) / 1000, status: String(last.metadata.status), message: last.message, step: s.key });
    }
    return out;
  }, [run.events, run.investigation]);
  const tick = Math.floor(run.elapsed * 12);
  const completion = run.events.find((e) => e.eventType === "COMPLETED");

  return (
    <div className="frame self-start" aria-live="polite">
      <span className="frame-title">agent.log</span>
      <div className="flex items-center justify-between border-b px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
        <span>
          {run.investigationId ? (run.finished ? (run.investigation?.status === "FAILED" ? "stopped" : "complete") : "running") : "idle"}
        </span>
        <span className="tabular">
          {run.investigationId ? `${run.elapsed.toFixed(2)}s` : "ready"}
          {run.finished && (
            <button onClick={onDismiss} className="ml-3 hover:text-foreground" aria-label="Clear agent log">
              [clear]
            </button>
          )}
        </span>
      </div>
      <ol className="min-h-[244px] space-y-1 px-4 py-3 font-mono text-[12px] leading-[1.55]">
        {!run.investigationId &&
          [
            "read ledger, orders, supplier costs",
            "hunt duplicates, price creep, margin slips",
            "crawl competitor prices via apify",
            "measure every leak in exact cents",
            "prepare each fix, wait for approval",
          ].map((t, i) => (
            <li key={t} className="flex gap-3 text-muted-foreground">
              <span className="text-faint">{String(i + 1).padStart(2, "0")}</span>
              {t}
            </li>
          ))}
        {lines.slice(-8).map((l) => (
          <li key={l.key} className="animate-fade-up flex gap-3">
            <span className="tabular shrink-0 text-faint">{l.at.toFixed(2).padStart(5, "0")}</span>
            <span
              className={cn(
                "shrink-0",
                l.status === "completed" && "text-positive",
                l.status === "started" && "text-foreground",
                l.status === "warning" && "text-warning",
                l.status === "failed" && "text-signal",
              )}
            >
              {l.status === "completed" ? "[ ok ]" : l.status === "started" ? `[ ${SPINNER[tick % SPINNER.length]}  ]` : l.status === "warning" ? "[warn]" : "[fail]"}
            </span>
            <span className={cn("min-w-0", l.status === "completed" ? "text-muted-foreground" : "text-foreground")}>{l.message.toLowerCase()}</span>
          </li>
        ))}
        {run.finished && completion && (
          <li className="animate-fade-up flex gap-3 pt-1">
            <span className="tabular shrink-0 text-faint">{run.elapsed.toFixed(2).padStart(5, "0")}</span>
            <span className="shrink-0 text-foreground">[done]</span>
            <span className="text-foreground">{completion.message.replace(/^Investigation complete\.\s*/, "").toLowerCase()}</span>
          </li>
        )}
        {run.running && <li className="cursor-blink text-foreground">_</li>}
      </ol>
      {run.investigation?.status === "FAILED" && (
        <p className="border-t px-4 py-2.5 font-mono text-[12px] text-signal">{run.investigation.errorMessage ?? "The investigation failed."} Previous findings are unchanged.</p>
      )}
    </div>
  );
}
