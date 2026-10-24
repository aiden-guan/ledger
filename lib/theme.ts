/*
 * Light or dark. The page follows the system setting until a visitor picks one with the switch in
 * the header; the pick is kept in localStorage and set as data-theme on <html> before first paint.
 */

export type Theme = "light" | "dark";

const KEY = "ll-theme";
const EVENT = "ll-theme";
const SYSTEM = "(prefers-color-scheme: dark)";

/** Runs in <head> before the page paints, so a picked theme never flashes the other one first. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

/** Whether the page is dark right now: the visitor's pick, or else the system's. */
export function isDark() {
  const picked = document.documentElement.dataset.theme;
  if (picked === "light" || picked === "dark") return picked === "dark";
  return window.matchMedia(SYSTEM).matches;
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Private windows may refuse; the pick still holds for this page.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Calls `on` whenever the page turns light or dark, by the switch or by the system. */
export function onThemeChange(on: () => void) {
  const q = window.matchMedia(SYSTEM);
  q.addEventListener("change", on);
  window.addEventListener(EVENT, on);
  return () => {
    q.removeEventListener("change", on);
    window.removeEventListener(EVENT, on);
  };
}
