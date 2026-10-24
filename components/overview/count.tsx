"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "@/lib/finance/money";

/** A dollar amount that counts to its new value instead of jumping. */
export function Count({ cents, className }: { cents: number; className?: string }) {
  const [shown, setShown] = useState(cents);
  const from = useRef(cents);

  useEffect(() => {
    const start = from.current;
    if (start === cents || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      from.current = cents;
      setShown(cents);
      return;
    }
    const t0 = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const u = Math.min(1, (now - t0) / 750);
      const v = Math.round(start + (cents - start) * (1 - (1 - u) ** 3));
      from.current = v;
      setShown(v);
      if (u < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [cents]);

  return (
    <span className={className} aria-label={format(cents)}>
      <span aria-hidden>{format(shown === cents ? cents : Math.round(shown / 100) * 100)}</span>
    </span>
  );
}
