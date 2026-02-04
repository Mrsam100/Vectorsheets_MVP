/**
 * IntentHandler - Processes SpreadsheetIntents and produces state updates
 *
 * This module is the only place where selection state is computed.
 * It receives intents from PointerAdapter/KeyboardAdapter and produces
 * new SelectionState.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                         INTENT PROCESSING                               │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │                                                                         │
 * │   SpreadsheetIntent                                                     │
 * │       │                                                                 │
 * │       ▼                                                                 │
 * │   ┌───────────────┐                                                     │
 * │   │IntentHandler  │  ← Pure function: intent + state → new state       │
 * │   └───────┬───────┘                                                     │
 * │           │                                                             │
 * │           ▼                                                             │
 * │   ┌───────────────┐                                                     │
 * │   │ SelectionState│  ← New state (immutable)                           │
 * │   └───────────────┘                                                     │
 * │                                                                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import type {
  PointerIntent,
  SetActiveCellIntent,
  ExtendSelectionIntent,
  AddRangeIntent,
  BeginDragSelectionIntent,
  UpdateDragSelectionIntent,
  EndDragSelectionIntent,
  SelectRowIntent,
  SelectColumnIntent,
  AutoScrollIntent,
  InsertRowsIntent,
  DeleteRowsIntent,
  InsertColumnsIntent,
  DeleteColumnsIntent,
} from './PointerAdapter';
import type {
  KeyboardIntent,
  NavigateCellIntent,
  NavigatePageIntent,
  NavigateHomeEndIntent,
  TabEnterNavigateIntent,
  StartEditIntent,
  ApplyFormatIntent,
} from './KeyboardAdapter';
import type { SelectionState, SelectionRange } from './types';
import type { CellFormat } from '../../../../engine/core/types/index';

/**
 * Union type of all intents (pointer + keyboard)
 */
export type SpreadsheetIntent = PointerIntent | KeyboardIntent;

// =============================================================================
// Constants
// =============================================================================

/** Maximum row index (1M rows) */
const MAX_ROW = 1048575;
/** Maximum column index (16K columns) */
const MAX_COL = 16383;
/** Maximum number of selection ranges (prevents OOM from rapid Ctrl+Click) */
const MAX_RANGES = 2048;

// =============================================================================
// Utilities
// =============================================================================

/** Clamp row to valid range [0, MAX_ROW] */
function clampRow(row: number): number {
  return Math.max(0, Math.min(MAX_ROW, Math.floor(row)));
}

/** Clamp column to valid range [0, MAX_COL] */
function clampCol(col: number): number {
  return Math.max(0, Math.min(MAX_COL, Math.floor(col)));
}

/** Clamp cell coordinates to valid range */
function clampCell(row: number, col: number): { row: number; col: number } {
  return { row: clampRow(row), col: clampCol(col) };
}

// =============================================================================
// Handler Result Types
// =============================================================================

export interface IntentResult {
  /** New selection state (if changed) */
  selection?: SelectionState;
  /** Scroll request (if needed) */
  scrollTo?: { row: number; col: number };
  /** Auto-scroll request */
  autoScroll?: { direction: 'up' | 'down' | 'left' | 'right'; speed: number };
  /** Stop auto-scroll */
  stopAutoScroll?: boolean;
  /** Begin edit mode */
  beginEdit?: { row: number; col: number; initialValue?: string };
  /** Confirm edit mode (save changes) */
  confirmEdit?: boolean;
  /** Cancel edit mode (discard changes) */
  cancelEdit?: boolean;
  /** Fill operation (after fill drag) */
  fillRange?: { from: SelectionRange; to: SelectionRange };
  /** Delete cell contents */
  deleteContents?: boolean;
  /** Clipboard action */
  clipboard?: 'copy' | 'cut' | 'paste';
  /** Format to apply to selected cells */
  applyFormat?: Partial<CellFormat>;
  /** Undo/redo action */
  undoRedo?: 'undo' | 'redo';
  /** Insert rows at position */
  insertRows?: { row: number; count: number };
  /** Delete rows in range (inclusive) */
  deleteRows?: { startRow: number; endRow: number };
  /** Insert columns at position */
  insertColumns?: { col: number; count: number };
  /** Delete columns in range (inclusive) */
  deleteColumns?: { startCol: number; endCol: number };
  /** Merge cells in current selection */
  mergeCells?: boolean;
  /** Unmerge cells in current selection */
  unmergeCells?: boolean;
  /** Open format cells dialog */
  showFormatDialog?: boolean;
  /** Open Find/Replace dialog */
  openFindReplace?: 'find' | 'replace';
  /** Open Sort dialog */
  openSortDialog?: true;
  /** Open Filter dropdown for a column */
  openFilterDropdown?: { column: number; anchorRect: { x: number; y: number; width: number; height: number } };
  /** Open Data Validation dialog */
  openDataValidation?: true;
}

