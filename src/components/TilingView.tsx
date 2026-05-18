import { memo } from 'react';
import type { Grid } from '../shape';
import type { Placement } from '../tile';
import type { tileRegion } from '../tile';
import { edgeStyle } from '../utils/edgeStyle';
import { MiniGrid } from './MiniGrid';

type TilingResult = ReturnType<typeof tileRegion>;

export function TilingView({ tiling }: { grid: Grid; tiling: TilingResult | null }) {
  if (!tiling) return null;

  if (tiling.emptyBoard) return <p className="hint">Draw a board below to start tiling.</p>;
  if (tiling.emptyPiece) return <p className="hint">Draw a piece on the main grid above first.</p>;
  if (tiling.tooLarge) return <p className="hint">Board or piece is too large for tiling search.</p>;
  if (tiling.disconnectedPiece) return <p className="hint">The piece must be a single connected shape.</p>;
  if (tiling.sizeMismatch) {
    return (
      <p className="hint">Board cell count isn't a multiple of the piece cell count — no exact tiling possible.</p>
    );
  }
  if (tiling.solutions.length === 0) {
    if (tiling.aborted) return <p className="hint">Search exceeded its iteration budget.</p>;
    return <p className="hint">No tiling of this board by that piece exists.</p>;
  }

  const count = tiling.solutions.length;
  return (
    <div>
      <p className="hint" aria-live="polite">
        {count} solution{count === 1 ? '' : 's'}
        {tiling.truncated ? `+ (showing the first ${count} — more may exist)` : ''}
        {tiling.aborted ? ' — search hit its iteration budget, results may be partial' : ''}
      </p>
      <div className="variant-list tiling-solutions">
        {tiling.solutions.map((solution, i) => (
          <TilingSolution key={i} solution={solution} index={i} />
        ))}
      </div>
    </div>
  );
}

const TilingSolution = memo(function TilingSolution({
  solution,
  index,
}: {
  solution: Placement[];
  index: number;
}) {
  // Bounding box derived from the placements themselves so we stay in sync
  // with the (debounced) board the solver actually used.
  let minR = Infinity, minC = Infinity, maxR = -1, maxC = -1;
  for (const placement of solution) {
    for (const { r, c } of placement) {
      if (r < minR) minR = r; if (r > maxR) maxR = r;
      if (c < minC) minC = c; if (c > maxC) maxC = c;
    }
  }
  const rows = maxR - minR + 1;
  const cols = maxC - minC + 1;
  const tileIdx: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(-1));
  const placementGrids: Grid[] = solution.map(() =>
    Array.from({ length: rows }, () => new Array(cols).fill(false) as boolean[]),
  );
  solution.forEach((placement, idx) => {
    for (const { r, c } of placement) {
      const rr = r - minR;
      const cc = c - minC;
      tileIdx[rr][cc] = idx;
      placementGrids[idx][rr][cc] = true;
    }
  });

  return (
    <figure className="variant">
      <MiniGrid
        rows={rows}
        cols={cols}
        className="tiling-grid"
        ariaLabel={`Solution ${index + 1}: tiling using ${solution.length} piece copies`}
        renderCell={(r, c) => {
          const idx = tileIdx[r][c];
          if (idx < 0) return <div key={`${r}-${c}`} aria-hidden="true" className="cell" />;
          const colorClass = `tile-${idx % 8}`;
          return (
            <div
              key={`${r}-${c}`}
              aria-hidden="true"
              className={`cell on ${colorClass}`}
              style={edgeStyle(placementGrids[idx], r, c)}
            />
          );
        }}
      />
      <figcaption>
        Solution #{index + 1} <span className="dims">({solution.length} pieces)</span>
      </figcaption>
    </figure>
  );
});
