/**
 * SelectionOverlay - Renders selection visuals over the cell layer
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                     SELECTION OVERLAY ARCHITECTURE                       │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │                                                                         │
 * │   ┌─────────────────────────────────────────────────────────────┐       │
 * │   │ Selection Rectangles (z-index: 40)                          │       │
 * │   │ - Multi-range support (Ctrl+click selections)               │       │
 * │   │ - Translucent blue fill                                     │       │
 * │   │ - Primary range has darker fill                             │       │
 * │   │ - GPU-accelerated with transform                            │       │
 * │   └─────────────────────────────────────────────────────────────┘       │
 * │                                                                         │
 * │   ┌─────────────────────────────────────────────────────────────┐       │
 * │   │ Active Cell Border (z-index: 50)                            │       │
 * │   │ - 2px solid blue border                                     │       │
 * │   │ - Fill handle rendered by FillHandleOverlay (separate)      │       │
 * │   └─────────────────────────────────────────────────────────────┘       │
 * │                                                                         │
 * │   Performance Optimizations:                                            │
 * │   - O(1) cell lookup using Map                                          │
 * │   - GPU acceleration via transform/will-change                          │
 * │   - Memoized calculations                                               │
 * │   - Efficient range rect calculation                                    │
 * │                                                                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import React, { memo, useMemo } from 'react';
import { useGridContext } from './GridContext';
import type { SelectionRange, RenderCell, RenderFrame, RowPosition, ColPosition } from './types';

// =============================================================================
// Types
// =============================================================================

export interface SelectionOverlayProps {
  /** Optional class name */
  className?: string;
  /** Optional inline styles */
  style?: React.CSSProperties;
}

