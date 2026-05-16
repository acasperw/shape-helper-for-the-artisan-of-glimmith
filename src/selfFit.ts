import { cropToBounds, type Grid } from './shape';

export type Cell = { r: number; c: number };

export type SelfFit = {
  /** Cells of the original shape, normalized so its bounding box starts at (0,0). */
  a: Cell[];
  /** Cells of the rotated/flipped copy placed next to A, in the same coord space as A. */
  b: Cell[];
  /** Label of which dihedral variant of A is used for B. */
  variantLabel: string;
  /** Number of unit edges shared between A and B (a rough "snugness" score). */
  contactEdges: number;
};

export type SelfFitResult = {
  fits: SelfFit[];
  totalCells: number;
  /** Drawn shape is not 4-connected — analysis only defined for one connected piece. */
  disconnected: boolean;
  /** No cells drawn. */
  empty: boolean;
};

type CellTransform = (cell: Cell, h: number, w: number) => Cell;

const TRANSFORMS: { label: string; t: CellTransform }[] = [
  { label: 'Original', t: ({ r, c }) => ({ r, c }) },
  { label: 'Rotated 90°', t: ({ r, c }, h) => ({ r: c, c: h - 1 - r }) },
  { label: 'Rotated 180°', t: ({ r, c }, h, w) => ({ r: h - 1 - r, c: w - 1 - c }) },
  { label: 'Rotated 270°', t: ({ r, c }, _h, w) => ({ r: w - 1 - c, c: r }) },
  { label: 'Flipped', t: ({ r, c }, _h, w) => ({ r, c: w - 1 - c }) },
  { label: 'Flipped + 90°', t: ({ r, c }, h, w) => ({ r: w - 1 - c, c: h - 1 - r }) },
  { label: 'Flipped + 180°', t: ({ r, c }, h) => ({ r: h - 1 - r, c }) },
  { label: 'Flipped + 270°', t: ({ r, c }) => ({ r: c, c: r }) },
];

function cellsOf(grid: Grid): Cell[] {
  const out: Cell[] = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c]) out.push({ r, c });
    }
  }
  return out;
}

function normalize(cells: Cell[]): { cells: Cell[]; dr: number; dc: number } {
  let mnR = Infinity, mnC = Infinity;
  for (const { r, c } of cells) {
    if (r < mnR) mnR = r;
    if (c < mnC) mnC = c;
  }
  if (!isFinite(mnR)) return { cells: [], dr: 0, dc: 0 };
  return { cells: cells.map(({ r, c }) => ({ r: r - mnR, c: c - mnC })), dr: -mnR, dc: -mnC };
}

function key(cells: Cell[]): string {
  return cells
    .slice()
    .sort((a, b) => a.r - b.r || a.c - b.c)
    .map((c) => `${c.r},${c.c}`)
    .join('|');
}

function isConnected(cells: Cell[]): boolean {
  if (cells.length === 0) return false;
  const present = new Set(cells.map((c) => `${c.r},${c.c}`));
  const seen = new Set<string>();
  const stack: Cell[] = [cells[0]];
  seen.add(`${cells[0].r},${cells[0].c}`);
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
 * Find every placement of a rotated/flipped copy of the drawn shape that fits
 * snugly against the original (shares at least one edge, no overlap).
 *
 * Two placements are considered the same when they are related by a self-symmetry
 * of the drawn shape (e.g., placing a copy on the left vs. the right of a
 * left-right symmetric shape).
 */
export function findSelfFits(grid: Grid): SelfFitResult {
  const cropped = cropToBounds(grid);
  if (!cropped) return { fits: [], totalCells: 0, disconnected: false, empty: true };

  const baseRaw = cellsOf(cropped);
  if (!isConnected(baseRaw)) {
    return { fits: [], totalCells: baseRaw.length, disconnected: true, empty: false };
  }

  const baseCells = baseRaw; // already in [0,H) x [0,W) frame.
  const baseKey = key(baseCells);
  const baseSet = new Set(baseCells.map((c) => `${c.r},${c.c}`));
  const H = cropped.length;
  const W = cropped[0].length;

  // Self-symmetries of the drawn shape, expressed as functions that map any
  // cell in the original frame to its image (already incorporating the
  // re-normalization translation, so applying to baseCells reproduces baseCells).
  const selfSyms: ((cells: Cell[]) => Cell[])[] = [];
  // Variant cell-lists for B, one per *distinct* dihedral image of A.
  const variantCells: { label: string; cells: Cell[] }[] = [];
  const variantKeys = new Set<string>();

  for (const tr of TRANSFORMS) {
    const mapped = baseCells.map((c) => tr.t(c, H, W));
    const { cells: normed, dr, dc } = normalize(mapped);
    const k = key(normed);
    if (k === baseKey) {
      selfSyms.push((cells) =>
        cells.map((cell) => {
          const m = tr.t(cell, H, W);
          return { r: m.r + dr, c: m.c + dc };
        }),
      );
    }
    if (!variantKeys.has(k)) {
      variantKeys.add(k);
      variantCells.push({ label: tr.label, cells: normed });
    }
  }

  if (selfSyms.length === 0) selfSyms.push((cells) => cells);

  const fits: SelfFit[] = [];
  const seen = new Set<string>();

  for (const v of variantCells) {
    let ch = 0;
    let cw = 0;
    for (const { r, c } of v.cells) {
      if (r + 1 > ch) ch = r + 1;
      if (c + 1 > cw) cw = c + 1;
    }

    // Translate B's (0,0) to (dr, dc). Range chosen so B's bbox is allowed to
    // touch A's bbox on any side.
    for (let dr = -ch; dr <= H; dr++) {
      for (let dc = -cw; dc <= W; dc++) {
        let overlap = false;
        let contact = 0;
        for (const { r, c } of v.cells) {
          const nr = r + dr;
          const nc = c + dc;
          if (baseSet.has(`${nr},${nc}`)) { overlap = true; break; }
          if (baseSet.has(`${nr - 1},${nc}`)) contact++;
          if (baseSet.has(`${nr + 1},${nc}`)) contact++;
          if (baseSet.has(`${nr},${nc - 1}`)) contact++;
          if (baseSet.has(`${nr},${nc + 1}`)) contact++;
        }
        // Require at least two shared edges so the copy actually nests against
        // the original rather than just touching it along a single edge.
        if (overlap || contact < 2) continue;

        const placed = v.cells.map(({ r, c }) => ({ r: r + dr, c: c + dc }));

        // Canonicalize by picking the lex-min key of σ(placed) over all
        // self-symmetries σ of A.
        let canon: string | null = null;
        for (const sym of selfSyms) {
          const k = key(sym(placed));
          if (canon === null || k < canon) canon = k;
        }
        if (canon === null || seen.has(canon)) continue;
        seen.add(canon);

        fits.push({ a: baseCells, b: placed, variantLabel: v.label, contactEdges: contact });
      }
    }
  }

  // Sort: most "snug" first (highest contact edge count), then by variant label
  // so identical-orientation placements group together.
  fits.sort((x, y) => y.contactEdges - x.contactEdges || x.variantLabel.localeCompare(y.variantLabel));

  return { fits, totalCells: baseCells.length, disconnected: false, empty: false };
}
