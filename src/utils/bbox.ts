import type { Grid } from '../shape';

export type Cell = { r: number; c: number };

export type BBox = { minR: number; minC: number; rows: number; cols: number };

/** Bounding box covering every cell in the given point sets. */
export function bboxOf(...pointSets: ReadonlyArray<readonly Cell[]>): BBox {
  let minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
  for (const set of pointSets) {
    for (const { r, c } of set) {
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
    }
  }
  return { minR, minC, rows: maxR - minR + 1, cols: maxC - minC + 1 };
}

/** Build a boolean grid of the given (already-offset) size with `cells` marked true. */
export function gridFromCells(cells: readonly Cell[], rows: number, cols: number, minR: number, minC: number): Grid {
  const out: Grid = Array.from({ length: rows }, () => new Array(cols).fill(false));
  for (const { r, c } of cells) out[r - minR][c - minC] = true;
  return out;
}
