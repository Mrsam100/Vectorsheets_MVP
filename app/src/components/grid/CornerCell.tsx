/**
 * CornerCell - Top-left corner of the grid
 *
 * The intersection of row and column headers.
 * Clicking selects all cells.
 */

import React, { memo } from 'react';
import { useGridContext } from './GridContext';

export interface CornerCellProps {
  className?: string;
}

export const CornerCell: React.FC<CornerCellProps> = memo(({ className = '' }) => {
  const { config, onSelectAll } = useGridContext();

  return (
    <div
      className={`corner-cell absolute top-0 left-0 z-30 ${className}`}
      style={{
        width: config.rowHeaderWidth,
        height: config.colHeaderHeight,
      }}
    >
      <button
        className="w-full h-full border-r border-b transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-inset"
        style={{ borderColor: 'var(--color-grid-header-border)' }}
        onClick={onSelectAll}
        title="Select all cells"
        aria-label="Select all cells"
      >
        {/* Small triangle indicator */}
        <svg
          className="w-2 h-2 absolute bottom-1 right-1"
          style={{ color: 'var(--color-text-muted)' }}
          viewBox="0 0 8 8"
          fill="currentColor"
        >
          <path d="M0 8 L8 8 L8 0 Z" />
        </svg>
      </button>
    </div>
  );
});

CornerCell.displayName = 'CornerCell';

export default CornerCell;
