import { memo } from 'react';
import type { SelfFit } from '../selfFit';
import { edgeStyle } from '../utils/edgeStyle';
import { bboxOf, gridFromCells } from '../utils/bbox';
import { MiniGrid } from './MiniGrid';

function SelfFitViewImpl({ fit }: { fit: SelfFit }) {
  const { minR, minC, rows, cols } = bboxOf(fit.a, fit.b);
  const gridA = gridFromCells(fit.a, rows, cols, minR, minC);
  const gridB = gridFromCells(fit.b, rows, cols, minR, minC);

  return (
    <figure className="variant split">
      <MiniGrid
        rows={rows}
        cols={cols}
        ariaLabel={`Self-fit placement (${fit.variantLabel}), ${fit.contactEdges} shared edges`}
        renderCell={(r, c) => {
          const inA = gridA[r][c];
          const inB = gridB[r][c];
          const cls = inA ? 'cell on piece-a' : inB ? 'cell on piece-b' : 'cell';
          const style = inA
            ? edgeStyle(gridA, r, c)
            : inB
              ? edgeStyle(gridB, r, c)
              : undefined;
          return <div key={`${r}-${c}`} aria-hidden="true" className={cls} style={style} />;
        }}
      />
      <figcaption>
        <strong>{fit.variantLabel}</strong>{' '}
        <span className="dims">
          {fit.contactEdges} shared edge{fit.contactEdges === 1 ? '' : 's'}
        </span>
      </figcaption>
    </figure>
  );
}

export const SelfFitView = memo(SelfFitViewImpl);
