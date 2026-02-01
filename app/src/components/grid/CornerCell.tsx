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
        className="w-full h-full bg-gray-50 border-r border-b border-gray-300 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500"
        onClick={onSelectAll}
        title="Select all cells"
        aria-label="Select all cells"
      >
        {/* Optional: Add a small triangle indicator */}
        <svg
          className="w-2 h-2 text-gray-400 absolute bottom-1 right-1"
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
