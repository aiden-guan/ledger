"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "@/lib/finance/money";
import { cn } from "@/lib/utils/cn";

export type Feed = NonNullable<FunctionReturnType<typeof api.watch.feed>>;
type Item = Feed["items"][number];
type Policy = Feed["policy"];

const STATUS: Record<Item["status"], { label: string; className: string }> = {
  posted: { label: "posted", className: "text-muted-foreground" },
  flagged: { label: "posted · flagged", className: "text-warning" },
  held: { label: "held", className: "text-negative" },
  awaiting: { label: "needs you", className: "text-warning" },
  released: { label: "released", className: "text-signal" },
  blocked: { label: "blocked", className: "text-muted-foreground" },
};

const errorText = (e: unknown) => (e instanceof ConvexError ? String((e.data as { message?: string }).message) : "Something went wrong");
const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour12: false });

/**
 * The fast loop: payments from the bank feed, each screened the moment it arrives. Autopilot posts,
 * flags, holds or escalates within the limits beside it; held payments wait for a person.
 */
export function LiveFeed({ preview }: { preview?: Feed }) {
  const live = useQuery(api.watch.feed, preview ? "skip" : {});
  const feed = preview ?? live;
  const start = useMutation(api.watch.start);
  const stop = useMutation(api.watch.stop);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <section className="mt-16 grid gap-12 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
          <p className="label">
            <span className="text-foreground">04</span> &nbsp;live feed
          </p>
          <div className="flex items-center gap-3">
            {feed?.running && (
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-signal">
                <span aria-hidden className="size-[5px] animate-pulse rounded-full bg-current" />
                screening {feed.cursor}/{feed.total}
              </span>
            )}
            {feed &&
              (feed.running ? (
                <Button variant="ghost" size="sm" onClick={() => run(() => stop({}))}>
                  stop
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => run(() => start({}))}>
                  {feed.items.length ? "replay feed" : "start feed"}
                </Button>
              ))}
          </div>
        </div>

        {feed && feed.items.length > 0 && (
          <p className="flex flex-wrap gap-x-6 gap-y-1 border-b py-3 font-mono text-[12px] text-muted-foreground">
            <span>
              stopped before posting <span className="tabular text-negative">{format(feed.stoppedCents)}</span>
            </span>
            <span>
              waiting on you <span className="tabular text-foreground">{feed.waiting}</span>
            </span>
          </p>
        )}

        {feed === undefined ? (
          <p className="border-b py-10 text-center font-mono text-[13px] text-faint">connecting…</p>
        ) : feed === null || feed.items.length === 0 ? (
          <p className="border-b py-10 text-center font-mono text-[13px] text-muted-foreground">every payment is screened before it posts.</p>
        ) : (
          <ol>
            {feed.items.map((item) => (
              <FeedRow key={item.id} item={item} policy={feed.policy} onError={setError} />
            ))}
          </ol>
        )}
        {error && <p className="mt-3 font-mono text-[12px] text-negative">{error}</p>}
      </div>

      <aside>{feed && <Autopilot policy={feed.policy} />}</aside>
    </section>
  );
}

