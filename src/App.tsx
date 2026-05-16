import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { emptyGrid, generateVariants, resizeGrid, type Grid } from './shape';

const MIN_SIZE = 5;
const MAX_SIZE = 20;
const DEFAULT_SIZE = 10;
const STORAGE_KEY = 'shape-helper:v1';

type PaintMode = 'fill' | 'erase' | null;

type PersistedState = { size: number; grid: Grid };

function loadPersisted(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (
      typeof parsed?.size !== 'number' ||
      !Array.isArray(parsed?.grid) ||
      parsed.grid.length !== parsed.size ||
      !parsed.grid.every(
        (row) => Array.isArray(row) && row.length === parsed.size && row.every((c) => typeof c === 'boolean'),
      )
    ) {
      return null;
    }
    const clamped = Math.max(MIN_SIZE, Math.min(MAX_SIZE, parsed.size));
    if (clamped !== parsed.size) return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function App() {
  const initial = useMemo(() => loadPersisted(), []);
  const [size, setSize] = useState(initial?.size ?? DEFAULT_SIZE);
  const [grid, setGrid] = useState<Grid>(() => initial?.grid ?? emptyGrid(DEFAULT_SIZE));
  const paintModeRef = useRef<PaintMode>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ size, grid }));
    } catch {
      // ignore quota / disabled storage
    }
  }, [size, grid]);

  const setCell = useCallback((r: number, c: number, value: boolean) => {
    setGrid((prev) => {
      if (prev[r][c] === value) return prev;
      const next = prev.map((row) => row.slice());
      next[r][c] = value;
      return next;
    });
  }, []);

  const handlePointerDown = (r: number, c: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    const mode: PaintMode = grid[r][c] ? 'erase' : 'fill';
    paintModeRef.current = mode;
    setCell(r, c, mode === 'fill');
  };

  const handlePointerEnter = (r: number, c: number) => (e: React.PointerEvent) => {
    if (paintModeRef.current === null) return;
    if (e.buttons === 0) {
      paintModeRef.current = null;
      return;
    }
    setCell(r, c, paintModeRef.current === 'fill');
  };

  const endPaint = () => {
    paintModeRef.current = null;
  };

  const handleSizeChange = (n: number) => {
    const clamped = Math.max(MIN_SIZE, Math.min(MAX_SIZE, n));
    setSize(clamped);
    setGrid((prev) => resizeGrid(prev, clamped));
  };

  const clear = () => setGrid(emptyGrid(size));

  const variants = useMemo(() => generateVariants(grid), [grid]);

  return (
    <div className="app">
      <header>
        <h1>Shape Helper</h1>
        <p className="subtitle">for The Artisan of Glimmith</p>
      </header>

      <section className="controls">
        <label>
          Grid size: <strong>{size}×{size}</strong>
          <input
            type="range"
            min={MIN_SIZE}
            max={MAX_SIZE}
            value={size}
            onChange={(e) => handleSizeChange(Number(e.target.value))}
          />
        </label>
        <button onClick={clear} type="button">Clear</button>
      </section>

      <section className="draw-area">
        <h2>Draw your shape</h2>
        <p className="hint">Click or drag to fill/erase cells.</p>
        <div
          className="grid"
          style={{
            ['--size' as string]: size,
            ['--cols' as string]: size,
            ['--rows' as string]: size,
            gridTemplateColumns: `repeat(${size}, var(--cell-size))`,
            gridTemplateRows: `repeat(${size}, var(--cell-size))`,
          }}
          onPointerUp={endPaint}
          onPointerLeave={endPaint}
        >
          {grid.map((row, r) =>
            row.map((cell, c) => (
              <div
                key={`${r}-${c}`}
                className={`cell ${cell ? 'on' : ''}`}
                style={cell ? edgeStyle(grid, r, c) : undefined}
                onPointerDown={handlePointerDown(r, c)}
                onPointerEnter={handlePointerEnter(r, c)}
              />
            ))
          )}
        </div>
      </section>

      <section className="variants">
        <h2>Variants ({variants.length})</h2>
        {variants.length === 0 ? (
          <p className="hint">Draw a shape to see its rotations and flips.</p>
        ) : (
          <div className="variant-list">
            {variants.map((v) => (
              <VariantView key={v.key} label={v.label} grid={v.grid} />
            ))}
          </div>
        )}
      </section>

      <footer>
        <a
          href="https://github.com/"
          target="_blank"
          rel="noreferrer"
        >Source on GitHub</a>
      </footer>
    </div>
  );
}

function VariantView({ label, grid }: { label: string; grid: Grid }) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  return (
    <figure className="variant">
      <div
        className="mini-grid"
        style={{
          ['--cols' as string]: cols,
          ['--rows' as string]: rows,
          gridTemplateColumns: `repeat(${cols}, var(--mini-cell-size))`,
          gridTemplateRows: `repeat(${rows}, var(--mini-cell-size))`,
        }}
      >
        {grid.map((row, r) =>
          row.map((cell, c) => (
            <div
              key={`${r}-${c}`}
              className={`cell ${cell ? 'on' : ''}`}
              style={cell ? edgeStyle(grid, r, c) : undefined}
            />
          ))
        )}
      </div>
      <figcaption>{label} <span className="dims">({rows}×{cols})</span></figcaption>
    </figure>
  );
}

/**
 * Compute the perimeter-edge CSS variables for a filled cell. Each variable is
 * 1 when the cell has no filled neighbor on that side (so a thick outline is
 * drawn there) and 0 otherwise. This produces the "merged region" outline seen
 * in the game where only the outer border of the shape is rendered.
 */
function edgeStyle(grid: Grid, r: number, c: number): React.CSSProperties {
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
