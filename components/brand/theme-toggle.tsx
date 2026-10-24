"use client";

import { useEffect, useState } from "react";
import { isDark, onThemeChange, setTheme } from "@/lib/theme";
import { cn } from "@/lib/utils/cn";

/** A pixel disc, lit on one side: the switch between paper and night. */
export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const on = () => setDark(isDark());
    on();
    return onThemeChange(on);
  }, []);
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light" : "Switch to dark"}
      title={dark ? "Light" : "Dark"}
      className={cn("grid size-8 place-items-center text-muted-foreground transition-colors hover:text-foreground", className)}
    >
      <svg viewBox="0 0 9 9" aria-hidden className="size-[18px]" shapeRendering="crispEdges">
        {DISC.map(([x, y]) => (
          <rect key={`${x}.${y}`} x={x + 0.1} y={y + 0.1} width={0.8} height={0.8} className={x < 4.5 === !dark ? "fill-current" : "fill-current opacity-25"} />
        ))}
      </svg>
    </button>
  );
}

/** The cells of a disc nine pixels across. */
const DISC: [number, number][] = [];
for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if ((x - 4) ** 2 + (y - 4) ** 2 <= 17) DISC.push([x, y]);
