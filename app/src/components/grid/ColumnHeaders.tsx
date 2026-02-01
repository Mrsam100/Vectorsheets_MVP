/**
 * ColumnHeaders - Virtualized column header row
 *
 * Features:
 * - Shows A, B, C, ..., Z, AA, AB, ... labels
 * - Scrolls horizontally in sync with grid (via scroll state)
 * - Sticks vertically (always visible at top)
 * - Grid lines align perfectly with cells
 * - Frozen columns stay fixed while scrollable columns move
 *
 * Uses same column metrics as CellLayer (from RenderFrame)
 */

import React, { memo, useCallback, useMemo } from 'react';
import { useGridContext } from './GridContext';
import { getColumnLabel } from './types';
import type { ColPosition } from './types';

export interface ColumnHeadersProps {
  className?: string;
}

/**
 * Individual column header cell
 */
const ColumnHeader: React.FC<{
  column: ColPosition;
  isSelected: boolean;
  headerOffset: number;
  onClick?: (col: number, e: React.MouseEvent) => void;
}> = memo(({ column, isSelected, headerOffset, onClick }) => {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onClick?.(column.col, e);
    },
    [column.col, onClick]
  );

  // Adjust position - columns come with absolute screen coordinates
  // but we're in a container offset by rowHeaderWidth
  const adjustedLeft = column.left - headerOffset;

  return (
    <div
      className={`column-header absolute flex items-center justify-center select-none cursor-pointer border-r border-b ${
        isSelected
          ? 'bg-blue-100 text-blue-700 border-blue-200'
          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
      }`}
      style={{
        left: adjustedLeft,
        width: column.width,
        height: '100%',
        top: 0,
        // Frozen columns have higher z-index
        zIndex: column.frozen ? 20 : 10,
        // Excel-like typography
        fontSize: '11px',
        fontWeight: 500,
        letterSpacing: '0.01em',
      }}
      onClick={handleClick}
      role="columnheader"
      aria-colindex={column.col + 1}
      aria-selected={isSelected}
    >
      <span className="truncate">{getColumnLabel(column.col)}</span>

      {/* Resize handle - right edge */}
      <div
        className="resize-handle absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 transition-colors"
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          // Column resize would be handled via callback
        }}
      />
    </div>
  );
});

ColumnHeader.displayName = 'ColumnHeader';

/**
 * ColumnHeaders container
 *
 * Positioning:
 * - Fixed at top (sticky vertically)
 * - Positioned after row headers horizontally
 * - Contains both frozen and scrollable columns
 */
export const ColumnHeaders: React.FC<ColumnHeadersProps> = memo(
  ({ className = '' }) => {
    const { config, frame, isColSelected, onColHeaderClick } = useGridContext();

    // Memoize frozen/scrollable column arrays to avoid O(n) filter + allocation per render.
    // ColumnHeaders re-renders on every selection change via context, but columns
    // only change when frame changes (scroll, zoom, resize).
    const { frozenCols, scrollableCols } = useMemo(() => ({
      frozenCols: frame?.columns.filter((col) => col.frozen) ?? [],
      scrollableCols: frame?.columns.filter((col) => !col.frozen) ?? [],
    }), [frame?.columns]);

    if (!frame) return null;

    // Header offset for adjusting column positions
    const headerOffset = config.rowHeaderWidth;

    return (
      <div
        className={`column-headers absolute overflow-hidden bg-gray-50 ${className}`}
        style={{
          left: config.rowHeaderWidth,
          top: 0,
          right: 0,
          height: config.colHeaderHeight,
          // Ensure headers are above cells
          zIndex: 30,
        }}
        role="row"
        aria-label="Column headers"
      >
        {/* Frozen columns - don't move with scroll */}
        {frozenCols.map((column) => (
          <ColumnHeader
            key={`frozen-col-${column.col}`}
            column={column}
            isSelected={isColSelected(column.col)}
            headerOffset={headerOffset}
            onClick={onColHeaderClick}
          />
        ))}

        {/* Scrollable columns - positions already account for scroll */}
        {scrollableCols.map((column) => (
          <ColumnHeader
            key={`col-${column.col}`}
            column={column}
            isSelected={isColSelected(column.col)}
            headerOffset={headerOffset}
            onClick={onColHeaderClick}
          />
        ))}

        {/* Bottom border line for visual separation */}
        <div
          className="absolute left-0 right-0 bottom-0 h-px bg-gray-300"
          style={{ zIndex: 25 }}
        />
      </div>
    );
  }
);

ColumnHeaders.displayName = 'ColumnHeaders';

export default ColumnHeaders;