// =============================================================================
// Drag State (for tracking drag operations)
// =============================================================================

export interface DragState {
  /** Is drag in progress? */
  isDragging: boolean;
  /** Starting cell of drag */
  startCell: { row: number; col: number } | null;
  /** Is this an additive drag (Ctrl held)? */
  additive: boolean;
  /** Selection state before drag started */
  preSelectionState: SelectionState | null;
  /** Is this a fill drag? */
  isFillDrag: boolean;
}

const initialDragState: DragState = {
  isDragging: false,
  startCell: null,
  additive: false,
  preSelectionState: null,
  isFillDrag: false,
};

// =============================================================================
// Intent Handler Class
// =============================================================================

/**
 * IntentHandler processes intents and produces state updates
 *
 * Usage:
 * ```typescript
 * const handler = new IntentHandler();
 *
 * const result = handler.handle(intent, currentSelection);
 * if (result.selection) {
 *   setSelection(result.selection);
 * }
 * ```
 */
export class IntentHandler {
  private dragState: DragState = { ...initialDragState };

  /**
   * Process an intent and return state updates
   */
  handle(intent: SpreadsheetIntent, currentSelection: SelectionState, isEditing?: boolean): IntentResult {
    switch (intent.type) {
      case 'SetActiveCell':
        return this.handleSetActiveCell(intent);

      case 'ExtendSelection':
        return this.handleExtendSelection(intent, currentSelection);

      case 'AddRange':
        return this.handleAddRange(intent, currentSelection);

      case 'BeginDragSelection':
        return this.handleBeginDragSelection(intent, currentSelection);

      case 'UpdateDragSelection':
        return this.handleUpdateDragSelection(intent, currentSelection);

      case 'EndDragSelection':
        return this.handleEndDragSelection(intent);

      case 'BeginEdit':
        return this.handleBeginEdit(intent);

      case 'SelectRow':
        return this.handleSelectRow(intent, currentSelection);

      case 'SelectColumn':
        return this.handleSelectColumn(intent, currentSelection);

      case 'SelectAll':
        return this.handleSelectAll();

      case 'AutoScroll':
        return this.handleAutoScroll(intent);

      case 'StopAutoScroll':
        return { stopAutoScroll: true };

      case 'BeginFillDrag':
        return this.handleBeginFillDrag(intent, currentSelection);

      case 'UpdateFillDrag':
        return this.handleUpdateFillDrag(intent, currentSelection);

      case 'EndFillDrag':
        return this.handleEndFillDrag(intent, currentSelection);

      // =========================================================================
      // Keyboard Intents
      // =========================================================================

      case 'NavigateCell':
        return this.handleNavigateCell(intent, currentSelection);

      case 'NavigatePage':
        return this.handleNavigatePage(intent, currentSelection);

      case 'NavigateHomeEnd':
        return this.handleNavigateHomeEnd(intent, currentSelection);

      case 'TabEnterNavigate':
        return this.handleTabEnterNavigate(intent, currentSelection);

      case 'StartEdit':
        return this.handleStartEdit(intent, currentSelection);

      case 'ConfirmEdit':
        return { confirmEdit: true };

      case 'CancelEdit':
        return { cancelEdit: true };

      case 'EscapePressed':
        return this.handleEscapePressed(currentSelection, isEditing);

      case 'SelectAllCells':
        return this.handleSelectAll();

      case 'DeleteContents':
        return { deleteContents: true };

      case 'ClipboardAction':
        return { clipboard: intent.action };

      case 'ApplyFormat':
        return { applyFormat: (intent as ApplyFormatIntent).format };

      case 'UndoRedo':
        return { undoRedo: (intent as { action: 'undo' | 'redo' }).action };

      case 'InsertRows': {
        let row = (intent as InsertRowsIntent).row;
        // Resolve sentinels: -1 = above active cell, -2 = below active cell
        if (row === -1) row = currentSelection.activeCell?.row ?? 0;
        else if (row === -2) row = Math.min(MAX_ROW, (currentSelection.activeCell?.row ?? 0) + 1);
        return { insertRows: { row, count: (intent as InsertRowsIntent).count } };
      }

      case 'DeleteRows':
        return { deleteRows: { startRow: (intent as DeleteRowsIntent).startRow, endRow: (intent as DeleteRowsIntent).endRow } };

      case 'InsertColumns': {
        let col = (intent as InsertColumnsIntent).col;
        // Resolve sentinels: -1 = left of active cell, -2 = right of active cell
        if (col === -1) col = currentSelection.activeCell?.col ?? 0;
        else if (col === -2) col = Math.min(MAX_COL, (currentSelection.activeCell?.col ?? 0) + 1);
        return { insertColumns: { col, count: (intent as InsertColumnsIntent).count } };
      }

      case 'DeleteColumns':
        return { deleteColumns: { startCol: (intent as DeleteColumnsIntent).startCol, endCol: (intent as DeleteColumnsIntent).endCol } };

      case 'MergeCells':
        return { mergeCells: true };

      case 'UnmergeCells':
        return { unmergeCells: true };

      case 'ShowFormatDialog':
        return { showFormatDialog: true };

      case 'OpenFindReplace':
        return { openFindReplace: (intent as { mode: 'find' | 'replace' }).mode };

      case 'OpenSortDialog':
        return { openSortDialog: true };

      case 'OpenFilterDropdown':
        return {
          openFilterDropdown: {
            column: (intent as { column: number; anchorRect: { x: number; y: number; width: number; height: number } }).column,
            anchorRect: (intent as { anchorRect: { x: number; y: number; width: number; height: number } }).anchorRect,
          },
        };

      case 'OpenDataValidation':
        return { openDataValidation: true };

      default:
        return {};
    }
  }

