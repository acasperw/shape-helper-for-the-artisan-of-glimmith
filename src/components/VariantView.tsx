import { memo } from 'react';
import type { Grid } from '../shape';
import { edgeStyle } from '../utils/edgeStyle';
import { MiniGrid } from './MiniGrid';

function VariantViewImpl({ label, grid }: { label: string; grid: Grid }) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  return (
    <figure className="variant">
      <MiniGrid
        rows={rows}
        cols={cols}
        ariaLabel={`${label}, ${rows} by ${cols}`}
        renderCell={(r, c) => {
          const cell = grid[r][c];
          return (
            <div
              key={`${r}-${c}`}
              aria-hidden="true"
              className={`cell ${cell ? 'on' : ''}`}
              style={cell ? edgeStyle(grid, r, c) : undefined}
            />
          );
        }}
      />
      <figcaption>
        {label} <span className="dims">({rows}×{cols})</span>
      </figcaption>
    </figure>
  );
}

export const VariantView = memo(VariantViewImpl);
