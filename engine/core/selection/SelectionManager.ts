/**
 * VectorSheet Engine - Selection Manager (Production Grade)
 *
 * Excel-exact selection model implementation:
 * - Single cell, rectangular range, and multi-range selection
 * - Ctrl+Click: Add independent ranges
 * - Shift+Click: Extend from anchor to clicked cell
 * - Shift+Arrow: Extend selection in direction
 * - All ranges normalized (topLeft → bottomRight)
 * - Immutable state updates
 *
 * Architecture:
 * - Pure state management (no UI logic)
 * - Decoupled from DataStore via optional interface
 * - All public methods return new SelectionState
 * - Event-driven change notification
 *
 * Excel Behavior Reference:
 * 1. Click: Clear all, select single cell, set anchor
 * 2. Shift+Click: Extend primary range from anchor to click
 * 3. Ctrl+Click: Add new range, new anchor
 * 4. Ctrl+Shift+Click: Extend last range from its anchor
 * 5. Arrow keys: Move active cell (and anchor)
 * 6. Shift+Arrow: Extend selection, keep anchor
 */

import {
  Cell,
  CellRef,
  CellRange,
  Selection,
  CellKey,
  rangeContains,
  MAX_ROWS,
  MAX_COLS,
} from '../types/index.js';

// =============================================================================
// Core Types
// =============================================================================

/**
 * Immutable selection state.
 * All selection operations return a new SelectionState.
 */
export interface SelectionState {
  /**
   * All selected ranges (primary + secondary).
   * Primary is always at index `activeRangeIndex`.
   * Ranges are normalized (startRow <= endRow, startCol <= endCol).
   */
  readonly ranges: readonly CellRange[];

  /**
   * The active cell - where keyboard input goes.
   * Always within the active (primary) range.
   */
  readonly activeCell: Readonly<CellRef>;

  /**
   * The anchor cell - fixed point for Shift+Click extension.
   * When extending, selection spans from anchor to active cell.
   */
  readonly anchorCell: Readonly<CellRef>;

  /**
   * Index of the active (primary) range in `ranges` array.
   * This is the range that keyboard navigation affects.
   */
  readonly activeRangeIndex: number;

  /**
   * Selection mode for UI hints.
   */
  readonly mode: SelectionMode;
}

/**
 * Selection modes for different behaviors.
 */
export type SelectionMode =
  | 'normal'      // Standard selection
  | 'extending'   // Shift is held, extending selection
  | 'adding'      // Ctrl is held, can add ranges
  | 'selecting';  // Mouse is down, dragging to select

/**
 * Options for DataStore integration (optional).
 */
export interface SelectionDataProvider {
  getCell(row: number, col: number): Cell | null;
  isRowHidden(row: number): boolean;
  isColumnHidden(col: number): boolean;
  getCellsInRange(range: CellRange): Map<CellKey, Cell>;
}

/**
 * Selection change event payload.
 */
export interface SelectionChangeEvent {
  previous: SelectionState;
  current: SelectionState;
  source: 'user' | 'api' | 'keyboard' | 'mouse';
}

/**
 * Bounds info for rendering selection rectangles.
 */
export interface SelectionBounds {
  range: CellRange;
  isActive: boolean;
  isPrimary: boolean;
}

/**
 * Statistics for selected numeric values (status bar).
 */
export interface SelectionStats {
  sum: number | null;
  average: number | null;
  count: number;
  numericCount: number;
  min: number | null;
  max: number | null;
}

// =============================================================================
// Pure Utility Functions
// =============================================================================

/**
 * Normalize a range so start <= end for both row and col.
 * Essential for consistent range operations.
 */
export function normalizeRange(range: CellRange): CellRange {
  return {
    startRow: Math.min(range.startRow, range.endRow),
    startCol: Math.min(range.startCol, range.endCol),
    endRow: Math.max(range.startRow, range.endRow),
    endCol: Math.max(range.startCol, range.endCol),
  };
}

/**
 * Create a single-cell range from a cell reference.
 */
export function cellToRange(cell: CellRef): CellRange {
  return {
    startRow: cell.row,
    startCol: cell.col,
    endRow: cell.row,
    endCol: cell.col,
  };
}

/**
 * Check if two ranges are equal.
 */
