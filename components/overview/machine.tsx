"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils/cn";
import { STATIONS, type Flow, type MachineView, type Station, type StationKey } from "./system";

/*
 * The system behind the beat, as one short line of parts: the books, the rules, Apify, Claude and
 * you. A part lights while it works, a square travels the wire whenever data passes between two,
 * and one line says what the part in front is doing. A dashed part is not used on this run.
 */

const HOP_MS = 360;
const NODE = 9;
const STEP = 68;

const NODE_CLASS: Record<Station["state"], string> = {
  idle: "border-border-strong bg-background",
  off: "border-dashed border-border-strong bg-background",
  on: "border-foreground bg-foreground",
  done: "border-muted-foreground bg-muted-foreground",
  waiting: "border-found bg-found",
};

// A square from one part's node to another's.
function send(el: HTMLElement | null, f: Flow, delay = 0) {
  if (!el) return;
  const a = STATIONS.indexOf(f.from);
  const b = STATIONS.indexOf(f.to);
  const at = (i: number) => `${i * STEP + (NODE - 5) / 2}px`;
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

/** The part to speak for: the one working, else the one waiting on you, else the last that finished. */
function lead(view: MachineView): StationKey | null {
  const by = (state: Station["state"]) => STATIONS.filter((k) => view.stations[k].state === state);
  return by("on")[0] ?? by("waiting")[0] ?? by("done").at(-1) ?? null;
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

  const front = lead(view);
  const s = front ? view.stations[front] : null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5" role="group" aria-label="What is working">
      <div className="relative flex shrink-0" style={{ width: STATIONS.length * STEP - STEP + 52 }}>
        <span aria-hidden className="pointer-events-none absolute left-[4px] top-[4px] border-t border-dotted border-border-strong" style={{ width: (STATIONS.length - 1) * STEP }} />
        <div ref={wire} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-[9px]" />
        {STATIONS.map((k, i) => {
          const st = view.stations[k];
          return (
            <div key={k} className="flex items-center gap-1.5" style={{ width: i < STATIONS.length - 1 ? STEP : undefined }} title={st.line}>
              <span aria-hidden className={cn("relative z-[1] size-[9px] shrink-0 border transition-colors duration-300", NODE_CLASS[st.state])} />
              <span
                className={cn(
                  "relative z-[1] bg-background pr-1.5 font-mono text-[11px] leading-[11px] transition-colors duration-300",
                  st.state === "idle" || st.state === "off" ? "text-faint" : st.state === "waiting" ? "text-found" : "text-foreground",
                )}
              >
                {k}
              </span>
            </div>
          );
        })}
      </div>
      {front && s && (
        <p key={front} className="animate-fade min-w-0 truncate font-mono text-[11px] leading-[14px] text-muted-foreground">
          <span className={s.state === "waiting" ? "text-found" : "text-foreground"}>{front}</span> · {s.line}
          {s.state === "on" && <span className="cursor-blink text-signal">_</span>}
        </p>
      )}
    </div>
  );
}