interface RangeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface NormalizedRange {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

// =============================================================================
// Optimized Lookup Structures
// =============================================================================

// Numeric key avoids per-cell string allocation during Map.set (hot path on scroll)
// Must exceed max column index (16383) to prevent key collisions at boundary
const CELL_KEY_COLS = 16385;
function cellKey(row: number, col: number): number {
  return row * CELL_KEY_COLS + col;
}

/**
 * Create O(1) lookup maps for cells, rows, and columns
 */
function createLookupMaps(frame: RenderFrame) {
  const cellMap = new Map<number, RenderCell>();
  const rowMap = new Map<number, RowPosition>();
  const colMap = new Map<number, ColPosition>();

  for (const cell of frame.cells) {
    cellMap.set(cellKey(cell.row, cell.col), cell);
  }
  for (const row of frame.rows) {
    rowMap.set(row.row, row);
  }
  for (const col of frame.columns) {
    colMap.set(col.col, col);
  }

  return { cellMap, rowMap, colMap };
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Normalize a selection range so min values come first
 */
function normalizeRange(range: SelectionRange): NormalizedRange {
  return {
    minRow: Math.min(range.startRow, range.endRow),
    maxRow: Math.max(range.startRow, range.endRow),
    minCol: Math.min(range.startCol, range.endCol),
    maxCol: Math.max(range.startCol, range.endCol),
  };
}

/**
 * Check if a range represents a single cell
 */
function isSingleCellRange(range: NormalizedRange): boolean {
  return range.minRow === range.maxRow && range.minCol === range.maxCol;
}

/**
 * Calculate pixel rectangle for a selection range using optimized lookups
 * Falls back to row/column positions when cells aren't in viewport
 */
function calculateRangeRect(
  range: NormalizedRange,
  frame: RenderFrame,
  lookups: ReturnType<typeof createLookupMaps>,
  headerOffset: { x: number; y: number }
): RangeRect | null {
  const { cellMap, rowMap, colMap } = lookups;
  const visibleRange = frame.visibleRange;

  // Check if range overlaps with visible area at all
  if (
    range.maxRow < visibleRange.startRow ||
    range.minRow > visibleRange.endRow ||
    range.maxCol < visibleRange.startCol ||
    range.minCol > visibleRange.endCol
  ) {
    return null; // Range is completely outside viewport
  }

  // Clamp range to visible area for efficient lookup
  const clampedMinRow = Math.max(range.minRow, visibleRange.startRow);
  const clampedMaxRow = Math.min(range.maxRow, visibleRange.endRow);
  const clampedMinCol = Math.max(range.minCol, visibleRange.startCol);
  const clampedMaxCol = Math.min(range.maxCol, visibleRange.endCol);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  // Try to find corner cells for bounds (O(1) lookups, no array allocation)
  const tl = cellMap.get(cellKey(clampedMinRow, clampedMinCol));
  const tr = cellMap.get(cellKey(clampedMinRow, clampedMaxCol));
  const bl = cellMap.get(cellKey(clampedMaxRow, clampedMinCol));
  const br = cellMap.get(cellKey(clampedMaxRow, clampedMaxCol));

  if (tl && tr && bl && br) {
    const tlX = tl.x - headerOffset.x;
    const tlY = tl.y - headerOffset.y;
    const brX = br.x - headerOffset.x + br.width;
    const brY = br.y - headerOffset.y + br.height;
    return { x: tlX, y: tlY, width: brX - tlX, height: brY - tlY };
  }

  // Partial corners found — accumulate bounds
  for (const c of [tl, tr, bl, br]) {
    if (c) {
      const cx = c.x - headerOffset.x;
      const cy = c.y - headerOffset.y;
      if (cx < minX) minX = cx;
      if (cy < minY) minY = cy;
      if (cx + c.width > maxX) maxX = cx + c.width;
      if (cy + c.height > maxY) maxY = cy + c.height;
    }
  }

  // Fallback: use row/column positions for bounds we couldn't find
  // This handles edge cases and partial visibility
  for (let r = clampedMinRow; r <= clampedMaxRow; r++) {
    const row = rowMap.get(r);
    if (row) {
      const rowY = row.top - headerOffset.y;
      minY = Math.min(minY, rowY);
      maxY = Math.max(maxY, rowY + row.height);
    }
  }

  for (let c = clampedMinCol; c <= clampedMaxCol; c++) {
    const col = colMap.get(c);
    if (col) {
      const colX = col.left - headerOffset.x;
      minX = Math.min(minX, colX);
      maxX = Math.max(maxX, colX + col.width);
    }
  }

  // If still no bounds found, range is not visible
  if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

// =============================================================================
// Selection Range Rectangle Component
// =============================================================================

interface SelectionRectProps {
  rect: RangeRect;
  isPrimary: boolean;
  isSingleCell: boolean;
  isOnlyRange: boolean;
}

const SelectionRect: React.FC<SelectionRectProps> = memo(
  ({ rect, isPrimary, isSingleCell, isOnlyRange }) => {
    // Don't render fill for single-cell selections when it's the only range
    // (active cell border handles the visual)
    const showFill = !(isSingleCell && isOnlyRange);

    return (
      <div
        className={`selection-rect absolute ${
          isPrimary ? 'selection-rect-primary' : 'selection-rect-secondary'
        }`}
        style={{
          // Use transform for GPU acceleration
          transform: `translate3d(${rect.x}px, ${rect.y}px, 0)`,
          width: rect.width,
          height: rect.height,
          // Prevent layout thrashing
          contain: 'layout style',
          // Primary range: darker fill, secondary: lighter fill
          backgroundColor: showFill
            ? isPrimary
              ? 'var(--color-selection-fill)'
              : 'var(--color-selection-secondary-fill)'
            : 'transparent',
          // Border on multi-cell ranges or multi-range selections
          border: showFill
            ? isPrimary
              ? '1px solid var(--color-selection-border)'
              : '1px solid var(--color-selection-secondary-border)'
            : 'none',
          boxSizing: 'border-box',
          zIndex: isPrimary ? 41 : 40,
          pointerEvents: 'none',
          // Smooth transitions for better UX (but not during rapid updates)
          transition: 'background-color 50ms ease-out',
        }}
        role="presentation"
        aria-hidden="true"
      />
    );
  }
);

SelectionRect.displayName = 'SelectionRect';

// =============================================================================
// Active Cell Border Component
// =============================================================================

interface ActiveCellBorderProps {
  cell: RenderCell;
  headerOffset: { x: number; y: number };
}

const ActiveCellBorder: React.FC<ActiveCellBorderProps> = memo(
  ({ cell, headerOffset }) => {
    const x = cell.x - headerOffset.x;
    const y = cell.y - headerOffset.y;

    return (
      <div
        className="active-cell-border absolute"
        style={{
          // Use transform for GPU acceleration - position slightly outside cell
          transform: `translate3d(${x - 1}px, ${y - 1}px, 0)`,
          width: cell.width + 2,
          height: cell.height + 2,
          contain: 'layout style',
          // Excel-style themed border
          border: '2px solid var(--color-grid-selection-border)',
          boxSizing: 'border-box',
          zIndex: 50,
          // Subtle shadow for depth
          boxShadow: '0 0 0 1px var(--color-selection-secondary-border)',
          pointerEvents: 'none',
        }}
        role="presentation"
        aria-hidden="true"
      />
    );
  }
);

ActiveCellBorder.displayName = 'ActiveCellBorder';

// =============================================================================
// Static Styles (hoisted to avoid per-render allocation)
// =============================================================================

const OVERLAY_STYLE: React.CSSProperties = {
  zIndex: 40,
  pointerEvents: 'none',
  transform: 'translateZ(0)',
};

// =============================================================================
// Main SelectionOverlay Component
// =============================================================================

/**
 * SelectionOverlay - Renders all selection visuals
 *
 * Responsibilities:
 * 1. Render active cell border
 * 2. Render primary selection rectangle
 * 3. Render secondary selection ranges (multi-select)
 *
 * Constraints:
 * - No selection math - receives normalized ranges from context
 * - Pixel-perfect alignment using RenderFrame cell positions
 * - Absolutely positioned over CellLayer
 * - GPU-accelerated for smooth performance
 */
export const SelectionOverlay: React.FC<SelectionOverlayProps> = memo(
  ({ className = '', style }) => {
    const { config, frame, selection } = useGridContext();

    // Header offset for position calculations
    const headerOffset = useMemo(
      () => ({
        x: config.rowHeaderWidth,
        y: config.colHeaderHeight,
      }),
      [config.rowHeaderWidth, config.colHeaderHeight]
    );

    // Create lookup maps for O(1) cell access
    const lookups = useMemo(() => {
      if (!frame) return null;
      return createLookupMaps(frame);
    }, [frame]);

    // Calculate selection rectangles from ranges
    const selectionRects = useMemo(() => {
      if (!frame || !lookups || selection.ranges.length === 0) return [];

      return selection.ranges
        .map((range, index) => {
          const normalized = normalizeRange(range);
          const rect = calculateRangeRect(normalized, frame, lookups, headerOffset);
          if (!rect) return null;

          return {
            rect,
            isPrimary: index === selection.ranges.length - 1,
            isSingleCell: isSingleCellRange(normalized),
            // Stable key based on range bounds
            key: `sel-${index}-${normalized.minRow}-${normalized.minCol}-${normalized.maxRow}-${normalized.maxCol}`,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
    }, [frame, lookups, selection.ranges, headerOffset]);

    // Find active cell render data with O(1) lookup
    const activeCellRender = useMemo(() => {
      if (!frame || !lookups || !selection.activeCell) return null;
      return lookups.cellMap.get(cellKey(selection.activeCell.row, selection.activeCell.col)) ?? null;
    }, [frame, lookups, selection.activeCell]);

    // Don't render if no frame
    if (!frame) return null;

    return (
      <div
        className={`selection-overlay absolute inset-0 overflow-hidden ${className}`}
        style={style ? { ...OVERLAY_STYLE, ...style } : OVERLAY_STYLE}
        role="presentation"
        aria-label="Selection indicators"
      >
        {/* Selection range rectangles - render in order, primary last for z-index */}
        {selectionRects.map(({ rect, isPrimary, isSingleCell, key }) => (
          <SelectionRect
            key={key}
            rect={rect}
            isPrimary={isPrimary}
            isSingleCell={isSingleCell}
            isOnlyRange={selectionRects.length === 1}
          />
        ))}

        {/* Active cell border (rendered last for highest z-index) */}
        {activeCellRender && (
          <ActiveCellBorder
            cell={activeCellRender}
            headerOffset={headerOffset}
          />
        )}
      </div>
    );
  }
);

SelectionOverlay.displayName = 'SelectionOverlay';

export default SelectionOverlay;
