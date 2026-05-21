import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { Grid } from '../shape';
import { enumerateFreePolyominoes, isBoxy, type Polyomino } from '../polyominoes';
import { edgeStyle } from '../utils/edgeStyle';
import { MiniGrid } from './MiniGrid';

type CatalogPanelProps = {
  size: number;
  minSize: number;
  maxSize: number;
  onSizeChange: (size: number) => void;
  onSelectPiece: (grid: Grid) => void;
};

type BoxyFilter = 'all' | 'boxy' | 'non-boxy';

export function CatalogPanel({ size, minSize, maxSize, onSizeChange, onSelectPiece }: CatalogPanelProps) {
  const [computing, setComputing] = useState(false);
  const [polyominoes, setPolyominoes] = useState<Polyomino[]>(() => enumerateFreePolyominoes(size));
  const [boxyFilter, setBoxyFilter] = useState<BoxyFilter>('all');

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

  const tagged = useMemo(
    () => polyominoes.map((p) => ({ poly: p, boxy: isBoxy(p.grid) })),
    [polyominoes],
  );
  const filtered = useMemo(() => {
    if (boxyFilter === 'boxy') return tagged.filter((t) => t.boxy);
    if (boxyFilter === 'non-boxy') return tagged.filter((t) => !t.boxy);
    return tagged;
  }, [tagged, boxyFilter]);

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
        <fieldset className="catalog-filter" aria-label="Filter by shape tag">
          <legend className="catalog-filter-legend">Filter:</legend>
          {(['all', 'boxy', 'non-boxy'] as const).map((value) => (
            <label key={value} className="catalog-filter-option">
              <input
                type="radio"
                name="catalog-boxy-filter"
                value={value}
                checked={boxyFilter === value}
                onChange={() => setBoxyFilter(value)}
              />
              {value === 'all' ? 'All' : value === 'boxy' ? 'Boxy' : 'Non-Boxy'}
            </label>
          ))}
        </fieldset>
        <span className="dims" aria-live="polite">
          {computing
            ? 'Computing…'
            : boxyFilter === 'all'
              ? `${filtered.length} distinct piece${filtered.length === 1 ? '' : 's'}`
              : `${filtered.length} of ${tagged.length} piece${tagged.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {computing ? (
        <p className="hint" role="status">
          Enumerating pieces…
        </p>
      ) : filtered.length === 0 ? (
        <p className="hint" role="status">
          No pieces match the current filter at this size.
        </p>
      ) : (
        <div className="variant-list catalog-list">
          {filtered.map(({ poly, boxy }, i) => (
            <CatalogPiece key={poly.key} poly={poly} index={i} boxy={boxy} onSelect={onSelectPiece} />
          ))}
        </div>
      )}
    </section>
  );
}

const CatalogPiece = memo(function CatalogPiece({
  poly,
  index,
  boxy,
  onSelect,
}: {
  poly: Polyomino;
  index: number;
  boxy: boolean;
  onSelect: (grid: Grid) => void;
}) {
  const rows = poly.grid.length;
  const cols = poly.grid[0]?.length ?? 0;
  const handleClick = useCallback(() => onSelect(poly.grid), [onSelect, poly.grid]);
  return (
    <button
      type="button"
      className="variant catalog-piece"
      aria-label={`Load piece ${index + 1} (${rows} by ${cols}, ${boxy ? 'boxy' : 'non-boxy'}) into the Shape Helper`}
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
      <span className={`catalog-piece-tag ${boxy ? 'is-boxy' : 'is-non-boxy'}`}>
        {boxy ? 'Boxy' : 'Non-Boxy'}
      </span>
    </button>
  );
});