  // ===========================================================================
  // Individual Intent Handlers
  // ===========================================================================

  private handleSetActiveCell(intent: SetActiveCellIntent): IntentResult {
    const cell = clampCell(intent.row, intent.col);
    return {
      selection: {
        activeCell: cell,
        ranges: [],
      },
      scrollTo: cell,
    };
  }

  private handleExtendSelection(
    intent: ExtendSelectionIntent,
    currentSelection: SelectionState
  ): IntentResult {
    if (!currentSelection.activeCell) {
      // No active cell, treat as SetActiveCell
      return this.handleSetActiveCell({ ...intent, type: 'SetActiveCell' });
    }

    const target = clampCell(intent.row, intent.col);

    // Create range from active cell to target
    const range: SelectionRange = {
      startRow: currentSelection.activeCell.row,
      startCol: currentSelection.activeCell.col,
      endRow: target.row,
      endCol: target.col,
    };

    return {
      selection: {
        activeCell: currentSelection.activeCell,
        ranges: [range],
      },
      scrollTo: target,
    };
  }

  private handleAddRange(
    intent: AddRangeIntent,
    currentSelection: SelectionState
  ): IntentResult {
    const cell = clampCell(intent.row, intent.col);

    // Add new range starting at clicked cell
    const newRange: SelectionRange = {
      startRow: cell.row,
      startCol: cell.col,
      endRow: cell.row,
      endCol: cell.col,
    };

    // Cap the number of ranges to prevent memory exhaustion from rapid Ctrl+Click
    const existingRanges = currentSelection.ranges.length >= MAX_RANGES
      ? currentSelection.ranges.slice(-MAX_RANGES + 1)
      : currentSelection.ranges;

    return {
      selection: {
        activeCell: cell,
        ranges: [...existingRanges, newRange],
      },
      scrollTo: cell,
    };
  }

