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

import React, { memo, useCallback, useMemo, useRef } from 'react';
import { useGridContext } from './GridContext';
import { getColumnLabel } from './types';
import type { ColPosition } from './types';

export interface ColumnHeadersProps {
  className?: string;
  isColumnFiltered?: (col: number) => boolean;
  onFilterClick?: (col: number, anchorRect: DOMRect) => void;
}

/**
 * Individual column header cell
 */
const ColumnHeader: React.FC<{
  column: ColPosition;
  isSelected: boolean;
  isFiltered: boolean;
  headerOffset: number;
  onClick?: (col: number, e: React.MouseEvent) => void;
  onFilterClick?: (col: number, anchorRect: DOMRect) => void;
}> = memo(({ column, isSelected, isFiltered, headerOffset, onClick, onFilterClick }) => {
  const headerRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onClick?.(column.col, e);
    },
    [column.col, onClick]
  );

  const handleFilterClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (headerRef.current && onFilterClick) {
        const rect = headerRef.current.getBoundingClientRect();
        onFilterClick(column.col, rect);
      }
    },
    [column.col, onFilterClick]
  );

  // Adjust position - columns come with absolute screen coordinates
  // but we're in a container offset by rowHeaderWidth
  const adjustedLeft = column.left - headerOffset;

  return (
    <div
      ref={headerRef}
      className="column-header absolute flex items-center justify-center select-none cursor-pointer border-r border-b group"
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

      {/* Active filter indicator - always visible when filtered */}
      {isFiltered && (
        <svg
          className="filter-icon-active ml-1"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="Filtered"
        >
          <path
            d="M1 2h10L7 6.5V10L5 11V6.5L1 2z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="0.5"
          />
        </svg>
      )}

      {/* Filter dropdown button - visible on hover or when filtered */}
      {onFilterClick && (
        <button
          className="filter-button absolute right-7 top-1/2 -translate-y-1/2 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-100 rounded"
          onClick={handleFilterClick}
          aria-label={`Filter column ${getColumnLabel(column.col)}`}
          title="Filter"
          style={{ zIndex: 5 }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M2 3.5L5 6.5L8 3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      {/* Resize handle - right edge */}
      <div
        className="resize-handle absolute right-0 top-0 bottom-0 w-1 cursor-col-resize transition-colors"
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
  ({ className = '', isColumnFiltered, onFilterClick }) => {
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
        className={`column-headers absolute overflow-hidden ${className}`}
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
            isFiltered={isColumnFiltered?.(column.col) ?? false}
            headerOffset={headerOffset}
            onClick={onColHeaderClick}
            onFilterClick={onFilterClick}
          />
        ))}

        {/* Scrollable columns - positions already account for scroll */}
        {scrollableCols.map((column) => (
          <ColumnHeader
            key={`col-${column.col}`}
            column={column}
            isSelected={isColSelected(column.col)}
            isFiltered={isColumnFiltered?.(column.col) ?? false}
            headerOffset={headerOffset}
            onClick={onColHeaderClick}
            onFilterClick={onFilterClick}
          />
        ))}

        {/* Bottom border line for visual separation */}
        <div
          className="absolute left-0 right-0 bottom-0 h-px"
          style={{ zIndex: 25, backgroundColor: 'var(--color-grid-header-border)' }}
        />
      </div>
    );
  }
);

ColumnHeaders.displayName = 'ColumnHeaders';

export default ColumnHeaders;
