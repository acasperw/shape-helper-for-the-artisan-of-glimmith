import { generateVariants, type Grid } from './shape';

/** A polyomino represented as its cropped grid (no empty rows/cols around it). */
export type Polyomino = {
  /** Cropped bounding-box grid for the canonical orientation. */
  grid: Grid;
  /** Stable key (canonical free-polyomino key). */
  key: string;
  /** Cell count. */
  size: number;
};

type Cell = { r: number; c: number };

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

function cellsKey(cells: Iterable<Cell>): string {
  // Normalize: translate so min r/c are 0, then sort.
  const arr = [...cells];
  let minR = Infinity;
  let minC = Infinity;
  for (const { r, c } of arr) {
    if (r < minR) minR = r;
    if (c < minC) minC = c;
  }
  const norm = arr.map(({ r, c }) => `${r - minR},${c - minC}`);
  norm.sort();
  return norm.join('|');
}

function cellsToGrid(cells: Iterable<Cell>): Grid {
  const arr = [...cells];
  let minR = Infinity;
  let minC = Infinity;
  let maxR = -Infinity;
  let maxC = -Infinity;
  for (const { r, c } of arr) {
    if (r < minR) minR = r;
    if (c < minC) minC = c;
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }
  const rows = maxR - minR + 1;
  const cols = maxC - minC + 1;
  const grid: Grid = Array.from({ length: rows }, () => Array(cols).fill(false));
  for (const { r, c } of arr) grid[r - minR][c - minC] = true;
  return grid;
}

/** Canonical free-polyomino key: lexicographically smallest variant key. */
function freeKey(grid: Grid): string {
  const variants = generateVariants(grid);
  let best = variants[0].key;
  for (let i = 1; i < variants.length; i++) {
    if (variants[i].key < best) best = variants[i].key;
  }
  return best;
}

/**
 * Enumerate all free polyominoes (deduped by rotation + reflection) of the given size.
 * For n up to 8 this is tractable in the browser (n=8 yields 369 free polyominoes).
 *
 * Results are cached per `n` for the lifetime of the module so that scrubbing
 * the slider back and forth doesn't repeat the work.
 */
const enumerationCache = new Map<number, Polyomino[]>();

export function enumerateFreePolyominoes(n: number): Polyomino[] {
  if (n < 1) return [];
  const cached = enumerationCache.get(n);
  if (cached) return cached;

  const fixedSeen = new Set<string>();
  const freeSeen = new Map<string, Polyomino>();

  const initial: Cell[] = [{ r: 0, c: 0 }];
  const initialKey = cellsKey(initial);
  fixedSeen.add(initialKey);
  expand(initial, n, fixedSeen, freeSeen);

  // Return in a stable order: smaller bounding box first, then by key.
  const result = [...freeSeen.values()].sort((a, b) => {
    const aArea = a.grid.length * a.grid[0].length;
    const bArea = b.grid.length * b.grid[0].length;
    if (aArea !== bArea) return aArea - bArea;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  enumerationCache.set(n, result);
  return result;
}

function expand(
  cells: Cell[],
  target: number,
  fixedSeen: Set<string>,
  freeSeen: Map<string, Polyomino>,
): void {
  if (cells.length === target) {
    const grid = cellsToGrid(cells);
    const key = freeKey(grid);
    if (!freeSeen.has(key)) {
      freeSeen.set(key, { grid, key, size: target });
    }
    return;
  }

  // Collect candidate neighbor cells (not already filled).
  const occupied = new Set(cells.map((c) => `${c.r},${c.c}`));
  const seenCandidates = new Set<string>();
  const candidates: Cell[] = [];
  for (const { r, c } of cells) {
    for (const [dr, dc] of NEIGHBORS) {
      const nr = r + dr;
      const nc = c + dc;
      const k = `${nr},${nc}`;
      if (occupied.has(k) || seenCandidates.has(k)) continue;
      seenCandidates.add(k);
      candidates.push({ r: nr, c: nc });
    }
  }

  for (const cand of candidates) {
    const next = cells.concat(cand);
    const key = cellsKey(next);
    if (fixedSeen.has(key)) continue;
    fixedSeen.add(key);
    expand(next, target, fixedSeen, freeSeen);
  }
}
