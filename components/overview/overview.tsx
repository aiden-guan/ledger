"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Preloaded } from "convex/react";
import type { api } from "@/convex/_generated/api";
import { Mark } from "@/components/brand/mark";
import { merchantKey } from "@/lib/finance/merchants";
import { format } from "@/lib/finance/money";
import { isCredible, isFixed, isOpen, type FieldData, type FieldLeak } from "@/lib/field/model";
import { INVESTIGATION_STEPS } from "@/lib/investigation/state-machine";
import { cn } from "@/lib/utils/cn";
import { Count } from "./count";
import { Details } from "./details";
import { FieldCanvas, TONE, type Leader, type Scene, type Tone } from "./field-canvas";
import { focusDomains, layoutField, lineY, place, recordAt, rowOf, yOf, type Geometry } from "./geometry";
import { AskPanel, BooksPanel, DecidePanel, EndPanel, InvestigatePanel, ScreenPanel } from "./panels";
import { errorText, useLiveSource, useReplaySource, type ReplaySnapshot, type Run, type Source } from "./source";

/*
 * The overview is the product and the demo at once: one screen, five beats. The field shows every
 * record in the books; each beat asks for one thing (investigate, approve, screen, ask) and the
 * field answers by lighting up the records involved.
 */

export function LiveOverview(props: { dashboard: Preloaded<typeof api.dashboard.get>; field: Preloaded<typeof api.field.get> }) {
  return <Overview source={useLiveSource(props)} />;
}

export function ReplayOverview({ snapshot }: { snapshot: ReplaySnapshot }) {
  return <Overview source={useReplaySource(snapshot)} />;
}

export const CHAPTERS = [
  { key: "books", name: "Books" },
  { key: "investigate", name: "Investigate" },
  { key: "decide", name: "Decide" },
  { key: "screen", name: "Screen" },
  { key: "ask", name: "Ask" },
] as const;
export type Chapter = (typeof CHAPTERS)[number]["key"] | "end";

const DAY = 86_400_000;
const TERMINAL = new Set(["COMPLETED", "FAILED"]);
const SCAN: Record<string, "in" | "out" | "all"> = {
  ingest: "all",
  duplicates: "out",
  recurring: "out",
  margins: "in",
  correlate: "in",
};

export interface RunView {
  running: boolean;
  failed: boolean;
  step: (typeof INVESTIGATION_STEPS)[number]["key"] | null;
  message: string | null;
  done: Set<string>;
  found: Set<string>;
  suspects: { type: string; label: string }[];
  elapsed: number;
}

function readRun(run: Run | null, now: number): RunView | null {
  if (!run) return null;
  const done = new Set<string>();
  const found = new Set<string>();
  const suspects: RunView["suspects"] = [];
  let step: RunView["step"] = null;
  let message: string | null = null;
  for (const e of run.events) {
    const m = e.metadata;
    const key = m.step as RunView["step"];
    if (e.eventType === "STEP_STARTED" && key) step = key;
    if ((e.eventType === "STEP_COMPLETED" || e.eventType === "STEP_WARNING" || e.eventType === "STEP_FAILED") && key) done.add(key);
    if (Array.isArray(m.suspects)) suspects.push(...(m.suspects as RunView["suspects"]));
    if (m.leak && typeof m.leak === "object") found.add(String((m.leak as { fingerprint: string }).fingerprint));
    if (e.eventType !== "STATE_CHANGED") message = e.message;
  }
  const running = !TERMINAL.has(run.status);
  return {
    running,
    failed: run.status === "FAILED",
    step: running ? step : null,
    message: run.status === "FAILED" ? run.error : message,
    done,
    found,
    suspects,
    elapsed: ((run.completedAt ?? now) - run.startedAt) / 1000,
  };
}

/** Records a suspect from the engine points at: a vendor's bank lines, or a product's recent sales. */
function suspectRecords(field: FieldData, s: { type: string; label: string }) {
  if (s.type === "DUPLICATE_PAYMENT" || s.type === "SUBSCRIPTION_CREEP") {
    const key = merchantKey(s.label);
    return field.records.filter((r) => r.kind !== "sale" && r.group === key).map((r) => r.id);
  }
  return field.records.filter((r) => r.kind === "sale" && r.group === s.label && r.at > field.asOf - 90 * DAY).map((r) => r.id);
}

function useDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setDark(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return dark;
}

function useReduced() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  return reduced;
}

function useNow(active: boolean, ms = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return now;
}

// Labels are kept apart by their measured widths, in the page's own fonts.
let ruler: CanvasRenderingContext2D | null = null;
let families = { sans: "sans-serif", mono: "monospace" };
function textWidth(text: string, px: number, font: "sans" | "medium" | "mono") {
  if (!ruler) {
    ruler = document.createElement("canvas").getContext("2d");
    const s = getComputedStyle(document.body);
    families = { sans: s.getPropertyValue("--font-geist-sans").trim() || "sans-serif", mono: s.getPropertyValue("--font-geist-mono").trim() || "monospace" };
  }
  if (!ruler) return text.length * px * 0.62;
  ruler.font = `${font === "medium" ? 500 : 400} ${px}px ${font === "mono" ? families.mono : families.sans}`;
  return ruler.measureText(text).width;
}
/** Width of a stacked label: a title, then an optional subtitle and a figure. */
const labelWidth = (title: string, sub?: string, value?: string) =>
  Math.ceil(Math.max(textWidth(title, 13.5, "medium"), sub ? textWidth(sub, 12, "sans") : 0, value ? textWidth(value, 12, "mono") : 0)) + 8;

