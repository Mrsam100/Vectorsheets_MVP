/**
 * FillHandleOverlay - Fill handle square and fill-drag preview
 *
 * Renders:
 * 1. The fill handle (small blue square at bottom-right of selection)
 * 2. A dashed-border preview of the fill-target region during drag
 *
 * Visibility rules:
 * - Handle shown only for single contiguous selection
 * - Hidden during drag, edit mode, and format painter mode
 * - During fill drag, shows dashed preview of the target area
 *
 * No business logic — pure visual affordance driven by props and context.
 */

import React, { memo, useMemo, useCallback } from 'react';
import { useGridContext } from './GridContext';
import type { SelectionRange, RenderCell, RenderFrame, RowPosition, ColPosition } from './types';

// =============================================================================
// Types
// =============================================================================

export interface FillHandleOverlayProps {
  className?: string;
  style?: React.CSSProperties;
  /** Callback when fill handle is mousedown'd */
  onFillHandleMouseDown?: (e: React.MouseEvent, anchorCell: { row: number; col: number }) => void;
  /** Is any drag in progress? (hides fill handle) */
  isDragging?: boolean;
  /** Is cell editing active? (hides fill handle) */
  isEditing?: boolean;
  /** Is format painter active? (hides fill handle) */
  isFormatPainterActive?: boolean;
  /** Source range preserved at BeginFillDrag — used to render dashed target preview */
  fillSourceRange?: SelectionRange | null;
}

interface RangeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// =============================================================================
// Utilities
// =============================================================================

// Numeric key avoids per-cell string allocation during Map.set (hot path on scroll)
// Must exceed max column index (16383) to prevent key collisions at boundary
const CELL_KEY_COLS = 16385;
function cellKey(row: number, col: number): number {
  return row * CELL_KEY_COLS + col;
}

interface FrameLookups {
  cellMap: Map<number, RenderCell>;
  rowMap: Map<number, RowPosition>;
  colMap: Map<number, ColPosition>;
}

/**
 * Build O(1) lookup maps from a RenderFrame.
 * Called once per frame change via useMemo, then reused across all rect calculations.
 */
function buildLookups(frame: RenderFrame): FrameLookups {
  const cellMap = new Map<number, RenderCell>();
  for (const cell of frame.cells) cellMap.set(cellKey(cell.row, cell.col), cell);
  const rowMap = new Map<number, RowPosition>();
  for (const row of frame.rows) rowMap.set(row.row, row);
  const colMap = new Map<number, ColPosition>();
  for (const col of frame.columns) colMap.set(col.col, col);
  return { cellMap, rowMap, colMap };
}

/**
 * Calculate pixel rectangle for a selection range using pre-built lookups.
 * Returns null if range is entirely outside the viewport.
 */
