/**
 * FormatPainterOverlay - Visual affordances when the format painter is active
 *
 * Renders:
 * 1. Source range highlight (dashed green border around the picked range)
 * 2. Hover preview (green tint over the cell/range under cursor)
 * 3. Visual distinction for persistent mode (thicker border)
 *
 * No business logic — all visuals driven by state props from parent.
 * The parent owns the FormatPainter engine instance and passes down
 * FormatPainterUIState reflecting the engine's current mode/source.
 */

import React, { memo, useMemo } from 'react';
import type { FormatPainterUIState } from './types';

// =============================================================================
// Types
// =============================================================================

export interface FormatPainterOverlayProps {
  /** Format painter state from engine */
  state: FormatPainterUIState;
  /** Cell under mouse cursor (for hover preview) */
  hoverCell?: { row: number; col: number } | null;
  /** Get cell pixel position (from VirtualRenderer, merge-aware) */
  getCellPosition: (row: number, col: number) => { x: number; y: number; width: number; height: number };
  /** Current scroll offset */
  scroll: { scrollLeft: number; scrollTop: number };
}

// =============================================================================
// Source Range Highlight
// =============================================================================

interface SourceHighlightProps {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
  isPersistent: boolean;
  getCellPosition: (row: number, col: number) => { x: number; y: number; width: number; height: number };
  scroll: { scrollLeft: number; scrollTop: number };
}

const SourceHighlight: React.FC<SourceHighlightProps> = memo(
  ({ startRow, startCol, endRow, endCol, isPersistent, getCellPosition, scroll }) => {
    const startPos = getCellPosition(startRow, startCol);
    const endPos = getCellPosition(endRow, endCol);

    const x = startPos.x - scroll.scrollLeft;
    const y = startPos.y - scroll.scrollTop;
    const width = (endPos.x + endPos.width) - startPos.x;
    const height = (endPos.y + endPos.height) - startPos.y;

    // Off-screen check
    if (x + width < 0 || y + height < 0) return null;

    return (
      <div
        className="format-painter-source absolute"
        style={{
          transform: `translate3d(${x}px, ${y}px, 0)`,
          width,
          height,
          willChange: 'transform',
          border: `${isPersistent ? 3 : 2}px dashed var(--color-format-painter)`,
          backgroundColor: 'var(--color-format-painter-fill)',
          boxSizing: 'border-box',
          pointerEvents: 'none',
        }}
        role="presentation"
        aria-label="Format painter source range"
      />
    );
  },
);

SourceHighlight.displayName = 'SourceHighlight';

// =============================================================================
// Hover Preview
// =============================================================================

interface HoverPreviewProps {
  row: number;
  col: number;
  /** Source range dimensions for tiling the preview */
  sourceRows: number;
  sourceCols: number;
  getCellPosition: (row: number, col: number) => { x: number; y: number; width: number; height: number };
  scroll: { scrollLeft: number; scrollTop: number };
}

const HoverPreview: React.FC<HoverPreviewProps> = memo(
  ({ row, col, sourceRows, sourceCols, getCellPosition, scroll }) => {
    // Preview covers the same dimensions as the source range, starting at hover cell
    const startPos = getCellPosition(row, col);
    const endPos = getCellPosition(row + sourceRows - 1, col + sourceCols - 1);

    const x = startPos.x - scroll.scrollLeft;
    const y = startPos.y - scroll.scrollTop;
    const width = (endPos.x + endPos.width) - startPos.x;
    const height = (endPos.y + endPos.height) - startPos.y;

    if (x + width < 0 || y + height < 0) return null;

    return (
      <div
        className="format-painter-hover absolute"
        style={{
          transform: `translate3d(${x}px, ${y}px, 0)`,
          width,
          height,
          willChange: 'transform',
          backgroundColor: 'var(--color-format-painter-hover)',
          border: '1px solid var(--color-format-painter-border)',
          boxSizing: 'border-box',
          pointerEvents: 'none',
        }}
        role="presentation"
        aria-hidden="true"
      />
    );
  },
);

HoverPreview.displayName = 'HoverPreview';

// =============================================================================
// Static Styles (hoisted to avoid per-render allocation)
// =============================================================================

const OVERLAY_STYLE: React.CSSProperties = {
  zIndex: 42,
  pointerEvents: 'none',
  transform: 'translateZ(0)',
};

// =============================================================================
// Main FormatPainterOverlay Component
// =============================================================================

export const FormatPainterOverlay: React.FC<FormatPainterOverlayProps> = memo(
  ({ state, hoverCell, getCellPosition, scroll }) => {
    const { mode, sourceRange } = state;

    // Source range dimensions (for hover preview tiling)
    const sourceDims = useMemo(() => {
      if (!sourceRange) return { rows: 1, cols: 1 };
      const rows = Math.abs(sourceRange.endRow - sourceRange.startRow) + 1;
      const cols = Math.abs(sourceRange.endCol - sourceRange.startCol) + 1;
      return { rows, cols };
    }, [sourceRange]);

    // Normalized source range (ensure min <= max)
    const normalizedSource = useMemo(() => {
      if (!sourceRange) return null;
      return {
        startRow: Math.min(sourceRange.startRow, sourceRange.endRow),
        startCol: Math.min(sourceRange.startCol, sourceRange.endCol),
        endRow: Math.max(sourceRange.startRow, sourceRange.endRow),
        endCol: Math.max(sourceRange.startCol, sourceRange.endCol),
      };
    }, [sourceRange]);

    if (mode === 'inactive') return null;

    return (
      <div
        className="format-painter-overlay absolute inset-0 overflow-hidden"
        style={OVERLAY_STYLE}
        role="presentation"
        aria-label="Format painter indicators"
      >
        {/* Source range highlight (dashed green border) */}
        {normalizedSource && (
          <SourceHighlight
            startRow={normalizedSource.startRow}
            startCol={normalizedSource.startCol}
            endRow={normalizedSource.endRow}
            endCol={normalizedSource.endCol}
            isPersistent={mode === 'persistent'}
            getCellPosition={getCellPosition}
            scroll={scroll}
          />
        )}

        {/* Hover preview (green tint over target area) */}
        {hoverCell && (
          <HoverPreview
            row={hoverCell.row}
            col={hoverCell.col}
            sourceRows={sourceDims.rows}
            sourceCols={sourceDims.cols}
            getCellPosition={getCellPosition}
            scroll={scroll}
          />
        )}
      </div>
    );
  },
);

FormatPainterOverlay.displayName = 'FormatPainterOverlay';

export default FormatPainterOverlay;