export function rangesEqual(a: CellRange, b: CellRange): boolean {
  return a.startRow === b.startRow &&
         a.startCol === b.startCol &&
         a.endRow === b.endRow &&
         a.endCol === b.endCol;
}

/**
 * Check if two cell refs are equal.
 */
export function cellsEqual(a: CellRef, b: CellRef): boolean {
  return a.row === b.row && a.col === b.col;
}

/**
 * Clamp a cell reference to valid grid bounds.
 */
export function clampCell(cell: CellRef): CellRef {
  return {
    row: Math.max(0, Math.min(cell.row, MAX_ROWS - 1)),
    col: Math.max(0, Math.min(cell.col, MAX_COLS - 1)),
  };
}

/**
 * Clamp a range to valid grid bounds.
 */
export function clampRange(range: CellRange): CellRange {
  return {
    startRow: Math.max(0, Math.min(range.startRow, MAX_ROWS - 1)),
    startCol: Math.max(0, Math.min(range.startCol, MAX_COLS - 1)),
    endRow: Math.max(0, Math.min(range.endRow, MAX_ROWS - 1)),
    endCol: Math.max(0, Math.min(range.endCol, MAX_COLS - 1)),
  };
}

/**
 * Create a range spanning from anchor to active cell.
 */
export function spanRange(anchor: CellRef, active: CellRef): CellRange {
  return normalizeRange({
    startRow: anchor.row,
    startCol: anchor.col,
    endRow: active.row,
    endCol: active.col,
  });
}

/**
 * Get cell count in a range.
 */
export function getRangeCellCount(range: CellRange): number {
  return (range.endRow - range.startRow + 1) * (range.endCol - range.startCol + 1);
}

/**
 * Check if a cell is within a range.
 */
export function isCellInRange(cell: CellRef, range: CellRange): boolean {
  return cell.row >= range.startRow &&
         cell.row <= range.endRow &&
         cell.col >= range.startCol &&
         cell.col <= range.endCol;
}

/**
 * Get union bounding box of multiple ranges.
 */
export function getUnionBounds(ranges: readonly CellRange[]): CellRange | null {
  if (ranges.length === 0) return null;

  let minRow = Infinity, maxRow = -Infinity;
  let minCol = Infinity, maxCol = -Infinity;

  for (const range of ranges) {
    minRow = Math.min(minRow, range.startRow);
    maxRow = Math.max(maxRow, range.endRow);
    minCol = Math.min(minCol, range.startCol);
    maxCol = Math.max(maxCol, range.endCol);
  }

  return { startRow: minRow, startCol: minCol, endRow: maxRow, endCol: maxCol };
}

// =============================================================================
// Initial State Factory
// =============================================================================

/**
 * Create initial selection state (A1 selected).
 */
export function createInitialSelection(): SelectionState {
  return Object.freeze({
    ranges: Object.freeze([Object.freeze({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 })]),
    activeCell: Object.freeze({ row: 0, col: 0 }),
    anchorCell: Object.freeze({ row: 0, col: 0 }),
    activeRangeIndex: 0,
    mode: 'normal' as SelectionMode,
  });
}

/**
 * Create a selection state with a single cell selected.
 */
export function createCellSelection(cell: CellRef): SelectionState {
  const clamped = clampCell(cell);
  return Object.freeze({
    ranges: Object.freeze([Object.freeze(cellToRange(clamped))]),
    activeCell: Object.freeze({ ...clamped }),
    anchorCell: Object.freeze({ ...clamped }),
    activeRangeIndex: 0,
    mode: 'normal' as SelectionMode,
  });
}

/**
 * Create a selection state with a single range selected.
 */
export function createRangeSelection(range: CellRange, activeCell?: CellRef): SelectionState {
  const normalized = normalizeRange(clampRange(range));
  const active = activeCell
    ? clampCell(activeCell)
    : { row: normalized.startRow, col: normalized.startCol };

  // Ensure active cell is within range
  const clampedActive = {
    row: Math.max(normalized.startRow, Math.min(active.row, normalized.endRow)),
    col: Math.max(normalized.startCol, Math.min(active.col, normalized.endCol)),
  };

  return Object.freeze({
    ranges: Object.freeze([Object.freeze(normalized)]),
    activeCell: Object.freeze(clampedActive),
    anchorCell: Object.freeze(clampedActive),
    activeRangeIndex: 0,
    mode: 'normal' as SelectionMode,
  });
}