  private handleBeginDragSelection(
    intent: BeginDragSelectionIntent,
    currentSelection: SelectionState
  ): IntentResult {
    const cell = clampCell(intent.row, intent.col);

    // Store drag state
    this.dragState = {
      isDragging: true,
      startCell: cell,
      additive: intent.additive,
      preSelectionState: intent.additive ? currentSelection : null,
      isFillDrag: false,
    };

    // Selection already set by SetActiveCell/AddRange
    return {};
  }

  private handleUpdateDragSelection(
    intent: UpdateDragSelectionIntent,
    _currentSelection: SelectionState
  ): IntentResult {
    if (!this.dragState.isDragging || !this.dragState.startCell) {
      return {};
    }

    const target = clampCell(intent.row, intent.col);

    // Create range from drag start to current position
    const dragRange: SelectionRange = {
      startRow: this.dragState.startCell.row,
      startCol: this.dragState.startCell.col,
      endRow: target.row,
      endCol: target.col,
    };

    // If additive, append to pre-drag ranges
    const ranges = this.dragState.additive && this.dragState.preSelectionState
      ? [...this.dragState.preSelectionState.ranges, dragRange]
      : [dragRange];

    return {
      selection: {
        activeCell: this.dragState.startCell,
        ranges,
      },
      scrollTo: target,
    };
  }

  private handleEndDragSelection(
    _intent: EndDragSelectionIntent
  ): IntentResult {
    // Reset drag state
    this.dragState = { ...initialDragState };
    return {};
  }

  private handleBeginEdit(intent: { row: number; col: number }): IntentResult {
    const cell = clampCell(intent.row, intent.col);
    return {
      beginEdit: cell,
    };
  }

  private handleSelectRow(
    intent: SelectRowIntent,
    currentSelection: SelectionState
  ): IntentResult {
    const row = clampRow(intent.row);

    const rowRange: SelectionRange = {
      startRow: row,
      startCol: 0,
      endRow: row,
      endCol: MAX_COL,
    };

    if (intent.extend && currentSelection.activeCell) {
      // Extend from active cell's row to clicked row
      return {
        selection: {
          activeCell: currentSelection.activeCell,
          ranges: [{
            startRow: currentSelection.activeCell.row,
            startCol: 0,
            endRow: row,
            endCol: MAX_COL,
          }],
        },
      };
    }

    if (intent.additive) {
      // Add row to selection (cap ranges to prevent memory exhaustion)
      const existingRanges = currentSelection.ranges.length >= MAX_RANGES
        ? currentSelection.ranges.slice(-MAX_RANGES + 1)
        : currentSelection.ranges;
      return {
        selection: {
          activeCell: { row, col: 0 },
          ranges: [...existingRanges, rowRange],
        },
      };
    }

    // Select single row
    return {
      selection: {
        activeCell: { row, col: 0 },
        ranges: [rowRange],
      },
    };
  }