/** Long bank descriptors are cut to keep labels short. */
const clip = (s: string, n = 26) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

const TOUR_QUESTION = "Why was a Summit payment held?";

const SEAM_STATUS: Record<string, string> = { held: "held", awaiting: "needs you", blocked: "blocked", released: "released", posted: "posted", flagged: "flagged" };

interface Label {
  key: string;
  x: number;
  y: number;
  w: number;
  above: boolean;
  kind: "leak" | "pin" | "note";
  leak?: FieldLeak;
  title: string;
  sub?: string;
  value?: string;
  tone?: "found" | "signal" | "faint";
  /** Where the leader starts, and that point now, for placing the label. */
  from: import("./field-canvas").Anchor;
  at: { x: number; y: number };
}

export function Overview({ source }: { source: Source }) {
  const { field, dashboard, feed, asks } = source;
  const [chapter, setChapter] = useState<Chapter>("books");
  const [details, setDetails] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [hot, setHot] = useState<{ id: string; x: number; y: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [revealN, setRevealN] = useState(0);
  const [cursor, setCursor] = useState(0);
  const dark = useDark();
  const reduced = useReduced();

  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const [screenH, setScreenH] = useState(0);
  useEffect(() => {
    const on = () => setScreenH(window.innerHeight);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const narrow = width > 0 && width < 640;
  // The field takes what the header, statement, panel and key hints leave of the screen.
  const g: Geometry | null = useMemo(() => (field && width ? layoutField(field, width, narrow, narrow ? 0 : Math.max(380, screenH - 440)) : null), [field, width, narrow, screenH]);

  const run = useMemo(() => readRun(source.run, Date.now()), [source.run]);
  const running = Boolean(run?.running);
  const now = useNow(running || Boolean(feed?.running));
  const runView = useMemo(
    () =>
      run
        ? {
            ...run,
            elapsed: running ? (now - source.run!.startedAt) / 1000 : run.elapsed,
          }
        : null,
    [run, running, now, source.run],
  );

  const leaks = useMemo(() => (field?.leaks ?? []).filter(isCredible), [field]);
  const open = useMemo(() => leaks.filter(isOpen), [leaks]);

  // Which findings the field shows: none over the bare books (or while screening and asking,
  // where the field is about other records); while an investigation runs, the ones it has
  // measured so far; afterwards all of them, revealed one by one on arrival.
  const shown: FieldLeak[] = useMemo(() => {
    if (chapter === "books" || chapter === "screen" || chapter === "ask") return [];
    if (chapter === "investigate") {
      if (running) return leaks.filter((l) => run!.found.has(l.fingerprint));
      return leaks.slice(0, revealN);
    }
    return leaks;
  }, [chapter, running, run, leaks, revealN]);

  // Entering the beat reveals the latest results one finding at a time; a run finishing here
  // leaves everything it found on screen.
  useEffect(() => {
    if (chapter !== "investigate") return;
    setRevealN(0);
    let n = 0;
    const id = setInterval(
      () => {
        n += 1;
        setRevealN((v) => Math.max(v, n));
        if (n >= 6) clearInterval(id);
      },
      reduced ? 1 : 650,
    );
    return () => clearInterval(id);
  }, [chapter, reduced]);
  const hadRun = Boolean(source.run);
  useEffect(() => {
    if (!running && hadRun) setRevealN(99);
  }, [running, hadRun]);

  // The decision in front of the person: the open fix at the cursor. A fix just approved stays a
  // moment so its records can turn back to blue.
  const [held, setHeld] = useState<string | null>(null);
  const heldLeak = held ? (leaks.find((l) => l.fingerprint === held) ?? null) : null;
  const decision = chapter === "decide" ? (heldLeak ?? open[Math.min(cursor, open.length - 1)] ?? null) : null;
  useEffect(() => {
    if (cursor > 0 && cursor >= open.length) setCursor(Math.max(0, open.length - 1));
  }, [cursor, open.length]);

  const latestAsk = asks?.[0] ?? null;
  const cited = useMemo(() => {
    if (chapter !== "ask" || !latestAsk || !field) return [];
    return latestAsk.citations.map((c, i) => {
      const [kind, id] = c.ref.split(":");
      if (kind === "tx") return { n: i + 1, records: [`tx:${id}`], label: c.label };
      if (kind === "finding") {
        const leak = field.leaks.find((l) => l.findingId === id);
        return {
          n: i + 1,
          records: leak ? ([leak.anchor ?? leak.records[0]].filter(Boolean) as string[]) : [],
          label: c.label,
          leak,
        };
      }
      return {
        n: i + 1,
        records: [] as string[],
        label: c.label,
        screening: id,
      };
    });
  }, [chapter, latestAsk, field]);

  // Payments the screen stopped sit at the seam past today, at their amount: every one while
  // screening, and the ones an answer cites.
  const seamItems = useMemo(() => {
    const items = feed?.items ?? [];
    if (chapter === "screen") return items.filter((i) => i.status === "held" || i.status === "awaiting" || i.status === "blocked").reverse();
    if (chapter === "ask") return items.filter((i) => cited.some((c) => c.screening === i.id));
    return [];
  }, [chapter, feed, cited]);

  // ---- Field tones ------------------------------------------------------------
  const focusLeak = decision ?? (focus ? (leaks.find((l) => l.fingerprint === focus) ?? null) : null);
  const domains = useMemo(() => (g && field ? focusDomains(g, chapter === "decide" || chapter === "investigate" ? focusLeak : null, field) : null), [g, field, focusLeak, chapter]);
  const pos = useMemo(() => (g && domains ? place(g, domains) : null), [g, domains]);
  const seam = useMemo(() => {
    if (!g || !domains) return [];
    const used = new Set<number>();
    return seamItems.map((item) => {
      let y = lineY(g, false, domains.out, item.amountCents);
      while (used.has(Math.round(y))) y += g.cell;
      used.add(Math.round(y));
      return { item, x: g.seamX + g.size / 2, y };
    });
  }, [g, domains, seamItems]);

  const { tones, delays } = useMemo(() => {
    const tones = new Map<string, Tone>();
    const delays = new Map<string, number>();
    if (!field || !g || !pos) return { tones, delays };
    if (running && chapter === "investigate") {
      for (const s of run!.suspects) {
        for (const id of suspectRecords(field, s)) {
          tones.set(id, TONE.suspect);
          delays.set(id, (pos.get(id)?.col ?? 0) * 3);
        }
      }
    }
    for (const leak of shown) {
      const a = leak.anchor ? pos.get(leak.anchor) : undefined;
      const ranked = leak.records
        .map((id) => ({
          id,
          d: a ? Math.abs((pos.get(id)?.col ?? 0) - a.col) : 0,
        }))
        .sort((x, y) => x.d - y.d);
      const stepMs = Math.min(40, 700 / Math.max(1, ranked.length));
      ranked.forEach(({ id }, k) => {
        tones.set(id, isFixed(leak) ? TONE.fixed : TONE.found);
        delays.set(id, k * stepMs);
      });
    }
    if (focusLeak && chapter !== "ask") {
      const keep = new Set(focusLeak.records);
      for (const r of field.records) if (!keep.has(r.id)) tones.set(r.id, TONE.dim);
      for (const id of keep) tones.set(id, isFixed(focusLeak) ? TONE.fixed : TONE.found);
    }
    if (cited.length) {
      const keep = new Set(cited.flatMap((c) => c.records));
      for (const r of field.records) tones.set(r.id, keep.has(r.id) ? TONE.cited : TONE.dim);
    }
    return { tones, delays };
  }, [field, g, pos, shown, running, chapter, run, focusLeak, cited]);

  // ---- Labels on the field ------------------------------------------------------
  const labels: Label[] = useMemo(() => {
    if (!g || !field || !pos || !domains) return [];
    const out: Label[] = [];
    const center = (id: string | null | undefined) => {
      const p = id ? pos.get(id) : undefined;
      return p ? { x: p.x + g.size / 2, y: p.y + g.size / 2 } : null;
    };
    for (const leak of shown) {
      // A phone has room for one label: the finding in focus.
      if (focusLeak ? focusLeak.fingerprint !== leak.fingerprint : narrow) continue;
      const at = center(leak.anchor);
      if (!at || !leak.anchor) continue;
      const value = isFixed(leak) ? "approved" : `${format(leak.annualCents)}${leak.oneTime ? " once" : " a year"}`;
      out.push({
        key: leak.fingerprint,
        x: at.x - 6,
        y: 0,
        w: labelWidth(leak.kind, leak.subject, value),
        above: at.y < g.axis,
        kind: "leak",
        leak,
        title: leak.kind,
        sub: leak.subject,
        value,
        tone: isFixed(leak) ? "signal" : "found",
        from: { id: leak.anchor },
        at,
      });
    }
    for (const c of cited) {
      const stopped = c.screening ? seam.find((s) => s.item.id === c.screening) : undefined;
      const at = stopped ? { x: stopped.x, y: stopped.y } : center(c.records[0]);
      if (!at) continue;
      out.push({ key: `pin${c.n}`, x: at.x - 9, y: 0, w: 22, above: at.y < g.axis, kind: "pin", title: String(c.n), from: stopped ? at : { id: c.records[0] }, at });
    }
    // The competitor prices a finding rests on, beside today's column.
    if (focusLeak && focusLeak.prices.length && shown.includes(focusLeak)) {
      const cents = focusLeak.prices.map((p) => p.cents);
      const at = { x: g.left + g.todayCol * g.cell + g.size / 2, y: lineY(g, true, domains.in, Math.max(...cents)) };
      const title = `${cents.length} ${cents.length === 1 ? "competitor" : "competitors"}`;
      const sub = cents.length === 1 ? format(cents[0]) : `${format(Math.min(...cents))} to ${format(Math.max(...cents))}`;
      out.push({ key: "market", x: at.x - 10, y: 0, w: labelWidth(title, sub), above: true, kind: "note", title, sub, tone: "found", from: at, at });
    }
    if (chapter === "investigate" && running && run?.step === "market") {
      const at = { x: g.left + g.todayCol * g.cell + g.size / 2, y: g.top + 8 };
      const title = field.investigation?.marketMode === "live" ? "Apify" : "Market data";
      out.push({
        key: "market-step",
        x: at.x - 10,
        y: 0,
        w: labelWidth(title, "reading competitor prices"),
        above: true,
        kind: "note",
        title,
        sub: "reading competitor prices",
        tone: "found",
        from: at,
        at,
      });
    }
    // Keep labels on each side apart, nudging left when they run out of room.
    const spread = (list: Label[], y: number) => {
      list.sort((a, b) => a.x - b.x);
      for (let i = 1; i < list.length; i++) list[i].x = Math.max(list[i].x, list[i - 1].x + list[i - 1].w + 16);
      const over = list.length ? list[list.length - 1].x + list[list.length - 1].w - g.width : 0;
      if (over > 0) {
        list[list.length - 1].x -= over;
        for (let i = list.length - 2; i >= 0; i--) list[i].x = Math.min(list[i].x, list[i + 1].x - list[i].w - 16);
      }
      for (const l of list) {
        l.x = Math.max(0, l.x);
        l.y = y;
      }
    };
    spread(
      out.filter((l) => l.above),
      2,
    );
    spread(
      out.filter((l) => !l.above),
      g.bottom + 26,
    );
    return out;
  }, [g, field, pos, domains, shown, cited, seam, focusLeak, chapter, running, run, narrow]);

  const leaders: Leader[] = useMemo(() => {
    const list: Leader[] = labels.map((l) => ({
      from: l.from,
      x1: Math.max(l.x + 2, Math.min(l.at.x, l.x + l.w - 2)),
      y1: l.above ? l.y + (l.kind === "pin" ? 18 : l.kind === "note" ? 34 : 52) : l.y - 4,
      ink: l.kind === "pin" || l.tone === "signal" ? "signal" : "found",
      strong: Boolean(l.leak && focusLeak?.fingerprint === l.leak.fingerprint),
    }));
    // One line from the stopped payments down to their list under the field.
    if (g && chapter === "screen" && seam.length) {
      const low = seam.reduce((a, b) => (b.y > a.y ? b : a));
      list.push({ from: { x: low.x, y: low.y }, x1: low.x, y1: g.bottom + 21, ink: "found" });
    }
    return list;
  }, [labels, focusLeak, g, chapter, seam]);

  const lastCol = g ? g.todayCol - 2 : 0;
  const costs = useMemo(() => {
    if (!g) return [];
    return shown
      .filter((l) => l.mark && focusLeak?.fingerprint === l.fingerprint)
      .map((l) => ({
        changeCol: Math.max(0, Math.floor((l.mark!.at - g.dayStart) / DAY)),
        endCol: lastCol,
        before: l.mark!.cents[0],
        after: l.mark!.cents[1],
        strong: focusLeak?.fingerprint === l.fingerprint,
        label: l.mark!.label,
      }));
  }, [shown, g, focusLeak, lastCol]);
  const prices = useMemo(() => (focusLeak && shown.includes(focusLeak) ? focusLeak.prices.map((p) => ({ cents: p.cents, strong: true })) : []), [shown, focusLeak]);

  // Amount ticks at the left, following the scale as it zooms.
  const ticks = useMemo(() => {
    if (!g || !domains || narrow) return [];
    const out: { key: string; y: number; label: string }[] = [];
    for (const up of [true, false]) {
      const range = up ? domains.in : domains.out;
      const span = range[1] - range[0];
      const steps =
        span > 1.2 ? [1e3, 1e4, 1e5, 1e6] : span > 0.5 ? [1e3, 2e3, 5e3, 1e4, 2e4, 5e4, 1e5, 2e5, 5e5] : [1e3, 2e3, 3e3, 4e3, 5e3, 6e3, 8e3, 1e4, 1.2e4, 1.5e4, 2e4, 3e4, 5e4, 7.5e4, 1e5, 1.5e5, 2e5];
      for (const cents of steps) {
        const r = rowOf(g, range, Math.log10(cents));
        if (r < 2.5 || r > g.rows - 1.5) continue;
        out.push({
          key: `${up}${cents}`,
          y: yOf(g, up, Math.floor(r)) + g.size / 2 - 6,
          label: cents >= 1e5 ? `$${cents / 1e5}k` : `$${cents / 100}`,
        });
      }
    }
    return out;
  }, [g, domains, narrow]);

  // New live payments drop into today's column.
  const seen = useRef<Set<string> | null>(null);
  const arrivals = useRef(new Map<string, number>());
  useEffect(() => {
    if (!field) return;
    const live = field.records.filter((r) => r.live).map((r) => r.id);
    if (!seen.current) {
      seen.current = new Set(live);
      return;
    }
    for (const id of live) {
      if (!seen.current.has(id)) {
        seen.current.add(id);
        arrivals.current.set(id, performance.now());
      }
    }
  }, [field]);

  const introAt = useRef<number | null>(null);
  if (introAt.current === null && typeof performance !== "undefined" && g) introAt.current = performance.now() + 150;

  const scene = useRef<Scene>({
    field: null,
    g: null,
    domains: null,
    tones: new Map(),
    delays: new Map(),
    recede: 0,
    introAt: null,
    scan: null,
    leaders: [],
    costs: [],
    prices: [],
    waiting: [],
    hot: null,
    arrivals: arrivals.current,
    reduced: false,
    dark: false,
  });
  const scanStart = useRef(0);
  // The scan sweeps while the engine reads a band of the books, and while an answer is being worked out.
  const thinking = chapter === "ask" && latestAsk?.status === "thinking";
  const scanBand = chapter === "investigate" && running && runView?.step ? (SCAN[runView.step] ?? null) : thinking ? "all" : null;
  useEffect(() => {
    scanStart.current = performance.now();
  }, [scanBand, runView?.step]);
  scene.current = {
    field,
    g,
    domains,
    tones,
    delays,
    recede: chapter === "screen" ? 1 : shown.length || cited.length || (chapter === "investigate" && running && run!.suspects.length) ? 0.55 : 0,
    introAt: introAt.current,
    scan: scanBand ? { band: scanBand, startedAt: scanStart.current, period: 1100 } : null,
    leaders,
    costs,
    prices,
    waiting: seam.map((s) => ({ id: s.item.id, status: s.item.status, y: s.y - (g?.size ?? 0) / 2 })),
    hot: hot?.id ?? null,
    arrivals: arrivals.current,
    reduced,
    dark,
  };

  // ---- Actions -------------------------------------------------------------------
  const act = useCallback(
    async (name: string, fn: () => Promise<void>) => {
      if (busy) return;
      setBusy(name);
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(null);
      }
    },
    [busy],
  );

  const investigate = () => act("investigate", source.investigate);
  const approve = (leak: FieldLeak) =>
    leak.recommendationId &&
    act("approve", async () => {
      await source.approve(leak.recommendationId!);
      setHeld(leak.fingerprint);
      setTimeout(() => setHeld((h) => (h === leak.fingerprint ? null : h)), reduced ? 600 : 1700);
    });
  const reject = (leak: FieldLeak) => leak.recommendationId && act("reject", () => source.reject(leak.recommendationId!));
  const startFeed = () => act("feed", source.startFeed);
  const firstWaiting = (feed?.items ?? []).filter((i) => i.status === "held" || i.status === "awaiting").at(-1) ?? null;
  const decidePayment = (id: string, d: "release" | "block") => act(d, () => source.decide(id, d));
  const ask = (q: string) => act("ask", () => source.ask(q));
  const reset = () =>
    act("reset", async () => {
      await source.reset();
      setChapter("books");
      setCursor(0);
      setFocus(null);
      seen.current = null;
      arrivals.current.clear();
      introAt.current = performance.now() + 150;
    });

  const index = chapter === "end" ? CHAPTERS.length : CHAPTERS.findIndex((c) => c.key === chapter);
  const go = useCallback((c: Chapter) => {
    setChapter(c);
    setFocus(null);
    setError(null);
    setCursor(0);
  }, []);
  const next = () => {
    if (chapter === "decide" && cursor < open.length - 1) return setCursor(cursor + 1);
    if (index < CHAPTERS.length - 1) go(CHAPTERS[index + 1].key);
    else go("end");
  };
  const prev = () => {
    if (chapter === "decide" && cursor > 0) return setCursor(cursor - 1);
    if (chapter === "end") go("ask");
    else if (index > 0) go(CHAPTERS[index - 1].key);
  };
  const primary = () => {
    if (chapter === "books") return next();
    if (chapter === "investigate") return running ? undefined : investigate();
    if (chapter === "decide") return decision && !isFixed(decision) ? approve(decision) : next();
    if (chapter === "screen") return feed?.running ? undefined : startFeed();
    if (chapter === "end") return go("books");
  };

  // Keyboard: arrows move between beats, Enter does the beat's one thing.
  const [touring, setTouring] = useState(false);
  const state = {
    next,
    prev,
    primary,
    go,
    setDetails,
    decidePayment,
    ask,
    setTouring,
    firstWaiting,
    chapter,
    details,
    touring,
    running,
    decision,
    feedRunning: Boolean(feed?.running),
    asking: latestAsk?.status === "thinking",
  };
  const keys = useRef(state);
  keys.current = state;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      const typing = e.target instanceof HTMLElement && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable);
      // Any key hands control back from the tour; p starts it.
      if (k.touring && !e.metaKey && !e.ctrlKey && !e.altKey) {
        k.setTouring(false);
        if (e.key === "p" || e.key === "Escape") return;
      } else if (e.key === "p" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) return k.setTouring(true);
      if (e.key === "Escape") {
        if (typing) (e.target as HTMLElement).blur();
        if (k.details) k.setDetails(false);
        setFocus(null);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") k.next();
      else if (e.key === "ArrowLeft") k.prev();
      else if (e.key === "Enter") {
        if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return;
        e.preventDefault();
        k.primary();
      } else if (e.key >= "1" && e.key <= String(CHAPTERS.length)) k.go(CHAPTERS[Number(e.key) - 1].key);
      else if (e.key === "d") k.setDetails((v: boolean) => !v);
      else if (k.chapter === "screen" && k.firstWaiting && (e.key === "b" || e.key === "r")) k.decidePayment(k.firstWaiting.id, e.key === "b" ? "block" : "release");
      else if (k.chapter === "ask" && e.key === "/") {
        e.preventDefault();
        document.getElementById("ask-input")?.focus();
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The tour plays the whole demo hands-free, for recording: each beat's one thing, waiting on the
  // engine, the feed and the agent rather than on a clock. ?tour in the address starts it.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("tour")) setTouring(true);
  }, []);
  useEffect(() => {
    if (!touring) return;
    let stop = false;
    const k = () => keys.current;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const until = async (ok: () => boolean, ms: number) => {
      const t0 = Date.now();
      while (!stop && !ok() && Date.now() - t0 < ms) await sleep(150);
    };
    const beat = async (c: Chapter, settle: number) => {
      if (stop) return;
      k().go(c);
      await sleep(settle);
    };
    (async () => {
      await beat("books", 4000);
      await beat("investigate", 2500);
      if (stop) return;
      k().primary();
      await until(() => k().running, 8000);
      await until(() => !k().running, 240_000);
      await sleep(3500);
      await beat("decide", 0);
      for (let i = 0; i < 2 && !stop; i++) {
        await sleep(3200);
        const d = k().decision;
        if (stop || !d || isFixed(d)) break;
        k().primary();
        await sleep(2400);
      }
      await sleep(1500);
      await beat("screen", 1800);
      if (stop) return;
      k().primary();
      await until(() => k().feedRunning, 8000);
      await until(() => !k().feedRunning, 120_000);
      await sleep(1500);
      const w = k().firstWaiting;
      if (!stop && w) k().decidePayment(w.id, "block");
      await sleep(2500);
      await beat("ask", 1800);
      if (stop) return;
      k().ask(TOUR_QUESTION);
      await until(() => k().asking, 8000);
      await until(() => !k().asking, 120_000);
      await sleep(6000);
      await beat("end", 0);
    })().finally(() => {
      if (!stop) setTouring(false);
    });
    return () => {
      stop = true;
    };
  }, [touring]);

  // ---- Statement ---------------------------------------------------------------------
  const total = (list: FieldLeak[]) => list.reduce((s, l) => s + l.annualCents, 0);
  const records = field ? field.counts.sales + field.counts.transactions : 0;
  const approved = leaks.filter(isFixed);
  const statement = (() => {
    if (!field) return { big: <>Load the demo company.</>, small: "No books yet." };
    switch (chapter) {
      case "books":
        return {
          big: <>{records.toLocaleString("en-US")} records.</>,
          small: `Six months of ${field.organizationName}, one square each.`,
        };
      case "investigate":
        if (runView?.failed)
          return {
            big: <>Investigation stopped.</>,
            small: runView.message ?? "Previous findings are unchanged.",
          };
        if (running && shown.length === 0)
          return {
            big: (
              <>
                Reading the books
                <span className="cursor-blink text-signal">_</span>
              </>
            ),
            small: runView?.message ?? "Starting",
          };
        return {
          big: (
            <>
              <Count cents={total(shown)} className="tabular text-found" /> found.
            </>
          ),
          small: running ? (runView?.message ?? "") : `${shown.length} ${shown.length === 1 ? "leak" : "leaks"} in ${records.toLocaleString("en-US")} records.`,
        };
      case "decide":
        return approved.length
          ? {
              big: (
                <>
                  <Count cents={total(approved)} className="tabular text-signal" /> recovered.
                </>
              ),
              small: `${approved.length} of ${leaks.length} fixes approved. Nothing moves without you.`,
            }
          : {
              big: <>Approve the fixes.</>,
              small: "Nothing moves without you.",
            };
      case "screen":
        return feed && feed.stoppedCents > 0
          ? {
              big: (
                <>
                  <Count cents={feed.stoppedCents} className="tabular text-found" /> stopped.
                </>
              ),
              small: feed.running ? `Screening ${feed.cursor} of ${feed.total}.` : "Before it posted.",
            }
          : {
              big: <>Every payment, screened.</>,
              small: feed?.running ? `Screening ${feed.cursor} of ${feed.total}.` : "Before it posts.",
            };
      case "ask":
        return {
          big: <>Ask your books.</>,
          small: "Every answer cites its records.",
        };
      case "end":
        return {
          big: <>You run the business.</>,
          small: "It watches the money.",
        };
    }
  })();

  const hint = (() => {
    switch (chapter) {
      case "books":
        return [["→", "investigate"]];
      case "investigate":
        return running
          ? [["→", "decide"]]
          : [
              ["↵", source.run ? "investigate again" : "investigate"],
              ["→", "decide"],
            ];
      case "decide":
        return decision
          ? [
              ["↵", "approve"],
              ["→", cursor < open.length - 1 ? "next fix" : "screen"],
            ]
          : [["→", "screen"]];
      case "screen":
        return firstWaiting
          ? [
              ["b", "block"],
              ["r", "release"],
              ["→", "ask"],
            ]
          : feed?.running
            ? [["→", "ask"]]
            : [
                ["↵", feed?.items.length ? "replay the feed" : "start the feed"],
                ["→", "ask"],
              ];
      case "ask":
        return [
          ["/", "type"],
          ["↵", "ask"],
          ["→", "finish"],
        ];
      case "end":
        return [["↵", "from the top"]];
    }
  })();

  const hotRecord = hot && field ? field.records.find((r) => r.id === hot.id) : null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md">
        <div className="flex h-14 items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Mark />
            <span className="hidden text-[15px] font-medium tracking-[-0.01em] min-[440px]:inline">LedgerLens</span>
          </Link>
          {field && <span className="hidden font-mono text-[12px] text-muted-foreground md:inline">/ {field.organizationName.toLowerCase()}</span>}
          <div className="ml-auto flex items-center gap-1 font-mono text-[12px]">
            <span className="mr-2 hidden items-center gap-1.5 text-faint sm:flex" title={source.mode === "live" ? "Connected to the Convex backend" : "Offline replay of the engine"}>
              <span className={cn("size-1.5", source.mode === "live" ? "bg-signal" : "bg-found")} />
              {source.mode}
            </span>
            <button
              onClick={() => setDetails((v) => !v)}
              className={cn("px-2 py-1 transition-colors hover:text-foreground", details ? "text-foreground" : "text-muted-foreground")}
              aria-pressed={details}
            >
              details
            </button>
            {(!dashboard || dashboard.organization.demoMode) && <ResetButton onReset={reset} busy={busy === "reset"} label={field ? "reset demo" : "load demo"} />}
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <Rail chapter={chapter} onGo={go} hint={hint} />
        <main className="relative min-w-0 flex-1 px-4 pb-5 pt-5 sm:px-8 lg:pl-4">
          <MobileRail chapter={chapter} onGo={go} />
          <div key={chapter} className="min-h-[84px]">
            <h1 className="display animate-fade-up text-[clamp(1.8rem,3.2vw,2.75rem)] leading-[1.02]">{statement.big}</h1>
            <p className="animate-fade-up mt-1.5 min-h-[1.4em] text-[15px] text-muted-foreground [animation-delay:80ms]">{statement.small}</p>
          </div>

          <div
            ref={box}
            className="relative mt-2 select-none"
            style={{ height: g?.height ?? 320 }}
            onPointerMove={(e) => {
              if (!g || e.pointerType !== "mouse") return;
              const r = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - r.left;
              const y = e.clientY - r.top;
              const id = pos ? recordAt(g, pos, x, y) : null;
              setHot(id ? { id, x, y } : null);
            }}
            onPointerLeave={() => setHot(null)}
          >
            <FieldCanvas scene={scene} />
            {g && !narrow && (
              <>
                <span className="label pointer-events-none absolute left-0 text-[10px] text-muted-foreground" style={{ top: g.axis - 13 }}>
                  in
                </span>
                <span className="label pointer-events-none absolute left-0 text-[10px] text-muted-foreground" style={{ top: g.axis + g.cell + 1 }}>
                  out
                </span>
              </>
            )}
            {g?.months.map((m) => (
              <span key={m.x} className="label pointer-events-none absolute text-faint" style={{ left: m.x, top: g.bottom + 6 }}>
                {m.label}
              </span>
            ))}
            {g && (
              <span
                className="label pointer-events-none absolute -translate-x-1/2 text-faint"
                style={{
                  left: g.left + g.todayCol * g.cell + g.size / 2,
                  top: g.bottom + 6,
                }}
              >
                today
              </span>
            )}
            {g &&
              domains &&
              costs.map((c) => (
                <span
                  key={c.label}
                  className={cn("halo pointer-events-none absolute font-mono text-[10.5px] text-found transition-[top,opacity] duration-500", !c.strong && "opacity-70")}
                  style={{
                    left: g.left + c.changeCol * g.cell + 6,
                    top: lineY(g, true, domains.in, c.after) - 16,
                  }}
                >
                  {c.label}
                </span>
              ))}
            {ticks.map((t) => (
              <span key={t.key} className="label pointer-events-none absolute left-0 text-[10px] text-faint transition-[top] duration-500" style={{ top: t.y }}>
                {t.label}
              </span>
            ))}
            {labels.map((l) => (
              <FieldLabel key={l.key} label={l} focused={Boolean(l.leak && focusLeak?.fingerprint === l.leak.fingerprint)} onFocus={(f) => setFocus(f)} />
            ))}
            {g && chapter === "screen" && seam.length > 0 && (
              <div className="halo pointer-events-none absolute right-0 grid w-[400px] max-w-full gap-px font-mono text-[11px] leading-[15px]" style={{ top: g.bottom + 24 }}>
                {seam.slice(-3).map(({ item }) => {
                  const blocked = item.status === "blocked";
                  return (
                    <div key={item.id} className="animate-fade-up flex items-baseline gap-3">
                      <span className={cn("w-[4.5rem] shrink-0", blocked ? "text-faint" : "text-found")}>{SEAM_STATUS[item.status]}</span>
                      <span className={cn("min-w-0 truncate", blocked ? "text-faint line-through" : "text-muted-foreground")}>{clip(item.merchantName, 34)}</span>
                      <span className="leader" />
                      <span className={cn("tabular shrink-0 text-right", blocked && "text-faint")}>{format(item.amountCents)}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {hotRecord && hot && (
              <div
                className="pointer-events-none absolute z-10 whitespace-nowrap border border-border-strong bg-card px-2 py-1 font-mono text-[11px] shadow-sm"
                style={{
                  left: Math.min(hot.x + 14, (g?.width ?? 0) - 260),
                  top: hot.y + 14,
                }}
              >
                <span className="text-faint">
                  {new Date(hotRecord.at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })}
                </span>{" "}
                {hotRecord.label}
                {hotRecord.ref && <span className="text-faint"> · {hotRecord.ref}</span>} ·{" "}
                <span className={hotRecord.kind === "out" ? "" : "text-signal"}>
                  {hotRecord.kind === "out" ? "−" : "+"}
                  {format(hotRecord.cents)}
                </span>
              </div>
            )}
          </div>

          <section className="min-h-[200px] border-t pt-4">
            {!field ? (
              <p className="font-mono text-[13px] text-muted-foreground">The demo company has not been loaded on this deployment yet. Use load demo above.</p>
            ) : chapter === "books" ? (
              <BooksPanel field={field} />
            ) : chapter === "investigate" ? (
              <InvestigatePanel
                run={runView}
                leaks={shown}
                total={leaks.length}
                busy={busy === "investigate"}
                started={Boolean(source.run)}
                onInvestigate={investigate}
                onFocus={setFocus}
                focus={focus}
                field={field}
              />
            ) : chapter === "decide" ? (
              <DecidePanel
                leaks={leaks}
                open={open}
                decision={decision}
                index={Math.min(cursor, Math.max(0, open.length - 1))}
                forecast={dashboard?.forecast ?? null}
                busy={busy}
                onApprove={approve}
                onReject={reject}
                onSkip={next}
              />
            ) : chapter === "screen" ? (
              <ScreenPanel feed={feed} busy={busy} onStart={startFeed} onDecide={decidePayment} />
            ) : chapter === "ask" ? (
              <AskPanel asks={asks} busy={busy === "ask"} onAsk={ask} />
            ) : (
              <EndPanel
                found={{ cents: total(leaks), n: leaks.length }}
                approved={{ cents: total(approved), n: approved.length }}
                stopped={{ cents: feed?.stoppedCents ?? 0, n: (feed?.items ?? []).filter((i) => i.status === "held" || i.status === "blocked").length }}
                onRestart={() => go("books")}
              />
            )}
            {error && <p className="mt-4 font-mono text-[12px] text-negative">{error}</p>}
          </section>

          <Hints hint={hint} className="mt-5 lg:hidden" />
        </main>
        {details && <Details source={source} onClose={() => setDetails(false)} />}
      </div>
    </div>
  );
}

function FieldLabel({ label: l, focused, onFocus }: { label: Label; focused: boolean; onFocus: (fingerprint: string | null) => void }) {
  if (l.kind === "pin") {
    return (
      <span
        className="pointer-events-none absolute flex h-[18px] min-w-[18px] items-center justify-center border border-signal bg-background px-1 font-mono text-[11px] text-signal animate-fade-up"
        style={{ left: l.x, top: l.y }}
      >
        {l.title}
      </span>
    );
  }
  const interactive = l.kind === "leak";
  return (
    <div
      className={cn("halo absolute whitespace-nowrap animate-fade-up", interactive ? "cursor-default" : "pointer-events-none")}
      style={{ left: l.x, top: l.y }}
      onPointerEnter={(e) => interactive && e.pointerType === "mouse" && onFocus(l.leak!.fingerprint)}
      onPointerLeave={() => interactive && onFocus(null)}
    >
      <span className={cn("block text-[13.5px] font-medium leading-[18px] transition-colors", focused && (l.tone === "signal" ? "text-signal" : "text-found"), l.kind === "note" && "text-found")}>
        {l.title}
      </span>
      {l.sub && <span className="block text-[12px] leading-snug text-faint">{l.sub}</span>}
      {l.value && <span className={cn("mt-0.5 block font-mono text-[12px] tabular", l.tone === "signal" ? "text-signal" : "text-found")}>{l.value}</span>}
    </div>
  );
}

function Hints({ hint, className }: { hint: string[][]; className?: string }) {
  return (
    <p className={cn("flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] text-faint", className)}>
      {[...hint, ["d", "details"]].map(([k, label]) => (
        <span key={k + label} className="whitespace-nowrap">
          <kbd className="mr-1.5 inline-block min-w-[1.5em] border border-border-strong px-1 text-center text-muted-foreground">{k}</kbd>
          {label}
        </span>
      ))}
    </p>
  );
}

function Rail({ chapter, onGo, hint }: { chapter: Chapter; onGo: (c: Chapter) => void; hint: string[][] }) {
  return (
    <div className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-44 shrink-0 flex-col pl-6 lg:flex">
      <nav aria-label="Demo beats" className="flex flex-1 flex-col justify-center gap-3.5">
        {CHAPTERS.map((c, i) => {
          const on = c.key === chapter;
          return (
            <button
              key={c.key}
              onClick={() => onGo(c.key)}
              className={cn("group flex items-center gap-2.5 font-mono text-[11px] transition-colors", on ? "text-foreground" : "text-faint hover:text-foreground")}
              aria-current={on ? "step" : undefined}
            >
              <span className={cn("h-px transition-[width,background-color] duration-300", on ? "w-6 bg-signal" : "w-3 bg-current")} />
              <span className="tabular">{String(i + 1).padStart(2, "0")}</span>
              <span>{c.name}</span>
            </button>
          );
        })}
      </nav>
      <Hints hint={hint} className="mb-6 flex-col items-start gap-y-2 pr-2" />
    </div>
  );
}

function MobileRail({ chapter, onGo }: { chapter: Chapter; onGo: (c: Chapter) => void }) {
  return (
    <nav aria-label="Demo beats" className="-mx-4 mb-5 flex gap-4 overflow-x-auto border-b px-4 pb-3 font-mono text-[11px] lg:hidden">
      {CHAPTERS.map((c, i) => (
        <button key={c.key} onClick={() => onGo(c.key)} className={cn("shrink-0", c.key === chapter ? "text-foreground" : "text-faint")}>
          {String(i + 1).padStart(2, "0")} {c.name}
        </button>
      ))}
    </nav>
  );
}

function ResetButton({ onReset, busy, label }: { onReset: () => void; busy: boolean; label: string }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 4000);
    return () => clearTimeout(t);
  }, [confirm]);
  return (
    <button
      disabled={busy}
      onClick={() => {
        if (confirm) {
          setConfirm(false);
          onReset();
        } else setConfirm(true);
      }}
      className={cn("px-2 py-1 transition-colors disabled:opacity-50", confirm ? "text-found" : "text-muted-foreground hover:text-foreground")}
    >
      {busy ? "restoring…" : confirm ? "confirm" : label}
    </button>
  );
}
