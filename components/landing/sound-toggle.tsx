"use client";

import { useEffect, useRef, useState } from "react";
import { TRAVEL_VH } from "@/lib/landing/clocks";
import { Soundscape } from "@/lib/landing/sound";
import { cn } from "@/lib/utils/cn";

const KEY = "ledgerlens.sound";

function read() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function write(v: "on" | "off") {
  try {
    localStorage.setItem(KEY, v);
  } catch {}
}

/** How far the story has gone, in vh of travel, from the page's one long section. */
function travel() {
  const sec = document.querySelector<HTMLElement>("main section");
  if (!sec) return 0;
  const r = sec.getBoundingClientRect();
  return Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight))) * TRAVEL_VH;
}

/**
 * The scene's sound, and a pixel speaker to turn it off and on. Browsers only allow sound after
 * the visitor does something, so it fades in on the first click, tap or key on the page, unless
 * they turned it off before.
 */
export function SoundToggle({ className }: { className?: string }) {
  const [on, setOn] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const scape = useRef<Soundscape | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const playing = useRef(false);

  useEffect(() => {
    const onScroll = () => scape.current?.update(travel());
    const ensure = () => {
      if (scape.current) return scape.current;
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx.current = new AC({ latencyHint: "playback" });
      scape.current = new Soundscape(ctx.current);
      scape.current.update(travel());
      window.addEventListener("scroll", onScroll, { passive: true });
      return scape.current;
    };
    const enable = () => {
      const s = ensure();
      if (!s || playing.current) return;
      playing.current = true;
      void ctx.current!.resume().then(() => s.start());
      setOn(true);
    };
    const disable = () => {
      if (!playing.current) return;
      playing.current = false;
      setOn(false);
      scape.current?.stop(() => {
        if (!playing.current) void ctx.current?.suspend();
      });
    };
    const firstTouch = (e: Event) => {
      if (button.current?.contains(e.target as Node)) return;
      off();
      if (read() !== "off") enable();
    };
    const events = ["pointerdown", "keydown", "touchend"] as const;
    const off = () => events.forEach((n) => window.removeEventListener(n, firstTouch, true));
    events.forEach((n) => window.addEventListener(n, firstTouch, true));
    const onVisible = () => {
      if (!ctx.current) return;
      if (document.hidden) void ctx.current.suspend();
      else if (playing.current) void ctx.current.resume();
    };
    document.addEventListener("visibilitychange", onVisible);
    toggle.current = () => {
      if (playing.current) {
        write("off");
        disable();
      } else {
        write("on");
        enable();
      }
    };
    return () => {
      off();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("scroll", onScroll);
      playing.current = false;
      void ctx.current?.close();
      ctx.current = null;
      scape.current = null;
    };
  }, []);
  const toggle = useRef<() => void>(() => {});

  return (
    <button
      ref={button}
      type="button"
      onClick={() => toggle.current()}
      aria-label={on ? "Turn sound off" : "Turn sound on"}
      aria-pressed={on}
      title={on ? "Sound off" : "Sound on"}
      className={cn("grid size-8 place-items-center text-muted-foreground transition-colors hover:text-foreground", className)}
    >
      <svg viewBox="0 0 9 9" aria-hidden className="size-[18px]" shapeRendering="crispEdges">
        {SPEAKER.map(([x, y]) => (
          <rect key={`s${x}.${y}`} x={x + 0.1} y={y + 0.1} width={0.8} height={0.8} className="fill-current" />
        ))}
        {WAVES.map(([x, y]) => (
          <rect key={`w${x}.${y}`} x={x + 0.1} y={y + 0.1} width={0.8} height={0.8} className={on ? "fill-current" : "fill-current opacity-25"} />
        ))}
      </svg>
    </button>
  );
}

/** A speaker nine pixels across: the box and its cone, then two waves. */
const SPEAKER: [number, number][] = [
  [0, 3], [1, 3], [0, 4], [1, 4], [0, 5], [1, 5],
  [2, 3], [2, 4], [2, 5], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6], [4, 1], [4, 2], [4, 3], [4, 4], [4, 5], [4, 6], [4, 7],
];
const WAVES: [number, number][] = [
  [6, 3], [6, 4], [6, 5],
  [7, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 6], [7, 7],
];
