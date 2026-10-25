import type { FieldData, FieldRecord } from "@/lib/field/model";

/*
 * Where every record sits: one square each, one column per week. Money in stacks up from the axis
 * and money out hangs below it, so the wall reads as six months of the business at a glance. In
 * every week, sales sit by product in the same order, so one product's sales line up into a band
 * across the weeks; deposits cap the stack. Payments the screen stops wait at a gate on the right.
 */

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Room above the wall and below the month labels, for the labels findings get. */
export const LABEL_ROOM = 52;
const MONTH_ROW = 20;
/** Payments the live feed can add to this week, kept room for so the wall does not jump. */
const FEED_ROOM = 10;

export interface Spot {
  x: number;
  y: number;
  week: number;
  up: boolean;
}

export interface Wall {
  width: number;
  height: number;
  /** Pitch of one square, and the side drawn inside it. */
  cell: number;
  size: number;
  /** Squares side by side in one week. */
  k: number;
  /** Width of one week, air included. */
  step: number;
  left: number;
  weeks: number;
  /** Bottom edge of money in; money out starts one cell lower. */
  base: number;
  /** Highest and lowest edges either half can reach. */
  ceiling: number;
  floor: number;
  /** Right edge of the last week. */
  right: number;
  /** Where payments waiting on a person are drawn. */
  gateX: number;
  months: { x: number; label: string }[];
  pos: Map<string, Spot>;
  /** Each week's records, from the axis outward. */
  stacks: { in: string[]; out: string[] }[];
}

const weekStart = (ms: number) => {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - ((d.getUTCDay() + 6) % 7) * DAY;
};

/** Lays the wall out to fit `width` and, when given, `height`. Narrow screens show the last quarter. */
export function layoutWall(field: FieldData, width: number, narrow: boolean, height: number): Wall {
  const left = narrow ? 0 : 28;
  const first = weekStart(field.start);
  const lastWeek = Math.round((weekStart(field.asOf) - first) / WEEK);
  const total = lastWeek + 1;
  const weeks = narrow ? Math.min(total, 13) : total;
  const skip = total - weeks;

  // Products and vendors keep one order every week: the biggest first, nearest the axis.
  const rank = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const r of field.records) if (!r.live) counts.set(`${r.kind}:${r.group}`, (counts.get(`${r.kind}:${r.group}`) ?? 0) + 1);
  [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).forEach(([key], i) => rank.set(key, i));
  const order = (r: FieldRecord) => (r.live ? 1e6 : r.kind === "in" ? 1e5 : 0) + (rank.get(`${r.kind}:${r.group}`) ?? 9e4);

  const buckets: { in: FieldRecord[]; out: FieldRecord[] }[] = Array.from({ length: weeks }, () => ({ in: [], out: [] }));
  for (const r of field.records) {
    const w = (r.live ? lastWeek : Math.min(lastWeek, Math.floor((r.at - first) / WEEK))) - skip;
    if (w < 0) continue;
    buckets[w][r.kind === "out" ? "out" : "in"].push(r);
  }
  for (const b of buckets) for (const list of [b.in, b.out]) list.sort((x, y) => order(x) - order(y) || x.at - y.at);
  const settled = (list: FieldRecord[]) => list.filter((r) => !r.live).length;
  const maxIn = Math.max(1, ...buckets.map((b) => settled(b.in)));
  const maxOut = Math.max(1, ...buckets.map((b, i) => settled(b.out) + (i === weeks - 1 ? FEED_ROOM : 0)));

  // The widest squares that fit: weeks of k squares with half a cell of air between them, a gate,
  // and both halves within the height.
  const room = width - left - 2;
  const tall = height ? height - 2 * LABEL_ROOM - MONTH_ROW : 1e9;
  let best = { k: 3, cell: 0 };
  for (const k of [2, 3, 4, 5]) {
    const cols = weeks * (k + 0.5) + 2.5;
    const rows = Math.ceil(maxIn / k) + Math.ceil(maxOut / k) + 1;
    const cell = Math.min(16, Math.floor(room / cols), Math.floor(tall / rows));
    if (cell > best.cell) best = { k, cell };
  }
  const { k } = best;
  const cell = Math.max(4, best.cell);
  const size = cell >= 8 ? cell - 2 : cell - 1;
  const rowsIn = Math.ceil(maxIn / k);
  const rowsOut = Math.ceil(maxOut / k);
  const ceiling = LABEL_ROOM;
  const base = ceiling + rowsIn * cell;
  const floor = base + cell + rowsOut * cell;
  const step = k * cell + Math.round(cell / 2);
  const right = left + weeks * step - Math.round(cell / 2);

  const pos = new Map<string, Spot>();
  const stacks = buckets.map((b, w) => {
    const x0 = left + w * step;
    b.in.forEach((r, i) => pos.set(r.id, { x: x0 + (i % k) * cell, y: base - (Math.floor(i / k) + 1) * cell, week: w, up: true }));
    b.out.forEach((r, i) => pos.set(r.id, { x: x0 + (i % k) * cell, y: base + cell + Math.floor(i / k) * cell, week: w, up: false }));
    return { in: b.in.map((r) => r.id), out: b.out.map((r) => r.id) };
  });

  const months: Wall["months"] = [];
  for (let w = 0; w < weeks; w++) {
    const monday = first + (w + skip) * WEEK;
    for (let d = 0; d < 7; d++) {
      const day = new Date(monday + d * DAY);
      if (day.getUTCDate() === 1) months.push({ x: left + w * step, label: MONTHS[day.getUTCMonth()] });
    }
  }

  return {
    width,
    height: floor + MONTH_ROW + LABEL_ROOM,
    cell,
    size,
    k,
    step,
    left,
    weeks,
    base,
    ceiling,
    floor,
    right,
    gateX: right + 2 * cell,
    months,
    pos,
    stacks,
  };
}

/** The outer edge of a week's stack in one half: where a leader to that week starts. */
export function stackEdge(wall: Wall, week: number, up: boolean) {
  const n = wall.stacks[week]?.[up ? "in" : "out"].length ?? 0;
  const rows = Math.ceil(n / wall.k);
  return up ? wall.base - rows * wall.cell - 3 : wall.base + wall.cell + rows * wall.cell + 2;
}

/** The record under a point, if any. */
export function recordAt(wall: Wall, x: number, y: number): string | null {
  const week = Math.floor((x - wall.left) / wall.step);
  const c = Math.floor((x - wall.left - week * wall.step) / wall.cell);
  if (week < 0 || week >= wall.weeks || c >= wall.k) return null;
  const up = y < wall.base;
  const row = up ? Math.floor((wall.base - y) / wall.cell) : Math.floor((y - wall.base - wall.cell) / wall.cell);
  if (row < 0) return null;
  return wall.stacks[week][up ? "in" : "out"][row * wall.k + c] ?? null;
}
