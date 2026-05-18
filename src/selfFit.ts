import { cropToBounds, type Grid } from './shape';

export type Cell = { r: number; c: number };

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

// Pack a cell into a single integer key. Coords can go slightly negative when
// the placed copy sits up/left of the original; the offset keeps keys positive
// and the stride is comfortably larger than any plausible cropped-shape
// dimension (cells capped at ~20 wide today).
const PACK_OFFSET = 128;
const PACK_STRIDE = 256;
const pack = (r: number, c: number) => (r + PACK_OFFSET) * PACK_STRIDE + (c + PACK_OFFSET);

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
  const present = new Set<number>();
  for (const c of cells) present.add(pack(c.r, c.c));
  const seen = new Set<number>([pack(cells[0].r, cells[0].c)]);
  const stack: Cell[] = [cells[0]];
  while (stack.length) {
    const { r, c } = stack.pop()!;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nr = r + dr, nc = c + dc;
      const k = pack(nr, nc);
      if (present.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push({ r: nr, c: nc });
      }
    }
  }
  return seen.size === cells.length;
}

/* ---------- N-copy clusters (N ≥ 2) ---------- */

export type SelfClusterPiece = {
  /** Cells of this placed copy, in the same coordinate frame as A. */
  cells: Cell[];
  /** Which dihedral image of A this copy uses ("Original", "Rotated 90°", …). */
  label: string;
};

export type SelfCluster = {
  /** Cells of the original A, normalized so its bbox starts at (0,0). */
  a: Cell[];
  /** The N-1 placed copies, in the order they were found. */
  pieces: SelfClusterPiece[];
  /** Total unit edges shared between any two pieces in the cluster. */
  contactEdges: number;
  /** True iff the cluster's union of cells exactly fills its bounding box. */
  isRectangle: boolean;
};

export type SelfClustersResult = {
  /** Number of copies in each returned cluster (including the original). */
  n: number;
  clusters: SelfCluster[];
  totalCells: number;
  disconnected: boolean;
  empty: boolean;
  /** Shape is bigger than the cap we apply for this N. */
  tooLarge: boolean;
  maxCells: number;
  /** Search aborted because it hit its iteration budget. */
  aborted: boolean;
};

/** Cell-count caps per cluster size — tighter for larger N because the
 *  search grows roughly like P^(N-1) where P is the number of valid
 *  single-copy placements against A. */
const SELF_CLUSTER_CAPS: Record<number, { maxCells: number; budget: number }> = {
  2: { maxCells: 30, budget: 2_000_000 },
  3: { maxCells: 16, budget: 6_000_000 },
  4: { maxCells: 12, budget: 14_000_000 },
};

export const SELF_CLUSTER_MIN_N = 2;
export const SELF_CLUSTER_MAX_N = 4;

/**
 * Find every way (N-1) rotated/flipped copies of the drawn shape can sit
 * snugly against the original to form an N-piece cluster.
 *
 * Snugness rule: each newly placed copy must share ≥ 2 unit edges with the
 * partial cluster built so far, and no two copies may overlap.
 *
 * Duplicates are collapsed by canonicalizing the unordered set of placed
 * copies under A's self-symmetries (so mirror-image clusters merge when A
 * itself is symmetric).
 */