  private handleSelectColumn(
    intent: SelectColumnIntent,
    currentSelection: SelectionState
  ): IntentResult {
    const col = clampCol(intent.col);

    const colRange: SelectionRange = {
      startRow: 0,
      startCol: col,
      endRow: MAX_ROW,
      endCol: col,
    };

    if (intent.extend && currentSelection.activeCell) {
      // Extend from active cell's column to clicked column
      return {
        selection: {
          activeCell: currentSelection.activeCell,
          ranges: [{
            startRow: 0,
            startCol: currentSelection.activeCell.col,
            endRow: MAX_ROW,
            endCol: col,
          }],
        },
      };
    }

    if (intent.additive) {
      // Add column to selection (cap ranges to prevent memory exhaustion)
      const existingRanges = currentSelection.ranges.length >= MAX_RANGES
        ? currentSelection.ranges.slice(-MAX_RANGES + 1)
        : currentSelection.ranges;
      return {
        selection: {
          activeCell: { row: 0, col },
          ranges: [...existingRanges, colRange],
        },
      };
    }

    // Select single column
    return {
      selection: {
        activeCell: { row: 0, col },
        ranges: [colRange],
      },
    };
  }

  private handleSelectAll(): IntentResult {
    return {
      selection: {
        activeCell: { row: 0, col: 0 },
        ranges: [{
          startRow: 0,
          startCol: 0,
          endRow: MAX_ROW,
          endCol: MAX_COL,
        }],
      },
    };
  }

  private handleAutoScroll(intent: AutoScrollIntent): IntentResult {
    return {
      autoScroll: {
        direction: intent.direction,
        speed: intent.speed,
      },
    };
  }

  private handleBeginFillDrag(
    intent: { row: number; col: number },
    currentSelection: SelectionState
  ): IntentResult {
    const cell = clampCell(intent.row, intent.col);

    this.dragState = {
      isDragging: true,
      startCell: cell,
      additive: false,
      preSelectionState: currentSelection,
      isFillDrag: true,
    };
    return {};
  }

  private handleUpdateFillDrag(
    intent: { row: number; col: number },
    currentSelection: SelectionState
  ): IntentResult {
    if (!this.dragState.isFillDrag || !this.dragState.preSelectionState) {
      return {};
    }

    const target = clampCell(intent.row, intent.col);

    // Show preview of fill range
    // For now, just extend the selection to show what will be filled
    const originalRange = this.dragState.preSelectionState.ranges[0];
    if (!originalRange) return {};

    const minRow = Math.min(originalRange.startRow, originalRange.endRow);
    const maxRow = Math.max(originalRange.startRow, originalRange.endRow);
    const minCol = Math.min(originalRange.startCol, originalRange.endCol);
    const maxCol = Math.max(originalRange.startCol, originalRange.endCol);

    // Lock fill to a single axis (the one with greater deviation) — matches Excel
    const rowDev = Math.max(minRow - target.row, target.row - maxRow, 0);
    const colDev = Math.max(minCol - target.col, target.col - maxCol, 0);

    const fillRange: SelectionRange = { ...originalRange };
    if (rowDev >= colDev) {
      // Vertical fill
      if (target.row < minRow) {
        fillRange.startRow = target.row;
      } else if (target.row > maxRow) {
        fillRange.endRow = target.row;
      }
    } else {
      // Horizontal fill
      if (target.col < minCol) {
        fillRange.startCol = target.col;
      } else if (target.col > maxCol) {
        fillRange.endCol = target.col;
      }
    }

    return {
      selection: {
        activeCell: currentSelection.activeCell,
        ranges: [fillRange],
      },
    };
  }

