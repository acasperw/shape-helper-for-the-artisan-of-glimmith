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
    return <p className="hint">Board cell count isn't a multiple of the piece cell count — no exact tiling possible.</p>;
  }
  if (tiling.aborted) return <p className="hint">Search exceeded its iteration budget.</p>;
  if (!tiling.solution) return <p className="hint">No tiling of this board by that piece exists.</p>;

  // Cropped bounding box derived from the solution itself so we stay in sync
  // with the (debounced) board the solver actually used.
  let minR = Infinity, minC = Infinity, maxR = -1, maxC = -1;
  for (const placement of tiling.solution) {
    for (const { r, c } of placement) {
      if (r < minR) minR = r; if (r > maxR) maxR = r;
      if (c < minC) minC = c; if (c > maxC) maxC = c;
    }
  }
  const rows = maxR - minR + 1;
  const cols = maxC - minC + 1;
  const tileIdx: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(-1));
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
    <MiniGrid
      rows={rows}
      cols={cols}
      className="tiling-grid"
      ariaLabel={`Tiling using ${tiling.solution.length} piece copies`}
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
  );
}