// =============================================================================
// Selection Manager Class
// =============================================================================

/**
 * Production-grade selection manager with Excel-exact behavior.
 *
 * Design principles:
 * - Immutable: All operations return new state
 * - Pure: No side effects in state transformations
 * - Decoupled: Optional data provider for advanced features
 * - Type-safe: Full TypeScript strict mode compliance
 *
 * Usage:
 * ```typescript
 * const manager = new SelectionManager();
 *
 * // Simple click
 * manager.setActiveCell({ row: 5, col: 3 });
 *
 * // Shift+Click to extend
 * manager.extendSelection({ row: 10, col: 7 });
 *
 * // Ctrl+Click to add range
 * manager.addRange({ startRow: 15, startCol: 0, endRow: 15, endCol: 5 });
 *
 * // Get current state
 * const state = manager.getState();
 * ```
 */
export class SelectionManager {
  private state: SelectionState;
  private dataProvider: SelectionDataProvider | null;
  private listeners: Set<(event: SelectionChangeEvent) => void> = new Set();

  /**
   * Create a new SelectionManager.
   *
   * @param dataProvider - Optional data provider for advanced features (stats, visibility)
   * @param initialState - Optional initial selection state
   */
  constructor(
    dataProvider?: SelectionDataProvider | null,
    initialState?: SelectionState
  ) {
    this.dataProvider = dataProvider ?? null;
    this.state = initialState ?? createInitialSelection();
  }

  // ===========================================================================
  // State Access (Read-only)
  // ===========================================================================

  /**
   * Get current immutable selection state.
   */
  getState(): SelectionState {
    return this.state;
  }

  /**
   * Get current selection (legacy compatibility).
   * @deprecated Use getState() instead
   */
  getSelection(): Selection {
    return {
      ranges: [...this.state.ranges],
      activeCell: { ...this.state.activeCell },
      anchorCell: { ...this.state.anchorCell },
      activeRangeIndex: this.state.activeRangeIndex,
    };
  }

  /**
   * Get the active (primary) range.
   */
  getActiveRange(): CellRange {
    return this.state.ranges[this.state.activeRangeIndex];
  }

  /**
   * Get the active cell reference.
   */
  getActiveCell(): CellRef {
    return this.state.activeCell;
  }

  /**
   * Get the anchor cell reference.
   */
  getAnchorCell(): CellRef {
    return this.state.anchorCell;
  }

  /**
   * Get all ranges (readonly).
   */
  getAllRanges(): readonly CellRange[] {
    return this.state.ranges;
  }

  /**
   * Get secondary ranges (all except active).
   */
  getSecondaryRanges(): CellRange[] {
    return this.state.ranges.filter((_, i) => i !== this.state.activeRangeIndex);
  }

  // ===========================================================================
  // Selection Queries
  // ===========================================================================

  /**
   * Check if a cell is in any selected range.
   */
  isCellSelected(row: number, col: number): boolean {
    const cell = { row, col };
    return this.state.ranges.some(range => isCellInRange(cell, range));
  }

  /**
   * Check if a cell is the active cell.
   */
  isActiveCell(row: number, col: number): boolean {
    return this.state.activeCell.row === row && this.state.activeCell.col === col;
  }

  /**
   * Check if selection is a single cell.
   */
  isSingleCell(): boolean {
    return this.state.ranges.length === 1 &&
           this.state.ranges[0].startRow === this.state.ranges[0].endRow &&
           this.state.ranges[0].startCol === this.state.ranges[0].endCol;
  }

  /**
   * Check if selection has multiple ranges.
   */
  isMultiRange(): boolean {
    return this.state.ranges.length > 1;
  }

  /**
   * Get total number of unique selected cells.
   */
  getSelectedCellCount(): number {
    if (this.state.ranges.length === 1) {
      return getRangeCellCount(this.state.ranges[0]);
    }

    // For multi-range, need to deduplicate
    const seen = new Set<string>();
    for (const range of this.state.ranges) {
      for (let row = range.startRow; row <= range.endRow; row++) {
        for (let col = range.startCol; col <= range.endCol; col++) {
          seen.add(`${row}_${col}`);
        }
      }
    }
    return seen.size;
  }

