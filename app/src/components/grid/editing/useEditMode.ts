/**
 * useEditMode - React hook for subscribing to EditModeManager state
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                      EDIT STATE SUBSCRIPTION                            │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │                                                                         │
 * │   EditModeManager (Engine)                                              │
 * │       │                                                                 │
 * │       │ setEventHandlers(...)                                           │
 * │       ▼                                                                 │
 * │   ┌───────────────────┐                                                 │
 * │   │  useEditMode Hook │  ← Bridges engine state to React               │
 * │   └─────────┬─────────┘                                                 │
 * │             │                                                           │
 * │             │ state updates                                             │
 * │             ▼                                                           │
 * │   ┌───────────────────┐     ┌───────────────────┐                      │
 * │   │ CellEditorOverlay │     │    FormulaBar     │                      │
 * │   │                   │     │                   │                      │
 * │   │ - Position over   │     │ - Always visible  │                      │
 * │   │   active cell     │     │ - Full formula    │                      │
 * │   │ - Captures keys   │     │ - Function hints  │                      │
 * │   └───────────────────┘     └───────────────────┘                      │
 * │                                                                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * The hook provides:
 * - Current edit state (mode, value, cursor, selection)
 * - Actions to modify edit state
 * - Cell position info for overlay positioning
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { EditModeManager } from '../../../../../engine/core/editing/EditModeManager';
import type { EditState } from '../../../../../engine/core/editing/EditModeManager';
import { isFormattedText } from '../../../../../engine/core/types/index';
import type { CellRef, EditMode } from '../../../../../engine/core/types/index';

// =============================================================================
// Types
// =============================================================================

export interface EditModeState {
  /** Current edit mode */
  mode: EditMode;
  /** Is currently editing */
  isEditing: boolean;
  /** Cell being edited */
  editingCell: CellRef | null;
  /** Current buffer value */
  value: string;
  /** Cursor position in text */
  cursorPosition: number;
  /** Text selection range */
  textSelection: { start: number; end: number } | null;
  /** Is this a formula */
  isFormula: boolean;
  /** Is formula bar focused */
  formulaBarFocused: boolean;
}

export interface EditModeActions {
  /** Start editing a cell */
  startEditing: (cell: CellRef, initialValue: string, replaceContent?: boolean, initialChar?: string) => void;
  /** Confirm and end editing */
  confirmEdit: () => { value: string; cell: CellRef } | null;
  /** Cancel and end editing */
  cancelEdit: () => void;
  /** Update the current value */
  setValue: (value: string) => void;
  /** Insert text at cursor */
  insertText: (text: string) => void;
  /** Delete text */
  deleteText: (direction: 'backward' | 'forward', count?: number) => void;
  /** Set cursor position */
  setCursorPosition: (position: number) => void;
  /** Set text selection */
  setTextSelection: (start: number, end: number) => void;
  /** Select all text */
  selectAll: () => void;
  /** Move cursor */
  moveCursor: (offset: number, extendSelection?: boolean) => void;
  /** Move cursor by word */
  moveCursorByWord: (direction: 'left' | 'right', extendSelection?: boolean) => void;
  /** Cycle edit mode (F2) */
  cycleMode: () => void;
  /** Set formula bar focus */
  setFormulaBarFocused: (focused: boolean) => void;
  /** Insert cell reference (point mode) */
  insertCellReference: (ref: string) => void;
  /** Set mode directly */
  setMode: (mode: EditMode) => void;
}

export interface UseEditModeOptions {
  /** EditModeManager instance (optional - creates singleton if not provided) */
  manager?: EditModeManager;
  /** Callback when edit starts */
  onEditStart?: (cell: CellRef, value: string) => void;
  /** Callback when edit ends */
  onEditEnd?: (confirmed: boolean, value: string, cell: CellRef | null) => void;
  /** Callback when value should be committed */
  onCommit?: (cell: CellRef, value: string) => void;
  /** Callback when value changes */
  onValueChange?: (value: string) => void;
  /** Callback when mode changes */
  onModeChange?: (mode: EditMode, previousMode: EditMode) => void;
}

export interface UseEditModeReturn {
  state: EditModeState;
  actions: EditModeActions;
  manager: EditModeManager;
}

// =============================================================================
// Singleton Manager
// =============================================================================

let singletonManager: EditModeManager | null = null;

