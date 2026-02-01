/**
 * FormulaReferenceHighlight - Visual highlighting of cell references in formulas
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                    FORMULA REFERENCE HIGHLIGHTING                           │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │                                                                             │
 * │   Formula: =SUM(A1:B5) + C3 * AVERAGE(D1:D10)                              │
 * │                                                                             │
 * │   ┌─────────────────────────────────────────────────────────────────────┐   │
 * │   │ Grid                                                               │   │
 * │   │  ┌─────┬─────┬─────┬─────┐                                         │   │
 * │   │  │  A  │  B  │  C  │  D  │                                         │   │
 * │   │  ├─────┼─────┼─────┼─────┤                                         │   │
 * │   │1 │█████│█████│     │▓▓▓▓▓│  ← A1:B5 (blue), D1:D10 (purple)       │   │
 * │   │  │ ref │ ref │     │ ref │                                         │   │
 * │   │  ├─────┼─────┼─────┼─────┤                                         │   │
 * │   │2 │█████│█████│     │▓▓▓▓▓│                                         │   │
 * │   │  ├─────┼─────┼─────┼─────┤                                         │   │
 * │   │3 │█████│█████│▒▒▒▒▒│▓▓▓▓▓│  ← C3 (green)                          │   │
 * │   │  ├─────┼─────┼─────┼─────┤                                         │   │
 * │   │4 │█████│█████│     │▓▓▓▓▓│                                         │   │
 * │   │  ├─────┼─────┼─────┼─────┤                                         │   │
 * │   │5 │█████│█████│     │▓▓▓▓▓│                                         │   │
 * │   │  └─────┴─────┴─────┴─────┘                                         │   │
 * │   └─────────────────────────────────────────────────────────────────────┘   │
 * │                                                                             │
 * │   Color Cycling:                                                            │
 * │   - Each distinct reference gets a unique color                             │
 * │   - Colors cycle through a palette (like Excel)                             │
 * │   - Same color for reference in formula text and cell highlight            │
 * │                                                                             │
 * │   Point Mode:                                                               │
 * │   - Active reference during point mode has pulsing animation               │
 * │   - Drag selection shows range preview with dashed border                  │
 * │                                                                             │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import React, { memo, useMemo, useEffect } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface CellReference {
  /** Reference string (e.g., "A1", "B2:C5") */
  ref: string;
  /** Start row (0-indexed) */
  startRow: number;
  /** Start column (0-indexed) */
  startCol: number;
  /** End row (same as start for single cell) */
  endRow: number;
  /** End column (same as start for single cell) */
  endCol: number;
  /** Whether this is a range reference */
  isRange: boolean;
  /** Color assigned to this reference */
  color: string;
  /** Index in the formula (for tracking) */
  index: number;
}

export interface PointModeState {
  /** Is point mode active? */
  isActive: boolean;
  /** Currently selected cell for point mode */
  pointCell?: { row: number; col: number } | null;
  /** Range end cell if dragging */
  pointRangeEnd?: { row: number; col: number } | null;
  /** Color for the current point selection */
  pointColor?: string;
}

export interface FormulaReferenceHighlightProps {
  /** The formula being edited */
  formula: string;
  /** Get cell position for rendering */
  getCellPosition: (row: number, col: number) => { x: number; y: number; width: number; height: number };
  /** Current scroll position */
  scroll?: { scrollLeft: number; scrollTop: number };
  /** Point mode state */
  pointMode?: PointModeState;
  /** Z-index for highlights */
  zIndex?: number;
  /** Callback when reference colors are computed (for formula bar sync) */
  onReferenceColors?: (references: CellReference[]) => void;
}

// =============================================================================
// Color Palette (Excel-like cycling)
// =============================================================================

/**
 * Excel-style reference color palette
 * Each reference gets a unique color from this cycle
 */
export const REFERENCE_COLORS = [
  '#4285f4', // Blue
  '#ea4335', // Red
  '#9c27b0', // Purple
  '#ff9800', // Orange
  '#34a853', // Green
  '#00bcd4', // Cyan
  '#e91e63', // Pink
  '#795548', // Brown
  '#607d8b', // Blue-gray
  '#673ab7', // Deep purple
] as const;

/**
 * Get color for reference at index (cycles through palette)
 */
export function getReferenceColor(index: number): string {
  return REFERENCE_COLORS[index % REFERENCE_COLORS.length];
}

// =============================================================================
// Formula Parsing
// =============================================================================

/**
 * Parse a column letter to 0-indexed column number
 * A = 0, B = 1, ..., Z = 25, AA = 26, etc.
 */
