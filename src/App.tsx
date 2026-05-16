import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { emptyGrid, generateVariants, resizeGrid, type Grid } from './shape';
import type { Split, SplitsResult } from './splits';
import type { SplitsRequest, SplitsResponse } from './splits.worker';
import { findSelfFits, type SelfFit } from './selfFit';
import { tileRegion, type Placement } from './tile';

const MIN_SIZE = 5;
const MAX_SIZE = 20;
const DEFAULT_SIZE = 6;
const BOARD_MIN_SIZE = 5;
const BOARD_MAX_SIZE = 15;
const BOARD_DEFAULT_SIZE = 8;
const STORAGE_KEY = 'shape-helper:v2';
/** Wait this long after the last edit before kicking off split analysis. */
const SPLITS_DEBOUNCE_MS = 400;

type PaintMode = 'fill' | 'erase' | null;

type PersistedState = { size: number; grid: Grid; boardSize?: number; boardGrid?: Grid };

function isValidGrid(g: unknown, n: number): g is Grid {
  return (
    Array.isArray(g) &&
    g.length === n &&
    (g as unknown[]).every(
      (row) => Array.isArray(row) && row.length === n && (row as unknown[]).every((c) => typeof c === 'boolean'),
    )
  );
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

function loadPersisted(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (typeof parsed?.size !== 'number' || !isValidGrid(parsed.grid, parsed.size)) return null;
    const clamped = Math.max(MIN_SIZE, Math.min(MAX_SIZE, parsed.size));
    if (clamped !== parsed.size) return null;
    if (
      typeof parsed.boardSize !== 'number' ||
      parsed.boardSize < BOARD_MIN_SIZE ||
      parsed.boardSize > BOARD_MAX_SIZE ||
      !isValidGrid(parsed.boardGrid, parsed.boardSize)
    ) {
      return { size: parsed.size, grid: parsed.grid };
    }
    return parsed;
  } catch {
    return null;
  }
}

