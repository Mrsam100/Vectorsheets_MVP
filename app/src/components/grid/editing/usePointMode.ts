/**
 * usePointMode - React hook for Point mode management
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                           POINT MODE FLOW                                   │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │                                                                             │
 * │   User Typing Formula                                                       │
 * │       │                                                                     │
 * │       │ types operator (+, -, *, /, (, =)                                   │
 * │       ▼                                                                     │
 * │   ┌─────────────────────────────────────────────────────────────────────┐   │
 * │   │                    Enter Point Mode                                 │   │
 * │   │  - Save cursor position                                             │   │
 * │   │  - Track operator position (insertion point)                        │   │
 * │   │  - Show visual indicator                                            │   │
 * │   └─────────────────────────────────────────────────────────────────────┘   │
 * │                              │                                              │
 * │               ┌──────────────┼──────────────┐                               │
 * │               │              │              │                               │
 * │               ▼              ▼              ▼                               │
 * │   ┌───────────────┐ ┌───────────────┐ ┌───────────────┐                    │
 * │   │  Click Cell   │ │  Arrow Keys   │ │  Type/Escape  │                    │
 * │   │               │ │               │ │               │                    │
 * │   │ Insert A1 ref │ │ Move to cell  │ │ Exit Point    │                    │
 * │   │ at cursor     │ │ Insert ref    │ │ mode          │                    │
 * │   └───────────────┘ └───────────────┘ └───────────────┘                    │
 * │               │              │              │                               │
 * │               └──────────────┼──────────────┘                               │
 * │                              │                                              │
 * │                              ▼                                              │
 * │   ┌─────────────────────────────────────────────────────────────────────┐   │
 * │   │                  Continue Editing Formula                           │   │
 * │   │  - Reference inserted                                               │   │
 * │   │  - Cursor after reference                                           │   │
 * │   │  - Ready for next operator                                          │   │
 * │   └─────────────────────────────────────────────────────────────────────┘   │
 * │                                                                             │
 * │   Range Selection (Drag):                                                   │
 * │   - Click+Drag: Creates A1:B5 range reference                              │
 * │   - Updates live preview during drag                                        │
 * │   - Finalizes on mouse up                                                   │
 * │                                                                             │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { getReferenceColor } from './FormulaReferenceHighlight';

// =============================================================================
// Types
// =============================================================================

export interface PointModeState {
  /** Whether Point mode is active */
  isActive: boolean;
  /** The cell being pointed at (for single reference) */
  pointCell: { row: number; col: number } | null;
  /** End cell if selecting a range */
  pointRangeEnd: { row: number; col: number } | null;
  /** Whether we're in a drag operation */
  isDragging: boolean;
  /** The color for the current reference */
  currentColor: string;
  /** Position where reference will be inserted */
  insertionPoint: number;
  /** Number of references already in formula (for color cycling) */
  referenceCount: number;
}

export interface PointModeActions {
  /** Enter Point mode at the current cursor position */
  enterPointMode: (cursorPosition: number, referenceCount?: number) => void;
  /** Exit Point mode without inserting */
  exitPointMode: () => void;
  /** Handle cell click in Point mode */
  handleCellClick: (row: number, col: number) => string | null;
  /** Start drag selection from a cell */
  beginDragSelection: (row: number, col: number) => void;
  /** Update drag selection (during drag) */
  updateDragSelection: (row: number, col: number) => void;
  /** End drag selection */
  endDragSelection: () => string | null;
  /** Move point selection by keyboard */
  movePointSelection: (direction: 'up' | 'down' | 'left' | 'right', extend: boolean) => string | null;
  /** Check if character should trigger Point mode */
  shouldEnterPointMode: (char: string, formula: string, cursorPos: number) => boolean;
}