  private handleEndFillDrag(
    intent: { row: number; col: number },
    currentSelection: SelectionState
  ): IntentResult {
    if (!this.dragState.isFillDrag || !this.dragState.preSelectionState) {
      this.dragState = { ...initialDragState };
      return {};
    }

    const target = clampCell(intent.row, intent.col);

    // Save preSelectionState before resetting dragState
    const preSelectionState = this.dragState.preSelectionState;
    const originalRange = preSelectionState.ranges[0];

    // Reset drag state
    this.dragState = { ...initialDragState };

    if (!originalRange) {
      // Restore original selection if no range
      return { selection: preSelectionState };
    }

    // Calculate fill range (axis-locked — matches Excel)
    const minRow = Math.min(originalRange.startRow, originalRange.endRow);
    const maxRow = Math.max(originalRange.startRow, originalRange.endRow);
    const minCol = Math.min(originalRange.startCol, originalRange.endCol);
    const maxCol = Math.max(originalRange.startCol, originalRange.endCol);

    const rowDev = Math.max(minRow - target.row, target.row - maxRow, 0);
    const colDev = Math.max(minCol - target.col, target.col - maxCol, 0);

    let fillRange: SelectionRange;
    if (rowDev >= colDev) {
      fillRange = {
        startRow: Math.min(minRow, target.row),
        startCol: minCol,
        endRow: Math.max(maxRow, target.row),
        endCol: maxCol,
      };
    } else {
      fillRange = {
        startRow: minRow,
        startCol: Math.min(minCol, target.col),
        endRow: maxRow,
        endCol: Math.max(maxCol, target.col),
      };
    }

    // Only emit fill if range actually changed
    if (
      fillRange.startRow !== minRow ||
      fillRange.endRow !== maxRow ||
      fillRange.startCol !== minCol ||
      fillRange.endCol !== maxCol
    ) {
      return {
        selection: {
          activeCell: currentSelection.activeCell,
          ranges: [fillRange],
        },
        fillRange: {
          from: originalRange,
          to: fillRange,
        },
      };
    }

    // Restore original selection - range didn't change
    return { selection: preSelectionState };
  }

  // ===========================================================================
  // Keyboard Intent Handlers
  // ===========================================================================

  private handleNavigateCell(
    intent: NavigateCellIntent,
    currentSelection: SelectionState
  ): IntentResult {
    const activeCell = currentSelection.activeCell;
    if (!activeCell) {
      // No active cell, go to A1
      return {
        selection: { activeCell: { row: 0, col: 0 }, ranges: [] },
        scrollTo: { row: 0, col: 0 },
      };
    }

    // When extending (Shift+Arrow), start from the current selection endpoint
    // instead of activeCell, so perpendicular extensions are preserved.
    const lastRange = currentSelection.ranges.length > 0
      ? currentSelection.ranges[currentSelection.ranges.length - 1]
      : null;
    const cursorRow = (intent.extend && lastRange) ? lastRange.endRow : activeCell.row;
    const cursorCol = (intent.extend && lastRange) ? lastRange.endCol : activeCell.col;

    let newRow = cursorRow;
    let newCol = cursorCol;

    // Calculate new position based on direction
    if (intent.jump) {
      // Ctrl+Arrow: Jump to grid boundary
      // When engine data is available, this should jump to the next data/empty boundary.
      // For now, jump to the edge of the grid (correct for empty grids).
      switch (intent.direction) {
        case 'up': newRow = 0; break;
        case 'down': newRow = MAX_ROW; break;
        case 'left': newCol = 0; break;
        case 'right': newCol = MAX_COL; break;
      }
    } else {
      // Single cell move
      switch (intent.direction) {
        case 'up': newRow = Math.max(0, cursorRow - 1); break;
        case 'down': newRow = Math.min(MAX_ROW, cursorRow + 1); break;
        case 'left': newCol = Math.max(0, cursorCol - 1); break;
        case 'right': newCol = Math.min(MAX_COL, cursorCol + 1); break;
      }
    }

    const newCell = clampCell(newRow, newCol);

    if (intent.extend) {
      // Shift+Arrow: Extend selection from anchor (activeCell stays fixed)
      // Preserve any prior ranges (from Ctrl+Click) and only modify the last one
      const range: SelectionRange = {
        startRow: activeCell.row,
        startCol: activeCell.col,
        endRow: newCell.row,
        endCol: newCell.col,
      };

      // Keep all existing ranges except the last one (which we're extending)
      const priorRanges = currentSelection.ranges.length > 1
        ? currentSelection.ranges.slice(0, -1)
        : [];

      return {
        selection: {
          activeCell, // Anchor stays fixed during extend
          ranges: [...priorRanges, range],
        },
        scrollTo: newCell, // Scroll to see the extended edge
      };
    }

    // Normal navigation - clear selection
    return {
      selection: { activeCell: newCell, ranges: [] },
      scrollTo: newCell,
    };
  }

