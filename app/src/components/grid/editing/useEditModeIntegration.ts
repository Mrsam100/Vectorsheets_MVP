/**
 * useEditModeIntegration - Integrates EditModeManager with the UI intent system
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                        EDIT MODE INTEGRATION                                │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │                                                                             │
 * │   Keyboard/Pointer Events                                                   │
 * │       │                                                                     │
 * │       ▼                                                                     │
 * │   ┌─────────────────────┐                                                   │
 * │   │ KeyboardAdapter /   │                                                   │
 * │   │ PointerAdapter      │                                                   │
 * │   └─────────┬───────────┘                                                   │
 * │             │ SpreadsheetIntent                                             │
 * │             ▼                                                               │
 * │   ┌─────────────────────────────────────────────────────────────────────┐   │
 * │   │              useEditModeIntegration                                 │   │
 * │   │  ┌─────────────────────────────────────────────────────────────┐   │   │
 * │   │  │  1. Check current edit mode                                 │   │   │
 * │   │  │  2. Route to EditModeManager if editing                     │   │   │
 * │   │  │  3. If not consumed, delegate to IntentHandler              │   │   │
 * │   │  │  4. Handle mode transitions (typing starts edit, etc.)      │   │   │
 * │   │  └─────────────────────────────────────────────────────────────┘   │   │
 * │   └───────────┬─────────────────────────────────────────┬───────────────┘   │
 * │               │                                         │                   │
 * │               ▼                                         ▼                   │
 * │   ┌───────────────────────┐               ┌───────────────────────┐         │
 * │   │   EditModeManager     │               │    IntentHandler      │         │
 * │   │   (edit state)        │               │    (selection state)  │         │
 * │   └───────────┬───────────┘               └───────────┬───────────┘         │
 * │               │                                       │                     │
 * │               ▼                                       ▼                     │
 * │   ┌───────────────────────┐               ┌───────────────────────┐         │
 * │   │ CellEditorOverlay /   │               │   SelectionOverlay    │         │
 * │   │ FormulaBar            │               │                       │         │
 * │   └───────────────────────┘               └───────────────────────┘         │
 * │                                                                             │
 * │   Mode Behaviors:                                                           │
 * │   ┌─────────────────────────────────────────────────────────────────────┐   │
 * │   │ Navigate: Arrow keys → move selection, typing → start Enter mode   │   │
 * │   │ Enter:    Arrow keys → commit + move, typing → replace content     │   │
 * │   │ Edit:     Arrow keys → move caret (if in text), else commit + move │   │
 * │   │ Point:    Arrow keys → insert cell reference, click → insert ref   │   │
 * │   └─────────────────────────────────────────────────────────────────────┘   │
 * │                                                                             │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StartEditIntent } from '../KeyboardAdapter';
import type { IntentResult, SpreadsheetIntent } from '../IntentHandler';
import type { SelectionState } from '../types';
import type { EditModeState, EditModeActions } from './useEditMode';
import { formatRangeRef } from './usePointMode';

// =============================================================================
// Types
// =============================================================================

export interface EditModeIntegrationOptions {
  /** Edit mode state from useEditMode */
  editState: EditModeState;
  /** Edit mode actions from useEditMode */
  editActions: EditModeActions;
  /** IntentHandler's handle function */
  handleIntent: (intent: SpreadsheetIntent, selection: SelectionState) => IntentResult;
  /** Current selection state */
  selection: SelectionState;
  /** Get cell value at position */
  getCellValue: (row: number, col: number) => string;
  /** Format cell reference as A1 style */
  formatCellReference: (row: number, col: number) => string;
}

export interface PointModeDragState {
  /** Is currently dragging in Point mode */
  isDragging: boolean;
  /** Start cell of drag */
  startCell: { row: number; col: number } | null;
  /** Current end cell of drag */
  endCell: { row: number; col: number } | null;
}

