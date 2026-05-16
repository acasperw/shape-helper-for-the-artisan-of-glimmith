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
  const gridRef = useRef<HTMLDivElement | null>(null);
  // Roving-tabindex anchor: only this cell is in the tab order; arrow keys move it.
  const [focus, setFocus] = useState({ r: 0, c: 0 });

  // Keep focus coordinates in range when the grid shrinks.
  useEffect(() => {
    setFocus((f) => ({
      r: Math.min(f.r, size - 1),
      c: Math.min(f.c, size - 1),
    }));
  }, [size]);

  const focusCell = (r: number, c: number) => {
    setFocus({ r, c });
    // Move DOM focus to the new cell. Query inside the grid so we don't
    // steal focus if the user isn't currently in the grid.
    const next = gridRef.current?.querySelector<HTMLButtonElement>(
      `[data-r="${r}"][data-c="${c}"]`,
    );
    next?.focus();
  };

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

  const handleCellKeyDown = (r: number, c: number) => (e: React.KeyboardEvent) => {
    const last = size - 1;
    switch (e.key) {
      case ' ':
      case 'Enter':
        e.preventDefault();
        setCell(r, c, !grid[r][c]);
        return;
      case 'ArrowUp':
        e.preventDefault();
        focusCell(Math.max(0, r - 1), c);
        return;
      case 'ArrowDown':
        e.preventDefault();
        focusCell(Math.min(last, r + 1), c);
        return;
      case 'ArrowLeft':
        e.preventDefault();
        focusCell(r, Math.max(0, c - 1));
        return;
      case 'ArrowRight':
        e.preventDefault();
        focusCell(r, Math.min(last, c + 1));
        return;
      case 'Home':
        e.preventDefault();
        if (e.ctrlKey) focusCell(0, 0);
        else focusCell(r, 0);
        return;
      case 'End':
        e.preventDefault();
        if (e.ctrlKey) focusCell(last, last);
        else focusCell(r, last);
        return;
      case 'PageUp':
        e.preventDefault();
        focusCell(0, c);
        return;
      case 'PageDown':
        e.preventDefault();
        focusCell(last, c);
        return;
    }
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
          Grid size:{' '}
          <strong aria-live="polite">
            {size}×{size}
          </strong>
          <input
            type="range"
            min={MIN_SIZE}
            max={MAX_SIZE}
            value={size}
            aria-valuetext={`${size} by ${size}`}
            onChange={(e) => handleSizeChange(Number(e.target.value))}
          />
        </label>
        <button onClick={clear} type="button">Clear</button>
      </section>

      <section className="draw-area" aria-labelledby="draw-heading">
        <h2 id="draw-heading">Draw your shape</h2>
        <p className="hint">Click or drag to fill/erase cells. Tab to enter the grid, arrow keys to move, Space or Enter to toggle.</p>
        <div
          ref={gridRef}
          className="grid"
          role="grid"
          aria-labelledby="draw-heading"
          aria-rowcount={size}
          aria-colcount={size}
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
              <button
                key={`${r}-${c}`}
                type="button"
                role="gridcell"
                aria-pressed={cell}
                aria-label={`Row ${r + 1}, column ${c + 1}, ${cell ? 'filled' : 'empty'}`}
                data-r={r}
                data-c={c}
                tabIndex={focus.r === r && focus.c === c ? 0 : -1}
                className={`cell ${cell ? 'on' : ''}`}
                style={cell ? edgeStyle(grid, r, c) : undefined}
                onPointerDown={handlePointerDown(r, c)}
                onPointerEnter={handlePointerEnter(r, c)}
                onFocus={() => setFocus({ r, c })}
                onKeyDown={handleCellKeyDown(r, c)}
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
          href="https://github.com/acasperw/shape-helper-for-the-artisan-of-glimmith/"
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
        role="img"
        aria-label={`${label}, ${rows} by ${cols}`}
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
              aria-hidden="true"
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
