import type { FindingType } from "@/lib/domain";
import { DEFAULT_DUPLICATE_CONFIG as DUP } from "@/lib/finance/duplicates";
import { DEFAULT_COST_INFLATION_CONFIG as INF } from "@/lib/finance/margins";
import { format } from "@/lib/finance/money";
import { DEFAULT_PRICING_CONFIG as PRICE } from "@/lib/finance/pricing";
import { DEFAULT_RECURRING_CONFIG as REC } from "@/lib/finance/recurring";
import { isFixed, type FieldData, type FieldLeak } from "@/lib/field/model";
import { INVESTIGATION_STEPS, type StepKey } from "@/lib/investigation/state-machine";
import { WEIGHTS } from "@/lib/watch/screen";
import type { Chapter } from "./overview";
import type { Ask, Feed, FeedItem, Run } from "./source";

/*
 * What is working behind each beat: the books, the rules, Apify, Claude or you. Everything here is
 * read from what the backend records (engine events, screenings, tool calls) and from the rules'
 * own thresholds, so a part that did nothing says so.
 */

export type StationKey = "data" | "rules" | "apify" | "claude" | "you";
export const STATIONS: StationKey[] = ["data", "rules", "apify", "claude", "you"];

/** idle: waiting its turn. on: working now. done: did its part. waiting: needs you. off: not part of this. */
export type StationState = "idle" | "on" | "done" | "waiting" | "off";
export interface Station {
  state: StationState;
  line: string;
}
export interface Flow {
  from: StationKey;
  to: StationKey;
  tone: "signal" | "found";
}
export interface MachineView {
  /** Bursts already on screen when this changes are not replayed. */
  scope: string;
  stations: Record<StationKey, Station>;
  /** Steady streams while a part works. */
  flows: Flow[];
  /** One packet per event (a payment arriving, a tool call), each sent once. */
  bursts: (Flow & { id: string; delay?: number })[];
}

/** The tools the agent can call, in the order it is offered them (tests/ask checks this list). */
export const TOOLS = ["search_transactions", "vendor_profile", "list_findings", "live_feed", "cash_forecast", "product_economics", "spending_by_category"];

/** Every check the payment screen runs, heaviest first. */
export const CHECKS = Object.entries(WEIGHTS).map(([signal, weight]) => ({ signal, weight, name: signal.replaceAll("_", " ") }));

// ---- The engine's ten steps ------------------------------------------------------

