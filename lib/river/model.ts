import type { RiverData } from "@/lib/db/queries/dashboard";
import type { LeakStream, StreamKey } from "./streams";

export type LeakState = "suspect" | "open" | "sealed" | "dismissed";

export interface RiverLeak {
  key: string;
  findingId?: string;
  type: string;
  stream: LeakStream;
  title: string;
  annualCents: number;
  recoveryKind: "one_time" | "recurring";
  state: LeakState;
}

export interface RiverBand {
  key: StreamKey;
  label: string;
  cents: number;
  baseCents: number;
  /** Vertical extent at the source and at the outlet, in rows. */
  sy0: number;
  sy1: number;
  ty0: number;
  ty1: number;
}

export interface RiverModel {
  bands: RiverBand[];
  revenueCents: number;
  srcTop: number;
  srcBottom: number;
  /** Height in rows of the uncaptured-revenue tributary (0 when there is none). */
  ghostRows: number;
  rows: number;
}

const revenueLeak = (l: RiverLeak) => l.stream === "cogs" || l.stream === "uncaptured";

/**
 * Lays out the river in abstract rows. Fixing a leak either widens revenue (price fixes) or
 * narrows a cost stream (vendor fixes); both widen profit by the same recurring amount.
 * One-time recoveries never change the yearly flow.
 */
export function buildRiverModel(river: RiverData, leaks: RiverLeak[], preview: boolean, rows = 34, bandRows = 22): RiverModel {
  const fixed = leaks.filter((l) => l.state === "sealed" || (preview && l.state === "open"));
  const recurringFixed = fixed.filter((l) => l.recoveryKind === "recurring");
  const revenueGain = recurringFixed.filter(revenueLeak).reduce((s, l) => s + l.annualCents, 0);
  const costCut = new Map<string, number>();
  for (const l of recurringFixed.filter((x) => !revenueLeak(x))) costCut.set(l.stream, (costCut.get(l.stream) ?? 0) + l.annualCents);
  const profitGain = recurringFixed.reduce((s, l) => s + l.annualCents, 0);

  // The scale is fixed to the largest revenue the river can show, so a fix visibly widens it.
  const potentialRevenue =
    river.revenueAnnualCents + leaks.filter((l) => l.state !== "dismissed" && l.recoveryKind === "recurring" && revenueLeak(l)).reduce((s, l) => s + l.annualCents, 0);
  const scale = bandRows / Math.max(1, potentialRevenue);

  const streams = river.streams.map((s) => {
    let cents = s.annualCents - (costCut.get(s.key) ?? 0);
    if (s.key === "profit") cents = s.annualCents + profitGain;
    return { key: s.key, label: s.label, cents: Math.max(0, cents), baseCents: s.annualCents };
  });
  const heights = streams.map((s) => (s.cents > 0 ? Math.max(1, s.cents * scale) : 0));
  const total = heights.reduce((a, b) => a + b, 0);
  const gap = 1;
  const outletTotal = total + gap * (streams.length - 1);

  // Bottom-align the source so growth shows at the top; centre the outlets.
  const top = 4;
  const srcTop = top + (bandRows - total) + 1;
  let ty = top + Math.max(0, (bandRows + gap * (streams.length - 1) - outletTotal) / 2) - 1;
  let sy = srcTop;
  const bands: RiverBand[] = streams.map((s, i) => {
    const h = heights[i];
    const band = { ...s, sy0: sy, sy1: sy + h, ty0: ty, ty1: ty + h };
    sy += h;
    ty += h + gap;
    return band;
  });

  const ghost = leaks.filter((l) => l.stream === "uncaptured" && l.state !== "sealed" && l.state !== "dismissed" && !(preview && l.state === "open"));
  const ghostCents = ghost.reduce((s, l) => s + (l.state === "suspect" ? 0 : l.annualCents), 0);
  const ghostRows = ghost.length ? Math.max(1, ghostCents * scale) : 0;

  return { bands, revenueCents: river.revenueAnnualCents + revenueGain, srcTop, srcBottom: sy, ghostRows, rows: Math.max(rows, Math.ceil(ty) + 2) };
}

/** Smooth S-curve used for every band, so source and outlet join without kinks. */
export function ease(u: number) {
  return u * u * (3 - 2 * u);
}

/** Vertical extent of a band at fraction u (0 = source, 1 = outlet) along the river. */
export function bandAt(b: Pick<RiverBand, "sy0" | "sy1" | "ty0" | "ty1">, u: number) {
  const e = ease(Math.min(1, Math.max(0, u)));
  return { top: b.sy0 + (b.ty0 - b.sy0) * e, bottom: b.sy1 + (b.ty1 - b.sy1) * e };
}
