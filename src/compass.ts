import type { Grid } from './shape';

/** A compass direction. Mirrors the four arms of an in-game Compass clue. */
export type Direction = 'n' | 's' | 'e' | 'w';

export const DIRECTIONS: readonly Direction[] = ['n', 'e', 's', 'w'] as const;

/** Count of region cells in each direction relative to the compass cell. */
export type CompassCounts = Record<Direction, number>;

/** Which half-planes (relative to the compass cell) a single cell falls into. */
export type CellDirections = Record<Direction, boolean>;

/**
 * Determine which directions a cell at (r, c) lies in relative to the compass
 * cell at (cr, cc). Each direction is an independent half-plane comparison, so
 * a cell to the north-east is both `n` and `e`. A cell sharing the compass row
 * is neither north nor south; one sharing the column is neither east nor west.
 *
 * @param r  Row of the cell being tested.
 * @param c  Column of the cell being tested.
 * @param cr Row of the compass cell.
 * @param cc Column of the compass cell.
 * @returns Flags for each of the four directions.
 */
export function directionsOf(r: number, c: number, cr: number, cc: number): CellDirections {
  return {
    n: r < cr,
    s: r > cr,
    e: c > cc,
    w: c < cc,
  };
}

/**
 * Count how many cells of the region are farther North, South, East and West
 * than the compass cell — exactly what the in-game "Compass" clue reports.
 *
 * The four counts are independent half-planes (the game tooltip: "Counts the
 * cells within the region that are farther north, south, east, or west"):
 *
 * - North  = region cells in a higher row (smaller row index).
 * - South  = region cells in a lower row (larger row index).
 * - East   = region cells in a column to the right (larger col index).
 * - West   = region cells in a column to the left (smaller col index).
 *
 * Because the directions are independent, a cell to the north-east is counted
 * by BOTH the North and the East totals. The compass cell itself is never
 * counted.
 *
 * @param region Boolean grid where `true` marks a cell inside the region.
 * @param cr     Row of the compass cell.
 * @param cc     Column of the compass cell.
 * @returns The four directional counts.
 */
export function countCompass(region: Grid, cr: number, cc: number): CompassCounts {
  const counts: CompassCounts = { n: 0, s: 0, e: 0, w: 0 };
  for (let r = 0; r < region.length; r++) {
    const row = region[r];
    for (let c = 0; c < row.length; c++) {
      if (!row[c]) continue;
      if (r === cr && c === cc) continue;
      if (r < cr) counts.n++;
      if (r > cr) counts.s++;
      if (c > cc) counts.e++;
      if (c < cc) counts.w++;
    }
  }
  return counts;
}
