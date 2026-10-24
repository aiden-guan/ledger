import type { FieldData, FieldLeak } from "@/lib/field/model";

/*
 * Where every record sits on the field: one column per day, and height by amount on a log scale.
 * Money in (sales, deposits) rises above the axis; money out (payments) hangs below it. Every sale
 * of a product shares its price, so each product draws a lane. Squares that would land on the same
 * cell stack away from the axis, so every record keeps a square of its own.
 */

const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A half's visible range of amounts, in log10 cents. */
export type Range = [number, number];
export interface Domains {
  in: Range;
  out: Range;
}

export interface Geometry {
  width: number;
  height: number;
  /** Pitch of one square, in CSS pixels. */
  cell: number;
  /** Side of the square drawn inside each cell. */
  size: number;
  left: number;
  /** Space above the squares, for labels. */
  top: number;
  cols: number;
  todayCol: number;
  rows: number;
  /** Top of the axis row: money in sits above it, money out below the next row. */
  axis: number;
  /** Bottom edge of the money-out half. */
  bottom: number;
  months: { x: number; label: string }[];
  dayStart: number;
  /** Where payments still waiting on a person are drawn. */
  seamX: number;
  /** Records in drawing order, with what placement needs. */
  items: { id: string; col: number; log: number; up: boolean }[];
  base: Domains;
}

export interface Placed {
  x: number;
  y: number;
  col: number;
  /** Outside the zoomed range: pinned to the edge and drawn faint. */
  clipped: boolean;
}

export const LABEL_ROOM = 64;
const log = (cents: number) => Math.log10(Math.max(100, Math.abs(cents)));

export function dayStart(ms: number) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Lays out the field to fit `width`, and `height` when given (the rest of the screen needs room too). */
export function layoutField(field: FieldData, width: number, narrow: boolean, height = 0): Geometry {
  const left = narrow ? 0 : 44;
  // Room on the right for payments waiting on a person.
  const seamCols = 5;
  const room = width - left - (narrow ? 4 : 12);
  // Squares stay at least 3px wide; a screen too narrow for every day shows the most recent ones.
  const days = Math.max(0, Math.floor((field.asOf - dayStart(field.start)) / DAY));
  const lastCol = Math.min(days, Math.max(30, Math.floor(room / 3) - seamCols - 3));
  const day0 = dayStart(field.asOf) - lastCol * DAY;
  const todayCol = lastCol + 2;
  const cols = todayCol + 1;
  const cell = Math.max(3, Math.min(9, Math.floor(room / (cols + seamCols))));
  const size = cell >= 5 ? cell - 1 : cell - 0.5;
  const top = LABEL_ROOM;
  const fit = height ? Math.floor((height - 2 * top - 20 - cell) / (2 * cell)) : 26;
  const rows = Math.max(narrow ? 16 : 14, Math.min(narrow ? 22 : 30, fit));
  const axis = top + rows * cell;
  const bottom = axis + cell + rows * cell;

  const items = field.records
    .map((r) => ({ id: r.id, col: r.live ? todayCol : Math.min(lastCol, Math.floor((r.at - day0) / DAY)), log: log(r.cents), up: r.kind !== "out" }))
    .filter((i) => i.col >= 0)
    .sort((a, b) => a.col - b.col || a.log - b.log);
  const span = (list: typeof items): Range => {
    if (!list.length) return [3, 5];
    const lo = Math.min(...list.map((i) => i.log));
    const hi = Math.max(...list.map((i) => i.log));
    return [lo - 0.08, hi + 0.06];
  };

  const months: Geometry["months"] = [];
  for (let d = new Date(day0); d.getTime() <= field.asOf; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    const first = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    if (first >= day0) months.push({ x: left + Math.floor((first - day0) / DAY) * cell, label: MONTHS[new Date(first).getUTCMonth()] });
  }

  return {
    width,
    height: bottom + 20 + LABEL_ROOM,
    cell,
    size,
    left,
    top,
    cols,
    todayCol,
    rows,
    axis,
    bottom,
    months,
    dayStart: day0,
    seamX: left + (todayCol + 2) * cell,
    items,
    base: { in: span(items.filter((i) => i.up)), out: span(items.filter((i) => !i.up)) },
  };
}

/** Row for an amount in a half, before stacking. Fractional; may fall outside [0, rows). */
export function rowOf(g: Geometry, range: Range, logCents: number) {
  return ((logCents - range[0]) / (range[1] - range[0])) * g.rows;
}

/** Top edge of a row in a half. */
export function yOf(g: Geometry, up: boolean, row: number) {
  return up ? g.axis - (row + 1) * g.cell : g.axis + g.cell + row * g.cell;
}

/** The y of an amount as a line through the middle of its row, for marks drawn across a half. */
export function lineY(g: Geometry, up: boolean, range: Range, cents: number) {
  const row = Math.max(0, Math.min(g.rows - 1, Math.floor(rowOf(g, range, log(cents)))));
  return yOf(g, up, row) + g.size / 2;
}

const occupied = new Uint8Array(1);
let grid = occupied;

/** Places every record for the given ranges. */
export function place(g: Geometry, d: Domains): Map<string, Placed> {
  const out = new Map<string, Placed>();
  const need = g.cols * g.rows * 2;
  if (grid.length < need) grid = new Uint8Array(need);
  else grid.fill(0, 0, need);
  for (const it of g.items) {
    const range = it.up ? d.in : d.out;
    const raw = Math.floor(rowOf(g, range, it.log));
    const clipped = raw < 0 || raw >= g.rows;
    let row = Math.max(0, Math.min(g.rows - 1, raw));
    const base = (it.up ? 0 : g.cols * g.rows) + it.col * g.rows;
    if (!clipped) {
      while (row < g.rows - 1 && grid[base + row]) row++;
      grid[base + row] = 1;
    }
    out.set(it.id, { x: g.left + it.col * g.cell, y: yOf(g, it.up, row), col: it.col, clipped });
  }
  return out;
}

/** The record under a point, if any. */
export function recordAt(g: Geometry, pos: Map<string, Placed>, x: number, y: number): string | null {
  const col = Math.floor((x - g.left) / g.cell);
  if (col < 0 || col >= g.cols) return null;
  let best: string | null = null;
  for (const [id, p] of pos) {
    if (p.col !== col || p.clipped) continue;
    if (y >= p.y - 1 && y < p.y + g.cell + 1) {
      best = id;
      break;
    }
  }
  return best;
}

/** The range to zoom a half to so one finding's evidence fills it. */
export function focusDomains(g: Geometry, leak: FieldLeak | null, field: FieldData): Domains {
  if (!leak) return g.base;
  const amounts = leak.records.map((id) => field.records.find((r) => r.id === id)?.cents ?? 0).filter((c) => c > 0);
  const extra = [...leak.prices.map((p) => p.cents), ...(leak.mark?.cents ?? [])];
  const all = [...amounts, ...extra];
  if (!all.length) return g.base;
  const lo = log(Math.min(...all));
  const hi = log(Math.max(...all));
  const pad = Math.max(0.09, (hi - lo) * 0.35);
  const range: Range = [lo - pad, hi + pad];
  const up = leak.type === "MARGIN_EROSION" || leak.type === "PRICING_OPPORTUNITY";
  return up ? { in: range, out: g.base.out } : { in: g.base.in, out: range };
}