export interface TraceStep {
  key: StepKey;
  status: "pending" | "running" | "done" | "warning" | "failed";
  /** The engine's latest line for the step, verbatim. */
  message: string;
  ms: number | null;
  meta: Record<string, unknown>;
  who: StationKey;
  /** What the step tests, from the rules' own thresholds. */
  check: string;
  /** What it came to, in a few words. */
  result: string;
  /** It turned up money. */
  found: boolean;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const count = (re: RegExp, s: string) => {
  const m = re.exec(s);
  return m ? Number(m[1]) : null;
};
const many = (n: number, one: string, more = `${one}s`) => `${n} ${n === 1 ? one : more}`;
const liveRun = (id: unknown) => (typeof id === "string" && id && !id.startsWith("fixture") ? id.slice(0, 6) : null);

function stationFor(key: StepKey, meta: Record<string, unknown>, message: string, expect: { model: boolean; live: boolean }): StationKey {
  switch (key) {
    case "ingest":
      return "data";
    case "hypotheses":
      return (meta.source ? meta.source === "model" : expect.model) ? "claude" : "rules";
    case "market":
      // The demo dataset is a file in the books, not a scrape.
      return ((meta.mode as string | undefined) ?? (expect.live ? "live" : "fixture")) === "live" ? "apify" : "data";
    case "validate":
      if (meta.modelExplanations !== undefined) return Number(meta.modelExplanations) > 0 ? "claude" : "rules";
      return (message ? / with /.test(message) : expect.model) ? "claude" : "rules";
    default:
      return "rules";
  }
}

function checkFor(key: StepKey, who: StationKey, meta: Record<string, unknown>): string {
  switch (key) {
    case "ingest":
      return "orders · bank · costs · listings";
    case "duplicates":
      return `same payee · ±${pct(DUP.amountTolerance)} · ≤${DUP.windowDays} days`;
    case "recurring":
      return `≥${REC.minOccurrences} charges · price ↑${REC.creepThresholdPercent}%`;
    case "margins":
      return `cost ↑${INF.minCostIncreasePercent}% · margin ↓${INF.minMarginCompressionPoints} pts`;
    case "hypotheses":
      return who === "claude" ? "which products to price-check" : "every product with listings";
    case "market":
      return who === "apify" ? `actor · ${meta.listings ?? "competitor"} pages` : "demo dataset";
    case "correlate":
      return `≥${PRICE.minObservations} prices · ≥${PRICE.minGapPercent}% under median`;
    case "validate":
      return who === "claude" ? "schema · every $ traced" : "rules-based narrative";
    case "impact":
      return "integer cents";
    case "recommend":
      return "drafts · nothing sent";
  }
}

function resultFor(key: StepKey, status: TraceStep["status"], meta: Record<string, unknown>, message: string): string {
  if (status === "failed") return "failed";
  if (status === "running") {
    if (key === "market") {
      const id = liveRun(meta.runId);
      return id ? `run ${id} · ${String(meta.apifyStatus ?? "starting").toLowerCase()}` : "";
    }
    if (key === "validate") return `explaining ${count(/Validating (\d+)/, message) ?? ""}`.trim();
    return "";
  }
  const suspects = Array.isArray(meta.suspects) ? meta.suspects.length : 0;
  switch (key) {
    case "ingest": {
      const s = meta.stats as { transactions?: number; sales?: number } | undefined;
      return s ? `${s.transactions} bank · ${s.sales} orders` : message;
    }
    case "duplicates":
      return suspects ? `${suspects} paid twice` : "none";
    case "recurring":
      return suspects ? `${suspects} price creep` : "none";
    case "margins":
      return suspects ? `${suspects} margin slipping` : "none";
    case "hypotheses": {
      const n = count(/(\d+) product/, message);
      return n === null ? message : `${many(n, "product")} to check`;
    }
    case "market": {
      const n = count(/Collected (\d+)/, message);
      if (n === null) return message;
      if (status === "warning") return `${many(n, "price")} · fallback`;
      const id = liveRun(meta.runId);
      return `${many(n, "price")}${/demo storefront/.test(message) ? " · demo storefronts" : id ? ` · run ${id}` : ""}`;
    }
    case "correlate": {
      const n = count(/^(\d+) pricing/, message) ?? suspects;
      return n ? `${n} underpriced` : "none";
    }
    case "validate": {
      const m = /^(\d+) of (\d+)/.exec(message);
      return m ? `${m[1]}/${m[2]} supported` : message;
    }
    case "impact":
      return meta.annualCents !== undefined ? `${format(Number(meta.annualCents))}/yr` : message;
    case "recommend": {
      const n = count(/^(\d+) recommendation/, message);
      return n === null ? message : `${many(n, "fix", "fixes")} drafted`;
    }
  }
}

/** The ten steps of a run as they stand: who ran each, what it tested, what it found, how long it took. */
export function readTrace(run: Run | null, expect: { model: boolean; live: boolean }, now: number): TraceStep[] {
  const seen = new Map<StepKey, { status: TraceStep["status"]; message: string; startedAt: number; endedAt: number | null; meta: Record<string, unknown> }>();
  for (const e of run?.events ?? []) {
    const key = e.metadata.step as StepKey | undefined;
    if (!key) continue;
    if (e.eventType === "STEP_STARTED" || !seen.has(key)) seen.set(key, { status: "running", message: e.message, startedAt: e.at, endedAt: null, meta: { ...e.metadata } });
    if (e.eventType === "STEP_STARTED") continue;
    const s = seen.get(key)!;
    s.meta = { ...s.meta, ...e.metadata };
    s.message = e.message;
    if (e.eventType === "STEP_COMPLETED") s.status = "done";
    else if (e.eventType === "STEP_WARNING") s.status = "warning";
    else if (e.eventType === "STEP_FAILED") s.status = "failed";
    if (s.status !== "running") s.endedAt = e.at;
  }
  const terminal = !run || run.status === "COMPLETED" || run.status === "FAILED";
  return INVESTIGATION_STEPS.map(({ key }) => {
    const s = seen.get(key);
    const status: TraceStep["status"] = !s ? "pending" : s.status === "running" && terminal ? (run?.status === "FAILED" ? "failed" : "done") : s.status;
    const meta = s?.meta ?? {};
    const message = s?.message ?? "";
    const who = stationFor(key, meta, message, expect);
    const settled = status === "done" || status === "warning";
    return {
      key,
      status,
      message,
      ms: s ? (s.endedAt ?? (terminal ? s.startedAt : now)) - s.startedAt : null,
      meta,
      who,
      check: checkFor(key, who, meta),
      result: s ? resultFor(key, status, meta, message) : "",
      found: settled && ((Array.isArray(meta.suspects) && meta.suspects.length > 0) || (key === "impact" && Number(meta.annualCents) > 0)),
    };
  });
}

// ---- What each part is doing, beat by beat -----------------------------------------

const idle = (line: string): Station => ({ state: "idle", line });
const on = (line: string): Station => ({ state: "on", line });
const done = (line: string): Station => ({ state: "done", line });
const waiting = (line: string): Station => ({ state: "waiting", line });
const off = (line: string): Station => ({ state: "off", line });

const VERB: Record<StepKey, string> = {
  ingest: "loading the books",
  duplicates: "checking duplicates",
  recurring: "checking recurring charges",
  margins: "checking margins",
  hypotheses: "planning",
  market: "fetching prices",
  correlate: "correlating prices",
  validate: "explaining findings",
  impact: "measuring",
  recommend: "drafting fixes",
};

/** The calculation that decides each kind of finding. */
const DECISIVE: Record<FindingType, { row: string; say: (result: string) => string }> = {
  DUPLICATE_PAYMENT: { row: "Duplicate score", say: (r) => `score ${r} ≥ ${DUP.threshold.toFixed(2)}` },
  MARGIN_EROSION: { row: "Margin compression", say: (r) => `margin ${r.replace(/^-/, "−")}` },
  PRICING_OPPORTUNITY: { row: "Gap to median", say: (r) => `${r} median` },
  SUBSCRIPTION_CREEP: { row: "Increase", say: (r) => `price ${r}` },
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export interface MachineInput {
  chapter: Chapter;
  field: FieldData | null;
  trace: TraceStep[];
  leaks: FieldLeak[];
  open: FieldLeak[];
  decision: FieldLeak | null;
  feed: Feed | null | undefined;
  asks: Ask[] | undefined;
}

export function machineView({ chapter, field, trace, leaks, open, decision, feed, asks }: MachineInput): MachineView {
  const live = field?.investigation?.marketMode === "live";
  const model = field?.investigation?.model ?? null;
  const records = field ? field.counts.sales + field.counts.transactions : 0;
  const role: Record<StationKey, Station> = {
    data: idle(`${records.toLocaleString("en-US")} records`),
    rules: idle("deterministic"),
    apify: live ? idle("competitor prices") : off("demo dataset instead"),
    claude: model ? idle(model) : off("not configured"),
    you: idle("approve · block · ask"),
  };
  const view = (stations: Partial<Record<StationKey, Station>>, flows: Flow[] = [], bursts: MachineView["bursts"] = []): MachineView => ({
    scope: chapter,
    stations: { ...role, ...stations },
    flows,
    bursts,
  });
  if (!field) return view({ data: off("no books loaded") });

  switch (chapter) {
    case "books":
      return view({
        data: done(`${field.counts.sales.toLocaleString("en-US")} orders · ${field.counts.transactions} bank`),
        rules: idle("duplicates · creep · margins"),
        apify: live ? idle("competitor prices") : off("demo dataset instead"),
        claude: model ? idle("plans · explains · answers") : off("not configured"),
      });

    case "investigate": {
      const active = trace.find((t) => t.status === "running") ?? null;
      const ran = (who: StationKey) => trace.filter((t) => t.who === who && t.status !== "pending" && t.status !== "running");
      const step = (key: StepKey) => trace.find((t) => t.key === key)!;
      const stations: Partial<Record<StationKey, Station>> = {};
      for (const k of ["data", "rules", "apify", "claude"] as const) {
        const mine = ran(k);
        if (active?.who === k) stations[k] = on(active.result || VERB[active.key]);
        else if (k === "claude" && mine.length) stations[k] = done(mine.map((t) => (t.key === "hypotheses" ? "planned" : `explained ${Number(t.meta.modelExplanations ?? 0)}`)).join(" · "));
        else if (k === "rules" && !active && step("impact").result && step("impact").status !== "pending") stations[k] = done(`${step("impact").result} found`);
        else if (mine.length) stations[k] = done(k === "data" ? mine.map((t) => t.result).join(" · ") : mine.at(-1)!.result);
      }
      if (active?.key === "recommend") stations.you = on("receiving fixes");
      else if (step("recommend").status !== "pending" && !active) stations.you = open.length ? waiting(`${many(open.length, "fix", "fixes")} to approve`) : done("every fix decided");
      else stations.you = idle("waits for fixes");

      const flows: Flow[] = [];
      if (active) {
        const plannedBy = step("hypotheses").who;
        const pricedBy = step("market").who;
        const f = (from: StationKey, to: StationKey, tone: Flow["tone"] = "signal") => flows.push({ from, to, tone });
        if (["ingest", "duplicates", "recurring", "margins"].includes(active.key)) f("data", "rules");
        else if (active.key === "hypotheses" && active.who === "claude") f("rules", "claude");
        else if (active.key === "market") f(active.who === "apify" ? plannedBy : "data", active.who === "apify" ? "apify" : "rules");
        else if (active.key === "correlate") f(pricedBy, "rules");
        else if (active.key === "validate" && active.who === "claude") f("rules", "claude", "found");
        else if (active.key === "impact" && step("validate").who === "claude") f("claude", "rules", "found");
        else if (active.key === "recommend") f("rules", "you", "found");
      }
      return view(stations, flows);
    }

    case "decide": {
      const approved = leaks.filter(isFixed);
      const bursts = approved.map((l) => ({ id: `approve:${l.fingerprint}`, from: "you" as const, to: "data" as const, tone: "signal" as const }));
      if (!decision) return view({ you: approved.length ? done(`${approved.length} approved`) : idle("nothing to decide") }, [], bursts);
      const sales = decision.records.filter((r) => r.startsWith("sale:")).length;
      const lines = decision.records.length - sales;
      const decisive = DECISIVE[decision.type];
      const row = decision.calculations.find((c) => c.label === decisive.row) ?? decision.calculations.at(-1);
      const cents = decision.prices.map((p) => p.cents);
      const range = cents.length ? `${format(Math.min(...cents))}–${format(Math.max(...cents))}` : "";
      return view(
        {
          data: done(sales ? many(sales, "sale") : decision.type === "SUBSCRIPTION_CREEP" ? many(lines, "charge") : many(lines, "payment")),
          rules: done(row ? (row.label === decisive.row ? decisive.say(row.result) : `${row.label.toLowerCase()} ${row.result}`) : "measured"),
          apify: !cents.length ? idle("not needed") : decision.prices.some((p) => p.mode === "live") ? done(`${many(cents.length, "price")} · ${range}`) : off(`${many(cents.length, "price")} from the demo set`),
          claude: decision.narrativeSource === "model" ? done("wrote it · numbers locked") : model ? idle("rules wording") : off("not configured"),
          you: isFixed(decision) ? done("approved · logged") : waiting("approve or reject"),
        },
        [],
        bursts,
      );
    }

    case "screen": {
      const items = feed?.items ?? [];
      const last = items[0];
      const policy = feed?.policy;
      const verdict = (i: FeedItem) => (i.verdict === "hold" ? "hold" : i.verdict === "review" ? "flag" : policy && i.amountCents > policy.approvalLimitCents ? "ask you" : "post");
      const decided = items.filter((i) => i.status === "blocked" || i.status === "released");
      const bursts: MachineView["bursts"] = items.flatMap((i) => {
        const key = `${i.id}:${i.at}`;
        const out: MachineView["bursts"] = [{ id: `pay:${key}`, from: "data", to: "rules", tone: "signal" }];
        if (i.verdict === "hold" || i.status === "held" || i.status === "awaiting" || i.status === "blocked" || (i.status === "released" && i.verdict !== "clear"))
          out.push({ id: `stop:${key}`, from: "rules", to: "you", tone: "found", delay: 420 });
        if (i.status === "released") out.push({ id: `release:${key}`, from: "you", to: "data", tone: "signal" });
        return out;
      });
      return view(
        {
          data: feed?.running ? on(`bank feed · ${feed.cursor}/${feed.total}`) : items.length ? done(`${many(items.length, "payment")} in`) : idle("bank feed"),
          rules: feed?.running && last ? on(`${last.score.toFixed(2)} → ${verdict(last)}`) : items.length ? done(`${items.length} screened · ${CHECKS.length} checks`) : idle(`${CHECKS.length} checks a payment`),
          apify: off("not in this loop"),
          claude: off("not in this loop"),
          you: feed?.waiting
            ? waiting(`${feed.waiting} waiting`)
            : decided.length
              ? done(
                  (["blocked", "released"] as const)
                    .map((st) => [st, decided.filter((i) => i.status === st).length] as const)
                    .filter(([, n]) => n)
                    .map(([st, n]) => `${n} ${st}`)
                    .join(" · "),
                )
              : idle("decides what is held"),
        },
        [],
        bursts,
      );
    }

    case "ask": {
      const a = asks?.[0] ?? null;
      const thinking = a?.status === "thinking";
      const tool = a?.steps.at(-1)?.tool ?? null;
      const bursts: MachineView["bursts"] = a
        ? [
            { id: `ask:${a.id}`, from: "you", to: "claude", tone: "signal" },
            ...a.steps.flatMap((_, i): MachineView["bursts"] => [
              { id: `call:${a.id}:${i}`, from: "claude", to: "data", tone: "signal" },
              { id: `back:${a.id}:${i}`, from: "data", to: "claude", tone: "signal", delay: 520 },
            ]),
            ...(a.status === "done" ? [{ id: `answer:${a.id}`, from: "claude" as const, to: "you" as const, tone: "signal" as const }] : []),
          ]
        : [];
      return view(
        {
          you: a ? done(`“${clip(a.question, 30)}”`) : idle("asks in plain words"),
          claude: thinking ? on(tool ? `called ${tool}` : "thinking") : a?.status === "done" ? done(`${many(a.steps.length, "tool call")} · ${a.citations.length} cited`) : model ? idle(`${TOOLS.length} read-only tools`) : role.claude,
          data: thinking && tool ? on(tool) : a?.steps.length ? done(`read by ${many(new Set(a.steps.map((s) => s.tool)).size, "tool")}`) : idle("read-only"),
          rules: a?.figures ? done(a.figures.total ? `${a.figures.traced}/${a.figures.total} figures traced` : "no figures to trace") : idle("traces every figure"),
          apify: off("not in this loop"),
        },
        [],
        bursts,
      );
    }

    case "end": {
      const approved = leaks.filter(isFixed).length;
      const items = feed?.items ?? [];
      const stopped = items.filter((i) => i.status === "held" || i.status === "blocked").length;
      const answered = (asks ?? []).filter((a) => a.status === "done").length;
      return view({
        data: done(`${records.toLocaleString("en-US")} records`),
        rules: done(`${format(leaks.reduce((s, l) => s + l.annualCents, 0))} found`),
        apify: live ? done(`${many(field.counts.prices, "price")}`) : off("demo dataset instead"),
        claude: model ? done(answered ? `explained · answered ${answered}` : "planned · explained") : off("not configured"),
        you: done(`${approved} approved · ${stopped} stopped`),
      });
    }
  }
}