export function findSelfClusters(grid: Grid, n: number): SelfClustersResult {
  const cfg = SELF_CLUSTER_CAPS[n];
  if (!cfg) {
    throw new Error(`findSelfClusters: unsupported n=${n} (expected 2–4)`);
  }
  const { maxCells, budget } = cfg;

  const empty = (over: Partial<SelfClustersResult>): SelfClustersResult => ({
    n,
    clusters: [],
    totalCells: 0,
    disconnected: false,
    empty: false,
    tooLarge: false,
    maxCells,
    aborted: false,
    ...over,
  });

  const cropped = cropToBounds(grid);
  if (!cropped) return empty({ empty: true });

  const baseRaw = cellsOf(cropped);
  if (!isConnected(baseRaw)) {
    return empty({ totalCells: baseRaw.length, disconnected: true });
  }
  if (baseRaw.length > maxCells) {
    return empty({ totalCells: baseRaw.length, tooLarge: true });
  }

  const baseCells = baseRaw;
  const baseKey = key(baseCells);
  const H = cropped.length;
  const W = cropped[0].length;

  // Self-symmetries of A: maps from cell-list in A's frame back into A's frame.
  const selfSyms: ((cells: readonly Cell[]) => Cell[])[] = [];
  // Distinct dihedral images of A — the catalog of placeable copies.
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
  if (selfSyms.length === 0) selfSyms.push((cells) => cells.map((c) => ({ r: c.r, c: c.c })));

  const variantInfo = variantCells.map((v) => {
    let h = 0, w = 0;
    for (const { r, c } of v.cells) {
      if (r + 1 > h) h = r + 1;
      if (c + 1 > w) w = c + 1;
    }
    return { ...v, h, w };
  });

  const baseSet = new Set<number>();
  for (const c of baseCells) baseSet.add(pack(c.r, c.c));

  type Placement = { label: string; cells: Cell[] };

  // Enumerate every placement of one copy that at least touches A (we'll
  // re-check "≥2 edges with current cluster" at each search step).
  const placementsVsA: Placement[] = [];
  for (const v of variantInfo) {
    for (let dr = -v.h; dr <= H; dr++) {
      for (let dc = -v.w; dc <= W; dc++) {
        let overlap = false;
        let contact = 0;
        for (const { r, c } of v.cells) {
          const nr = r + dr;
          const nc = c + dc;
          if (baseSet.has(pack(nr, nc))) { overlap = true; break; }
          if (baseSet.has(pack(nr - 1, nc))) contact++;
          if (baseSet.has(pack(nr + 1, nc))) contact++;
          if (baseSet.has(pack(nr, nc - 1))) contact++;
          if (baseSet.has(pack(nr, nc + 1))) contact++;
        }
        if (overlap || contact === 0) continue;
        const cells = v.cells.map(({ r, c }) => ({ r: r + dr, c: c + dc }));
        placementsVsA.push({ label: v.label, cells });
      }
    }
  }

  const clusters: SelfCluster[] = [];
  const seen = new Set<string>();
  const unionSet = new Set<number>(baseSet);
  const picked: Placement[] = [];
  let iters = 0;
  let aborted = false;

  const emit = (contactSum: number) => {
    // Canonicalize: lex-min over self-symmetries of A of the sorted
    // multi-set of piece keys. (Order of A's self-symmetries swaps cluster
    // pieces that are mirror images of each other under A's symmetry.)
    let canon: string | null = null;
    for (const sym of selfSyms) {
      const ks: string[] = [];
      for (const p of picked) ks.push(key(sym(p.cells)));
      ks.sort();
      const s = ks.join('#');
      if (canon === null || s < canon) canon = s;
    }
    if (canon === null || seen.has(canon)) return;
    seen.add(canon);

    // Bounding box of the union — used for the rectangle predicate.
    let mnR = Infinity, mnC = Infinity, mxR = -Infinity, mxC = -Infinity;
    for (const { r, c } of baseCells) {
      if (r < mnR) mnR = r; if (r > mxR) mxR = r;
      if (c < mnC) mnC = c; if (c > mxC) mxC = c;
    }
    for (const p of picked) {
      for (const { r, c } of p.cells) {
        if (r < mnR) mnR = r; if (r > mxR) mxR = r;
        if (c < mnC) mnC = c; if (c > mxC) mxC = c;
      }
    }
    const rows = mxR - mnR + 1;
    const cols = mxC - mnC + 1;
    const unionCells = baseCells.length * n; // all pieces same size, disjoint.
    const isRectangle = rows * cols === unionCells;

    clusters.push({
      a: baseCells,
      pieces: picked.map((p) => ({ cells: p.cells, label: p.label })),
      contactEdges: contactSum,
      isRectangle,
    });
  };

  // Returns false if the search hit its budget and should bail entirely.
  const recurse = (depth: number, contactSum: number): boolean => {
    if (depth === n - 1) {
      emit(contactSum);
      return true;
    }
    for (let i = 0; i < placementsVsA.length; i++) {
      if (++iters > budget) { aborted = true; return false; }
      const p = placementsVsA[i];
      let overlap = false;
      let contact = 0;
      for (const { r, c } of p.cells) {
        const k = pack(r, c);
        if (unionSet.has(k)) { overlap = true; break; }
        if (unionSet.has(pack(r - 1, c))) contact++;
        if (unionSet.has(pack(r + 1, c))) contact++;
        if (unionSet.has(pack(r, c - 1))) contact++;
        if (unionSet.has(pack(r, c + 1))) contact++;
      }
      if (overlap || contact < 2) continue;
      for (const { r, c } of p.cells) unionSet.add(pack(r, c));
      picked.push(p);
      const ok = recurse(depth + 1, contactSum + contact);
      picked.pop();
      for (const { r, c } of p.cells) unionSet.delete(pack(r, c));
      if (!ok) return false;
    }
    return true;
  };

  recurse(0, 0);

  // Sort: rectangles first, then snugger (more contact edges), then by labels.
  clusters.sort((x, y) => {
    if (x.isRectangle !== y.isRectangle) return x.isRectangle ? -1 : 1;
    if (x.contactEdges !== y.contactEdges) return y.contactEdges - x.contactEdges;
    for (let i = 0; i < x.pieces.length; i++) {
      const cmp = x.pieces[i].label.localeCompare(y.pieces[i].label);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });

  return {
    n,
    clusters,
    totalCells: baseCells.length,
    disconnected: false,
    empty: false,
    tooLarge: false,
    maxCells,
    aborted,
  };
}