  /**
   * Get all selected cell references (deduplicated).
   */
  getSelectedCells(): CellRef[] {
    const cells: CellRef[] = [];
    const seen = new Set<string>();

    for (const range of this.state.ranges) {
      for (let row = range.startRow; row <= range.endRow; row++) {
        for (let col = range.startCol; col <= range.endCol; col++) {
          const key = `${row}_${col}`;
          if (!seen.has(key)) {
            seen.add(key);
            cells.push({ row, col });
          }
        }
      }
    }

    return cells;
  }

  /**
   * Get selection bounds for rendering.
   */
  getSelectionBounds(): SelectionBounds[] {
    return this.state.ranges.map((range, index) => ({
      range,
      isActive: index === this.state.activeRangeIndex,
      isPrimary: index === this.state.activeRangeIndex,
    }));
  }

  // ===========================================================================
  // Core Selection Operations (Immutable)
  // ===========================================================================

  /**
   * Set active cell (single cell selection).
   * Clears all existing ranges and starts fresh.
   * This is the standard "click" behavior.
   */
  setActiveCell(cell: CellRef): SelectionState {
    const newState = createCellSelection(cell);
    return this.setState(newState, 'api');
  }

  /**
   * Set a single range selection.
   * Clears all existing ranges.
   */
  setRange(range: CellRange, activeCell?: CellRef): SelectionState {
    const newState = createRangeSelection(range, activeCell);
    return this.setState(newState, 'api');
  }

  /**
   * Set selection from legacy Selection type.
   * @deprecated Use setActiveCell or setRange instead
   */
  setSelection(selection: Selection): SelectionState {
    const normalized = selection.ranges.map(r => normalizeRange(clampRange(r)));
    const newState: SelectionState = Object.freeze({
      ranges: Object.freeze(normalized.map(r => Object.freeze(r))),
      activeCell: Object.freeze(clampCell(selection.activeCell)),
      anchorCell: Object.freeze(clampCell(selection.anchorCell)),
      activeRangeIndex: Math.min(selection.activeRangeIndex, normalized.length - 1),
      mode: 'normal',
    });
    return this.setState(newState, 'api');
  }

  /**
   * Extend selection from anchor to target cell.
   * This is the "Shift+Click" or "Shift+Arrow" behavior.
   * Modifies the active range to span from anchor to target.
   */
  extendSelection(target: CellRef): SelectionState {
    const clamped = clampCell(target);
    const anchor = this.state.anchorCell;

    // Create new range spanning anchor to target
    const newRange = spanRange(anchor, clamped);

    // Replace active range, keep others
    const newRanges = [...this.state.ranges];
    newRanges[this.state.activeRangeIndex] = Object.freeze(newRange);

    const newState: SelectionState = Object.freeze({
      ranges: Object.freeze(newRanges.map(r => Object.freeze(r))),
      activeCell: Object.freeze(clamped),
      anchorCell: this.state.anchorCell, // Anchor stays fixed
      activeRangeIndex: this.state.activeRangeIndex,
      mode: 'extending',
    });

    return this.setState(newState, 'api');
  }

  /**
   * Add a new range to selection.
   * This is the "Ctrl+Click" behavior.
   * New range becomes active.
   */
  addRange(range: CellRange): SelectionState {
    const normalized = normalizeRange(clampRange(range));
    const activeCell = { row: normalized.startRow, col: normalized.startCol };

    const newRanges = [...this.state.ranges, Object.freeze(normalized)];

    const newState: SelectionState = Object.freeze({
      ranges: Object.freeze(newRanges),
      activeCell: Object.freeze(activeCell),
      anchorCell: Object.freeze(activeCell),
      activeRangeIndex: newRanges.length - 1,
      mode: 'adding',
    });

    return this.setState(newState, 'api');
  }

  /**
   * Add a single cell as new range.
   * Convenience method for Ctrl+Click on single cell.
   */
  addCell(cell: CellRef): SelectionState {
    return this.addRange(cellToRange(cell));
  }