  private handleNavigatePage(
    intent: NavigatePageIntent,
    currentSelection: SelectionState
  ): IntentResult {
    const activeCell = currentSelection.activeCell ?? { row: 0, col: 0 };
    const pageSize = intent.pageSize ?? 20;

    // When extending, start from current selection endpoint to preserve perpendicular extent
    const lastRange = currentSelection.ranges.length > 0
      ? currentSelection.ranges[currentSelection.ranges.length - 1]
      : null;
    const cursorRow = (intent.extend && lastRange) ? lastRange.endRow : activeCell.row;
    const cursorCol = (intent.extend && lastRange) ? lastRange.endCol : activeCell.col;

    let newRow = cursorRow;
    if (intent.direction === 'up') {
      newRow = Math.max(0, cursorRow - pageSize);
    } else {
      newRow = Math.min(MAX_ROW, cursorRow + pageSize);
    }

    const newCell = clampCell(newRow, cursorCol);

    if (intent.extend) {
      // Shift+PageUp/Down: Extend selection from anchor (activeCell stays fixed)
      const range: SelectionRange = {
        startRow: activeCell.row,
        startCol: activeCell.col,
        endRow: newCell.row,
        endCol: cursorCol,
      };

      return {
        selection: { activeCell, ranges: [range] }, // Anchor stays fixed
        scrollTo: newCell,
      };
    }

    return {
      selection: { activeCell: newCell, ranges: [] },
      scrollTo: newCell,
    };
  }

  private handleNavigateHomeEnd(
    intent: NavigateHomeEndIntent,
    currentSelection: SelectionState
  ): IntentResult {
    const activeCell = currentSelection.activeCell ?? { row: 0, col: 0 };

    // When extending, start from current selection endpoint to preserve perpendicular extent
    const lastRange = currentSelection.ranges.length > 0
      ? currentSelection.ranges[currentSelection.ranges.length - 1]
      : null;
    const cursorRow = (intent.extend && lastRange) ? lastRange.endRow : activeCell.row;
    const cursorCol = (intent.extend && lastRange) ? lastRange.endCol : activeCell.col;

    let newRow = cursorRow;
    let newCol = cursorCol;

    if (intent.target === 'home') {
      if (intent.documentLevel) {
        // Ctrl+Home: Go to A1
        newRow = 0;
        newCol = 0;
      } else {
        // Home: Go to column A
        newCol = 0;
      }
    } else {
      // End
      if (intent.documentLevel) {
        // Ctrl+End: Go to last used cell
        // When engine data is available, this should use getLastUsedCell().
        // For now, go to the grid boundary (correct for empty grids).
        newRow = MAX_ROW;
        newCol = MAX_COL;
      } else {
        // End: Go to the last column in current row
        // When engine data is available, this should find the last data column in the row.
        newCol = MAX_COL;
      }
    }

    const newCell = clampCell(newRow, newCol);

    if (intent.extend) {
      // Shift+Home/End: Extend selection from anchor (activeCell stays fixed)
      const range: SelectionRange = {
        startRow: activeCell.row,
        startCol: activeCell.col,
        endRow: newCell.row,
        endCol: newCell.col,
      };

      return {
        selection: { activeCell, ranges: [range] }, // Anchor stays fixed
        scrollTo: newCell,
      };
    }

    return {
      selection: { activeCell: newCell, ranges: [] },
      scrollTo: newCell,
    };
  }

