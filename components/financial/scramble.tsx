"use client";

import { useEffect, useRef, useState } from "react";

const DIGITS = "0123456789";

/**
 * Renders text and, when it changes, briefly scrambles the digits before they settle left to
 * right, like a split-flap board. Non-digit characters stay put. Respects reduced motion.
 */
export function Scramble({ text, className, durationMs = 700 }: { text: string; className?: string; durationMs?: number }) {
  const [shown, setShown] = useState(text);
  const first = useRef(true);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(text);
      return;
    }
    // Scramble on first mount too, so numbers "resolve" when the page loads.
    const start = performance.now();
    const delay = first.current ? 150 : 0;
    first.current = false;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      const t = (now - start - delay) / durationMs;
      if (t >= 1) {
        setShown(text);
        return;
      }
      if (now - last > 45) {
        last = now;
        const settled = Math.max(0, Math.floor(t * text.length));
        setShown(
          text
            .split("")
            .map((ch, i) => (i < settled || !DIGITS.includes(ch) ? ch : DIGITS[Math.floor(Math.random() * 10)]))
            .join(""),
        );
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, durationMs]);

  return (
    <span className={className} aria-label={text}>
      <span aria-hidden>{shown}</span>
    </span>
  );
}