  /**
   * Remove a specific range by index.
   * If removing active range, activates previous or next.
   */
  removeRange(index: number): SelectionState {
    if (this.state.ranges.length <= 1) {
      // Can't remove last range - reset to A1 instead
      return this.clear();
    }

    if (index < 0 || index >= this.state.ranges.length) {
      return this.state; // Invalid index, no change
    }

    const newRanges = this.state.ranges.filter((_, i) => i !== index);
    let newActiveIndex = this.state.activeRangeIndex;

    // Adjust active index if needed
    if (index === this.state.activeRangeIndex) {
      newActiveIndex = Math.min(index, newRanges.length - 1);
    } else if (index < this.state.activeRangeIndex) {
      newActiveIndex--;
    }

    const activeRange = newRanges[newActiveIndex];
    const newState: SelectionState = Object.freeze({
      ranges: Object.freeze(newRanges.map(r => Object.freeze(r))),
      activeCell: Object.freeze({ row: activeRange.startRow, col: activeRange.startCol }),
      anchorCell: Object.freeze({ row: activeRange.startRow, col: activeRange.startCol }),
      activeRangeIndex: newActiveIndex,
      mode: 'normal',
    });

    return this.setState(newState, 'api');
  }

  /**
   * Clear selection and reset to A1.
   */
  clear(): SelectionState {
    const newState = createInitialSelection();
    return this.setState(newState, 'api');
  }

  /**
   * Set mode (for UI state tracking).
   */
  setMode(mode: SelectionMode): SelectionState {
    if (this.state.mode === mode) return this.state;

    const newState: SelectionState = Object.freeze({
      ...this.state,
      mode,
    });
    return this.setState(newState, 'api');
  }

  // ===========================================================================
  // Keyboard Navigation
  // ===========================================================================

  /**
   * Move active cell by delta.
   * Optionally extend selection (Shift key).
   */
  moveActiveCell(
    deltaRow: number,
    deltaCol: number,
    extend: boolean = false
  ): SelectionState {
    const current = this.state.activeCell;
    const newActive = clampCell({
      row: current.row + deltaRow,
      col: current.col + deltaCol,
    });

    if (extend) {
      return this.extendSelection(newActive);
    }

    return this.setActiveCell(newActive);
  }

  /**
   * Move to specific cell without extending.
   */
  goToCell(row: number, col: number): SelectionState {
    return this.setActiveCell({ row, col });
  }

  /**
   * Move within selection (Tab/Enter behavior).
   * Moves active cell within current range, wraps at edges.
   */
  moveWithinSelection(
    direction: 'next' | 'previous' | 'nextRow' | 'previousRow'
  ): SelectionState {
    const range = this.getActiveRange();
    const active = this.state.activeCell;

    let newRow = active.row;
    let newCol = active.col;

    switch (direction) {
      case 'next': // Tab
        if (newCol < range.endCol) {
          newCol++;
        } else if (newRow < range.endRow) {
          newCol = range.startCol;
          newRow++;
        } else {
          // Wrap to start
          newCol = range.startCol;
          newRow = range.startRow;
        }
        break;

      case 'previous': // Shift+Tab
        if (newCol > range.startCol) {
          newCol--;
        } else if (newRow > range.startRow) {
          newCol = range.endCol;
          newRow--;
        } else {
          // Wrap to end
          newCol = range.endCol;
          newRow = range.endRow;
        }
        break;

      case 'nextRow': // Enter
        if (newRow < range.endRow) {
          newRow++;
        } else if (newCol < range.endCol) {
          newRow = range.startRow;
          newCol++;
        } else {
          newRow = range.startRow;
          newCol = range.startCol;
        }
        break;

      case 'previousRow': // Shift+Enter
        if (newRow > range.startRow) {
          newRow--;
        } else if (newCol > range.startCol) {
          newRow = range.endRow;
          newCol--;
        } else {
          newRow = range.endRow;
          newCol = range.endCol;
        }
        break;
    }

    // Update active cell but keep range and anchor
    const newState: SelectionState = Object.freeze({
      ...this.state,
      activeCell: Object.freeze({ row: newRow, col: newCol }),
    });

    return this.setState(newState, 'keyboard');
  }

  /**
   * Select entire row(s) of current selection.
   */
  selectEntireRows(): SelectionState {
    const bounds = getUnionBounds(this.state.ranges);
    if (!bounds) return this.state;

    return this.setRange({
      startRow: bounds.startRow,
      startCol: 0,
      endRow: bounds.endRow,
      endCol: MAX_COLS - 1,
    });
  }

  /**
   * Select entire column(s) of current selection.
   */
  selectEntireColumns(): SelectionState {
    const bounds = getUnionBounds(this.state.ranges);
    if (!bounds) return this.state;

    return this.setRange({
      startRow: 0,
      startCol: bounds.startCol,
      endRow: MAX_ROWS - 1,
      endCol: bounds.endCol,
    });
  }

