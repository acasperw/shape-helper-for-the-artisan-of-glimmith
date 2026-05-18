import { memo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { gridTemplateStyle } from '../utils/edgeStyle';

type MiniGridProps = {
  rows: number;
  cols: number;
  ariaLabel?: string;
  ariaHidden?: boolean;
  className?: string;
  cellVar?: string;
  /** Called for each (r, c). Return the cell node (typically a styled <div>). */
  renderCell: (r: number, c: number) => ReactNode;
  style?: CSSProperties;
};

/**
 * Read-only grid of cells. Used by VariantView, CatalogPiece, SplitView,
 * SelfFitView, and TilingView. The caller decides per-cell content/styling
 * via `renderCell`.
 */
function MiniGridImpl({ rows, cols, ariaLabel, ariaHidden, className, cellVar, renderCell, style }: MiniGridProps) {
  const merged: CSSProperties = { ...gridTemplateStyle(rows, cols, cellVar), ...style };
  const cells: ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) cells.push(renderCell(r, c));
  }
  return (
    <div
      className={`mini-grid${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={ariaHidden ? undefined : ariaLabel}
      aria-hidden={ariaHidden || undefined}
      style={merged}
    >
      {cells}
    </div>
  );
}

export const MiniGrid = memo(MiniGridImpl);
