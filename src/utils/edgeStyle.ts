import type { CSSProperties } from 'react';
import type { Grid } from '../shape';

/**
 * Compute the perimeter-edge CSS variables for a filled cell. Each variable is
 * 1 when the cell has no filled neighbor on that side (so a thick outline is
 * drawn there) and 0 otherwise. This produces the "merged region" outline seen
 * in the game where only the outer border of the shape is rendered.
 */
export function edgeStyle(grid: Grid, r: number, c: number): CSSProperties {
  const filled = (rr: number, cc: number) =>
    rr >= 0 && rr < grid.length && cc >= 0 && cc < grid[rr].length && grid[rr][cc];
  return {
    ['--row' as string]: r,
    ['--col' as string]: c,
    ['--et' as string]: filled(r - 1, c) ? 0 : 1,
    ['--er' as string]: filled(r, c + 1) ? 0 : 1,
    ['--eb' as string]: filled(r + 1, c) ? 0 : 1,
    ['--el' as string]: filled(r, c - 1) ? 0 : 1,
  };
}

/** CSS variables + template strings used by every grid/mini-grid. */
export function gridTemplateStyle(rows: number, cols: number, cellVar = '--cell-size'): CSSProperties {
  return {
    ['--cols' as string]: cols,
    ['--rows' as string]: rows,
    gridTemplateColumns: `repeat(${cols}, var(${cellVar}))`,
    gridTemplateRows: `repeat(${rows}, var(${cellVar}))`,
  };
}
