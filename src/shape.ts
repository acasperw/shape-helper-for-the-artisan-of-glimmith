export type Grid = boolean[][]; // [row][col]

export function emptyGrid(size: number): Grid {
  return Array.from({ length: size }, () => Array(size).fill(false));
}

export function resizeGrid(grid: Grid, newSize: number): Grid {
  const next = emptyGrid(newSize);
  const copy = Math.min(grid.length, newSize);
  for (let r = 0; r < copy; r++) {
    for (let c = 0; c < copy; c++) {
      next[r][c] = grid[r][c];
    }
  }
  return next;
}

/** Crop grid to the bounding box of filled cells. Returns null if empty. */
export function cropToBounds(grid: Grid): Grid | null {
  let minR = Infinity, maxR = -1, minC = Infinity, maxC = -1;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c]) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  if (maxR < 0) return null;
  const out: Grid = [];
  for (let r = minR; r <= maxR; r++) {
    out.push(grid[r].slice(minC, maxC + 1));
  }
  return out;
}

export function rotate90(g: Grid): Grid {
  const rows = g.length;
  const cols = g[0].length;
  const out: Grid = Array.from({ length: cols }, () => Array(rows).fill(false));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out[c][rows - 1 - r] = g[r][c];
    }
  }
  return out;
}

export function flipHorizontal(g: Grid): Grid {
  return g.map((row) => [...row].reverse());
}

function keyOf(g: Grid): string {
  return g.map((row) => row.map((v) => (v ? '1' : '0')).join('')).join('/');
}

export type Variant = {
  grid: Grid;
  label: string;
  key: string;
};

/** Generate all 8 dihedral variants of a shape, deduped, cropped to bounding box. */
export function generateVariants(grid: Grid): Variant[] {
  const cropped = cropToBounds(grid);
  if (!cropped) return [];

  const transforms: { label: string; fn: (g: Grid) => Grid }[] = [
    { label: 'Original', fn: (g) => g },
    { label: 'Rotated 90°', fn: (g) => rotate90(g) },
    { label: 'Rotated 180°', fn: (g) => rotate90(rotate90(g)) },
    { label: 'Rotated 270°', fn: (g) => rotate90(rotate90(rotate90(g))) },
    { label: 'Flipped', fn: (g) => flipHorizontal(g) },
    { label: 'Flipped + 90°', fn: (g) => rotate90(flipHorizontal(g)) },
    { label: 'Flipped + 180°', fn: (g) => rotate90(rotate90(flipHorizontal(g))) },
    { label: 'Flipped + 270°', fn: (g) => rotate90(rotate90(rotate90(flipHorizontal(g)))) },
  ];

  const seen = new Set<string>();
  const out: Variant[] = [];
  for (const t of transforms) {
    const v = t.fn(cropped);
    const k = keyOf(v);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ grid: v, label: t.label, key: k });
  }
  return out;
}