export function columnToIndex(col: string): number {
  let result = 0;
  for (let i = 0; i < col.length; i++) {
    result = result * 26 + (col.charCodeAt(i) - 64);
  }
  return result - 1;
}

/**
 * Parse cell reference string to row/col
 * Examples: "A1" -> {row: 0, col: 0}, "B2" -> {row: 1, col: 1}
 */
export function parseReference(ref: string): { row: number; col: number } | null {
  // Match column letters and row number, accounting for $ anchors
  const match = ref.match(/^\$?([A-Z]+)\$?(\d+)$/i);
  if (!match) return null;

  const col = columnToIndex(match[1].toUpperCase());
  const row = parseInt(match[2], 10) - 1;

  if (row < 0 || col < 0) return null;
  return { row, col };
}

/**
 * Check if a position in the formula is inside a string literal
 */
function isPositionInsideString(formula: string, position: number): boolean {
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < position && i < formula.length; i++) {
    const char = formula[i];

    if (!inString && (char === '"' || char === "'")) {
      inString = true;
      stringChar = char;
    } else if (inString && char === stringChar) {
      // Check for escaped quote (doubled quote in Excel)
      if (i + 1 < formula.length && formula[i + 1] === stringChar) {
        i++; // Skip escaped quote
      } else {
        inString = false;
      }
    }
  }

  return inString;
}

/**
 * Parse all cell references from a formula
 */
export function parseFormulaReferences(formula: string): CellReference[] {
  if (!formula.startsWith('=')) return [];

  const references: CellReference[] = [];

  // Regex to match cell references (handles $, ranges like A1:B5)
  // This matches: A1, $A1, A$1, $A$1, A1:B5, $A$1:$B$5, etc.
  const refRegex = /\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?/gi;

  let match;
  let index = 0;
  const seen = new Set<string>(); // Track unique references

  while ((match = refRegex.exec(formula)) !== null) {
    const fullMatch = match[0];
    const matchPosition = match.index;

    // Skip if this match is inside a string literal
    if (isPositionInsideString(formula, matchPosition)) continue;

    // Skip if we've already processed this exact reference
    if (seen.has(fullMatch.toUpperCase())) continue;
    seen.add(fullMatch.toUpperCase());

    const startCol = columnToIndex(match[1].toUpperCase());
    const startRow = parseInt(match[2], 10) - 1;

    // Skip invalid references (row or column < 0)
    if (startRow < 0 || startCol < 0) continue;

    let endCol = startCol;
    let endRow = startRow;
    let isRange = false;

    // Check if it's a range reference
    if (match[3] && match[4]) {
      endCol = columnToIndex(match[3].toUpperCase());
      endRow = parseInt(match[4], 10) - 1;
      // Skip invalid range end
      if (endRow < 0 || endCol < 0) continue;
      isRange = true;
    }

    // Normalize range (ensure start <= end)
    const normalizedRef: CellReference = {
      ref: fullMatch,
      startRow: Math.min(startRow, endRow),
      startCol: Math.min(startCol, endCol),
      endRow: Math.max(startRow, endRow),
      endCol: Math.max(startCol, endCol),
      isRange,
      color: getReferenceColor(index),
      index,
    };

    references.push(normalizedRef);
    index++;
  }

  return references;
}

// =============================================================================
// Styles
// =============================================================================

const styles = {
  container: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    pointerEvents: 'none' as const,
    overflow: 'hidden',
  },

  highlight: {
    position: 'absolute' as const,
    boxSizing: 'border-box' as const,
    pointerEvents: 'none' as const,
  },

  border: {
    borderWidth: 2,
    borderStyle: 'solid',
  },

  fill: {
    opacity: 0.1,
  },

  pointModePulse: {
    animation: 'pointModePulse 1s ease-in-out infinite',
  },

  pointModePreview: {
    borderStyle: 'dashed',
    borderWidth: 2,
  },
};

// Inject keyframes for pulse animation
if (typeof document !== 'undefined') {
  const styleId = 'formula-reference-highlight-styles';
  if (!document.getElementById(styleId)) {
    const styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.textContent = `
      @keyframes pointModePulse {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 0.6; }
      }
    `;
    document.head.appendChild(styleEl);
  }
}

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Single reference highlight box
 */
