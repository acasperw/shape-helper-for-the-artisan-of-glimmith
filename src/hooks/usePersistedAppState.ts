import { useEffect, useMemo, useState } from 'react';
import { emptyGrid, type Grid } from '../shape';

const STORAGE_KEY = 'shape-helper:v2';
const SAVE_DEBOUNCE_MS = 250;

type PersistedState = { size: number; grid: Grid; boardSize?: number; boardGrid?: Grid };

type Bounds = {
  pieceMin: number;
  pieceMax: number;
  pieceDefault: number;
  boardMin: number;
  boardMax: number;
  boardDefault: number;
};

function isValidGrid(g: unknown, n: number): g is Grid {
  return (
    Array.isArray(g) &&
    g.length === n &&
    (g as unknown[]).every(
      (row) =>
        Array.isArray(row) &&
        row.length === n &&
        (row as unknown[]).every((c) => typeof c === 'boolean'),
    )
  );
}

function loadPersisted(b: Bounds): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (typeof parsed?.size !== 'number' || !isValidGrid(parsed.grid, parsed.size)) return null;
    const clamped = Math.max(b.pieceMin, Math.min(b.pieceMax, parsed.size));
    if (clamped !== parsed.size) return null;
    if (
      typeof parsed.boardSize !== 'number' ||
      parsed.boardSize < b.boardMin ||
      parsed.boardSize > b.boardMax ||
      !isValidGrid(parsed.boardGrid, parsed.boardSize)
    ) {
      return { size: parsed.size, grid: parsed.grid };
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * App-wide persisted state: the piece grid + size and the board grid + size.
 * Writes are debounced so a drag-paint doesn't spam localStorage.
 */
export function usePersistedAppState(bounds: Bounds) {
  const initial = useMemo(() => loadPersisted(bounds), [bounds]);
  const [pieceSize, setPieceSize] = useState(initial?.size ?? bounds.pieceDefault);
  const [pieceGrid, setPieceGrid] = useState<Grid>(() => initial?.grid ?? emptyGrid(bounds.pieceDefault));
  const [boardSize, setBoardSize] = useState(initial?.boardSize ?? bounds.boardDefault);
  const [boardGrid, setBoardGrid] = useState<Grid>(() => initial?.boardGrid ?? emptyGrid(bounds.boardDefault));

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ size: pieceSize, grid: pieceGrid, boardSize, boardGrid }),
        );
      } catch {
        // ignore quota / disabled storage
      }
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [pieceSize, pieceGrid, boardSize, boardGrid]);

  return {
    pieceSize,
    setPieceSize,
    pieceGrid,
    setPieceGrid,
    boardSize,
    setBoardSize,
    boardGrid,
    setBoardGrid,
  };
}
