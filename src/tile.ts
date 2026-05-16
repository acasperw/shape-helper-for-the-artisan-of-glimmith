import { cropToBounds, generateVariants, type Grid } from './shape';
import type { Cell } from './selfFit';

export type Placement = Cell[];

export type TilingResult = {
  /** First exact tiling found, in placement order; null if none. */
  solution: Placement[] | null;
  emptyBoard: boolean;
  emptyPiece: boolean;
  /** Piece cell-count doesn't divide board cell-count, so no exact tiling exists. */
  sizeMismatch: boolean;
  disconnectedPiece: boolean;
  /** Exceeded the configured cell caps. */
  tooLarge: boolean;
  /** Search ran out of iteration budget before finishing. */
  aborted: boolean;
};

const MAX_BOARD_CELLS = 80;
const MAX_PIECE_CELLS = 16;
const ITERATION_BUDGET = 2_000_000;

function cellsOf(grid: Grid): Cell[] {
  const out: Cell[] = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c]) out.push({ r, c });
    }
  }
  return out;
}

function isConnected(cells: Cell[]): boolean {
  if (cells.length === 0) return false;
  const present = new Set(cells.map((c) => `${c.r},${c.c}`));
  const seen = new Set<string>([`${cells[0].r},${cells[0].c}`]);
  const stack: Cell[] = [cells[0]];
  while (stack.length) {
    const { r, c } = stack.pop()!;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const k = `${r + dr},${c + dc}`;
      if (present.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push({ r: r + dr, c: c + dc });
      }
    }
  }
  return seen.size === cells.length;
}

/**
 * Find one way to tile every filled cell of `board` using rotated/flipped
 * copies of `piece`, with no overlap. Uses backtracking: at each step we pick
 * the lex-smallest uncovered cell and try every piece orientation whose anchor
 * (its own lex-smallest cell) covers it.
 */
export function tileRegion(board: Grid, piece: Grid): TilingResult {
  const base: TilingResult = {
    solution: null,
    emptyBoard: false,
    emptyPiece: false,
    sizeMismatch: false,
    disconnectedPiece: false,
    tooLarge: false,
    aborted: false,
  };

  const boardCells = cellsOf(board);
  if (boardCells.length === 0) return { ...base, emptyBoard: true };

  const pieceCellsRaw = cellsOf(piece);
  if (pieceCellsRaw.length === 0) return { ...base, emptyPiece: true };

  if (boardCells.length > MAX_BOARD_CELLS || pieceCellsRaw.length > MAX_PIECE_CELLS) {
    return { ...base, tooLarge: true };
  }
  if (boardCells.length % pieceCellsRaw.length !== 0) return { ...base, sizeMismatch: true };

  const cropped = cropToBounds(piece)!;
  if (!isConnected(cellsOf(cropped))) return { ...base, disconnectedPiece: true };

  // Each variant is normalized so its lex-smallest cell sits at (0,0); that
  // makes "anchor on the first uncovered board cell" a simple translation.
  const variantKeys = new Set<string>();
  const variants: Cell[][] = [];
  for (const v of generateVariants(cropped)) {
    const cs = cellsOf(v.grid).sort((a, b) => a.r - b.r || a.c - b.c);
    const anchor = cs[0];
    const offsets = cs.map(({ r, c }) => ({ r: r - anchor.r, c: c - anchor.c }));
    const key = offsets.map((c) => `${c.r},${c.c}`).join('|');
    if (variantKeys.has(key)) continue;
    variantKeys.add(key);
    variants.push(offsets);
  }

  const boardSet = new Set(boardCells.map((c) => `${c.r},${c.c}`));
  const sortedBoard = boardCells.slice().sort((a, b) => a.r - b.r || a.c - b.c);
  const covered = new Set<string>();
  const placements: Placement[] = [];

  let iterations = 0;
  let aborted = false;

  function firstUncovered(startIdx: number): { idx: number; cell: Cell } | null {
    for (let i = startIdx; i < sortedBoard.length; i++) {
      const c = sortedBoard[i];
      if (!covered.has(`${c.r},${c.c}`)) return { idx: i, cell: c };
    }
    return null;
  }

  function solve(startIdx: number): boolean {
    if (++iterations > ITERATION_BUDGET) {
      aborted = true;
      return false;
    }
    const next = firstUncovered(startIdx);
    if (!next) return true;
    const { idx, cell } = next;

    for (const offsets of variants) {
      const placed: Cell[] = [];
      let ok = true;
      for (const off of offsets) {
        const r = cell.r + off.r;
        const c = cell.c + off.c;
        const k = `${r},${c}`;
        if (!boardSet.has(k) || covered.has(k)) { ok = false; break; }
        placed.push({ r, c });
      }
      if (!ok) continue;
      for (const p of placed) covered.add(`${p.r},${p.c}`);
      placements.push(placed);
      if (solve(idx + 1)) return true;
      placements.pop();
      for (const p of placed) covered.delete(`${p.r},${p.c}`);
      if (aborted) return false;
    }
    return false;
  }

  const solved = solve(0);
  return { ...base, solution: solved ? placements.slice() : null, aborted };
}
