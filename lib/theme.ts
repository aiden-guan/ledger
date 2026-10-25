/*
 * Light or dark. The landing page opens dark and the other pages follow the system setting, until a
 * visitor picks one with the switch in the header; the pick is kept in localStorage and wins on every
 * page. Either way the theme is set as data-theme on <html> before first paint.
 */

export type Theme = "light" | "dark";

const KEY = "ll-theme";
const EVENT = "ll-theme";
const SYSTEM = "(prefers-color-scheme: dark)";
/** Pages that open dark until the visitor picks: the landing page's first look is its night. */
const OPENS_DARK = ["/"];
/** The browser bar's tint for each theme: the page's paper and its night. */
const BAR: Record<Theme, string> = { light: "#f6f4ee", dark: "#0d0d0e" };

/**
 * Runs in <head> before the page paints, so a picked or opening theme never flashes the other one
 * first. It comes after the theme-color tags, so it tints the browser's bar to match as well.
 */
export const THEME_SCRIPT = `(function(){var t;try{t=localStorage.getItem("${KEY}")}catch(e){}if(t!=="light"&&t!=="dark"&&${JSON.stringify(OPENS_DARK)}.indexOf(location.pathname)<0)return;if(t!=="light"&&t!=="dark")t="dark";document.documentElement.dataset.theme=t;var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++)m[i].setAttribute("content",${JSON.stringify(BAR)}[t])})()`;

/** Whether the page is dark right now: the visitor's pick or the page's opening theme, or else the system's. */
export function isDark() {
  const picked = document.documentElement.dataset.theme;
  if (picked === "light" || picked === "dark") return picked === "dark";
  return window.matchMedia(SYSTEM).matches;
}

/** Tints the browser's bar to the page, which can differ from the system's setting. */
export function tintBar() {
  const color = BAR[isDark() ? "dark" : "light"];
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute("content", color);
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
