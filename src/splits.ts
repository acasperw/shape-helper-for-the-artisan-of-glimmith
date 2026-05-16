import { generateVariants, type Grid } from './shape';

export type Cell = { r: number; c: number };

export type Split = {
  /** Cells of piece A in original grid coordinates. */
  a: Cell[];
  /** Cells of piece B in original grid coordinates. */
  b: Cell[];
  /** Canonical key of piece A (lex-min over the 8 dihedral images of its cropped form). */
  canonA: string;
  /** Canonical key of piece B. */
  canonB: string;
  /** True when A and B are the same shape up to rotation/flip. */
  congruent: boolean;
};

export type SplitsResult = {
  splits: Split[];
  totalCells: number;
  /** Shape exceeds the cell-count cap; no splits computed. */
  tooLarge: boolean;
  /** Shape is not 4-connected; splits are only defined for a single connected piece. */
  disconnected: boolean;
  /** Search exceeded the iteration budget; results are partial. */
  aborted: boolean;
  /** Cap that was applied. */
  maxCells: number;
};

const DEFAULT_MAX_CELLS = 35;
/** Hard limit on ESU recursion steps so dense shapes can't lock up the worker. */
const DEFAULT_ITERATION_BUDGET = 50_000_000;

/**
 * Enumerate every way to partition a single connected polyomino into exactly two
 * non-empty contiguous pieces. Pairs are deduplicated by the unordered pair of
 * canonical keys, so mirror/rotated equivalents collapse.
 *
 * Uses Wernicke's ESU algorithm to enumerate connected subgraphs once each,
 * then keeps only those whose complement is also connected. Bitmasks are
 * BigInts so we can handle polyominos up to ~50 cells.
 */