  private handleTabEnterNavigate(
    intent: TabEnterNavigateIntent,
    currentSelection: SelectionState
  ): IntentResult {
    const activeCell = currentSelection.activeCell ?? { row: 0, col: 0 };

    // Check if there's a non-degenerate selection range to cycle within
    const range = currentSelection.ranges.length > 0 ? currentSelection.ranges[0] : null;
    const hasRange = range && (
      range.startRow !== range.endRow || range.startCol !== range.endCol
    );

    if (hasRange && range) {
      // Cycle within selected range (matches Excel behavior)
      const minRow = Math.min(range.startRow, range.endRow);
      const maxRow = Math.max(range.startRow, range.endRow);
      const minCol = Math.min(range.startCol, range.endCol);
      const maxCol = Math.max(range.startCol, range.endCol);

      let newRow = activeCell.row;
      let newCol = activeCell.col;

      if (intent.key === 'tab') {
        // Tab cycles horizontally within range, wrapping to next/prev row
        if (intent.reverse) {
          newCol--;
          if (newCol < minCol) { newCol = maxCol; newRow--; }
          if (newRow < minRow) { newRow = maxRow; } // wrap to bottom
        } else {
          newCol++;
          if (newCol > maxCol) { newCol = minCol; newRow++; }
          if (newRow > maxRow) { newRow = minRow; } // wrap to top
        }
      } else {
        // Enter cycles vertically within range, wrapping to next/prev column
        if (intent.reverse) {
          newRow--;
          if (newRow < minRow) { newRow = maxRow; newCol--; }
          if (newCol < minCol) { newCol = maxCol; } // wrap to right
        } else {
          newRow++;
          if (newRow > maxRow) { newRow = minRow; newCol++; }
          if (newCol > maxCol) { newCol = minCol; } // wrap to left
        }
      }

      const newCell = clampCell(newRow, newCol);
      return {
        selection: { activeCell: newCell, ranges: currentSelection.ranges },
        scrollTo: newCell,
      };
    }

    // No selection range — move to adjacent cell
    let newRow = activeCell.row;
    let newCol = activeCell.col;

    if (intent.key === 'tab') {
      if (intent.reverse) {
        newCol = Math.max(0, activeCell.col - 1);
      } else {
        newCol = Math.min(MAX_COL, activeCell.col + 1);
      }
    } else {
      if (intent.reverse) {
        newRow = Math.max(0, activeCell.row - 1);
      } else {
        newRow = Math.min(MAX_ROW, activeCell.row + 1);
      }
    }

    const newCell = clampCell(newRow, newCol);

    return {
      selection: { activeCell: newCell, ranges: [] },
      scrollTo: newCell,
    };
  }

  private handleStartEdit(
    intent: StartEditIntent,
    currentSelection: SelectionState
  ): IntentResult {
    const activeCell = currentSelection.activeCell;
    if (!activeCell && intent.row === undefined) {
      return {};
    }

    const row = intent.row ?? activeCell!.row;
    const col = intent.col ?? activeCell!.col;
    const cell = clampCell(row, col);

    return {
      beginEdit: {
        row: cell.row,
        col: cell.col,
        initialValue: intent.initialValue,
      },
    };
  }

  private handleEscapePressed(currentSelection: SelectionState, isEditing?: boolean): IntentResult {
    // If editing, always cancel edit first (matches Excel: Escape cancels edit, second Escape clears selection)
    if (isEditing) {
      return { cancelEdit: true };
    }
    // Not editing: clear selection ranges but keep active cell
    if (currentSelection.ranges.length > 0) {
      return {
        selection: {
          activeCell: currentSelection.activeCell,
          ranges: [],
        },
      };
    }
    return { cancelEdit: true };
  }

  /**
   * Reset handler state
   */
  reset(): void {
    this.dragState = { ...initialDragState };
  }
}

// =============================================================================
// React Hook
// =============================================================================

import { useRef, useCallback } from 'react';

/**
 * React hook for IntentHandler
 */
export function useIntentHandler() {
  const handlerRef = useRef<IntentHandler | null>(null);

  if (!handlerRef.current) {
    handlerRef.current = new IntentHandler();
  }

  const handleIntent = useCallback(
    (intent: SpreadsheetIntent, selection: SelectionState, isEditing?: boolean): IntentResult => {
      return handlerRef.current!.handle(intent, selection, isEditing);
    },
    []
  );

  const reset = useCallback(() => {
    handlerRef.current?.reset();
  }, []);

  return { handleIntent, reset };
}
