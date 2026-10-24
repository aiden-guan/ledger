/*
 * The quadtree behind the LedgerLens visuals. A cell splits into four while it still holds
 * something worth a closer look, so the tree ends up coarse where the books are ordinary and
 * fine where a leak is. Coordinates are unit-square fractions; callers scale them to pixels.
 */

export interface QPoint {
  x: number;
  y: number;
  /** Index of the leak this record belongs to, or -1. */
  hot: number;
}

export interface QCell {
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  split: boolean;
  /** Smallest leak index among the cell's records, or -1. */
  hot: number;
  /** Indices into the point list. */
  points: number[];
}

export interface QuadtreeOptions {
  /** Every cell splits down to this depth, so the field always reads as a grid. */
  baseDepth: number;
  /** Cells holding a leak keep splitting down to this depth. */
  hotDepth: number;
  /** Cells holding more than this many records split, down to densityDepth. */
  density: number;
  densityDepth: number;
}

/** Builds the tree breadth first, so a parent always comes before its children. */
export function buildQuadtree(points: QPoint[], opts: QuadtreeOptions): QCell[] {
  const cells: QCell[] = [];
  const root: QCell = { x: 0, y: 0, w: 1, h: 1, depth: 0, split: false, hot: -1, points: points.map((_, i) => i) };
  const queue = [root];
  while (queue.length) {
    const c = queue.shift()!;
    c.hot = c.points.reduce((h, i) => (points[i].hot >= 0 && (h < 0 || points[i].hot < h) ? points[i].hot : h), -1);
    const split =
      c.depth < opts.baseDepth || (c.hot >= 0 && c.depth < opts.hotDepth) || (c.points.length > opts.density && c.depth < opts.densityDepth);
    c.split = split;
    cells.push(c);
    if (!split) continue;
    const hw = c.w / 2;
    const hh = c.h / 2;
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      const x = c.x + dx * hw;
      const y = c.y + dy * hh;
      const inside = c.points.filter((i) => {
        const p = points[i];
        return p.x >= x && (p.x < x + hw || (dx === 1 && p.x <= x + hw)) && p.y >= y && (p.y < y + hh || (dy === 1 && p.y <= y + hh));
      });
      queue.push({ x, y, w: hw, h: hh, depth: c.depth + 1, split: false, hot: -1, points: inside });
    }
  }
  return cells;
}

/** The leaf cell containing (x, y). */
export function leafAt(cells: QCell[], x: number, y: number): QCell | undefined {
  let found: QCell | undefined;
  for (const c of cells) if (!c.split && x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) found = c;
  return found;
}

/**
 * Splits a coverage mask (for example rasterised type) wherever a cell is partly covered, down to
 * maxDepth. Returns the leaves that are mostly inside the shape: large squares in the middle of a
 * stroke, finer ones along its edge.
 */
export function coverageQuadtree(coverage: (x: number, y: number, w: number, h: number) => number, w: number, h: number, size: number, maxDepth: number) {
  const out: { x: number; y: number; s: number; depth: number }[] = [];
  const visit = (x: number, y: number, s: number, depth: number) => {
    if (x >= w || y >= h) return;
    const c = coverage(x, y, Math.min(s, w - x), Math.min(s, h - y));
    if (c <= 0.02) return;
    if (c >= 0.98 || depth >= maxDepth) {
      if (c >= 0.5) out.push({ x, y, s, depth });
      return;
    }
    const half = s / 2;
    visit(x, y, half, depth + 1);
    visit(x + half, y, half, depth + 1);
    visit(x, y + half, half, depth + 1);
    visit(x + half, y + half, half, depth + 1);
  };
  for (let y = 0; y < h; y += size) for (let x = 0; x < w; x += size) visit(x, y, size, 0);
  return out;
}