function getOrCreateManager(): EditModeManager {
  if (!singletonManager) {
    singletonManager = new EditModeManager();
  }
  return singletonManager;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * React hook for editing state management
 *
 * Usage:
 * ```tsx
 * const { state, actions, manager } = useEditMode({
 *   onCommit: (cell, value) => engine.setCell(cell.row, cell.col, value),
 * });
 *
 * // Start editing on double-click
 * const handleDoubleClick = (row, col) => {
 *   actions.startEditing({ row, col }, getCellValue(row, col));
 * };
 *
 * // Render editor overlay
 * if (state.isEditing) {
 *   return <CellEditorOverlay state={state} actions={actions} />;
 * }
 * ```
 */
export function useEditMode(options: UseEditModeOptions = {}): UseEditModeReturn {
  const {
    manager: providedManager,
    onEditStart,
    onEditEnd,
    onCommit,
    onValueChange,
    onModeChange,
  } = options;

  // Use provided manager or singleton
  const manager = useMemo(
    () => providedManager ?? getOrCreateManager(),
    [providedManager]
  );

  // State derived from manager
  const [state, setState] = useState<EditModeState>(() => createStateFromManager(manager));

  // Refs for callbacks to avoid stale closures
  const onEditStartRef = useRef(onEditStart);
  const onEditEndRef = useRef(onEditEnd);
  const onCommitRef = useRef(onCommit);
  const onValueChangeRef = useRef(onValueChange);
  const onModeChangeRef = useRef(onModeChange);

  // Keep refs updated
  onEditStartRef.current = onEditStart;
  onEditEndRef.current = onEditEnd;
  onCommitRef.current = onCommit;
  onValueChangeRef.current = onValueChange;
  onModeChangeRef.current = onModeChange;

  // Subscribe to manager events
  useEffect(() => {
    // Set up event handlers that update React state
    manager.setEventHandlers({
      onModeChange: (mode, previousMode) => {
        setState(createStateFromManager(manager));
        onModeChangeRef.current?.(mode, previousMode);
      },
      onEditStart: (cell, value) => {
        setState(createStateFromManager(manager));
        onEditStartRef.current?.(cell, value);
      },
      onEditEnd: (confirmed, value) => {
        const editingCell = manager.getEditingCell();
        setState(createStateFromManager(manager));
        onEditEndRef.current?.(confirmed, value, editingCell);
      },
      onCommit: (cell, value) => {
        onCommitRef.current?.(cell, value);
      },
      onValueChange: (value) => {
        setState(createStateFromManager(manager));
        onValueChangeRef.current?.(value);
      },
      onCursorChange: () => {
        setState(createStateFromManager(manager));
      },
    });

    // Initial state sync
    setState(createStateFromManager(manager));

    return () => {
      // Clear event handlers on cleanup
      manager.clearEventHandlers();
    };
  }, [manager]);

  // Actions (memoized to avoid recreating)
  const actions = useMemo<EditModeActions>(() => ({
    startEditing: (cell, initialValue, replaceContent = false, initialChar) => {
      manager.startEditing(cell, initialValue, replaceContent ? 'enter' : 'edit', replaceContent, initialChar);
    },
    confirmEdit: () => {
      const result = manager.confirmEditing();
      if (!result) return null;

      // Extract plain text from FormattedText for UI layer
      const plainValue = isFormattedText(result.value)
        ? result.value.text
        : result.value;

      return { value: plainValue, cell: result.cell };
    },
    cancelEdit: () => manager.cancelEditing(),
    setValue: (value) => manager.setValue(value),
    insertText: (text) => manager.insertText(text),
    deleteText: (direction, count) => manager.deleteText(direction, count),
    setCursorPosition: (position) => manager.setCursorPosition(position),
    setTextSelection: (start, end) => manager.setTextSelection(start, end),
    selectAll: () => manager.selectAll(),
    moveCursor: (offset, extend) => manager.moveCursor(offset, extend),
    moveCursorByWord: (direction, extend) => manager.moveCursorByWord(direction, extend),
    cycleMode: () => manager.cycleMode(),
    setFormulaBarFocused: (focused) => manager.setFormulaBarFocused(focused),
    insertCellReference: (ref) => manager.insertCellReference(ref),
    setMode: (mode) => manager.setMode(mode),
  }), [manager]);

  return { state, actions, manager };
}

// =============================================================================
// Helper Functions
// =============================================================================

function createStateFromManager(manager: EditModeManager): EditModeState {
  const engineState = manager.getState();

  // Extract plain text from FormattedText for UI layer
  const plainValue = isFormattedText(engineState.currentValue)
    ? engineState.currentValue.text
    : engineState.currentValue;

  return {
    mode: engineState.mode,
    isEditing: engineState.isEditing,
    editingCell: engineState.editingCell,
    value: plainValue,
    cursorPosition: engineState.cursorPosition,
    textSelection: engineState.textSelection,
    isFormula: plainValue.startsWith('='),
    formulaBarFocused: engineState.formulaBarFocused,
  };
}

// =============================================================================
// Exports
// =============================================================================

export { EditModeManager };
export type { EditState, EditMode, CellRef };
