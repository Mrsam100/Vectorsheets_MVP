/**
 * RowHeaders - Virtualized row header column
 *
 * Features:
 * - Shows 1, 2, 3, ... labels
 * - Scrolls vertically in sync with grid (via scroll state)
 * - Sticks horizontally (always visible at left)
 * - Grid lines align perfectly with cells
 * - Frozen rows stay fixed while scrollable rows move
 *
 * Uses same row metrics as CellLayer (from RenderFrame)
 */

import React, { memo, useCallback, useMemo } from 'react';
import { useGridContext } from './GridContext';
import type { RowPosition } from './types';

export interface RowHeadersProps {
  className?: string;
}

/**
 * Individual row header cell
 */
const RowHeader: React.FC<{
  row: RowPosition;
  isSelected: boolean;
  headerOffset: number;
  onClick?: (row: number, e: React.MouseEvent) => void;
}> = memo(({ row, isSelected, headerOffset, onClick }) => {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onClick?.(row.row, e);
    },
    [row.row, onClick]
  );

  // Adjust position - rows come with absolute screen coordinates
  // but we're in a container offset by colHeaderHeight
  const adjustedTop = row.top - headerOffset;

  return (
    <div
      className="row-header absolute flex items-center justify-center select-none cursor-pointer border-r border-b"
      style={{
        top: adjustedTop,
        height: row.height,
        width: '100%',
        left: 0,
        // Frozen rows have higher z-index
        zIndex: row.frozen ? 20 : 10,
        // Excel-like typography
        fontSize: '11px',
        fontWeight: 500,
        letterSpacing: '0.01em',
      }}
      onClick={handleClick}
      role="rowheader"
      aria-rowindex={row.row + 1}
      aria-selected={isSelected}
    >
      <span className="truncate">{row.row + 1}</span>

      {/* Resize handle - bottom edge */}
      <div
        className="resize-handle absolute left-0 right-0 bottom-0 h-1 cursor-row-resize transition-colors"
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          // Row resize would be handled via callback
        }}
      />
    </div>
  );
});

RowHeader.displayName = 'RowHeader';

/**
 * RowHeaders container
 *
 * Positioning:
 * - Fixed at left (sticky horizontally)
 * - Positioned after column headers vertically
 * - Contains both frozen and scrollable rows
 */
export const RowHeaders: React.FC<RowHeadersProps> = memo(
  ({ className = '' }) => {
    const { config, frame, isRowSelected, onRowHeaderClick } = useGridContext();

    // Memoize frozen/scrollable row arrays to avoid O(n) filter + allocation per render.
    // RowHeaders re-renders on every selection change via context, but rows
    // only change when frame changes (scroll, zoom, resize).
    const { frozenRows, scrollableRows } = useMemo(() => ({
      frozenRows: frame?.rows.filter((r) => r.frozen) ?? [],
      scrollableRows: frame?.rows.filter((r) => !r.frozen) ?? [],
    }), [frame?.rows]);

    if (!frame) return null;

    // Header offset for adjusting row positions
    const headerOffset = config.colHeaderHeight;

    return (
      <div
        className={`row-headers absolute overflow-hidden ${className}`}
        style={{
          left: 0,
          top: config.colHeaderHeight,
          width: config.rowHeaderWidth,
          bottom: 0,
          // Ensure headers are above cells
          zIndex: 30,
        }}
        role="rowgroup"
        aria-label="Row headers"
      >
        {/* Frozen rows - don't move with scroll */}
        {frozenRows.map((row) => (
          <RowHeader
            key={`frozen-row-${row.row}`}
            row={row}
            isSelected={isRowSelected(row.row)}
            headerOffset={headerOffset}
            onClick={onRowHeaderClick}
          />
        ))}

        {/* Scrollable rows - positions already account for scroll */}
        {scrollableRows.map((row) => (
          <RowHeader
            key={`row-${row.row}`}
            row={row}
            isSelected={isRowSelected(row.row)}
            headerOffset={headerOffset}
            onClick={onRowHeaderClick}
          />
        ))}

        {/* Right border line for visual separation */}
        <div
          className="absolute top-0 bottom-0 right-0 w-px"
          style={{ zIndex: 25, backgroundColor: 'var(--color-grid-header-border)' }}
        />
      </div>
    );
  }
);

RowHeaders.displayName = 'RowHeaders';

export default RowHeaders;