export function findSplits(
  grid: Grid,
  maxCells: number = DEFAULT_MAX_CELLS,
  iterationBudget: number = DEFAULT_ITERATION_BUDGET,
): SplitsResult {
  const cells: Cell[] = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c]) cells.push({ r, c });
    }
  }
  const n = cells.length;
  if (n < 2) {
    return { splits: [], totalCells: n, tooLarge: false, disconnected: false, aborted: false, maxCells };
  }
  if (n > maxCells) {
    return { splits: [], totalCells: n, tooLarge: true, disconnected: false, aborted: false, maxCells };
  }

  // Build cell-index map and 4-neighbour adjacency.
  const idxOf = new Map<number, number>();
  const key = (r: number, c: number) => r * 2048 + c;
  for (let i = 0; i < n; i++) idxOf.set(key(cells[i].r, cells[i].c), i);
  const neighbours: number[][] = cells.map(({ r, c }) => {
    const out: number[] = [];
    const u = idxOf.get(key(r - 1, c)); if (u !== undefined) out.push(u);
    const d = idxOf.get(key(r + 1, c)); if (d !== undefined) out.push(d);
    const l = idxOf.get(key(r, c - 1)); if (l !== undefined) out.push(l);
    const rt = idxOf.get(key(r, c + 1)); if (rt !== undefined) out.push(rt);
    return out;
  });

  if (!isConnected(neighbours, n)) {
    return { splits: [], totalCells: n, tooLarge: false, disconnected: true, aborted: false, maxCells };
  }

  // Pre-compute BigInt powers of two and per-cell neighbour masks once, so the
  // hot ESU loop never allocates `1n << BigInt(i)` or re-iterates neighbours.
  const BIT: bigint[] = new Array(n);
  for (let i = 0; i < n; i++) BIT[i] = 1n << BigInt(i);
  let FULL = 0n;
  for (let i = 0; i < n; i++) FULL |= BIT[i];
  const NEIGHBOUR_MASK: bigint[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let m = 0n;
    for (const u of neighbours[i]) m |= BIT[u];
    NEIGHBOUR_MASK[i] = m;
  }

  const pairKeys = new Set<string>();
  const splits: Split[] = [];
  let iterations = 0;
  let aborted = false;

  function record(subsetMask: bigint, size: number): void {
    if (size === 0 || size === n) return;
    // Only consider the smaller half; (A,B) and (B,A) collapse via pairKeys.
    if (size * 2 > n) return;
    const compMask = FULL ^ subsetMask;
    if (!isConnectedMask(compMask, neighbours, n, BIT)) return;

    const aCells: Cell[] = [];
    const bCells: Cell[] = [];
    for (let i = 0; i < n; i++) {
      if (subsetMask & BIT[i]) aCells.push(cells[i]);
      else bCells.push(cells[i]);
    }
    const canonA = canonicalKey(aCells);
    const canonB = canonicalKey(bCells);
    const pairKey = canonA < canonB ? `${canonA}|${canonB}` : `${canonB}|${canonA}`;
    if (pairKeys.has(pairKey)) return;
    pairKeys.add(pairKey);
    splits.push({ a: aCells, b: bCells, canonA, canonB, congruent: canonA === canonB });
  }

  // ESU: enumerate every connected subgraph that has `seed` as its minimum
  // vertex, exactly once. Returns false when the iteration budget runs out.
  //
  // Note: we do NOT prune on "complement currently disconnected" here, because
  // a disconnected intermediate complement can still become connected once a
  // singleton component adjacent to the subset gets absorbed by further
  // growth. Connectivity is therefore checked once, at the moment of emission
  // inside `record()`.
  function esu(seed: number, ext: number[], subsetMask: bigint, adjMask: bigint, size: number): boolean {
    if (++iterations > iterationBudget) {
      aborted = true;
      return false;
    }
    record(subsetMask, size);
    if (size * 2 >= n) return true; // smaller half is complete; growing further would flip roles
    for (let i = 0; i < ext.length; i++) {
      const w = ext[i];
      const wBit = BIT[w];
      const wNeighMask = NEIGHBOUR_MASK[w];
      const newExt = ext.slice(i + 1);
      // Candidates from w that are new to the frontier: neighbours of w that are
      // > seed, not already in the subset, and not already adjacent to the subset.
      const candidatesMask = wNeighMask & ~subsetMask & ~adjMask;
      if (candidatesMask !== 0n) {
        for (const u of neighbours[w]) {
          if (u <= seed) continue;
          if (candidatesMask & BIT[u]) newExt.push(u);
        }
      }
      const newAdjMask = adjMask | wNeighMask;
      if (!esu(seed, newExt, subsetMask | wBit, newAdjMask, size + 1)) return false;
    }
    return true;
  }

  for (let seed = 0; seed < n; seed++) {
    const ext: number[] = [];
    let adjMask = 0n;
    for (const u of neighbours[seed]) {
      adjMask |= BIT[u];
      if (u > seed) ext.push(u);
    }
    if (!esu(seed, ext, BIT[seed], adjMask, 1)) break;
  }

  // Surface congruent splits first, then more-balanced cuts, then by piece size.
  splits.sort((x, y) => {
    if (x.congruent !== y.congruent) return x.congruent ? -1 : 1;
    const xMin = Math.min(x.a.length, x.b.length);
    const yMin = Math.min(y.a.length, y.b.length);
    if (xMin !== yMin) return yMin - xMin;
    return x.canonA.localeCompare(y.canonA);
  });

  return { splits, totalCells: n, tooLarge: false, disconnected: false, aborted, maxCells };
}

function isConnected(neighbours: number[][], n: number): boolean {
  if (n === 0) return true;
  const visited = new Array<boolean>(n).fill(false);
  const stack = [0];
  visited[0] = true;
  let count = 1;
  while (stack.length) {
    const v = stack.pop()!;
    for (const u of neighbours[v]) {
      if (!visited[u]) { visited[u] = true; count++; stack.push(u); }
    }
  }
  return count === n;
}

function isConnectedMask(
  mask: bigint,
  neighbours: number[][],
  n: number,
  BIT: bigint[],
): boolean {
  if (mask === 0n) return true;
  let first = -1;
  for (let i = 0; i < n; i++) if (mask & BIT[i]) { first = i; break; }
  let visited = BIT[first];
  const stack = [first];
  while (stack.length) {
    const v = stack.pop()!;
    for (const u of neighbours[v]) {
      const b = BIT[u];
      if ((mask & b) && !(visited & b)) {
        visited |= b;
        stack.push(u);
      }
    }
  }
  return visited === mask;
}

/** Canonical key for a polyomino: lex-min serialization across the 8 dihedral images of its cropped form. */
function canonicalKey(cells: Cell[]): string {
  if (cells.length === 0) return '';
  let minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
  for (const { r, c } of cells) {
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
  }
  const rows = maxR - minR + 1;
  const cols = maxC - minC + 1;
  const g: Grid = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
  for (const { r, c } of cells) g[r - minR][c - minC] = true;
  const variants = generateVariants(g);
  let best = variants[0]?.key ?? '';
  for (let i = 1; i < variants.length; i++) {
    if (variants[i].key < best) best = variants[i].key;
  }
  return best;
}