const ReferenceBox = memo(({
  reference,
  getCellPosition,
  scroll = { scrollLeft: 0, scrollTop: 0 },
  isPulsing = false,
  isPreview = false,
}: {
  reference: CellReference;
  getCellPosition: (row: number, col: number) => { x: number; y: number; width: number; height: number };
  scroll?: { scrollLeft: number; scrollTop: number };
  isPulsing?: boolean;
  isPreview?: boolean;
}) => {
  // Calculate the bounding box for the reference
  const startPos = getCellPosition(reference.startRow, reference.startCol);
  const endPos = getCellPosition(reference.endRow, reference.endCol);

  const x = startPos.x - scroll.scrollLeft;
  const y = startPos.y - scroll.scrollTop;
  const width = (endPos.x + endPos.width) - startPos.x;
  const height = (endPos.y + endPos.height) - startPos.y;

  // Don't render if completely off-screen
  if (x + width < 0 || y + height < 0) return null;

  const boxStyle: React.CSSProperties = {
    ...styles.highlight,
    left: x,
    top: y,
    width,
    height,
    borderColor: reference.color,
    backgroundColor: reference.color,
    ...(isPreview ? styles.pointModePreview : styles.border),
    ...styles.fill,
    ...(isPulsing ? { animation: 'pointModePulse 1s ease-in-out infinite' } : {}),
  };

  return <div style={boxStyle} data-ref={reference.ref} />;
});

ReferenceBox.displayName = 'ReferenceBox';

/**
 * Point mode preview (shows where reference will be inserted)
 */
const PointModePreview = memo(({
  pointCell,
  pointRangeEnd,
  color,
  getCellPosition,
  scroll = { scrollLeft: 0, scrollTop: 0 },
}: {
  pointCell: { row: number; col: number };
  pointRangeEnd?: { row: number; col: number } | null;
  color: string;
  getCellPosition: (row: number, col: number) => { x: number; y: number; width: number; height: number };
  scroll?: { scrollLeft: number; scrollTop: number };
}) => {
  // Create a temporary reference for the preview
  const endCell = pointRangeEnd || pointCell;
  const previewRef: CellReference = {
    ref: 'preview',
    startRow: Math.min(pointCell.row, endCell.row),
    startCol: Math.min(pointCell.col, endCell.col),
    endRow: Math.max(pointCell.row, endCell.row),
    endCol: Math.max(pointCell.col, endCell.col),
    isRange: pointRangeEnd != null,
    color,
    index: -1,
  };

  return (
    <ReferenceBox
      reference={previewRef}
      getCellPosition={getCellPosition}
      scroll={scroll}
      isPulsing
      isPreview={previewRef.isRange}
    />
  );
});

PointModePreview.displayName = 'PointModePreview';

// =============================================================================
// Main Component
// =============================================================================

/**
 * FormulaReferenceHighlight - Renders colored overlays for cell references
 *
 * Usage:
 * ```tsx
 * <FormulaReferenceHighlight
 *   formula="=SUM(A1:B5) + C3"
 *   getCellPosition={(row, col) => renderer.getCellPosition(row, col)}
 *   scroll={{ scrollLeft: 0, scrollTop: 0 }}
 *   pointMode={{
 *     isActive: editState.mode === 'point',
 *     pointCell: { row: 3, col: 2 },
 *     pointColor: '#4285f4',
 *   }}
 * />
 * ```
 */
export const FormulaReferenceHighlight: React.FC<FormulaReferenceHighlightProps> = memo(({
  formula,
  getCellPosition,
  scroll = { scrollLeft: 0, scrollTop: 0 },
  pointMode,
  zIndex = 50,
  onReferenceColors,
}) => {
  // Parse references from formula (pure computation)
  const references = useMemo(() => {
    return parseFormulaReferences(formula);
  }, [formula]);

  // Notify parent of reference colors (side effect in useEffect, not useMemo)
  useEffect(() => {
    if (onReferenceColors && references.length > 0) {
      onReferenceColors(references);
    }
  }, [references, onReferenceColors]);

  // Don't render if no formula or no references
  if (!formula.startsWith('=') && !pointMode?.isActive) {
    return null;
  }

  return (
    <div
      style={{
        ...styles.container,
        zIndex,
        width: '100%',
        height: '100%',
      }}
      data-formula-highlight="true"
      aria-hidden="true"
    >
      {/* Existing reference highlights */}
      {references.map((ref) => (
        <ReferenceBox
          key={`${ref.ref}-${ref.index}`}
          reference={ref}
          getCellPosition={getCellPosition}
          scroll={scroll}
        />
      ))}

      {/* Point mode preview */}
      {pointMode?.isActive && pointMode.pointCell && (
        <PointModePreview
          pointCell={pointMode.pointCell}
          pointRangeEnd={pointMode.pointRangeEnd}
          color={pointMode.pointColor || getReferenceColor(references.length)}
          getCellPosition={getCellPosition}
          scroll={scroll}
        />
      )}
    </div>
  );
});

FormulaReferenceHighlight.displayName = 'FormulaReferenceHighlight';

// =============================================================================
// Exports
// =============================================================================

export default FormulaReferenceHighlight;
