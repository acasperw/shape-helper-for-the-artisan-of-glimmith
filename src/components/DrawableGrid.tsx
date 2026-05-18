import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Grid } from '../shape';
import { edgeStyle, gridTemplateStyle } from '../utils/edgeStyle';

type PaintMode = 'fill' | 'erase' | null;

type DrawableGridProps = {
  grid: Grid;
  setGrid: React.Dispatch<React.SetStateAction<Grid>>;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  className?: string;
  /** CSS variable name for cell size (`--cell-size`, `--piece-cell-size`, …). */
  cellVar?: string;
  /** Enable arrow-key / Home / End / PageUp / PageDown roving-tabindex nav. */
  keyboardNav?: boolean;
};

/**
 * Drawable square grid with pointer-drag painting (and optional keyboard
 * navigation via a roving tabindex). Shared between the main piece grid and
 * the tiling-board grid.
 */
export function DrawableGrid({
  grid,
  setGrid,
  ariaLabel,
  ariaLabelledBy,
  className,
  cellVar,
  keyboardNav = false,
}: DrawableGridProps) {
  const size = grid.length;
  const paintModeRef = useRef<PaintMode>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [focus, setFocus] = useState({ r: 0, c: 0 });

  // Keep focus coordinates in range when the grid shrinks.
  useEffect(() => {
    if (!keyboardNav) return;
    setFocus((f) => ({ r: Math.min(f.r, size - 1), c: Math.min(f.c, size - 1) }));
  }, [size, keyboardNav]);

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

  const focusCell = useCallback((r: number, c: number) => {
    setFocus({ r, c });
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-r="${r}"][data-c="${c}"]`)
      ?.focus();
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

  const handleCellKeyDown = (r: number, c: number) => (e: React.KeyboardEvent) => {
    if (!keyboardNav) return;
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
        focusCell(e.ctrlKey ? 0 : r, 0);
        return;
      case 'End':
        e.preventDefault();
        focusCell(e.ctrlKey ? last : r, last);
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

  const style: CSSProperties = {
    ['--size' as string]: size,
    ...gridTemplateStyle(size, size, cellVar),
  };

  return (
    <div
      ref={gridRef}
      className={`grid${className ? ` ${className}` : ''}`}
      role="grid"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-rowcount={size}
      aria-colcount={size}
      style={style}
      onPointerUp={endPaint}
      onPointerLeave={endPaint}
    >
      {grid.map((row, r) =>
        row.map((cell, c) => {
          const isFocus = keyboardNav && focus.r === r && focus.c === c;
          return (
            <button
              key={`${r}-${c}`}
              type="button"
              role="gridcell"
              aria-pressed={cell}
              aria-label={`Row ${r + 1}, column ${c + 1}, ${cell ? 'filled' : 'empty'}`}
              data-r={r}
              data-c={c}
              tabIndex={keyboardNav ? (isFocus ? 0 : -1) : undefined}
              className={`cell ${cell ? 'on' : ''}`}
              style={cell ? edgeStyle(grid, r, c) : undefined}
              onPointerDown={handlePointerDown(r, c)}
              onPointerEnter={handlePointerEnter(r, c)}
              onFocus={keyboardNav ? () => setFocus({ r, c }) : undefined}
              onKeyDown={handleCellKeyDown(r, c)}
            />
          );
        }),
      )}
    </div>
  );
}