export interface EditModeIntegrationResult {
  /** Process an intent through the edit mode system */
  processIntent: (intent: SpreadsheetIntent) => IntentResult;
  /** Handle cell click (for Point mode reference insertion) */
  handleCellClick: (row: number, col: number, additive: boolean) => IntentResult | null;
  /** Handle Point mode drag start */
  handlePointModeDragStart: (row: number, col: number) => void;
  /** Handle Point mode drag update */
  handlePointModeDragUpdate: (row: number, col: number) => void;
  /** Handle Point mode drag end - returns the range reference */
  handlePointModeDragEnd: () => string | null;
  /** Get current Point mode drag state */
  getPointModeDragState: () => PointModeDragState;
  /** Whether the editor should be visible */
  isEditorVisible: boolean;
  /** Whether point mode highlighting should be active */
  isPointModeActive: boolean;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Integration hook for EditModeManager with the intent system
 *
 * Usage:
 * ```tsx
 * const { state: editState, actions: editActions } = useEditMode({
 *   onCommit: (cell, value) => engine.setCell(cell.row, cell.col, value),
 * });
 *
 * const { processIntent, isEditorVisible } = useEditModeIntegration({
 *   editState,
 *   editActions,
 *   handleIntent,
 *   selection,
 *   getCellValue: (row, col) => engine.getCell(row, col),
 *   formatCellReference,
 * });
 *
 * // In keyboard handler
 * const handleKeyboardIntent = (intent) => {
 *   const result = processIntent(intent);
 *   // Apply result...
 * };
 * ```
 */
export function useEditModeIntegration(
  options: EditModeIntegrationOptions
): EditModeIntegrationResult {
  const {
    editState,
    editActions,
    handleIntent,
    selection,
    getCellValue,
    formatCellReference,
  } = options;

  // Refs to avoid stale closures in callbacks
  const editStateRef = useRef(editState);
  const selectionRef = useRef(selection);
  editStateRef.current = editState;
  selectionRef.current = selection;

  // Point mode drag state
  const [pointDragState, setPointDragState] = useState<PointModeDragState>({
    isDragging: false,
    startCell: null,
    endCell: null,
  });

  // Ref for drag state to avoid stale closures
  const pointDragStateRef = useRef(pointDragState);
  pointDragStateRef.current = pointDragState;

  // rAF-based throttle for drag updates (prevents 60+ state updates/sec)
  const dragRafRef = useRef<number | null>(null);
  const pendingDragCellRef = useRef<{ row: number; col: number } | null>(null);

  // Debounce rapid same-cell clicks in point mode
  const lastPointClickRef = useRef<{ row: number; col: number; time: number } | null>(null);

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (dragRafRef.current) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
    };
  }, []);

  /**
   * Process an intent through the edit mode system
   */
  const processIntent = useCallback((intent: SpreadsheetIntent): IntentResult => {
    const currentEditState = editStateRef.current;
    const currentSelection = selectionRef.current;

    // =========================================================================
    // Route based on current edit mode
    // =========================================================================

    if (currentEditState.isEditing) {
      // Currently editing - check if EditModeManager should handle this
      const editResult = processEditingIntent(
        intent,
        currentEditState,
        editActions,
        currentSelection,
        formatCellReference
      );

      if (editResult.handled) {
        return editResult.result;
      }
      // Not handled by edit mode, fall through to normal intent handling
    }

    // =========================================================================
    // Check for edit triggers in Navigate mode
    // =========================================================================

    if (!currentEditState.isEditing) {
      const startEditResult = checkStartEditTrigger(
        intent,
        currentSelection,
        editActions,
        getCellValue
      );

      if (startEditResult) {
        return startEditResult;
      }
    }

    // =========================================================================
    // Delegate to IntentHandler for navigation/selection
    // =========================================================================

    return handleIntent(intent, currentSelection);
  }, [editActions, handleIntent, getCellValue, formatCellReference]);

  /**
   * Handle cell click (for Point mode reference insertion)
   * Deduplicates rapid clicks on the same cell to prevent double-insert
   */
  const handleCellClick = useCallback((
    row: number,
    col: number,
    _additive: boolean
  ): IntentResult | null => {
    const currentEditState = editStateRef.current;

    // In Point mode, clicking a cell inserts its reference
    if (currentEditState.isEditing && currentEditState.mode === 'point') {
      // Deduplicate rapid clicks on the same cell (prevent double-insert)
      const now = performance.now();
      const lastClick = lastPointClickRef.current;
      if (
        lastClick &&
        lastClick.row === row &&
        lastClick.col === col &&
        now - lastClick.time < 300
      ) {
        return {}; // Ignore duplicate
      }
      lastPointClickRef.current = { row, col, time: now };

      const ref = formatCellReference(row, col);
      editActions.insertCellReference(ref);

      // Don't change selection - stay in edit mode
      return {};
    }

    // Not in point mode - return null to let normal click handling proceed
    return null;
  }, [editActions, formatCellReference]);

  /**
   * Handle Point mode drag start
   */
  const handlePointModeDragStart = useCallback((row: number, col: number) => {
    const currentEditState = editStateRef.current;
    if (!currentEditState.isEditing || currentEditState.mode !== 'point') return;

    setPointDragState({
      isDragging: true,
      startCell: { row, col },
      endCell: { row, col },
    });
  }, []);

  /**
   * Handle Point mode drag update
   * Throttled with rAF to prevent 60+ state updates per second during drag
   */
  const handlePointModeDragUpdate = useCallback((row: number, col: number) => {
    // Store latest cell for rAF callback (collapses rapid mousemove into 1/frame)
    pendingDragCellRef.current = { row, col };
    if (dragRafRef.current) return; // Already scheduled

    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = null;
      const cell = pendingDragCellRef.current;
      if (!cell) return;

      setPointDragState((prev) => {
        if (!prev.isDragging || !prev.startCell) return prev;
        return {
          ...prev,
          endCell: cell,
        };
      });
    });
  }, []);

  /**
   * Handle Point mode drag end - inserts range reference
   */
  const handlePointModeDragEnd = useCallback((): string | null => {
    const currentEditState = editStateRef.current;
    const dragState = pointDragStateRef.current; // Use ref to avoid stale closure

    if (!currentEditState.isEditing || currentEditState.mode !== 'point') {
      setPointDragState({ isDragging: false, startCell: null, endCell: null });
      return null;
    }

    if (!dragState.isDragging || !dragState.startCell) {
      setPointDragState({ isDragging: false, startCell: null, endCell: null });
      return null;
    }

    const startCell = dragState.startCell;
    const endCell = dragState.endCell || startCell;

    // Generate the reference
    const ref = formatRangeRef(
      startCell.row,
      startCell.col,
      endCell.row,
      endCell.col
    );

    // Insert the reference
    editActions.insertCellReference(ref);

    // Reset drag state
    setPointDragState({ isDragging: false, startCell: null, endCell: null });

    return ref;
  }, [editActions]); // Removed pointDragState - using ref instead

  /**
   * Get current Point mode drag state
   */
  const getPointModeDragState = useCallback((): PointModeDragState => {
    return pointDragStateRef.current; // Use ref for consistency
  }, []);

  // Computed properties
  const isEditorVisible = editState.isEditing;
  const isPointModeActive = editState.isEditing && editState.mode === 'point';

  return {
    processIntent,
    handleCellClick,
    handlePointModeDragStart,
    handlePointModeDragUpdate,
    handlePointModeDragEnd,
    getPointModeDragState,
    isEditorVisible,
    isPointModeActive,
  };
}