function calculateRangeRect(
  minRow: number,
  maxRow: number,
  minCol: number,
  maxCol: number,
  frame: RenderFrame,
  lookups: FrameLookups,
  headerOffset: { x: number; y: number },
): RangeRect | null {
  const { visibleRange } = frame;

  // Range completely outside viewport
  if (
    maxRow < visibleRange.startRow ||
    minRow > visibleRange.endRow ||
    maxCol < visibleRange.startCol ||
    minCol > visibleRange.endCol
  ) {
    return null;
  }

  // Clamp to visible area
  const clampedMinRow = Math.max(minRow, visibleRange.startRow);
  const clampedMaxRow = Math.min(maxRow, visibleRange.endRow);
  const clampedMinCol = Math.max(minCol, visibleRange.startCol);
  const clampedMaxCol = Math.min(maxCol, visibleRange.endCol);

  const { cellMap, rowMap, colMap } = lookups;

  // Try corner cells first (O(1) lookups, no array allocation)
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

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

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

  // Fallback: iterate rows/columns
  for (let r = clampedMinRow; r <= clampedMaxRow; r++) {
    const row = rowMap.get(r);
    if (row) {
      const ry = row.top - headerOffset.y;
      minY = Math.min(minY, ry);
      maxY = Math.max(maxY, ry + row.height);
    }
  }
  for (let c = clampedMinCol; c <= clampedMaxCol; c++) {
    const col = colMap.get(c);
    if (col) {
      const cx = col.left - headerOffset.x;
      minX = Math.min(minX, cx);
      maxX = Math.max(maxX, cx + col.width);
    }
  }

  if (minX === Infinity || minY === Infinity) return null;

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// =============================================================================
// Fill Handle Square
// =============================================================================

interface FillHandleSquareProps {
  rect: RangeRect;
  onMouseDown: (e: React.PointerEvent | React.MouseEvent) => void;
}

const FillHandleSquare: React.FC<FillHandleSquareProps> = memo(({ rect, onMouseDown }) => {
  return (
    <div
      className="fill-handle absolute cursor-crosshair"
      style={{
        // Position at bottom-right corner of the range rect
        // Only positioning & z-index here — colors/transitions in CSS so :hover/:active work
        left: rect.x + rect.width - 5,
        top: rect.y + rect.height - 5,
        width: 10,
        height: 10,
        zIndex: 51,
        pointerEvents: 'auto',
        touchAction: 'none',
      }}
      onPointerDown={onMouseDown}
      role="button"
      aria-label="Fill handle - drag to fill cells"
      tabIndex={-1}
    />
  );
});

FillHandleSquare.displayName = 'FillHandleSquare';

// =============================================================================
// Fill Drag Preview (dashed border on target region)
// =============================================================================

interface FillDragPreviewProps {
  rect: RangeRect;
}

const FillDragPreview: React.FC<FillDragPreviewProps> = memo(({ rect }) => {
  return (
    <div
      className="fill-drag-preview absolute"
      style={{
        transform: `translate3d(${rect.x}px, ${rect.y}px, 0)`,
        width: rect.width,
        height: rect.height,
        willChange: 'transform',
        border: '2px dashed var(--color-selection-border)',
        backgroundColor: 'var(--color-selection-secondary-fill)',
        boxSizing: 'border-box',
        zIndex: 41,
        pointerEvents: 'none',
      }}
      role="presentation"
      aria-hidden="true"
    />
  );
});

FillDragPreview.displayName = 'FillDragPreview';

// =============================================================================
// Static Styles (hoisted to avoid per-render allocation)
// =============================================================================

const OVERLAY_STYLE: React.CSSProperties = {
  zIndex: 50,
  pointerEvents: 'none',
};

// =============================================================================
// Main FillHandleOverlay Component
// =============================================================================

export const FillHandleOverlay: React.FC<FillHandleOverlayProps> = memo(
  ({
    className = '',
    style,
    onFillHandleMouseDown,
    isDragging = false,
    isEditing = false,
    isFormatPainterActive = false,
    fillSourceRange,
  }) => {
    const { config, frame, selection } = useGridContext();

    const headerOffset = useMemo(
      () => ({ x: config.rowHeaderWidth, y: config.colHeaderHeight }),
      [config.rowHeaderWidth, config.colHeaderHeight],
    );

    // Memoize lookup maps once per frame change — reused across all rect calculations.
    // Without this, Maps would be rebuilt on every selection change during fill drag.
    const lookups = useMemo(() => {
      if (!frame) return null;
      return buildLookups(frame);
    }, [frame]);

    // Determine the primary range rect (last range, or active cell as single-cell range)
    const primaryRangeRect = useMemo(() => {
      if (!frame || !lookups) return null;

      const range = selection.ranges.length > 0
        ? selection.ranges[selection.ranges.length - 1]
        : selection.activeCell
          ? { startRow: selection.activeCell.row, startCol: selection.activeCell.col,
              endRow: selection.activeCell.row, endCol: selection.activeCell.col }
          : null;

      if (!range) return null;

      const minRow = Math.min(range.startRow, range.endRow);
      const maxRow = Math.max(range.startRow, range.endRow);
      const minCol = Math.min(range.startCol, range.endCol);
      const maxCol = Math.max(range.startCol, range.endCol);

      return calculateRangeRect(minRow, maxRow, minCol, maxCol, frame, lookups, headerOffset);
    }, [frame, lookups, selection.ranges, selection.activeCell, headerOffset]);

    // Show handle: visible active cell, single contiguous selection, not dragging/editing/painting
    const showHandle =
      primaryRangeRect !== null &&
      selection.activeCell !== null &&
      !isDragging &&
      !isEditing &&
      !isFormatPainterActive &&
      selection.ranges.length <= 1;

    // Fill drag preview: compute the target-only region (expanded minus source)
    const fillTargetRect = useMemo(() => {
      if (!isDragging || !fillSourceRange || !frame || !lookups || selection.ranges.length === 0) return null;

      const expanded = selection.ranges[0];
      const srcMinRow = Math.min(fillSourceRange.startRow, fillSourceRange.endRow);
      const srcMaxRow = Math.max(fillSourceRange.startRow, fillSourceRange.endRow);
      const srcMinCol = Math.min(fillSourceRange.startCol, fillSourceRange.endCol);
      const srcMaxCol = Math.max(fillSourceRange.startCol, fillSourceRange.endCol);

      const expMinRow = Math.min(expanded.startRow, expanded.endRow);
      const expMaxRow = Math.max(expanded.startRow, expanded.endRow);
      const expMinCol = Math.min(expanded.startCol, expanded.endCol);
      const expMaxCol = Math.max(expanded.startCol, expanded.endCol);

      // Determine which direction the fill extends
      let targetMinRow: number, targetMaxRow: number, targetMinCol: number, targetMaxCol: number;

      if (expMaxRow > srcMaxRow) {
        // Fill extends downward
        targetMinRow = srcMaxRow + 1;
        targetMaxRow = expMaxRow;
        targetMinCol = srcMinCol;
        targetMaxCol = srcMaxCol;
      } else if (expMinRow < srcMinRow) {
        // Fill extends upward
        targetMinRow = expMinRow;
        targetMaxRow = srcMinRow - 1;
        targetMinCol = srcMinCol;
        targetMaxCol = srcMaxCol;
      } else if (expMaxCol > srcMaxCol) {
        // Fill extends rightward
        targetMinRow = srcMinRow;
        targetMaxRow = srcMaxRow;
        targetMinCol = srcMaxCol + 1;
        targetMaxCol = expMaxCol;
      } else if (expMinCol < srcMinCol) {
        // Fill extends leftward
        targetMinRow = srcMinRow;
        targetMaxRow = srcMaxRow;
        targetMinCol = expMinCol;
        targetMaxCol = srcMinCol - 1;
      } else {
        // No extension (cursor still inside source)
        return null;
      }

      return calculateRangeRect(targetMinRow, targetMaxRow, targetMinCol, targetMaxCol, frame, lookups, headerOffset);
    }, [isDragging, fillSourceRange, frame, lookups, selection.ranges, headerOffset]);

    // Fill handle mousedown handler — use primitive row/col deps to avoid
    // recreating the callback on every selection change (object identity).
    const activeCellRow = selection.activeCell?.row ?? 0;
    const activeCellCol = selection.activeCell?.col ?? 0;

    const handleFillMouseDown = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        onFillHandleMouseDown?.(e, { row: activeCellRow, col: activeCellCol });
      },
      [activeCellRow, activeCellCol, onFillHandleMouseDown],
    );

    if (!frame) return null;

    return (
      <div
        className={`fill-handle-overlay absolute inset-0 overflow-hidden ${className}`}
        style={style ? { ...OVERLAY_STYLE, ...style } : OVERLAY_STYLE}
        role="presentation"
        aria-hidden="true"
      >
        {/* Fill handle square */}
        {showHandle && primaryRangeRect && (
          <FillHandleSquare
            rect={primaryRangeRect}
            onMouseDown={handleFillMouseDown}
          />
        )}

        {/* Dashed preview of the fill target region during drag */}
        {fillTargetRect && (
          <FillDragPreview rect={fillTargetRect} />
        )}
      </div>
    );
  },
);

FillHandleOverlay.displayName = 'FillHandleOverlay';

export default FillHandleOverlay;
