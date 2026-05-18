import { memo, useCallback, useEffect, useState } from 'react';
import type { Grid } from '../shape';
import { enumerateFreePolyominoes, type Polyomino } from '../polyominoes';
import { edgeStyle } from '../utils/edgeStyle';
import { MiniGrid } from './MiniGrid';

type CatalogPanelProps = {
  size: number;
  minSize: number;
  maxSize: number;
  onSizeChange: (size: number) => void;
  onSelectPiece: (grid: Grid) => void;
};

export function CatalogPanel({ size, minSize, maxSize, onSizeChange, onSelectPiece }: CatalogPanelProps) {
  const [computing, setComputing] = useState(false);
  const [polyominoes, setPolyominoes] = useState<Polyomino[]>(() => enumerateFreePolyominoes(size));

  // Defer the actual enumeration to a microtask so the slider feels snappy
  // when scrubbing across sizes (the largest case ~ size 8 is the slow one).
  useEffect(() => {
    setComputing(true);
    let cancelled = false;
    const id = window.setTimeout(() => {
      const result = enumerateFreePolyominoes(size);
      if (cancelled) return;
      setPolyominoes(result);
      setComputing(false);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [size]);

  return (
    <section className="catalog" aria-labelledby="catalog-heading">
      <h2 id="catalog-heading">Piece Catalog</h2>
      <p className="hint">
        Browse every distinct shape (up to rotation and reflection) of a given size. Click a piece to load it into the
        Shape Helper.
      </p>
      <div className="controls catalog-controls">
        <label>
          Piece size:{' '}
          <strong className="size-readout" aria-live="polite">
            {size} cell{size === 1 ? '' : 's'}
          </strong>
          <input
            type="range"
            min={minSize}
            max={maxSize}
            value={size}
            aria-valuetext={`${size} cells`}
            onChange={(e) => onSizeChange(Number(e.target.value))}
          />
        </label>
        <span className="dims" aria-live="polite">
          {computing
            ? 'Computing…'
            : `${polyominoes.length} distinct piece${polyominoes.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {computing ? (
        <p className="hint" role="status">
          Enumerating pieces…
        </p>
      ) : (
        <div className="variant-list catalog-list">
          {polyominoes.map((p, i) => (
            <CatalogPiece key={p.key} poly={p} index={i} onSelect={onSelectPiece} />
          ))}
        </div>
      )}
    </section>
  );
}

const CatalogPiece = memo(function CatalogPiece({
  poly,
  index,
  onSelect,
}: {
  poly: Polyomino;
  index: number;
  onSelect: (grid: Grid) => void;
}) {
  const rows = poly.grid.length;
  const cols = poly.grid[0]?.length ?? 0;
  const handleClick = useCallback(() => onSelect(poly.grid), [onSelect, poly.grid]);
  return (
    <button
      type="button"
      className="variant catalog-piece"
      aria-label={`Load piece ${index + 1} (${rows} by ${cols}) into the Shape Helper`}
      onClick={handleClick}
    >
      <MiniGrid
        rows={rows}
        cols={cols}
        ariaHidden
        renderCell={(r, c) => {
          const cell = poly.grid[r][c];
          return (
            <div
              key={`${r}-${c}`}
              aria-hidden="true"
              className={`cell ${cell ? 'on' : ''}`}
              style={cell ? edgeStyle(poly.grid, r, c) : undefined}
            />
          );
        }}
      />
      <span className="catalog-piece-label">
        #{index + 1} <span className="dims">({rows}×{cols})</span>
      </span>
    </button>
  );
});