  /**
   * Select all cells (Ctrl+A behavior).
   * First call: select current region. Second: select all.
   */
  selectAll(usedRange?: CellRange): SelectionState {
    // If already selecting used range or larger, select entire sheet
    const currentBounds = getUnionBounds(this.state.ranges);
    const effectiveUsedRange = usedRange ?? {
      startRow: 0,
      startCol: 0,
      endRow: 999,
      endCol: 25,
    };

    if (currentBounds &&
        currentBounds.startRow <= effectiveUsedRange.startRow &&
        currentBounds.startCol <= effectiveUsedRange.startCol &&
        currentBounds.endRow >= effectiveUsedRange.endRow &&
        currentBounds.endCol >= effectiveUsedRange.endCol) {
      // Already at or beyond used range - select entire sheet
      return this.setRange({
        startRow: 0,
        startCol: 0,
        endRow: MAX_ROWS - 1,
        endCol: MAX_COLS - 1,
      });
    }

    // Select used range
    return this.setRange(effectiveUsedRange);
  }

  // ===========================================================================
  // Mouse Interaction Helpers
  // ===========================================================================

  /**
   * Handle mouse down on a cell.
   * @param cell - The clicked cell
   * @param modifiers - Keyboard modifiers
   */
  handleMouseDown(
    cell: CellRef,
    modifiers: { shift?: boolean; ctrl?: boolean; meta?: boolean }
  ): SelectionState {
    const ctrlOrMeta = modifiers.ctrl || modifiers.meta;

    if (modifiers.shift) {
      // Extend from anchor
      return this.extendSelection(cell);
    }

    if (ctrlOrMeta) {
      // Add new range
      return this.addCell(cell);
    }

    // Regular click - new single cell selection
    return this.setActiveCell(cell);
  }

  /**
   * Handle mouse drag to cell (selection rectangle).
   * @param cell - Current mouse position as cell
   */
  handleMouseDrag(cell: CellRef): SelectionState {
    return this.extendSelection(cell);
  }

  /**
   * Handle mouse up (finalize selection).
   */
  handleMouseUp(): SelectionState {
    return this.setMode('normal');
  }

  // ===========================================================================
  // Event Subscription
  // ===========================================================================

