"use client";

import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { useEffect } from "react";

/** The landing page's smoothed scroll, while it is mounted. */
export let scroller: Lenis | null = null;

/**
 * Eases wheel and trackpad scrolling on the landing page, so the story moves at a steady pace
 * however hard the wheel is spun. Touch and keyboard scrolling stay native, and nothing changes
 * for anyone who prefers reduced motion.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({
      lerp: 0.075,
      wheelMultiplier: 0.8,
      autoRaf: true,
      // One hard spin of the wheel moves no further than a few gentle notches.
      virtualScroll: (data) => {
        data.deltaY = Math.max(-140, Math.min(140, data.deltaY));
        return true;
      },
    });
    scroller = lenis;
    return () => {
      lenis.destroy();
      scroller = null;
    };
  }, []);
  return null;
}