export default function App() {
  const initial = useMemo(() => loadPersisted(), []);
  const [pieceSize, setPieceSize] = useState(initial?.size ?? DEFAULT_SIZE);
  const [pieceGrid, setPieceGrid] = useState<Grid>(() => initial?.grid ?? emptyGrid(DEFAULT_SIZE));
  const [boardSize, setBoardSize] = useState(initial?.boardSize ?? BOARD_DEFAULT_SIZE);
  const [boardGrid, setBoardGrid] = useState<Grid>(() => initial?.boardGrid ?? emptyGrid(BOARD_DEFAULT_SIZE));
  // Aliases so the rest of the existing main-grid wiring (variants, self-fits, splits) keeps reading `grid`/`size`.
  const size = pieceSize;
  const setSize = setPieceSize;
  const grid = pieceGrid;
  const setGrid = setPieceGrid;
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
    // Debounce so a drag-paint doesn't spam localStorage with one write per cell.
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ size: pieceSize, grid: pieceGrid, boardSize, boardGrid }),
        );
      } catch {
        // ignore quota / disabled storage
      }
    }, 250);
    return () => window.clearTimeout(id);
  }, [pieceSize, pieceGrid, boardSize, boardGrid]);

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

  const handleBoardSizeChange = (n: number) => {
    const clamped = Math.max(BOARD_MIN_SIZE, Math.min(BOARD_MAX_SIZE, n));
    setBoardSize(clamped);
    setBoardGrid((prev) => resizeGrid(prev, clamped));
  };
  const clearBoard = () => setBoardGrid(emptyGrid(boardSize));
  // Debounce heavy analyses so dragging to paint stays fluid. Variants are cheap
  // and can stay live; selfFits and tile both walk the cell-set repeatedly.
  const debouncedPiece = useDebouncedValue(pieceGrid, 180);
  const debouncedBoard = useDebouncedValue(boardGrid, 180);
  const [tilingOpen, setTilingOpen] = useState(false);
  const tiling = useMemo(
    () => (tilingOpen ? tileRegion(debouncedBoard, debouncedPiece) : null),
    [tilingOpen, debouncedBoard, debouncedPiece],
  );

  const variants = useMemo(() => generateVariants(grid), [grid]);
  const selfFits = useMemo(() => findSelfFits(debouncedPiece), [debouncedPiece]);
  const { result: splitsResult, pending: splitsPending } = useSplits(grid);
  const [showAllSplits, setShowAllSplits] = useState(false);
  /** Number of distinct shared-edge tiers (e.g., "9 edges", "7 edges") to display. */
  const [selfFitTiers, setSelfFitTiers] = useState(3);
  const selfFitDistinctTiers = useMemo(
    () => Array.from(new Set(selfFits.fits.map((f) => f.contactEdges))).sort((a, b) => b - a),
    [selfFits],
  );
  // Clamp the slider when the underlying tier count changes.
  const effectiveSelfFitTiers = Math.min(selfFitTiers, Math.max(1, selfFitDistinctTiers.length));
  const selfFitCutoff = selfFitDistinctTiers[effectiveSelfFitTiers - 1] ?? -Infinity;
  const displayedSelfFits = useMemo(
    () => selfFits.fits.filter((f) => f.contactEdges >= selfFitCutoff),
    [selfFits, selfFitCutoff],
  );
  // A piece of one cell isn't a useful tiling answer, so hide those.
  const meaningfulSplits = useMemo(
    () =>
      (splitsResult?.splits ?? []).filter(
        (s) => Math.min(s.a.length, s.b.length) >= 2,
      ),
    [splitsResult],
  );
  const displayedSplits = useMemo(
    () =>
      showAllSplits
        ? meaningfulSplits
        : meaningfulSplits.filter((s) => s.congruent),
    [meaningfulSplits, showAllSplits],
  );

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

      <section className="tiling" aria-labelledby="tiling-heading">
        <details onToggle={(e) => setTilingOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>
            <h2 id="tiling-heading">Tile a board with this piece</h2>
            <span className="hint cheating-tag">Finds one full tiling of a board you draw using the piece above</span>
          </summary>
          <p className="hint">
            Draw a board below and we'll try to tile every filled cell of it
            using only rotated and flipped copies of the piece you drew above.
            Each placement gets its own color.
          </p>

          <div className="piece-controls">
            <label>
              Board grid:{' '}
              <strong aria-live="polite">{boardSize}×{boardSize}</strong>
              <input
                type="range"
                min={BOARD_MIN_SIZE}
                max={BOARD_MAX_SIZE}
                value={boardSize}
                aria-valuetext={`${boardSize} by ${boardSize}`}
                onChange={(e) => handleBoardSizeChange(Number(e.target.value))}
              />
            </label>
            <button onClick={clearBoard} type="button">Clear board</button>
          </div>

          <div className="piece-and-result">
            <div>
              <h3 className="piece-heading">Board</h3>
              <PieceGrid grid={boardGrid} setGrid={setBoardGrid} />
            </div>
            <div className="tiling-result">
              <h3 className="piece-heading">Tiling</h3>
              <TilingView grid={boardGrid} tiling={tiling} />
            </div>
          </div>
        </details>
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

      <section className="self-fits" aria-labelledby="self-fits-heading">
        <h2 id="self-fits-heading">
          Fits with itself{' '}
          {!selfFits.empty && !selfFits.disconnected ? `(${selfFits.fits.length})` : null}
        </h2>
        <p className="hint">
          Every way a single rotated or flipped copy of the drawn shape can sit
          snugly against the original (sharing at least two edges, no overlap).
          Original is shown in red, the placed copy in blue.
        </p>
        {selfFitDistinctTiers.length > 1 ? (
          <div className="splits-controls">
            <label>
              Show top{' '}
              <strong aria-live="polite">{effectiveSelfFitTiers}</strong>{' '}
              of {selfFitDistinctTiers.length} shared-edge tier{selfFitDistinctTiers.length === 1 ? '' : 's'}
              {' '}
              <input
                type="range"
                min={1}
                max={selfFitDistinctTiers.length}
                value={effectiveSelfFitTiers}
                aria-valuetext={`Top ${effectiveSelfFitTiers} of ${selfFitDistinctTiers.length} tiers (≥ ${selfFitCutoff} shared edges)`}
                onChange={(e) => setSelfFitTiers(Number(e.target.value))}
              />{' '}
              <span className="dims">
                ({displayedSelfFits.length} of {selfFits.fits.length} shown, ≥ {selfFitCutoff} edge{selfFitCutoff === 1 ? '' : 's'})
              </span>
            </label>
          </div>
        ) : null}
        {selfFits.empty ? (
          <p className="hint">Draw a shape to explore self-fitting placements.</p>
        ) : selfFits.disconnected ? (
          <p className="hint">Self-fit analysis only works on a single connected shape.</p>
        ) : selfFits.fits.length === 0 ? (
          <p className="hint">This shape cannot fit snugly against a rotated or flipped copy of itself.</p>
        ) : (
          <div className="split-list">
            {displayedSelfFits.map((f, i) => (
              <SelfFitView key={i} fit={f} />
            ))}
          </div>
        )}
      </section>

      <section className="splits" aria-labelledby="splits-heading" aria-busy={splitsPending}>
        <h2 id="splits-heading">
          Shapes that tile into this one{' '}
          {splitsResult && !splitsResult.tooLarge && !splitsResult.disconnected && splitsResult.totalCells >= 4
            ? `(${displayedSplits.length}${splitsResult.aborted ? '+' : ''})`
            : null}
        </h2>
        <p className="hint">
          A single piece that, placed twice (with rotations or flips), exactly
          fills the drawn shape. The two copies are shown in red and blue.
        </p>
        <div className="splits-controls">
          <label>
            <input
              type="checkbox"
              checked={showAllSplits}
              onChange={(e) => setShowAllSplits(e.target.checked)}
            />{' '}
            Also show non-matching 2-piece cuts (the two pieces are different shapes)
          </label>
        </div>
        {splitsPending ? (
          <p className="hint" role="status">Computing tilings…</p>
        ) : !splitsResult ? (
          <p className="hint">Draw a shape with at least 4 cells to see tilings.</p>
        ) : splitsResult.tooLarge ? (
          <p className="hint">
            Shape has {splitsResult.totalCells} cells — tiling analysis is
            capped at {splitsResult.maxCells} cells to keep the browser
            responsive.
          </p>
        ) : splitsResult.disconnected ? (
          <p className="hint">
            Tiling analysis only works on a single connected shape.
          </p>
        ) : splitsResult.totalCells < 4 ? (
          <p className="hint">Draw a shape with at least 4 cells to see tilings.</p>
        ) : displayedSplits.length === 0 ? (
          splitsResult.aborted ? (
            <p className="hint">
              Search hit its iteration budget before finding a tiling. The shape may still have one.
            </p>
          ) : (
            <p className="hint">
              {showAllSplits
                ? 'No 2-piece cuts found.'
                : 'No single piece tiles this shape twice. Try the option above to see uneven 2-piece cuts.'}
            </p>
          )
        ) : (
          <>
            {splitsResult.aborted ? (
              <p className="hint">
                Showing partial results — the search hit its iteration budget
                before exploring every possibility.
              </p>
            ) : null}
            <div className="split-list">
              {displayedSplits.map((s, i) => (
                <SplitView key={i} split={s} />
              ))}
            </div>
          </>
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

function SplitView({ split }: { split: Split }) {
  // Bounding box of the whole shape (A ∪ B) so the cut is shown in context.
  let minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
  for (const { r, c } of split.a) {
    if (r < minR) minR = r; if (r > maxR) maxR = r;
    if (c < minC) minC = c; if (c > maxC) maxC = c;
  }
  for (const { r, c } of split.b) {
    if (r < minR) minR = r; if (r > maxR) maxR = r;
    if (c < minC) minC = c; if (c > maxC) maxC = c;
  }
  const rows = maxR - minR + 1;
  const cols = maxC - minC + 1;

  // Per-piece grids drive the edge outlines so each piece gets its own
  // perimeter (which together draw the cut line).
  const gridA: Grid = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const gridB: Grid = Array.from({ length: rows }, () => new Array(cols).fill(false));
  for (const { r, c } of split.a) gridA[r - minR][c - minC] = true;
  for (const { r, c } of split.b) gridB[r - minR][c - minC] = true;

  const aLabel = `${split.a.length} cells`;
  const bLabel = `${split.b.length} cells`;

  return (
    <figure className="variant split">
      <div
        className="mini-grid"
        role="img"
        aria-label={`${split.congruent ? 'Congruent split' : 'Split'}: ${aLabel} and ${bLabel}`}
        style={{
          ['--cols' as string]: cols,
          ['--rows' as string]: rows,
          gridTemplateColumns: `repeat(${cols}, var(--cell-size))`,
          gridTemplateRows: `repeat(${rows}, var(--cell-size))`,
        }}
      >
        {Array.from({ length: rows }).flatMap((_, r) =>
          Array.from({ length: cols }).map((_, c) => {
            const inA = gridA[r][c];
            const inB = gridB[r][c];
            const cls = inA
              ? 'cell on piece-a'
              : inB
                ? 'cell on piece-b'
                : 'cell';
            const style = inA
              ? edgeStyle(gridA, r, c)
              : inB
                ? edgeStyle(gridB, r, c)
                : undefined;
            return (
              <div
                key={`${r}-${c}`}
                aria-hidden="true"
                className={cls}
                style={style}
              />
            );
          })
        )}
      </div>
      <figcaption>
        {split.congruent ? <strong>Tiles twice</strong> : 'Uneven cut'}{' '}
        <span className="dims">({split.a.length} + {split.b.length})</span>
      </figcaption>
    </figure>
  );
}

function SelfFitView({ fit }: { fit: SelfFit }) {
  // Bounding box over A ∪ B (B may sit outside A's frame).
  let minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
  for (const { r, c } of fit.a) {
    if (r < minR) minR = r; if (r > maxR) maxR = r;
    if (c < minC) minC = c; if (c > maxC) maxC = c;
  }
  for (const { r, c } of fit.b) {
    if (r < minR) minR = r; if (r > maxR) maxR = r;
    if (c < minC) minC = c; if (c > maxC) maxC = c;
  }
  const rows = maxR - minR + 1;
  const cols = maxC - minC + 1;

  const gridA: Grid = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const gridB: Grid = Array.from({ length: rows }, () => new Array(cols).fill(false));
  for (const { r, c } of fit.a) gridA[r - minR][c - minC] = true;
  for (const { r, c } of fit.b) gridB[r - minR][c - minC] = true;

  return (
    <figure className="variant split">
      <div
        className="mini-grid"
        role="img"
        aria-label={`Self-fit placement (${fit.variantLabel}), ${fit.contactEdges} shared edges`}
        style={{
          ['--cols' as string]: cols,
          ['--rows' as string]: rows,
          gridTemplateColumns: `repeat(${cols}, var(--cell-size))`,
          gridTemplateRows: `repeat(${rows}, var(--cell-size))`,
        }}
      >
        {Array.from({ length: rows }).flatMap((_, r) =>
          Array.from({ length: cols }).map((_, c) => {
            const inA = gridA[r][c];
            const inB = gridB[r][c];
            const cls = inA ? 'cell on piece-a' : inB ? 'cell on piece-b' : 'cell';
            const style = inA
              ? edgeStyle(gridA, r, c)
              : inB
                ? edgeStyle(gridB, r, c)
                : undefined;
            return <div key={`${r}-${c}`} aria-hidden="true" className={cls} style={style} />;
          })
        )}
      </div>
      <figcaption>
        <strong>{fit.variantLabel}</strong>{' '}
        <span className="dims">{fit.contactEdges} shared edge{fit.contactEdges === 1 ? '' : 's'}</span>
      </figcaption>
    </figure>
  );
}

function PieceGrid({ grid, setGrid }: { grid: Grid; setGrid: React.Dispatch<React.SetStateAction<Grid>> }) {
  const size = grid.length;
  const paintModeRef = useRef<PaintMode>(null);
  const setCell = useCallback(
    (r: number, c: number, value: boolean) => {
      setGrid((prev) => {
        if (prev[r][c] === value) return prev;
        const next = prev.map((row) => row.slice());
        next[r][c] = value;
        return next;
      });
    },
    [setGrid],
  );
  const onDown = (r: number, c: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    const mode: PaintMode = grid[r][c] ? 'erase' : 'fill';
    paintModeRef.current = mode;
    setCell(r, c, mode === 'fill');
  };
  const onEnter = (r: number, c: number) => (e: React.PointerEvent) => {
    if (paintModeRef.current === null) return;
    if (e.buttons === 0) { paintModeRef.current = null; return; }
    setCell(r, c, paintModeRef.current === 'fill');
  };
  const end = () => { paintModeRef.current = null; };
  return (
    <div
      className="grid piece-grid"
      role="grid"
      aria-label={`Piece, ${size} by ${size}`}
      style={{
        ['--size' as string]: size,
        ['--cols' as string]: size,
        ['--rows' as string]: size,
        gridTemplateColumns: `repeat(${size}, var(--piece-cell-size))`,
        gridTemplateRows: `repeat(${size}, var(--piece-cell-size))`,
      }}
      onPointerUp={end}
      onPointerLeave={end}
    >
      {grid.map((row, r) =>
        row.map((cell, c) => (
          <button
            key={`${r}-${c}`}
            type="button"
            role="gridcell"
            aria-pressed={cell}
            aria-label={`Row ${r + 1}, column ${c + 1}, ${cell ? 'filled' : 'empty'}`}
            className={`cell ${cell ? 'on' : ''}`}
            style={cell ? edgeStyle(grid, r, c) : undefined}
            onPointerDown={onDown(r, c)}
            onPointerEnter={onEnter(r, c)}
          />
        )),
      )}
    </div>
  );
}

function TilingView({ grid: _grid, tiling }: { grid: Grid; tiling: ReturnType<typeof tileRegion> | null }) {
  // The parent only invokes the solver when the accordion is open; while it's
  // closed we render nothing.
  if (!tiling) return null;

  if (tiling.emptyBoard) return <p className="hint">Draw a board below to start tiling.</p>;
  if (tiling.emptyPiece) return <p className="hint">Draw a piece on the main grid above first.</p>;
  if (tiling.tooLarge) return <p className="hint">Board or piece is too large for tiling search.</p>;
  if (tiling.disconnectedPiece) return <p className="hint">The piece must be a single connected shape.</p>;
  if (tiling.sizeMismatch) {
    return <p className="hint">Board cell count isn't a multiple of the piece cell count — no exact tiling possible.</p>;
  }
  if (tiling.aborted) return <p className="hint">Search exceeded its iteration budget.</p>;
  if (!tiling.solution) return <p className="hint">No tiling of this board by that piece exists.</p>;

  // Cropped bounding box derived from the solution itself so we stay in sync
  // with the (debounced) board the solver actually used. Using the live board
  // grid here would crash when the user clears the board between renders.
  let minR = Infinity, minC = Infinity, maxR = -1, maxC = -1;
  for (const placement of tiling.solution) {
    for (const { r, c } of placement) {
      if (r < minR) minR = r; if (r > maxR) maxR = r;
      if (c < minC) minC = c; if (c > maxC) maxC = c;
    }
  }

  const rows = maxR - minR + 1;
  const cols = maxC - minC + 1;
  // Map every covered cell to the index of its placement, so we can color it.
  const tileIdx: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(-1));
  // Per-placement boolean grid for edge styling (so each piece keeps its own outline).
  const placementGrids: Grid[] = tiling.solution.map(() =>
    Array.from({ length: rows }, () => new Array(cols).fill(false) as boolean[]),
  );
  tiling.solution.forEach((placement: Placement, idx) => {
    for (const { r, c } of placement) {
      const rr = r - minR;
      const cc = c - minC;
      tileIdx[rr][cc] = idx;
      placementGrids[idx][rr][cc] = true;
    }
  });

  return (
    <div
      className="mini-grid tiling-grid"
      role="img"
      aria-label={`Tiling using ${tiling.solution.length} piece copies`}
      style={{
        ['--cols' as string]: cols,
        ['--rows' as string]: rows,
        gridTemplateColumns: `repeat(${cols}, var(--cell-size))`,
        gridTemplateRows: `repeat(${rows}, var(--cell-size))`,
      }}
    >
      {Array.from({ length: rows }).flatMap((_, r) =>
        Array.from({ length: cols }).map((_, c) => {
          const idx = tileIdx[r][c];
          if (idx < 0) {
            return <div key={`${r}-${c}`} aria-hidden="true" className="cell" />;
          }
          const colorClass = `tile-${idx % 8}`;
          return (
            <div
              key={`${r}-${c}`}
              aria-hidden="true"
              className={`cell on ${colorClass}`}
              style={edgeStyle(placementGrids[idx], r, c)}
            />
          );
        }),
      )}
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
          gridTemplateColumns: `repeat(${cols}, var(--cell-size))`,
          gridTemplateRows: `repeat(${rows}, var(--cell-size))`,
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

/**
 * Run split analysis in a Web Worker, debounced so we only kick off after the
 * user stops editing. Stale responses (from a grid that has since changed) are
 * dropped by comparing requestIds.
 */
function useSplits(grid: Grid): { result: SplitsResult | null; pending: boolean } {
  const [result, setResult] = useState<SplitsResult | null>(null);
  const [pending, setPending] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const latestRequestIdRef = useRef(0);

  // Spin up the worker once.
  useEffect(() => {
    const worker = new Worker(new URL('./splits.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    worker.addEventListener('message', (e: MessageEvent<SplitsResponse>) => {
      // Drop responses for requests that have already been superseded.
      if (e.data.requestId !== latestRequestIdRef.current) return;
      setResult(e.data.result);
      setPending(false);
    });
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // Debounce: schedule a worker request 400ms after the most recent grid edit.
  useEffect(() => {
    // If the grid has no filled cells, short-circuit to an empty result without
    // bothering the worker.
    const hasAny = grid.some((row) => row.some(Boolean));
    if (!hasAny) {
      requestIdRef.current++;
      latestRequestIdRef.current = requestIdRef.current;
      setResult(null);
      setPending(false);
      return;
    }
    setPending(true);
    const timer = window.setTimeout(() => {
      const worker = workerRef.current;
      if (!worker) return;
      requestIdRef.current++;
      const requestId = requestIdRef.current;
      latestRequestIdRef.current = requestId;
      const req: SplitsRequest = { requestId, grid };
      worker.postMessage(req);
    }, SPLITS_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [grid]);

  return { result, pending };
}