export interface UsePointModeReturn {
  state: PointModeState;
  actions: PointModeActions;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert column index to letter (0 = A, 1 = B, ..., 25 = Z, 26 = AA)
 */
function columnToLetter(col: number): string {
  let result = '';
  let n = col + 1;
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

/**
 * Format cell as A1-style reference
 */
export function formatCellRef(row: number, col: number): string {
  // Ensure non-negative values
  const safeRow = Math.max(0, row);
  const safeCol = Math.max(0, col);
  return `${columnToLetter(safeCol)}${safeRow + 1}`;
}

/**
 * Format range as A1:B5-style reference
 */
export function formatRangeRef(
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number
): string {
  // Normalize range (ensure start <= end)
  const r1 = Math.min(startRow, endRow);
  const c1 = Math.min(startCol, endCol);
  const r2 = Math.max(startRow, endRow);
  const c2 = Math.max(startCol, endCol);

  // Single cell
  if (r1 === r2 && c1 === c2) {
    return formatCellRef(r1, c1);
  }

  return `${formatCellRef(r1, c1)}:${formatCellRef(r2, c2)}`;
}

/**
 * Characters that should trigger Point mode when typed in a formula
 */
const POINT_MODE_TRIGGERS = new Set([
  '=', // Start of formula or comparison
  '+', // Addition
  '-', // Subtraction
  '*', // Multiplication
  '/', // Division
  '(', // Function argument start
  ',', // Argument separator
  ':', // Range operator (special case)
  '^', // Power
  '&', // Concatenation
  '<', // Less than
  '>', // Greater than
  ';', // European separator
]);

/**
 * Check if position is inside a string literal
 */
function isInsideString(formula: string, position: number): boolean {
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < position && i < formula.length; i++) {
    const char = formula[i];

    if (!inString && (char === '"' || char === "'")) {
      inString = true;
      stringChar = char;
    } else if (inString && char === stringChar) {
      // Check for escaped quote
      if (i + 1 < formula.length && formula[i + 1] === stringChar) {
        i++; // Skip escaped quote
      } else {
        inString = false;
      }
    }
  }

  return inString;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * usePointMode - Manages Point mode state for formula editing
 *
 * Usage:
 * ```tsx
 * const { state: pointState, actions: pointActions } = usePointMode();
 *
 * // In keyboard handler
 * if (pointActions.shouldEnterPointMode(e.key, formula, cursorPos)) {
 *   pointActions.enterPointMode(cursorPos, existingRefs.length);
 * }
 *
 * // In pointer handler (Point mode active)
 * if (pointState.isActive) {
 *   const ref = pointActions.handleCellClick(row, col);
 *   if (ref) {
 *     insertText(ref);
 *   }
 * }
 * ```
 */
export function usePointMode(): UsePointModeReturn {
  // State
  const [state, setState] = useState<PointModeState>({
    isActive: false,
    pointCell: null,
    pointRangeEnd: null,
    isDragging: false,
    currentColor: getReferenceColor(0),
    insertionPoint: 0,
    referenceCount: 0,
  });

  // Ref for avoiding stale closures
  const stateRef = useRef(state);
  stateRef.current = state;

  // Enter Point mode
  const enterPointMode = useCallback((cursorPosition: number, referenceCount: number = 0) => {
    setState({
      isActive: true,
      pointCell: null,
      pointRangeEnd: null,
      isDragging: false,
      currentColor: getReferenceColor(referenceCount),
      insertionPoint: cursorPosition,
      referenceCount,
    });
  }, []);

  // Exit Point mode
  const exitPointMode = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isActive: false,
      pointCell: null,
      pointRangeEnd: null,
      isDragging: false,
    }));
  }, []);

  // Handle cell click in Point mode
  const handleCellClick = useCallback((row: number, col: number): string | null => {
    const currentState = stateRef.current;
    if (!currentState.isActive) return null;

    const ref = formatCellRef(row, col);

    // Update state with clicked cell
    setState((prev) => ({
      ...prev,
      pointCell: { row, col },
      pointRangeEnd: null,
    }));

    return ref;
  }, []);

  // Begin drag selection
  const beginDragSelection = useCallback((row: number, col: number) => {
    setState((prev) => ({
      ...prev,
      isActive: true,
      pointCell: { row, col },
      pointRangeEnd: null,
      isDragging: true,
    }));
  }, []);

  // Update drag selection
  const updateDragSelection = useCallback((row: number, col: number) => {
    setState((prev) => {
      if (!prev.isDragging || !prev.pointCell) return prev;

      return {
        ...prev,
        pointRangeEnd: { row, col },
      };
    });
  }, []);

  // End drag selection and return reference
  const endDragSelection = useCallback((): string | null => {
    const currentState = stateRef.current;
    if (!currentState.isDragging || !currentState.pointCell) return null;

    const startCell = currentState.pointCell;
    const endCell = currentState.pointRangeEnd || startCell;

    const ref = formatRangeRef(
      startCell.row,
      startCell.col,
      endCell.row,
      endCell.col
    );

    // Keep the selection visible but stop dragging
    setState((prev) => ({
      ...prev,
      isDragging: false,
    }));

    return ref;
  }, []);

  // Move point selection by keyboard
  const movePointSelection = useCallback((
    direction: 'up' | 'down' | 'left' | 'right',
    extend: boolean
  ): string | null => {
    const currentState = stateRef.current;
    if (!currentState.isActive) return null;

    // Get current cell or default to 0,0
    const currentCell = currentState.pointCell || { row: 0, col: 0 };
    let newRow = currentCell.row;
    let newCol = currentCell.col;

    switch (direction) {
      case 'up':
        newRow = Math.max(0, currentCell.row - 1);
        break;
      case 'down':
        newRow = currentCell.row + 1;
        break;
      case 'left':
        newCol = Math.max(0, currentCell.col - 1);
        break;
      case 'right':
        newCol = currentCell.col + 1;
        break;
    }

    if (extend) {
      // Extending selection (Shift held)
      const newRangeEnd = { row: newRow, col: newCol };

      setState((prev) => ({
        ...prev,
        pointRangeEnd: newRangeEnd,
      }));

      return formatRangeRef(
        currentCell.row,
        currentCell.col,
        newRangeEnd.row,
        newRangeEnd.col
      );
    } else {
      // Single cell selection
      setState((prev) => ({
        ...prev,
        pointCell: { row: newRow, col: newCol },
        pointRangeEnd: null,
      }));

      return formatCellRef(newRow, newCol);
    }
  }, []);

  // Check if character should trigger Point mode
  const shouldEnterPointMode = useCallback((
    char: string,
    formula: string,
    cursorPos: number
  ): boolean => {
    // Only for formulas
    if (!formula.startsWith('=')) return false;

    // Don't enter point mode if inside a string
    if (isInsideString(formula, cursorPos)) return false;

    // Check if the character is a trigger
    return POINT_MODE_TRIGGERS.has(char);
  }, []);

  // Memoize actions to prevent unnecessary re-renders
  const actions = useMemo<PointModeActions>(() => ({
    enterPointMode,
    exitPointMode,
    handleCellClick,
    beginDragSelection,
    updateDragSelection,
    endDragSelection,
    movePointSelection,
    shouldEnterPointMode,
  }), [
    enterPointMode,
    exitPointMode,
    handleCellClick,
    beginDragSelection,
    updateDragSelection,
    endDragSelection,
    movePointSelection,
    shouldEnterPointMode,
  ]);

  return { state, actions };
}

// =============================================================================
// Exports
// =============================================================================

export { columnToLetter };
export default usePointMode;
