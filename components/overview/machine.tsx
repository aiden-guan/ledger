"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils/cn";
import { STATIONS, type Flow, type MachineView, type Station } from "./system";

/*
 * The system behind the beat, as one line of parts: the books, the rules, Apify, Claude and you.
 * A part lights while it works, and a square travels the wire whenever data passes between two.
 */

const HOP_MS = 360;
const NODE = 9;

const NODE_CLASS: Record<Station["state"], string> = {
  idle: "border-border-strong bg-background",
  off: "border-dashed border-border-strong bg-background",
  on: "border-foreground bg-foreground",
  done: "border-muted-foreground bg-muted-foreground",
  waiting: "border-found bg-found",
};
const LINE_CLASS: Record<Station["state"], string> = {
  idle: "text-faint",
  off: "text-faint",
  on: "text-foreground",
  done: "text-muted-foreground",
  waiting: "text-found",
};

// A square from one part's node to another's. Nodes sit at the left of five equal columns.
function send(el: HTMLElement | null, f: Flow, delay = 0) {
  if (!el) return;
  const a = STATIONS.indexOf(f.from);
  const b = STATIONS.indexOf(f.to);
  const at = (i: number) => `calc(${i * 20}% + ${(NODE - 5) / 2}px)`;
  const dot = document.createElement("span");
  dot.className = cn("absolute top-[2px] size-[5px]", f.tone === "found" ? "bg-found" : "bg-signal");
  el.appendChild(dot);
  const anim = dot.animate(
    [
      { left: at(a), opacity: 0 },
      { opacity: 1, offset: 0.12 },
      { opacity: 1, offset: 0.88 },
      { left: at(b), opacity: 0 },
    ],
    { duration: 240 + HOP_MS * Math.abs(b - a), delay, easing: "cubic-bezier(0.45, 0, 0.55, 1)", fill: "both" },
  );
  anim.onfinish = anim.oncancel = () => dot.remove();
}

export function Machine({ view, reduced }: { view: MachineView; reduced: boolean }) {
  const wire = useRef<HTMLDivElement>(null);
  const sent = useRef<Set<string> | null>(null);
  const scope = useRef(view.scope);

  const flows = view.flows.map((f) => `${f.from}>${f.to}>${f.tone}`).join(" ");
  useEffect(() => {
    if (reduced || !flows) return;
    const list = flows.split(" ").map((s) => {
      const [from, to, tone] = s.split(">");
      return { from, to, tone } as Flow;
    });
    const tick = () => list.forEach((f) => send(wire.current, f));
    tick();
    const id = setInterval(tick, 480);
    return () => clearInterval(id);
  }, [flows, reduced]);

  useEffect(() => {
    // Whatever is already on screen when the beat changes stays quiet; only new events send.
    if (!sent.current || scope.current !== view.scope) {
      sent.current = new Set([...(sent.current ?? []), ...view.bursts.map((b) => b.id)]);
      scope.current = view.scope;
      return;
    }
    for (const b of view.bursts) {
      if (sent.current.has(b.id)) continue;
      sent.current.add(b.id);
      if (!reduced) send(wire.current, b, b.delay);
    }
  });

  const active = STATIONS.find((k) => view.stations[k].state === "on" || view.stations[k].state === "waiting");
  return (
    <div className="mt-3" role="group" aria-label="What is working">
      <div className="relative grid grid-cols-5">
        <span aria-hidden className="pointer-events-none absolute left-[4px] right-[calc(20%-5px)] top-[4px] border-t border-dotted border-border-strong" />
        <div ref={wire} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-[9px]" />
        {STATIONS.map((k) => {
          const s = view.stations[k];
          return (
            <div key={k} className="min-w-0 pr-4">
              <div className="flex items-center gap-2">
                <span aria-hidden className={cn("relative z-[1] size-[9px] shrink-0 border transition-colors duration-300", NODE_CLASS[s.state])} />
                <span className={cn("relative z-[1] bg-background pr-2 font-mono text-[11px] leading-[11px] transition-colors duration-300", s.state === "idle" || s.state === "off" ? "text-muted-foreground" : "text-foreground")}>{k}</span>
              </div>
              <p className={cn("mt-1.5 hidden truncate font-mono text-[11px] leading-[14px] transition-colors duration-300 sm:block", LINE_CLASS[s.state])} title={s.line}>
                {s.line}
                {s.state === "on" && <span className="cursor-blink text-signal">_</span>}
              </p>
            </div>
          );
        })}
      </div>
      {active && <p className="mt-1.5 truncate font-mono text-[11px] leading-[14px] text-muted-foreground sm:hidden">{`${active} · ${view.stations[active].line}`}</p>}
    </div>
  );
}

