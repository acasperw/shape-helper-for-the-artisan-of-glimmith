import { memo } from 'react';
import type { SelfCluster } from '../selfFit';
import { edgeStyle } from '../utils/edgeStyle';
import { bboxOf, gridFromCells } from '../utils/bbox';
import { MiniGrid } from './MiniGrid';

/** CSS classes for pieces, keyed by index. Index 0 is the original (A). */
const PIECE_CLASSES = ['piece-a', 'piece-b', 'piece-c', 'piece-d'] as const;

function SelfClusterViewImpl({ cluster }: { cluster: SelfCluster }) {
  const allCells = [cluster.a, ...cluster.pieces.map((p) => p.cells)];
  const { minR, minC, rows, cols } = bboxOf(...allCells);
  const grids = allCells.map((cells) => gridFromCells(cells, rows, cols, minR, minC));

  const labels = cluster.pieces.map((p) => p.label).join(' + ');

  return (
    <figure className="variant split">
      <MiniGrid
        rows={rows}
        cols={cols}
        ariaLabel={`${cluster.pieces.length + 1}-copy cluster (${labels}), ${cluster.contactEdges} shared edges${cluster.isRectangle ? ', forms a rectangle' : ''}`}
        renderCell={(r, c) => {
          let owner = -1;
          for (let i = 0; i < grids.length; i++) {
            if (grids[i][r][c]) { owner = i; break; }
          }
          if (owner < 0) {
            return <div key={`${r}-${c}`} aria-hidden="true" className="cell" />;
          }
          const cls = `cell on ${PIECE_CLASSES[owner] ?? PIECE_CLASSES[PIECE_CLASSES.length - 1]}`;
          return (
            <div
              key={`${r}-${c}`}
              aria-hidden="true"
              className={cls}
              style={edgeStyle(grids[owner], r, c)}
            />
          );
        }}
      />
      <figcaption>
        <strong>{labels}</strong>{' '}
        <span className="dims">
          {cluster.contactEdges} shared edge{cluster.contactEdges === 1 ? '' : 's'}
          {cluster.isRectangle ? (
            <>
              {' · '}
              <span className="rect-badge">rectangle {rows}×{cols}</span>
            </>
          ) : null}
        </span>
      </figcaption>
    </figure>
  );
}

export const SelfClusterView = memo(SelfClusterViewImpl);