  /**
   * Subscribe to selection changes.
   * Returns unsubscribe function.
   */
  subscribe(listener: (event: SelectionChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Legacy listener API.
   * @deprecated Use subscribe() instead
   */
  addSelectionListener(listener: (selection: Selection) => void): () => void {
    const wrapper = (event: SelectionChangeEvent) => {
      listener({
        ranges: [...event.current.ranges],
        activeCell: { ...event.current.activeCell },
        anchorCell: { ...event.current.anchorCell },
        activeRangeIndex: event.current.activeRangeIndex,
      });
    };
    this.listeners.add(wrapper);
    return () => this.listeners.delete(wrapper);
  }

  // ===========================================================================
  // Data Provider Operations (require dataProvider)
  // ===========================================================================

  /**
   * Delete contents of selected cells.
   * Requires dataProvider with setCell capability.
   */
  deleteSelectedContents(): CellRef[] {
    if (!this.dataProvider) return [];

    const deleted: CellRef[] = [];

    for (const range of this.state.ranges) {
      for (let row = range.startRow; row <= range.endRow; row++) {
        if (this.dataProvider.isRowHidden(row)) continue;

        for (let col = range.startCol; col <= range.endCol; col++) {
          if (this.dataProvider.isColumnHidden(col)) continue;

          const cell = this.dataProvider.getCell(row, col);
          if (cell) {
            deleted.push({ row, col });
          }
        }
      }
    }

    return deleted;
  }

  /**
   * Calculate statistics for selected numeric values.
   */
  calculateSelectionStats(): SelectionStats {
    if (!this.dataProvider) {
      return {
        sum: null,
        average: null,
        count: this.getSelectedCellCount(),
        numericCount: 0,
        min: null,
        max: null,
      };
    }

    const values: number[] = [];
    let totalCount = 0;

    for (const range of this.state.ranges) {
      for (let row = range.startRow; row <= range.endRow; row++) {
        for (let col = range.startCol; col <= range.endCol; col++) {
          totalCount++;
          const cell = this.dataProvider.getCell(row, col);

          if (cell && typeof cell.value === 'number') {
            values.push(cell.value);
          }
        }
      }
    }

    if (values.length === 0) {
      return {
        sum: null,
        average: null,
        count: totalCount,
        numericCount: 0,
        min: null,
        max: null,
      };
    }

    const sum = values.reduce((a, b) => a + b, 0);

    return {
      sum,
      average: sum / values.length,
      count: totalCount,
      numericCount: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }

  /**
   * Get copy data for clipboard.
   */
  getCopyData(): { range: CellRange; cells: Map<CellKey, Cell> } {
    const range = this.getActiveRange();
    const cells = this.dataProvider?.getCellsInRange(range) ?? new Map();
    return { range, cells };
  }

  // ===========================================================================
  // Fill Handle Support
  // ===========================================================================

  /**
   * Get fill handle position (bottom-right of active range).
   */
  getFillHandlePosition(): CellRef {
    const range = this.getActiveRange();
    return { row: range.endRow, col: range.endCol };
  }

  /**
   * Get source range for fill operation.
   */
  getFillSourceRange(): CellRange {
    return this.getActiveRange();
  }

  // ===========================================================================
  // Internal State Management
  // ===========================================================================

  /**
   * Update state and notify listeners.
   * All state changes flow through here.
   */
  private setState(
    newState: SelectionState,
    source: SelectionChangeEvent['source']
  ): SelectionState {
    const previous = this.state;

    // Skip if no change
    if (this.statesEqual(previous, newState)) {
      return this.state;
    }

    this.state = newState;

    // Notify listeners
    const event: SelectionChangeEvent = { previous, current: newState, source };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Selection listener error:', error);
      }
    }

    return this.state;
  }

  /**
   * Check if two states are equal.
   */
  private statesEqual(a: SelectionState, b: SelectionState): boolean {
    if (a === b) return true;
    if (a.activeRangeIndex !== b.activeRangeIndex) return false;
    if (a.mode !== b.mode) return false;
    if (!cellsEqual(a.activeCell, b.activeCell)) return false;
    if (!cellsEqual(a.anchorCell, b.anchorCell)) return false;
    if (a.ranges.length !== b.ranges.length) return false;

    for (let i = 0; i < a.ranges.length; i++) {
      if (!rangesEqual(a.ranges[i], b.ranges[i])) return false;
    }

    return true;
  }

  // ===========================================================================
  // Compatibility Layer
  // ===========================================================================

  /**
   * Legacy compatibility: apply format to selection.
   * @deprecated Handle formatting externally
   */
  applyFormat(_format: Partial<Cell['format']>): void {
    // No-op: Formatting should be handled by the caller using getSelectedCells()
    console.warn('applyFormat is deprecated. Handle formatting externally.');
  }

  /**
   * Legacy compatibility: check paste compatibility.
   */
  canPasteToSelection(sourceRange: CellRange): boolean {
    if (this.state.ranges.length === 1) return true;

    const sourceRows = sourceRange.endRow - sourceRange.startRow + 1;
    const sourceCols = sourceRange.endCol - sourceRange.startCol + 1;

    for (const range of this.state.ranges) {
      const rows = range.endRow - range.startRow + 1;
      const cols = range.endCol - range.startCol + 1;
      if (rows !== sourceRows || cols !== sourceCols) return false;
    }

    return true;
  }

  /**
   * Backwards compatibility: apply function to all selected cells.
   */
  applyToSelection<T>(
    fn: (row: number, col: number, cell: Cell | null) => T
  ): T[] {
    const results: T[] = [];

    for (const range of this.state.ranges) {
      for (let row = range.startRow; row <= range.endRow; row++) {
        const isRowHidden = this.dataProvider?.isRowHidden(row) ?? false;
        if (isRowHidden) continue;

        for (let col = range.startCol; col <= range.endCol; col++) {
          const isColHidden = this.dataProvider?.isColumnHidden(col) ?? false;
          if (isColHidden) continue;

          const cell = this.dataProvider?.getCell(row, col) ?? null;
          results.push(fn(row, col, cell));
        }
      }
    }

    return results;
  }
}

// =============================================================================
// Convenience Exports
// =============================================================================

export { rangeContains };
