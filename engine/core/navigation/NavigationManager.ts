/**
 * VectorSheet Engine - Navigation Manager (Production Grade)
 *
 * Pure logic layer for keyboard navigation in a spreadsheet grid.
 * Handles all navigation operations without touching the DOM.
 *
 * Features:
 * - Arrow key navigation (move)
 * - Ctrl+Arrow jump to data region edges (jump)
 * - Direct cell navigation (goTo)
 * - PageUp/PageDown viewport scrolling
 * - Home/End navigation
 * - Tab/Enter movement within selection
 * - Hidden row/column skipping
 * - Sheet bounds enforcement
 *
 * Architecture:
 * - Pure functions: All operations return new positions
 * - Decoupled: Uses NavigationDataProvider interface
 * - Optional SelectionManager integration
 * - Event-driven for UI synchronization
 * - Deterministic and testable
 *
 * Performance:
 * - O(1) basic movement
 * - O(k log k) for Ctrl+Arrow where k = cells in row/column
 * - Designed for 1M x 100k grids
 *
 * Excel Ctrl+Arrow Behavior:
 * 1. If current cell is empty → jump to next non-empty cell, or edge if all empty
 * 2. If current cell is non-empty:
 *    a. If next cell is empty → jump to next non-empty cell, or edge
 *    b. If next cell is non-empty → jump to last non-empty before empty (or edge)
 */

import {
  CellRef,
  CellRange,
  Direction,
  MAX_ROWS,
  MAX_COLS,
} from '../types/index.js';
import type { SelectionManager } from '../selection/SelectionManager.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Interface for data queries - decouples from SpreadsheetEngine/SparseDataStore.
 * Implement this interface to provide navigation with data awareness.
 */
export interface NavigationDataProvider {
  /**
   * Check if a cell has content (non-empty).
   * Used for Ctrl+Arrow data region detection.
   */
  hasContent(row: number, col: number): boolean;

  /**
   * Check if a row is hidden.
   * Navigation skips hidden rows.
   */
  isRowHidden(row: number): boolean;

  /**
   * Check if a column is hidden.
   * Navigation skips hidden columns.
   */
  isColumnHidden(col: number): boolean;

  /**
   * Get all columns with data in a specific row.
   * Returns sorted array for efficient Ctrl+Arrow.
   * Performance: Should be O(k) where k = cells in row.
   */
  getColumnsInRow(row: number): number[];

  /**
   * Get all rows with data in a specific column.
   * Returns sorted array for efficient Ctrl+Arrow.
   * Performance: Should be O(k) where k = cells in column.
   */
  getRowsInColumn(col: number): number[];

  /**
   * Get the used range (bounding box of all data).
   * Returns null if no data exists.
   */
  getUsedRange(): CellRange | null;
}

/**
 * Navigation action types for events and debugging.
 */
export type NavigationAction =
  | 'move'        // Single arrow key
  | 'jump'        // Ctrl+Arrow
  | 'goTo'        // Direct navigation
  | 'pageUp'      // PageUp key
  | 'pageDown'    // PageDown key
  | 'home'        // Home key
  | 'end'         // End key
  | 'tab'         // Tab key
  | 'enter';      // Enter key

/**
 * Configuration for NavigationManager.
 */
export interface NavigationConfig {
  /** Maximum row index (exclusive). Default: 1,000,000 */
  maxRow: number;

  /** Maximum column index (exclusive). Default: 100,000 */
  maxCol: number;

  /** Skip hidden rows/columns during navigation. Default: true */
  skipHidden: boolean;

  /** Direction for Enter key movement. Default: 'down' */
  enterDirection: 'down' | 'right';

  /** Direction for Tab key movement. Default: 'right' */
  tabDirection: 'right' | 'down';

  /** Number of rows per page for PageUp/PageDown. Default: 20 */
  pageSize: number;

  /** Wrap around at edges for Tab/Enter. Default: false */
  wrapAround: boolean;

  /** Maximum hidden rows/cols to skip before giving up. Default: 1000 */
  maxHiddenSkip: number;
}

/**
 * Options for move operations.
 */
export interface MoveOptions {
  /** Extend selection instead of moving (Shift+Arrow). */
  extend?: boolean;

  /** Override config.skipHidden for this operation. */
  skipHidden?: boolean;
}

/**
 * Options for jump operations.
 */
export interface JumpOptions {
  /** Extend selection instead of moving (Ctrl+Shift+Arrow). */
  extend?: boolean;
}

/**
 * Result of a navigation operation.
 */
export interface NavigationResult {
  /** The target cell position. */
  cell: CellRef;

  /** The action that was performed. */
  action: NavigationAction;

  /** Direction of movement (if applicable). */
  direction?: Direction;

  /** Whether a boundary was hit (couldn't move further). */
  boundaryHit: boolean;

  /** The cell we started from. */
  previousCell: CellRef;
}

/**
 * Event callbacks for navigation operations.
 */
export interface NavigationEvents {
  /** Called after any navigation operation. */
  onNavigate?: (result: NavigationResult) => void;

