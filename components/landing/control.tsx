"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { LandingData } from "@/lib/landing/data";
import { cn } from "@/lib/utils/cn";
import { Caption, Section } from "./section";

type Row = { at: string; actor: "system" | "you"; action: string; fresh?: boolean };

const BASE: Row[] = [
  { at: "09:41:02", actor: "system", action: "investigation.completed" },
  { at: "09:41:02", actor: "system", action: "finding.created #03" },
  { at: "09:41:03", actor: "system", action: "fix.proposed #03" },
];

const clock = () => new Date().toTimeString().slice(0, 8);

/** Fig. 4: a prepared fix waits for a decision; the decision is written to the audit log. */
export function Control({ data }: { data: LandingData }) {
  const [state, setState] = useState<"open" | "approved" | "rejected">("open");
  const [rows, setRows] = useState<Row[]>(BASE);

  const decide = (approved: boolean) => {
    const at = clock();
    setState(approved ? "approved" : "rejected");
    setRows([
      ...BASE,
      { at, actor: "you", action: approved ? "fix.approved #03" : "fix.rejected #03", fresh: true },
      ...(approved ? [{ at, actor: "system" as const, action: "fix.ready_for_execution #03", fresh: true }] : []),
    ]);
  };

  return (
    <Section
      n="03"
      label="Control"
      title={
        <>
          Nothing moves <span className="text-faint">without you.</span>
        </>
      }
    >
      <figure className="mt-12">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="frame flex flex-col p-5">
            <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
              <span>
                fix <span className="text-signal">#03</span>
              </span>
              <span>+{data.fix.annual} /yr</span>
            </div>
            <p className="display mt-4 text-[24px] leading-tight">{data.fix.product}</p>
            <div className="mt-4 space-y-1 font-mono text-[13px]">
              <p className="text-faint">
                <span className="inline-block w-5">−</span>price <span className="line-through">{data.fix.from}</span>
              </p>
              <p className="text-signal">
                <span className="inline-block w-5">+</span>price {data.fix.to}
              </p>
            </div>
            <div className="mt-auto flex items-center gap-2 pt-8">
              {state === "open" ? (
                <>
                  <Button onClick={() => decide(true)}>Approve</Button>
                  <Button variant="outline" onClick={() => decide(false)}>
                    Reject
                  </Button>
                </>
              ) : (
                <>
                  <span className={cn("font-mono text-[13px]", state === "approved" ? "text-signal" : "text-muted-foreground")}>
                    {state === "approved" ? "● approved" : "○ rejected"}
                  </span>
                  <button
                    type="button"
                    className="ml-auto font-mono text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setState("open");
                      setRows(BASE);
                    }}
                  >
                    undo
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="frame overflow-hidden">
            <div className="border-b border-border px-4 py-2 font-mono text-[11px] text-muted-foreground">audit_log</div>
            <ol className="p-2 font-mono text-[12px]">
              {rows.map((r, i) => (
                <li key={`${r.action}${i}`} className={cn("flex gap-4 rounded-[2px] px-2 py-1.5", r.fresh && "animate-fade-up bg-signal-soft")}>
                  <span className="text-faint tabular">{r.at}</span>
                  <span className={cn("w-12", r.actor === "you" ? "text-signal" : "text-muted-foreground")}>{r.actor}</span>
                  <span className="truncate">{r.action}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <Caption n={4}>Try it. Every decision is logged; nothing changes until you approve.</Caption>
      </figure>
    </Section>
  );
}
