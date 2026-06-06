/**
 * Logic for the "Loopy" rule (and its sibling "Bricky") in The Artisan of
 * Glimmith. Borders are drawn on the edges between cells. A blank board starts
 * with the outer rectangle as borders, but every edge — boundary included — is
 * editable, since real puzzle boards are rarely rectangles. The rule forbids
 * any grid vertex where exactly N border segments meet:
 *
 *  - Loopy  → N = 3 (no T-junctions: three borders may never meet at a point)
 *  - Bricky → N = 4 (no crossings: four borders may never meet at a point)
 *
 * A border configuration only forms closed loops when every vertex has an even
 * number of borders (0, 2 or 4). So besides the headline N-junction, a vertex
 * with a single border is a "loose end" — a border that just stops, which the
 * game forbids via its "forced extension" behaviour.
 *
 * Edge indexing
 * -------------
 * Vertices form a (size + 1) × (size + 1) lattice. Edges connect adjacent
 * vertices:
 *  - `vertical[r][c]`   — the vertical edge spanning vertices (r, c)→(r+1, c),
 *                          for r in [0, size) and c in [0, size]. c = 0 and
 *                          c = size are the left/right frame.
 *  - `horizontal[r][c]` — the horizontal edge spanning vertices (r, c)→(r, c+1),
 *                          for r in [0, size] and c in [0, size). r = 0 and
 *                          r = size are the top/bottom frame.
 */

export type Walls = {
  /** Cells per side. */
  size: number;
  /** Vertical edge walls, `vertical[r][c]` (see module docs). */
  vertical: boolean[][];
  /** Horizontal edge walls, `horizontal[r][c]` (see module docs). */
  horizontal: boolean[][];
};

export type EdgeKind = 'v' | 'h';

/** True when a vertical edge column is part of the fixed board frame. */
export const isFrameV = (size: number, c: number) => c === 0 || c === size;
/** True when a horizontal edge row is part of the fixed board frame. */
export const isFrameH = (size: number, r: number) => r === 0 || r === size;

/** A blank board: only the outer frame is a border. */
export function emptyWalls(size: number): Walls {
  const vertical = Array.from({ length: size }, () =>
    Array.from({ length: size + 1 }, (_, c) => isFrameV(size, c)),
  );
  const horizontal = Array.from({ length: size + 1 }, (_, r) =>
    Array.from({ length: size }, () => isFrameH(size, r)),
  );
  return { size, vertical, horizontal };
}

/** Resize, keeping any walls that still fit; the new outer ring defaults on. */
export function resizeWalls(walls: Walls, newSize: number): Walls {
  const next = emptyWalls(newSize);
  const copy = Math.min(walls.size, newSize);
  for (let r = 0; r < copy; r++) {
    for (let c = 0; c <= copy; c++) {
      if (walls.vertical[r]?.[c] !== undefined && next.vertical[r]?.[c] !== undefined) {
        next.vertical[r][c] = walls.vertical[r][c];
      }
    }
  }
  for (let r = 0; r <= copy; r++) {
    for (let c = 0; c < copy; c++) {
      if (walls.horizontal[r]?.[c] !== undefined && next.horizontal[r]?.[c] !== undefined) {
        next.horizontal[r][c] = walls.horizontal[r][c];
      }
    }
  }
  return next;
}

/** Whether the given edge is part of the default outer rectangle. */
export function isInternalEdge(size: number, kind: EdgeKind, r: number, c: number): boolean {
  return kind === 'v' ? !isFrameV(size, c) : !isFrameH(size, r);
}

/** Return a copy of `walls` with the value of one edge set (boundary included). */
export function setWall(
  walls: Walls,
  kind: EdgeKind,
  r: number,
  c: number,
  value: boolean,
): Walls {
  if (kind === 'v') {
    if (walls.vertical[r]?.[c] === undefined) return walls;
    if (walls.vertical[r][c] === value) return walls;
    const vertical = walls.vertical.map((row) => row.slice());
    vertical[r][c] = value;
    return { ...walls, vertical };
  }
  if (walls.horizontal[r]?.[c] === undefined) return walls;
  if (walls.horizontal[r][c] === value) return walls;
  const horizontal = walls.horizontal.map((row) => row.slice());
  horizontal[r][c] = value;
  return { ...walls, horizontal };
}

/** Read one edge's wall state. */
export function getWall(walls: Walls, kind: EdgeKind, r: number, c: number): boolean {
  return kind === 'v' ? !!walls.vertical[r]?.[c] : !!walls.horizontal[r]?.[c];
}

/**
 * Number of border segments meeting at vertex (i, j), counting the frame.
 * Up to four edges meet: north/south are vertical edges, west/east horizontal.
 */
export function degreeAt(walls: Walls, i: number, j: number): number {
  const { size, vertical, horizontal } = walls;
  let d = 0;
  if (i - 1 >= 0 && vertical[i - 1][j]) d++; // north
  if (i <= size - 1 && vertical[i][j]) d++; // south
  if (j - 1 >= 0 && horizontal[i][j - 1]) d++; // west
  if (j <= size - 1 && horizontal[i][j]) d++; // east
  return d;
}

export type Vertex = { i: number; j: number };

export type LoopyAnalysis = {
  /** Vertices where exactly the forbidden number of borders meet (red ✕). */
  junctions: Vertex[];
  /** Vertices with a single border — a border that just stops (loose end). */
  looseEnds: Vertex[];
  /** True when there are no junctions and no loose ends. */
  valid: boolean;
};

/**
 * Find every rule-breaking vertex.
 *
 * @param walls    Border configuration.
 * @param forbidden The junction degree(s) the active rules forbid (3 = Loopy,
 *                  4 = Bricky). A puzzle may enforce both at once, so this
 *                  accepts either a single degree or a list.
 */
export function analyse(walls: Walls, forbidden: number | readonly number[]): LoopyAnalysis {
  const banned = typeof forbidden === 'number' ? [forbidden] : forbidden;
  const { size } = walls;
  const junctions: Vertex[] = [];
  const looseEnds: Vertex[] = [];
  for (let i = 0; i <= size; i++) {
    for (let j = 0; j <= size; j++) {
      const d = degreeAt(walls, i, j);
      if (banned.includes(d)) junctions.push({ i, j });
      else if (d === 1) looseEnds.push({ i, j });
    }
  }
  return { junctions, looseEnds, valid: junctions.length === 0 && looseEnds.length === 0 };
}