// =============================================================================
// Intent Processing Helpers
// =============================================================================

interface EditIntentProcessResult {
  handled: boolean;
  result: IntentResult;
}

/**
 * Process an intent when in editing mode
 */
function processEditingIntent(
  intent: SpreadsheetIntent,
  editState: EditModeState,
  editActions: EditModeActions,
  selection: SelectionState,
  formatCellReference: (row: number, col: number) => string
): EditIntentProcessResult {
  const { mode } = editState;

  switch (intent.type) {
    // =========================================================================
    // Navigation intents
    // =========================================================================

    case 'NavigateCell': {
      if (mode === 'edit') {
        // In Edit mode, arrow keys move caret (handled by input element)
        // The CellEditorOverlay handles this - we don't consume it here
        // But if at text boundary, we might want to commit and navigate
        // For now, let the editor handle it
        return { handled: false, result: {} };
      }

      if (mode === 'enter') {
        // In Enter mode, arrow keys commit and navigate
        editActions.confirmEdit();
        // Return unhandled so IntentHandler processes the navigation
        return { handled: false, result: {} };
      }

      if (mode === 'point') {
        // In Point mode, arrow keys select cells for reference
        // Move the selection and insert the reference
        const activeCell = selection.activeCell;
        if (!activeCell) return { handled: true, result: {} };

        let newRow = activeCell.row;
        let newCol = activeCell.col;

        switch (intent.direction) {
          case 'up': newRow = Math.max(0, activeCell.row - 1); break;
          case 'down': newRow = activeCell.row + 1; break;
          case 'left': newCol = Math.max(0, activeCell.col - 1); break;
          case 'right': newCol = activeCell.col + 1; break;
        }

        // Insert the cell reference
        const ref = formatCellReference(newRow, newCol);
        editActions.insertCellReference(ref);

        // Update selection to show pointed cell
        return {
          handled: true,
          result: {
            selection: {
              activeCell: { row: newRow, col: newCol },
              ranges: [],
            },
            scrollTo: { row: newRow, col: newCol },
          },
        };
      }

      return { handled: false, result: {} };
    }

    case 'NavigatePage':
    case 'NavigateHomeEnd': {
      if (mode === 'enter' || mode === 'point') {
        // Commit and navigate
        editActions.confirmEdit();
        return { handled: false, result: {} };
      }
      // In Edit mode, don't consume - let input handle or fall through
      return { handled: false, result: {} };
    }

    case 'TabEnterNavigate': {
      // Tab/Enter always commits the edit
      editActions.confirmEdit();
      // Let IntentHandler handle the navigation
      return { handled: false, result: {} };
    }

    // =========================================================================
    // Edit control intents
    // =========================================================================

    case 'StartEdit': {
      // F2 while editing cycles mode
      editActions.cycleMode();
      return { handled: true, result: {} };
    }

    case 'ConfirmEdit': {
      editActions.confirmEdit();
      return { handled: true, result: { confirmEdit: true } };
    }

    case 'CancelEdit':
    case 'EscapePressed': {
      editActions.cancelEdit();
      return { handled: true, result: { cancelEdit: true } };
    }

    // =========================================================================
    // Selection intents during edit
    // =========================================================================

    case 'SelectAllCells': {
      // Ctrl+A during edit selects all text, not cells
      editActions.selectAll();
      return { handled: true, result: {} };
    }

    case 'DeleteContents': {
      // Delete during edit is handled by input element
      return { handled: false, result: {} };
    }

    // =========================================================================
    // Click intents during edit
    // =========================================================================

    case 'SetActiveCell': {
      if (mode === 'point') {
        // Click inserts reference
        const ref = formatCellReference(intent.row, intent.col);
        editActions.insertCellReference(ref);
        return { handled: true, result: {} };
      }
      // Other modes: commit and select new cell
      editActions.confirmEdit();
      return { handled: false, result: {} };
    }

    default:
      return { handled: false, result: {} };
  }
}

/**
 * Check if an intent should trigger edit mode
 */
function checkStartEditTrigger(
  intent: SpreadsheetIntent,
  selection: SelectionState,
  editActions: EditModeActions,
  getCellValue: (row: number, col: number) => string
): IntentResult | null {
  const activeCell = selection.activeCell;
  if (!activeCell) return null;

  switch (intent.type) {
    case 'StartEdit': {
      const startIntent = intent as StartEditIntent;

      // F2 or typing triggered edit
      const row = startIntent.row ?? activeCell.row;
      const col = startIntent.col ?? activeCell.col;
      const cellValue = getCellValue(row, col);

      if (startIntent.initialValue) {
        // User typed a character - start in Enter mode with that character
        editActions.startEditing(
          { row, col },
          cellValue,
          true, // replaceContent
          startIntent.initialValue // initialChar
        );
      } else {
        // F2 pressed - start in Edit mode with existing value
        editActions.startEditing(
          { row, col },
          cellValue,
          false // don't replaceContent
        );
      }

      return {
        // No selection change needed
        beginEdit: { row, col, initialValue: startIntent.initialValue },
      };
    }

    default:
      return null;
  }
}

// =============================================================================
// Exports
// =============================================================================

export default useEditModeIntegration;