  /** Called when navigation hits a boundary. */
  onBoundaryHit?: (direction: Direction, cell: CellRef) => void;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: NavigationConfig = {
  maxRow: MAX_ROWS,
  maxCol: MAX_COLS,
  skipHidden: true,
  enterDirection: 'down',
  tabDirection: 'right',
  pageSize: 20,
  wrapAround: false,
  maxHiddenSkip: 1000,
};

// =============================================================================
// Direction Utilities
// =============================================================================

/** Direction vectors for movement. */
const DIRECTION_DELTA: Readonly<Record<Direction, { dRow: number; dCol: number }>> = {
  up: { dRow: -1, dCol: 0 },
  down: { dRow: 1, dCol: 0 },
  left: { dRow: 0, dCol: -1 },
  right: { dRow: 0, dCol: 1 },
};

/** Check if direction is vertical. */
function isVertical(direction: Direction): boolean {
  return direction === 'up' || direction === 'down';
}

/** Check if direction is forward (positive). */
function isForward(direction: Direction): boolean {
  return direction === 'down' || direction === 'right';
}

// =============================================================================
// Pure Navigation Functions
// =============================================================================

/**
 * Binary search to find insertion point in sorted array.
 * Returns index where value would be inserted to maintain sort order.
 */
function binarySearchInsertPoint(arr: readonly number[], value: number): number {
  let low = 0;
  let high = arr.length;

  while (low < high) {
    const mid = (low + high) >>> 1;
    if (arr[mid]! < value) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

/**
 * Find the next value greater than target in a sorted array.
 */
function findNextGreater(arr: readonly number[], target: number): number | null {
  const idx = binarySearchInsertPoint(arr, target + 1);
  return idx < arr.length ? arr[idx]! : null;
}

/**
 * Find the next value less than target in a sorted array.
 */
function findNextLess(arr: readonly number[], target: number): number | null {
  const idx = binarySearchInsertPoint(arr, target);
  return idx > 0 ? arr[idx - 1]! : null;
}

/**
 * Find the last consecutive value starting from a position going forward.
 * Used for Ctrl+Arrow when in a data region.
 */
function findLastConsecutive(
  arr: readonly number[],
  start: number,
  direction: 1 | -1,
  max: number
): number {
  const startIdx = arr.indexOf(start);
  if (startIdx === -1) return start;

  let current = start;
  let idx = startIdx;

  while (true) {
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= arr.length) break;

    const next = arr[nextIdx]!;
    const expected = current + direction;

    // Check if next is consecutive
    if (next !== expected) break;

    // Check bounds
    if (next < 0 || next >= max) break;

    current = next;
    idx = nextIdx;
  }

  return current;
}

// =============================================================================
// NavigationManager Class
// =============================================================================

/**
 * Production-grade navigation manager for spreadsheet grids.
 *
 * Design principles:
 * - Pure logic: All operations return results, don't mutate external state
 * - Decoupled: Uses NavigationDataProvider interface
 * - Optional integration: Works standalone or with SelectionManager
 * - Performant: O(1) moves, O(k log k) jumps for sparse data
 * - Testable: Deterministic behavior, no side effects
 *
 * Usage:
 * ```typescript
 * const nav = new NavigationManager(dataProvider);
 *
 * // Basic movement
 * const result = nav.move('down', { row: 0, col: 0 });
 *
 * // Ctrl+Arrow jump
 * const jumpResult = nav.jump('right', { row: 5, col: 3 });
 *
 * // Direct navigation
 * const cell = nav.goTo(100, 50);
 *
 * // With SelectionManager integration
 * const navWithSelection = new NavigationManager(dataProvider, {}, selectionManager);
 * navWithSelection.move('down'); // Uses and updates SelectionManager
 * ```
 */
export class NavigationManager {
  private readonly dataProvider: NavigationDataProvider;
  private readonly config: Readonly<NavigationConfig>;
  private selectionManager: SelectionManager | null = null;
  private events: NavigationEvents = {};

  // Internal position tracking (used when no SelectionManager)
  private _currentRow: number = 0;
  private _currentCol: number = 0;

  // Ctrl+A cycling state
  private _ctrlACount: number = 0;
  private _ctrlALastTime: number = 0;

  // Tab/Enter entry point for wrap behavior
  private _entryPoint: CellRef | null = null;

  /**
   * Create a new NavigationManager.
   *
   * @param dataProvider - Provider for data queries (cell content, hidden state)
   * @param config - Navigation configuration
   * @param selectionManager - Optional SelectionManager for integrated updates
   */
  constructor(
    dataProvider: NavigationDataProvider,
    config: Partial<NavigationConfig> = {},
    selectionManager?: SelectionManager
  ) {
    this.dataProvider = dataProvider;
    this.config = Object.freeze({ ...DEFAULT_CONFIG, ...config });

    if (selectionManager) {
      this.selectionManager = selectionManager;
      // Sync initial position from SelectionManager
      const state = selectionManager.getState();
      this._currentRow = state.activeCell.row;
      this._currentCol = state.activeCell.col;
    }
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  /**
   * Set event handlers.
   */
  setEventHandlers(events: NavigationEvents): void {
    this.events = { ...this.events, ...events };
  }

  /**
   * Get current configuration (read-only).
   */
  getConfig(): Readonly<NavigationConfig> {
    return this.config;
  }

  /**
   * Attach a SelectionManager for integrated updates.
   */
  setSelectionManager(manager: SelectionManager | null): void {
    this.selectionManager = manager;
    if (manager) {
      const state = manager.getState();
      this._currentRow = state.activeCell.row;
      this._currentCol = state.activeCell.col;
    }
  }

  // ===========================================================================
  // Position Access
  // ===========================================================================

  /**
   * Get the current active cell position.
   * Uses SelectionManager if available, otherwise internal tracking.
   */
  getCurrentCell(): CellRef {
    if (this.selectionManager) {
      const state = this.selectionManager.getState();
      return { row: state.activeCell.row, col: state.activeCell.col };
    }
    return { row: this._currentRow, col: this._currentCol };
  }

  /**
   * Set the current position directly.
   * Updates SelectionManager if available.
   */
  setCurrentCell(row: number, col: number): void {
    const clamped = this.clampPosition(row, col);
    this._currentRow = clamped.row;
    this._currentCol = clamped.col;

    if (this.selectionManager) {
      this.selectionManager.setActiveCell(clamped);
    }
  }

  // ===========================================================================
  // Core Navigation: move()
  // ===========================================================================

  /**
   * Move one cell in the specified direction.
   * Respects hidden rows/columns and sheet bounds.
   *
   * @param direction - Direction to move
   * @param from - Starting position (defaults to current cell)
   * @param options - Move options (extend, skipHidden)
   * @returns Navigation result with target cell
   */
  move(
    direction: Direction,
    from?: CellRef,
    options: MoveOptions = {}
  ): NavigationResult {
    const start = from ?? this.getCurrentCell();
    const skipHidden = options.skipHidden ?? this.config.skipHidden;

    const delta = DIRECTION_DELTA[direction];
    let newRow = start.row + delta.dRow;
    let newCol = start.col + delta.dCol;

    // Skip hidden rows/columns
    if (skipHidden) {
      if (isVertical(direction)) {
        newRow = this.findNextVisibleRow(newRow, delta.dRow);
      } else {
        newCol = this.findNextVisibleCol(newCol, delta.dCol);
      }
    }

    // Clamp to bounds
    const clamped = this.clampPosition(newRow, newCol);
    const boundaryHit = clamped.row !== newRow || clamped.col !== newCol ||
      (clamped.row === start.row && clamped.col === start.col);

    // Update position
    this.updatePosition(clamped, options.extend ?? false);

    // Build result
    const result: NavigationResult = {
      cell: clamped,
      action: 'move',
      direction,
      boundaryHit,
      previousCell: start,
    };

    // Fire events
    this.fireNavigateEvent(result);
    if (boundaryHit) {
      this.events.onBoundaryHit?.(direction, clamped);
    }

    return result;
  }

  // ===========================================================================
  // Core Navigation: jump() (Ctrl+Arrow)
  // ===========================================================================

  /**
   * Jump to the edge of a data region (Ctrl+Arrow behavior).
   *
   * Excel-exact behavior:
   * 1. If current cell is empty:
   *    - Jump to next non-empty cell in direction
   *    - If no non-empty cell, jump to edge
   * 2. If current cell has content:
   *    - If next cell is empty: jump to next non-empty, or edge
   *    - If next cell has content: jump to last content before empty (or edge)
   *
   * @param direction - Direction to jump
   * @param from - Starting position (defaults to current cell)
   * @param options - Jump options
   * @returns Navigation result with target cell
   */
  jump(
    direction: Direction,
    from?: CellRef,
    options: JumpOptions = {}
  ): NavigationResult {
    const start = from ?? this.getCurrentCell();
    const target = this.calculateJumpTarget(start, direction);

    // Clamp and check boundary
    const clamped = this.clampPosition(target.row, target.col);
    const boundaryHit = clamped.row === start.row && clamped.col === start.col;

    // Update position
    this.updatePosition(clamped, options.extend ?? false);

    // Build result
    const result: NavigationResult = {
      cell: clamped,
      action: 'jump',
      direction,
      boundaryHit,
      previousCell: start,
    };

    // Fire events
    this.fireNavigateEvent(result);
    if (boundaryHit) {
      this.events.onBoundaryHit?.(direction, clamped);
    }

    return result;
  }

  /**
   * Calculate the jump target for Ctrl+Arrow.
   * Implements Excel-exact data region navigation.
   */
  private calculateJumpTarget(start: CellRef, direction: Direction): CellRef {
    const { row, col } = start;
    const vertical = isVertical(direction);
    const forward = isForward(direction);
    const delta = forward ? 1 : -1;

    // Get the line of cells we're navigating along
    const cells = vertical
      ? this.dataProvider.getRowsInColumn(col)
      : this.dataProvider.getColumnsInRow(row);

    // Sort for efficient searching
    const sorted = [...cells].sort((a, b) => a - b);

    const currentPos = vertical ? row : col;
    const maxPos = vertical ? this.config.maxRow : this.config.maxCol;
    const hasContent = this.dataProvider.hasContent(row, col);

    // Calculate the next position
    const nextPos = currentPos + delta;
    const nextHasContent = vertical
      ? this.dataProvider.hasContent(nextPos, col)
      : this.dataProvider.hasContent(row, nextPos);

    let targetPos: number;

    if (!hasContent) {
      // Case 1: Current cell is empty
      // Jump to next non-empty cell, or edge
      if (forward) {
        const next = findNextGreater(sorted, currentPos);
        targetPos = next !== null ? next : maxPos - 1;
      } else {
        const next = findNextLess(sorted, currentPos);
        targetPos = next !== null ? next : 0;
      }
    } else if (!nextHasContent || nextPos < 0 || nextPos >= maxPos) {
      // Case 2a: Current has content, next is empty (or out of bounds)
      // Jump to next non-empty cell, or edge
      if (forward) {
        const next = findNextGreater(sorted, currentPos);
        targetPos = next !== null ? next : maxPos - 1;
      } else {
        const next = findNextLess(sorted, currentPos);
        targetPos = next !== null ? next : 0;
      }
    } else {
      // Case 2b: Both current and next have content
      // Jump to last consecutive non-empty cell
      targetPos = findLastConsecutive(sorted, currentPos, delta, maxPos);
    }

    // Skip hidden rows/columns from target
    if (this.config.skipHidden) {
      if (vertical) {
        targetPos = this.findNextVisibleRow(targetPos, 0);
      } else {
        targetPos = this.findNextVisibleCol(targetPos, 0);
      }
    }

    return vertical
      ? { row: targetPos, col }
      : { row, col: targetPos };
  }

  // ===========================================================================
  // Core Navigation: goTo()
  // ===========================================================================

  /**
   * Navigate directly to a specific cell.
   *
   * @param row - Target row (will be clamped to bounds)
   * @param col - Target column (will be clamped to bounds)
   * @returns Navigation result
   */
  goTo(row: number, col: number): NavigationResult {
    const start = this.getCurrentCell();
    const target = this.clampPosition(row, col);

    // Skip hidden (find nearest visible)
    let finalRow = target.row;
    let finalCol = target.col;

    if (this.config.skipHidden) {
      if (this.dataProvider.isRowHidden(finalRow)) {
        finalRow = this.findNextVisibleRow(finalRow, 1);
      }
      if (this.dataProvider.isColumnHidden(finalCol)) {
        finalCol = this.findNextVisibleCol(finalCol, 1);
      }
    }

    const clamped = this.clampPosition(finalRow, finalCol);

    // Update position (not extending)
    this.updatePosition(clamped, false);

    // Reset Ctrl+A cycle
    this._ctrlACount = 0;

    // Build result
    const result: NavigationResult = {
      cell: clamped,
      action: 'goTo',
      boundaryHit: false,
      previousCell: start,
    };

    this.fireNavigateEvent(result);
    return result;
  }

  // ===========================================================================
  // Extended Navigation: PageUp/PageDown
  // ===========================================================================

  /**
   * Move up by one page.
   *
   * @param shift - Extend selection if true
   * @param pageSize - Override config.pageSize
   * @returns Navigation result
   */
  pageUp(shift: boolean = false, pageSize?: number): NavigationResult {
    const size = pageSize ?? this.config.pageSize;
    return this.moveByPage(-size, shift, 'pageUp');
  }

  /**
   * Move down by one page.
   *
   * @param shift - Extend selection if true
   * @param pageSize - Override config.pageSize
   * @returns Navigation result
   */
  pageDown(shift: boolean = false, pageSize?: number): NavigationResult {
    const size = pageSize ?? this.config.pageSize;
    return this.moveByPage(size, shift, 'pageDown');
  }

  private moveByPage(
    rowDelta: number,
    extend: boolean,
    action: NavigationAction
  ): NavigationResult {
    const start = this.getCurrentCell();
    let newRow = start.row + rowDelta;

    // Skip hidden rows
    if (this.config.skipHidden) {
      const direction = rowDelta > 0 ? 1 : -1;
      newRow = this.findNextVisibleRow(newRow, direction);
    }

    const clamped = this.clampPosition(newRow, start.col);
    const boundaryHit = clamped.row === start.row;

    this.updatePosition(clamped, extend);

    const result: NavigationResult = {
      cell: clamped,
      action,
      direction: rowDelta > 0 ? 'down' : 'up',
      boundaryHit,
      previousCell: start,
    };

    this.fireNavigateEvent(result);
    return result;
  }

  // ===========================================================================
  // Extended Navigation: Home/End
  // ===========================================================================

  /**
   * Home key navigation.
   * - Home: Go to column 0 in current row
   * - Ctrl+Home: Go to A1 (0, 0)
   *
   * @param ctrl - Ctrl key pressed
   * @param shift - Extend selection if true
   * @returns Navigation result
   */
  home(ctrl: boolean = false, shift: boolean = false): NavigationResult {
    const start = this.getCurrentCell();
    let targetRow = ctrl ? 0 : start.row;
    let targetCol = 0;

    // Skip hidden
    if (this.config.skipHidden) {
      targetRow = this.findNextVisibleRow(targetRow, 1);
      targetCol = this.findNextVisibleCol(targetCol, 1);
    }

    const clamped = this.clampPosition(targetRow, targetCol);
    this.updatePosition(clamped, shift);

    const result: NavigationResult = {
      cell: clamped,
      action: 'home',
      direction: 'left',
      boundaryHit: false,
      previousCell: start,
    };

    this.fireNavigateEvent(result);
    return result;
  }

  /**
   * End key navigation.
   * - End: Go to last column with data in current row
   * - Ctrl+End: Go to last used cell (bottom-right of used range)
   *
   * @param ctrl - Ctrl key pressed
   * @param shift - Extend selection if true
   * @returns Navigation result
   */
  end(ctrl: boolean = false, shift: boolean = false): NavigationResult {
    const start = this.getCurrentCell();
    let targetRow: number;
    let targetCol: number;

    if (ctrl) {
      // Ctrl+End: Go to last used cell
      const usedRange = this.dataProvider.getUsedRange();
      if (usedRange) {
        targetRow = usedRange.endRow;
        targetCol = usedRange.endCol;
      } else {
        targetRow = 0;
        targetCol = 0;
      }
    } else {
      // End: Go to last column with data in current row
      const colsInRow = this.dataProvider.getColumnsInRow(start.row);
      if (colsInRow.length > 0) {
        targetCol = Math.max(...colsInRow);
        targetRow = start.row;
      } else {
        targetRow = start.row;
        targetCol = 0;
      }
    }

    // Skip hidden
    if (this.config.skipHidden) {
      targetRow = this.findNextVisibleRow(targetRow, -1);
      targetCol = this.findNextVisibleCol(targetCol, -1);
    }

    const clamped = this.clampPosition(targetRow, targetCol);
    this.updatePosition(clamped, shift);

    const result: NavigationResult = {
      cell: clamped,
      action: 'end',
      direction: 'right',
      boundaryHit: false,
      previousCell: start,
    };

    this.fireNavigateEvent(result);
    return result;
  }

  // ===========================================================================
  // Extended Navigation: Tab/Enter
  // ===========================================================================

  /**
   * Tab key navigation.
   * - In selection: Cycle through cells horizontally
   * - Single cell: Move right (or left with shift)
   *
   * @param shift - Move backward if true
   * @returns Navigation result
   */
  tab(shift: boolean = false): NavigationResult {
    const start = this.getCurrentCell();

    // Check if we have a multi-cell selection
    if (this.selectionManager) {
      const state = this.selectionManager.getState();
      const range = state.ranges[state.activeRangeIndex];

      if (range && !this.isSingleCellRange(range)) {
        return this.cycleWithinSelection(shift, 'row');
      }
    }

    // Single cell: move in tab direction
    const direction = shift
      ? (this.config.tabDirection === 'right' ? 'left' : 'up')
      : this.config.tabDirection;

    // Track entry point for wrap
    if (!this._entryPoint) {
      this._entryPoint = { ...start };
    }

    return this.move(direction, start, { extend: false });
  }

  /**
   * Enter key navigation.
   * - In selection: Cycle through cells vertically
   * - Single cell: Move down (or up with shift)
   *
   * @param shift - Move backward if true
   * @returns Navigation result
   */
  enter(shift: boolean = false): NavigationResult {
    const start = this.getCurrentCell();

    // Check if we have a multi-cell selection
    if (this.selectionManager) {
      const state = this.selectionManager.getState();
      const range = state.ranges[state.activeRangeIndex];

      if (range && !this.isSingleCellRange(range)) {
        return this.cycleWithinSelection(shift, 'column');
      }
    }

    // Single cell: move in enter direction
    const direction = shift
      ? (this.config.enterDirection === 'down' ? 'up' : 'left')
      : this.config.enterDirection;

    return this.move(direction, start, { extend: false });
  }

  /**
   * Cycle through cells within the active selection.
   *
   * @param backward - Move backward through selection
   * @param primary - Primary direction: 'row' = horizontal first, 'column' = vertical first
   */
  private cycleWithinSelection(
    backward: boolean,
    primary: 'row' | 'column'
  ): NavigationResult {
    const start = this.getCurrentCell();

    if (!this.selectionManager) {
      // No selection manager, just move
      const direction = primary === 'row' ? (backward ? 'left' : 'right') : (backward ? 'up' : 'down');
      return this.move(direction, start, { extend: false });
    }

    const state = this.selectionManager.getState();
    const range = state.ranges[state.activeRangeIndex];

    if (!range) {
      const direction = primary === 'row' ? (backward ? 'left' : 'right') : (backward ? 'up' : 'down');
      return this.move(direction, start, { extend: false });
    }

    let { row, col } = start;
    const delta = backward ? -1 : 1;

    if (primary === 'row') {
      // Move horizontally first, then vertically
      col += delta;
      if (col > range.endCol) {
        col = range.startCol;
        row += 1;
        if (row > range.endRow) {
          row = range.startRow;
        }
      } else if (col < range.startCol) {
        col = range.endCol;
        row -= 1;
        if (row < range.startRow) {
          row = range.endRow;
        }
      }
    } else {
      // Move vertically first, then horizontally
      row += delta;
      if (row > range.endRow) {
        row = range.startRow;
        col += 1;
        if (col > range.endCol) {
          col = range.startCol;
        }
      } else if (row < range.startRow) {
        row = range.endRow;
        col -= 1;
        if (col < range.startCol) {
          col = range.endCol;
        }
      }
    }

    // Skip hidden cells (with safety limit)
    let attempts = 0;
    while (
      (this.dataProvider.isRowHidden(row) || this.dataProvider.isColumnHidden(col)) &&
      attempts < this.config.maxHiddenSkip
    ) {
      if (primary === 'row') {
        col += delta;
        if (col > range.endCol || col < range.startCol) {
          col = backward ? range.endCol : range.startCol;
          row += delta;
        }
      } else {
        row += delta;
        if (row > range.endRow || row < range.startRow) {
          row = backward ? range.endRow : range.startRow;
          col += delta;
        }
      }
      attempts++;
    }

    // Clamp to range bounds
    row = Math.max(range.startRow, Math.min(range.endRow, row));
    col = Math.max(range.startCol, Math.min(range.endCol, col));

    const target = { row, col };

    // Update only active cell, keep selection
    this._currentRow = row;
    this._currentCol = col;

    if (this.selectionManager) {
      // Move active cell within selection without changing the range
      // Use moveWithinSelection for proper Tab/Enter behavior
      const direction = primary === 'row'
        ? (backward ? 'previous' : 'next')
        : (backward ? 'previousRow' : 'nextRow');
      this.selectionManager.moveWithinSelection(direction);
    }

    const result: NavigationResult = {
      cell: target,
      action: primary === 'row' ? 'tab' : 'enter',
      direction: primary === 'row' ? (backward ? 'left' : 'right') : (backward ? 'up' : 'down'),
      boundaryHit: false,
      previousCell: start,
    };

    this.fireNavigateEvent(result);
    return result;
  }

  // ===========================================================================
  // Ctrl+A: Select Current Region / All
  // ===========================================================================

  /**
   * Ctrl+A behavior:
   * 1st press: Select current contiguous region
   * 2nd press: Select used range
   * 3rd press: Select all cells
   *
   * @returns The selected range
   */
  ctrlA(): CellRange {
    const now = Date.now();

    // Reset counter if more than 1 second since last press
    if (now - this._ctrlALastTime > 1000) {
      this._ctrlACount = 0;
    }

    this._ctrlACount++;
    this._ctrlALastTime = now;

    let range: CellRange;

    if (this._ctrlACount === 1) {
      // First press: Select current region
      const currentRegion = this.findCurrentRegion(this.getCurrentCell());
      if (currentRegion) {
        range = currentRegion;
      } else {
        // No current region, skip to used range
        const usedRange = this.dataProvider.getUsedRange();
        if (usedRange) {
          range = usedRange;
        } else {
          range = { startRow: 0, startCol: 0, endRow: this.config.maxRow - 1, endCol: this.config.maxCol - 1 };
        }
        this._ctrlACount = 2;
      }
    } else if (this._ctrlACount === 2) {
      // Second press: Select used range
      const usedRange = this.dataProvider.getUsedRange();
      if (usedRange) {
        range = usedRange;
      } else {
        range = { startRow: 0, startCol: 0, endRow: this.config.maxRow - 1, endCol: this.config.maxCol - 1 };
      }
    } else {
      // Third+ press: Select all
      range = { startRow: 0, startCol: 0, endRow: this.config.maxRow - 1, endCol: this.config.maxCol - 1 };
      this._ctrlACount = 0; // Reset for next cycle
    }

    // Update SelectionManager if available
    if (this.selectionManager) {
      this.selectionManager.setRange(range);
    }

    return range;
  }

  /**
   * Find the current contiguous data region around a cell.
   * Uses flood-fill algorithm with boundary detection.
   */
  private findCurrentRegion(start: CellRef): CellRange | null {
    const { row, col } = start;

    // If starting cell is empty, no current region
    if (!this.dataProvider.hasContent(row, col)) {
      return null;
    }

    // Expand in all directions to find bounds
    let minRow = row, maxRow = row;
    let minCol = col, maxCol = col;

    // Expand up
    while (minRow > 0 && this.hasContentInRow(minRow - 1, minCol, maxCol)) {
      minRow--;
      // Expand columns for new row
      while (minCol > 0 && this.dataProvider.hasContent(minRow, minCol - 1)) minCol--;
      while (maxCol < this.config.maxCol - 1 && this.dataProvider.hasContent(minRow, maxCol + 1)) maxCol++;
    }

    // Expand down
    while (maxRow < this.config.maxRow - 1 && this.hasContentInRow(maxRow + 1, minCol, maxCol)) {
      maxRow++;
      // Expand columns for new row
      while (minCol > 0 && this.dataProvider.hasContent(maxRow, minCol - 1)) minCol--;
      while (maxCol < this.config.maxCol - 1 && this.dataProvider.hasContent(maxRow, maxCol + 1)) maxCol++;
    }

    // Expand left for all rows
    while (minCol > 0 && this.hasContentInColumn(minCol - 1, minRow, maxRow)) {
      minCol--;
    }

    // Expand right for all rows
    while (maxCol < this.config.maxCol - 1 && this.hasContentInColumn(maxCol + 1, minRow, maxRow)) {
      maxCol++;
    }

    return { startRow: minRow, startCol: minCol, endRow: maxRow, endCol: maxCol };
  }

  private hasContentInRow(row: number, minCol: number, maxCol: number): boolean {
    for (let col = minCol; col <= maxCol; col++) {
      if (this.dataProvider.hasContent(row, col)) {
        return true;
      }
    }
    return false;
  }

  private hasContentInColumn(col: number, minRow: number, maxRow: number): boolean {
    for (let row = minRow; row <= maxRow; row++) {
      if (this.dataProvider.hasContent(row, col)) {
        return true;
      }
    }
    return false;
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Find the next visible row from a starting position.
   */
  private findNextVisibleRow(row: number, delta: number): number {
    if (delta === 0) {
      // Find nearest visible (prefer forward)
      if (row >= 0 && row < this.config.maxRow && !this.dataProvider.isRowHidden(row)) {
        return row;
      }
      // Search forward then backward
      for (let d = 1; d < this.config.maxHiddenSkip; d++) {
        if (row + d < this.config.maxRow && !this.dataProvider.isRowHidden(row + d)) {
          return row + d;
        }
        if (row - d >= 0 && !this.dataProvider.isRowHidden(row - d)) {
          return row - d;
        }
      }
      return Math.max(0, Math.min(this.config.maxRow - 1, row));
    }

    let current = row;
    let attempts = 0;

    while (
      current >= 0 &&
      current < this.config.maxRow &&
      this.dataProvider.isRowHidden(current) &&
      attempts < this.config.maxHiddenSkip
    ) {
      current += delta;
      attempts++;
    }

    return Math.max(0, Math.min(this.config.maxRow - 1, current));
  }

  /**
   * Find the next visible column from a starting position.
   */
  private findNextVisibleCol(col: number, delta: number): number {
    if (delta === 0) {
      // Find nearest visible (prefer forward)
      if (col >= 0 && col < this.config.maxCol && !this.dataProvider.isColumnHidden(col)) {
        return col;
      }
      // Search forward then backward
      for (let d = 1; d < this.config.maxHiddenSkip; d++) {
        if (col + d < this.config.maxCol && !this.dataProvider.isColumnHidden(col + d)) {
          return col + d;
        }
        if (col - d >= 0 && !this.dataProvider.isColumnHidden(col - d)) {
          return col - d;
        }
      }
      return Math.max(0, Math.min(this.config.maxCol - 1, col));
    }

    let current = col;
    let attempts = 0;

    while (
      current >= 0 &&
      current < this.config.maxCol &&
      this.dataProvider.isColumnHidden(current) &&
      attempts < this.config.maxHiddenSkip
    ) {
      current += delta;
      attempts++;
    }

    return Math.max(0, Math.min(this.config.maxCol - 1, current));
  }

  /**
   * Clamp a position to valid sheet bounds.
   */
  private clampPosition(row: number, col: number): CellRef {
    return {
      row: Math.max(0, Math.min(this.config.maxRow - 1, row)),
      col: Math.max(0, Math.min(this.config.maxCol - 1, col)),
    };
  }

  /**
   * Check if a range represents a single cell.
   */
  private isSingleCellRange(range: CellRange): boolean {
    return range.startRow === range.endRow && range.startCol === range.endCol;
  }

  /**
   * Update position and optionally selection.
   */
  private updatePosition(cell: CellRef, extend: boolean): void {
    this._currentRow = cell.row;
    this._currentCol = cell.col;

    if (this.selectionManager) {
      if (extend) {
        this.selectionManager.extendSelection(cell);
      } else {
        this.selectionManager.setActiveCell(cell);
      }
    }
  }

  /**
   * Fire navigation event.
   */
  private fireNavigateEvent(result: NavigationResult): void {
    this.events.onNavigate?.(result);
  }

  // ===========================================================================
  // Selection Compatibility Layer
  // ===========================================================================

  /**
   * Start a selection at a cell (mouse down).
   * @deprecated Use SelectionManager directly
   */
  startSelection(row: number, col: number, addToSelection: boolean = false): void {
    if (this.selectionManager) {
      if (addToSelection) {
        this.selectionManager.addRange({
          startRow: row,
          startCol: col,
          endRow: row,
          endCol: col,
        });
      } else {
        this.selectionManager.setActiveCell({ row, col });
      }
    }
    this._currentRow = row;
    this._currentCol = col;
    this._entryPoint = { row, col };
  }

  /**
   * Extend selection to a cell (mouse drag or Shift+Click).
   * @deprecated Use SelectionManager directly
   */
  extendSelectionTo(row: number, col: number): void {
    if (this.selectionManager) {
      this.selectionManager.extendSelection({ row, col });
    }
  }

  /**
   * Extend selection by one cell (Shift+Arrow).
   * @deprecated Use move() with extend option
   */
  extendSelection(direction: Direction): CellRange | null {
    this.move(direction, undefined, { extend: true });
    if (this.selectionManager) {
      const state = this.selectionManager.getState();
      return state.ranges[state.activeRangeIndex] ?? null;
    }
    return null;
  }

  /**
   * Ctrl+Arrow navigation.
   * @deprecated Use jump() instead
   */
  ctrlArrow(direction: Direction): CellRef {
    const result = this.jump(direction);
    return result.cell;
  }

  /**
   * Ctrl+Shift+Arrow navigation.
   * @deprecated Use jump() with extend option
   */
  ctrlShiftArrow(direction: Direction): CellRange | null {
    this.jump(direction, undefined, { extend: true });
    if (this.selectionManager) {
      const state = this.selectionManager.getState();
      return state.ranges[state.activeRangeIndex] ?? null;
    }
    return null;
  }

  /**
   * Enter key handler.
   * @deprecated Use enter() instead
   */
  enterKey(shift: boolean = false): CellRef {
    const result = this.enter(shift);
    return result.cell;
  }

  /**
   * Tab key handler.
   * @deprecated Use tab() instead
   */
  tabKey(shift: boolean = false): CellRef {
    const result = this.tab(shift);
    return result.cell;
  }

  /**
   * Move active cell (Arrow key).
   * @deprecated Use move() instead
   */
  moveActiveCell(direction: Direction, options: { skipHidden?: boolean } = {}): CellRef {
    const result = this.move(direction, undefined, options);
    return result.cell;
  }

  /**
   * Go to a specific cell.
   * @deprecated Use goTo() instead
   */
  goToCell(row: number, col: number): void {
    this.goTo(row, col);
  }

  // ===========================================================================
  // State Access (Compatibility)
  // ===========================================================================

  /**
   * Get current selection state.
   * @deprecated Use SelectionManager.getState() instead
   */
  getSelection(): { ranges: CellRange[]; activeCell: CellRef; anchorCell: CellRef; activeRangeIndex: number } {
    if (this.selectionManager) {
      const state = this.selectionManager.getState();
      return {
        ranges: [...state.ranges],
        activeCell: { ...state.activeCell },
        anchorCell: { ...state.anchorCell },
        activeRangeIndex: state.activeRangeIndex,
      };
    }
    const cell = this.getCurrentCell();
    return {
      ranges: [{ startRow: cell.row, startCol: cell.col, endRow: cell.row, endCol: cell.col }],
      activeCell: cell,
      anchorCell: cell,
      activeRangeIndex: 0,
    };
  }

  /**
   * Get active cell.
   * @deprecated Use getCurrentCell() instead
   */
  getActiveCell(): CellRef {
    return this.getCurrentCell();
  }

  /**
   * Get active range.
   */
  getActiveRange(): CellRange {
    if (this.selectionManager) {
      const state = this.selectionManager.getState();
      return { ...state.ranges[state.activeRangeIndex]! };
    }
    const cell = this.getCurrentCell();
    return { startRow: cell.row, startCol: cell.col, endRow: cell.row, endCol: cell.col };
  }

  /**
   * Set selection state.
   * @deprecated Use SelectionManager directly
   */
  setSelection(selection: Partial<{ ranges: CellRange[]; activeCell: CellRef; anchorCell: CellRef; activeRangeIndex: number }>): void {
    if (selection.activeCell) {
      this._currentRow = selection.activeCell.row;
      this._currentCol = selection.activeCell.col;
    }
    this._ctrlACount = 0;
  }

  /**
   * Select entire row.
   * @deprecated Use SelectionManager directly
   */
  selectRow(row: number, addToSelection: boolean = false): void {
    const range: CellRange = {
      startRow: row,
      startCol: 0,
      endRow: row,
      endCol: this.config.maxCol - 1,
    };

    if (this.selectionManager) {
      if (addToSelection) {
        this.selectionManager.addRange(range);
      } else {
        this.selectionManager.setRange(range);
      }
    }
  }

  /**
   * Select entire column.
   * @deprecated Use SelectionManager directly
   */
  selectColumn(col: number, addToSelection: boolean = false): void {
    const range: CellRange = {
      startRow: 0,
      startCol: col,
      endRow: this.config.maxRow - 1,
      endCol: col,
    };

    if (this.selectionManager) {
      if (addToSelection) {
        this.selectionManager.addRange(range);
      } else {
        this.selectionManager.setRange(range);
      }
    }
  }

  /**
   * Check if a cell is selected.
   */
  isCellSelected(row: number, col: number): boolean {
    if (this.selectionManager) {
      return this.selectionManager.isCellSelected(row, col);
    }
    const current = this.getCurrentCell();
    return current.row === row && current.col === col;
  }

  /**
   * Check if a cell is the active cell.
   */
  isActiveCell(row: number, col: number): boolean {
    const current = this.getCurrentCell();
    return current.row === row && current.col === col;
  }

  /**
   * Get selection info text.
   */
  getSelectionInfo(): string {
    if (this.selectionManager) {
      const state = this.selectionManager.getState();
      const range = state.ranges[state.activeRangeIndex];
      if (range) {
        if (range.startRow === range.endRow && range.startCol === range.endCol) {
          return this.cellRefToString(range.startRow, range.startCol);
        }
        const rows = range.endRow - range.startRow + 1;
        const cols = range.endCol - range.startCol + 1;
        return `${rows}R x ${cols}C`;
      }
    }
    return this.cellRefToString(this._currentRow, this._currentCol);
  }

  private cellRefToString(row: number, col: number): string {
    let colStr = '';
    let c = col + 1;
    while (c > 0) {
      const remainder = (c - 1) % 26;
      colStr = String.fromCharCode(65 + remainder) + colStr;
      c = Math.floor((c - 1) / 26);
    }
    return colStr + (row + 1);
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a NavigationManager with default configuration.
 */
export function createNavigationManager(
  dataProvider: NavigationDataProvider,
  config?: Partial<NavigationConfig>,
  selectionManager?: SelectionManager
): NavigationManager {
  return new NavigationManager(dataProvider, config, selectionManager);
}

/**
 * Create a NavigationDataProvider adapter from a SparseDataStore.
 * This bridges the NavigationManager with the existing data layer.
 */
export function createDataProviderAdapter(dataStore: {
  hasCell(row: number, col: number): boolean;
  isRowHidden(row: number): boolean;
  isColumnHidden(col: number): boolean;
  getCellsInRow(row: number): Map<number, unknown>;
  getCellsInColumn(col: number): Map<number, unknown>;
  getUsedRange(): CellRange;
}): NavigationDataProvider {
  return {
    hasContent(row: number, col: number): boolean {
      return dataStore.hasCell(row, col);
    },

    isRowHidden(row: number): boolean {
      return dataStore.isRowHidden(row);
    },

    isColumnHidden(col: number): boolean {
      return dataStore.isColumnHidden(col);
    },

    getColumnsInRow(row: number): number[] {
      const cells = dataStore.getCellsInRow(row);
      return Array.from(cells.keys()).sort((a, b) => a - b);
    },

    getRowsInColumn(col: number): number[] {
      const cells = dataStore.getCellsInColumn(col);
      return Array.from(cells.keys()).sort((a, b) => a - b);
    },

    getUsedRange(): CellRange | null {
      const range = dataStore.getUsedRange();
      if (range.endRow < 0 || range.endCol < 0) {
        return null;
      }
      return range;
    },
  };
}
