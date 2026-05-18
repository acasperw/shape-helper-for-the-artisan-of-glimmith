import { memo } from 'react';
import type { Split } from '../splits';
import { edgeStyle } from '../utils/edgeStyle';
import { bboxOf, gridFromCells } from '../utils/bbox';
import { MiniGrid } from './MiniGrid';

function SplitViewImpl({ split }: { split: Split }) {
  const { minR, minC, rows, cols } = bboxOf(split.a, split.b);
  const gridA = gridFromCells(split.a, rows, cols, minR, minC);
  const gridB = gridFromCells(split.b, rows, cols, minR, minC);

  const aLabel = `${split.a.length} cells`;
  const bLabel = `${split.b.length} cells`;

  return (
    <figure className="variant split">
      <MiniGrid
        rows={rows}
        cols={cols}
        ariaLabel={`${split.congruent ? 'Congruent split' : 'Split'}: ${aLabel} and ${bLabel}`}
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
        {split.congruent ? <strong>Tiles twice</strong> : 'Uneven cut'}{' '}
        <span className="dims">({split.a.length} + {split.b.length})</span>
      </figcaption>
    </figure>
  );
}

export const SplitView = memo(SplitViewImpl);