function FeedRow({ item, policy, onError }: { item: Item; policy: Policy; onError: (e: string | null) => void }) {
  const decide = useMutation(api.watch.decide);
  const [busy, setBusy] = useState(false);
  const open = item.status === "held" || item.status === "awaiting";
  const status = STATUS[item.status];
  const act = async (decision: "release" | "block") => {
    setBusy(true);
    onError(null);
    try {
      await decide({ id: item.id, decision });
    } catch (e) {
      onError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={cn("animate-fade-up grid grid-cols-[1fr_auto] gap-x-4 border-b py-3.5 sm:grid-cols-[4.5rem_1fr_auto]", item.status === "blocked" && "opacity-55")}>
      <span className="hidden pt-0.5 font-mono text-[11px] text-faint sm:block">{clock(item.at)}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={cn("truncate text-[15px]", item.status === "blocked" && "line-through")}>{item.merchantName}</span>
          {item.invoiceReference && <span className="font-mono text-[11px] text-faint">{item.invoiceReference}</span>}
          <Badge className={status.className}>{status.label}</Badge>
        </div>
        {item.signals.length > 0 && (
          <ul className="mt-1.5 grid gap-0.5 font-mono text-[12px] text-muted-foreground">
            {(open ? item.signals : item.signals.slice(0, 1)).map((s) => (
              <li key={s.signal} className="flex gap-2">
                <span className="tabular w-9 shrink-0 text-faint">+{s.weight.toFixed(2)}</span>
                <span className="min-w-0">{s.detail}</span>
              </li>
            ))}
          </ul>
        )}
        {item.status === "awaiting" && <p className="mt-1.5 font-mono text-[12px] text-muted-foreground">above your {format(policy.approvalLimitCents)} limit</p>}
        {open && (
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act("block")}>
              block
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => act("release")}>
              release
            </Button>
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-2">
        <span className={cn("figure tabular text-[15px]", item.transactionType === "CREDIT" && "text-signal")}>
          {item.transactionType === "CREDIT" ? "+" : ""}
          {format(item.amountCents)}
        </span>
        {item.score > 0 && <Risk score={item.score} policy={policy} />}
      </div>
    </li>
  );
}

/** Risk score on a 0 to 1 track, with ticks where the policy flags and holds. */
function Risk({ score, policy }: { score: number; policy: Policy }) {
  const tone = score >= policy.holdAt ? "bg-negative" : score >= policy.reviewAt ? "bg-warning" : "bg-faint";
  return (
    <span className="flex items-center gap-2" title={`risk ${score.toFixed(2)}`}>
      <span className="relative block h-[3px] w-14 bg-border">
        <span className={cn("absolute inset-y-0 left-0", tone)} style={{ width: `${Math.max(score, 0.02) * 100}%` }} />
        <span aria-hidden className="absolute -top-[3px] h-[9px] w-px bg-foreground/30" style={{ left: `${policy.reviewAt * 100}%` }} />
        <span aria-hidden className="absolute -top-[3px] h-[9px] w-px bg-foreground/60" style={{ left: `${policy.holdAt * 100}%` }} />
      </span>
      <span className="tabular w-7 text-right font-mono text-[11px] text-faint">{score.toFixed(2)}</span>
    </span>
  );
}

/** The limits autopilot works within. Saved when a control is released. */
function Autopilot({ policy }: { policy: Policy }) {
  const save = useMutation(api.watch.setPolicy);
  const [draft, setDraft] = useState(policy);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => setDraft(policy), [policy]);

  const commit = async (next: Policy) => {
    setDraft(next);
    if (next.holdAt === policy.holdAt && next.reviewAt === policy.reviewAt && next.approvalLimitCents === policy.approvalLimitCents) return;
    try {
      await save(next);
      setNote("saved · applies to the next payment");
    } catch (e) {
      setNote(errorText(e));
      setDraft(policy);
    }
  };

  return (
    <div>
      <p className="label border-b pb-3">autopilot</p>
      <div className="mt-4 grid gap-5 font-mono text-[12px]">
        <Slider label="hold at risk" value={draft.holdAt} min={0.3} max={1} onChange={(holdAt) => setDraft({ ...draft, holdAt })} onCommit={(holdAt) => commit({ ...draft, holdAt, reviewAt: Math.min(draft.reviewAt, Number((holdAt - 0.05).toFixed(2))) })} />
        <Slider label="flag at risk" value={draft.reviewAt} min={0.1} max={0.95} onChange={(reviewAt) => setDraft({ ...draft, reviewAt })} onCommit={(reviewAt) => commit({ ...draft, reviewAt: Math.min(reviewAt, Number((draft.holdAt - 0.05).toFixed(2))) })} />
        <label className="grid gap-1.5">
          <span className="flex justify-between text-muted-foreground">
            ask me above <span className="text-foreground">{format(draft.approvalLimitCents)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={500_000}
            step={25_000}
            value={draft.approvalLimitCents}
            onChange={(e) => setDraft({ ...draft, approvalLimitCents: Number(e.target.value) })}
            onPointerUp={(e) => commit({ ...draft, approvalLimitCents: Number((e.target as HTMLInputElement).value) })}
            onKeyUp={(e) => commit({ ...draft, approvalLimitCents: Number((e.target as HTMLInputElement).value) })}
            className="accent-[var(--signal)]"
          />
        </label>
      </div>
      <p className="mt-4 font-mono text-[11px] text-faint">{note ?? "acts inside these limits. the rest waits for you."}</p>
    </div>
  );
}

function Slider({ label, value, min, max, onChange, onCommit }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; onCommit: (v: number) => void }) {
  const read = (e: { target: EventTarget }) => Number(Number((e.target as HTMLInputElement).value).toFixed(2));
  return (
    <label className="grid gap-1.5">
      <span className="flex justify-between text-muted-foreground">
        {label} <span className="tabular text-foreground">{value.toFixed(2)}</span>
      </span>
      <input type="range" min={min} max={max} step={0.05} value={value} onChange={(e) => onChange(read(e))} onPointerUp={(e) => onCommit(read(e))} onKeyUp={(e) => onCommit(read(e))} className="accent-[var(--signal)]" />
    </label>
  );
}
