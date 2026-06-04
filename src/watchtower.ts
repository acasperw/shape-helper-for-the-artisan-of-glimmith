/**
 * Logic for the in-game "Watchtower" clue. The token sits on a grid vertex (the
 * corner shared by up to four cells) and counts how many distinct stained glass
 * regions meet at that corner.
 *
 * A "region" here is a maximally edge-connected group of cells that share the
 * same colour. Two same-coloured blobs that are not edge-connected are two
 * separate regions, mirroring how separate glass pieces work in the puzzle.
 */

/** Region colour index per cell. `EMPTY` marks an unpainted (border) cell. */
export type RegionGrid = number[][];

/** Sentinel colour for an unpainted cell. */
export const EMPTY = -1;

export function emptyRegionGrid(size: number): RegionGrid {
  return Array.from({ length: size }, () => Array<number>(size).fill(EMPTY));
}

export function resizeRegionGrid(grid: RegionGrid, newSize: number): RegionGrid {
  const next = emptyRegionGrid(newSize);
  const copy = Math.min(grid.length, newSize);
  for (let r = 0; r < copy; r++) {
    for (let c = 0; c < copy; c++) next[r][c] = grid[r][c];
  }
  return next;
}

/** Result of labelling: a per-cell region id (`EMPTY` stays `EMPTY`). */
export type RegionLabels = {
  labels: number[][];
  /** Number of distinct regions found. */
  count: number;
};

/**
 * Flood-fill label every cell into an edge-connected, same-colour region.
 * Empty cells keep the `EMPTY` label and are never part of a region.
 *
 * @param cells Colour grid (`EMPTY` for unpainted cells).
 * @returns Per-cell region ids plus the total region count.
 */
export function labelRegions(cells: RegionGrid): RegionLabels {
  const size = cells.length;
  const labels = Array.from({ length: size }, () => Array<number>(size).fill(EMPTY));
  let next = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (cells[r][c] === EMPTY || labels[r][c] !== EMPTY) continue;
      const colour = cells[r][c];
      const id = next++;
      // Iterative flood fill (4-connectivity) to label the whole region.
      const stack: [number, number][] = [[r, c]];
      labels[r][c] = id;
      while (stack.length > 0) {
        const [cr, cc] = stack.pop()!;
        const neighbours: [number, number][] = [
          [cr - 1, cc],
          [cr + 1, cc],
          [cr, cc - 1],
          [cr, cc + 1],
        ];
        for (const [nr, nc] of neighbours) {
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
          if (labels[nr][nc] !== EMPTY) continue;
          if (cells[nr][nc] !== colour) continue;
          labels[nr][nc] = id;
          stack.push([nr, nc]);
        }
      }
    }
  }
  return { labels, count: next };
}

/** A watchtower's tally for one tile. */
export type WatchtowerResult = {
  /** Distinct region ids meeting at the vertex. */
  regionIds: number[];
  /** Convenience: `regionIds.length` — the number the clue would display. */
  count: number;
};

/**
 * Count the distinct regions meeting at the grid vertex (vr, vc). A vertex sits
 * at the corner shared by up to four cells — (vr-1,vc-1), (vr-1,vc), (vr,vc-1)
 * and (vr,vc) — which is exactly where an in-game Watchtower token rests. The
 * clue tallies how many separate glass regions touch that corner, so a token on
 * the point where four quadrants meet reads 4, while one deep inside a single
 * region reads 1.
 *
 * Vertices range over [0, size] in each axis; corner/edge vertices simply touch
 * fewer cells.
 *
 * @param labels Region labels from {@link labelRegions}.
 * @param vr     Vertex row (0 = top edge, size = bottom edge).
 * @param vc     Vertex column (0 = left edge, size = right edge).
 * @returns The distinct touching region ids and their count.
 */
export function watchtowerVertexCount(
  labels: number[][],
  vr: number,
  vc: number,
): WatchtowerResult {
  const size = labels.length;
  const ids = new Set<number>();
  const cells: [number, number][] = [
    [vr - 1, vc - 1],
    [vr - 1, vc],
    [vr, vc - 1],
    [vr, vc],
  ];
  for (const [r, c] of cells) {
    if (r < 0 || r >= size || c < 0 || c >= size) continue;
    const id = labels[r][c];
    if (id !== EMPTY) ids.add(id);
  }
  return { regionIds: [...ids].sort((a, b) => a - b), count: ids.size };
}

