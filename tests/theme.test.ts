import { describe, expect, it } from "vitest";
import { THEME_SCRIPT } from "@/lib/theme";

/** Runs the head script for a page at `path` with `saved` in storage: the theme it set on <html>, and the bar's tint. */
function run(path: string, saved: string | null | Error) {
  const root = { dataset: {} as Record<string, string> };
  const bars = ["#f6f4ee", "#0d0d0e"].map((content) => ({
    content,
    setAttribute(_: string, value: string) {
      this.content = value;
    },
  }));
  const storage = {
    getItem: () => {
      if (saved instanceof Error) throw saved;
      return saved;
    },
  };
  const document = { documentElement: root, querySelectorAll: () => bars };
  new Function("localStorage", "location", "document", THEME_SCRIPT)(storage, { pathname: path }, document);
  return { theme: root.dataset.theme, bars: bars.map((bar) => bar.content) };
}

const opening = (path: string, saved: string | null | Error) => run(path, saved).theme;

describe("theme before first paint", () => {
  it("opens the landing page dark", () => {
    expect(opening("/", null)).toBe("dark");
  });

  it("keeps a visitor's pick on every page", () => {
    expect(opening("/", "light")).toBe("light");
    expect(opening("/overview", "dark")).toBe("dark");
    expect(opening("/overview", "light")).toBe("light");
  });

  it("leaves the other pages to the system setting", () => {
    expect(opening("/overview", null)).toBeUndefined();
    expect(opening("/market-check", "sepia")).toBeUndefined();
  });

  it("still opens the landing page dark when storage is blocked", () => {
    expect(opening("/", new Error("SecurityError"))).toBe("dark");
  });

  it("tints the browser's bar to the theme it sets, and leaves it to the system otherwise", () => {
    expect(run("/", null).bars).toEqual(["#0d0d0e", "#0d0d0e"]);
    expect(run("/overview", "light").bars).toEqual(["#f6f4ee", "#f6f4ee"]);
    expect(run("/overview", null).bars).toEqual(["#f6f4ee", "#0d0d0e"]);
  });
});
