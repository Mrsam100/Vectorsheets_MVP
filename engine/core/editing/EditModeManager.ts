/**
 * VectorSheet Engine - Edit Mode Manager (Production Grade)
 *
 * Pure state machine managing Excel-style editing modes.
 * No DOM dependencies, no UI assumptions, deterministic transitions.
 *
 * Modes:
 * - Navigate: Default grid navigation. Arrow keys move between cells.
 * - Edit: In-cell editing. Arrow keys move cursor within text. F2 to enter.
 * - Enter: Overwrite mode. Arrow keys confirm edit and move. Typing triggers.
 * - Point: Formula reference capture. Arrow keys select cell references.
 *
 * Mode Transitions (Excel-exact):
 * - Navigate → Edit: Press F2 on a cell
 * - Navigate → Enter: Start typing (any printable character)
 * - Edit → Point: Type '=' or operator (+,-,*,/,(,etc.) in formula
 * - Edit → Enter: Press F2 again
 * - Enter → Edit: Press F2
 * - Point → Enter: Press F2 or complete reference
 * - Any → Navigate: Press Escape or confirm with Enter
 *
 * F2 Cycling (while editing):
 * Edit → Point (if formula) → Enter → Edit → ...
 *
 * Integration Points:
 * - SelectionManager: Active cell tracking, point mode references
 * - SpreadsheetEngine: Commit values, cell data access
 */

import { CellRef, EditMode, Direction } from '../types/index.js';
import type {
  SpreadsheetIntent,
  NavigateIntent,
  EditIntent,
  TabEnterIntent,
  DeleteIntent,
  ClipboardIntent,
} from '../navigation/KeyboardHandler.js';

export interface EditState {
  /** Current edit mode */
  mode: EditMode;
  /** Is currently editing a cell */
  isEditing: boolean;
  /** The cell being edited */
  editingCell: CellRef | null;
  /** Original value before editing (for Escape to cancel) */
  originalValue: string | number | boolean | null;
  /** Current editor value */
  currentValue: string;
  /** Cursor position in text */
  cursorPosition: number;
  /** Selection range in text (start, end) */
  textSelection: { start: number; end: number } | null;
  /** Is the formula bar focused (vs in-cell editor) */
  formulaBarFocused: boolean;
}

export interface EditModeManagerEvents {
  /** Called when edit mode changes */
  onModeChange?: (mode: EditMode, previousMode: EditMode) => void;
  /** Called when editing starts */
  onEditStart?: (cell: CellRef, value: string) => void;
  /** Called when editing ends */
  onEditEnd?: (confirmed: boolean, value: string) => void;
  /** Called when value should be committed */
  onCommit?: (cell: CellRef, value: string) => void;
  /** Called when editor value changes */
  onValueChange?: (value: string) => void;
  /** Called when cursor position changes */
  onCursorChange?: (position: number, selection: { start: number; end: number } | null) => void;
  /** Called when a cell reference should be inserted (Point mode) */
  onInsertReference?: (ref: string) => void;
  /** Called when navigation should occur (in Enter/Point mode) */
  onNavigate?: (direction: Direction, extend: boolean) => void;
  /** Called when point mode selection changes */
  onPointSelection?: (startCell: CellRef, endCell?: CellRef) => void;
}

/**
 * Result of handling a key/intent.
 * Indicates whether the intent was consumed and any side effects.
 */
export interface HandleKeyResult {
  /** Whether the intent was handled (consumed) */
  handled: boolean;
  /** If editing ended, the result */
  commitResult?: { cell: CellRef; value: string } | null;
  /** Whether navigation should occur */
  shouldNavigate?: boolean;
  /** Direction for navigation (if shouldNavigate) */
  navigateDirection?: Direction;
  /** Whether to extend selection (for shift+navigation) */
  extendSelection?: boolean;
}

/**
 * Characters that indicate a cell reference is expected next (module-level constant)
 */
const REF_TRIGGER_CHARS = new Set(['=', '+', '-', '*', '/', '^', '(', ',', ':', '<', '>', '&', ';']);

export class EditModeManager {
  private state: EditState;
  private events: EditModeManagerEvents = {};

  constructor() {
    this.state = this.createInitialState();
  }

  private createInitialState(): EditState {
    return {
      mode: 'navigate' as EditMode,
      isEditing: false,
      editingCell: null,
      originalValue: null,
      currentValue: '',
      cursorPosition: 0,
      textSelection: null,
      formulaBarFocused: false,
    };
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  /**
   * Set event handlers. Merges with existing handlers.
   * Pass clearEventHandlers() first to replace all handlers.
   */
  setEventHandlers(events: EditModeManagerEvents): void {
    this.events = { ...this.events, ...events };
  }

  /**
   * Clear all event handlers
   */
  clearEventHandlers(): void {
    this.events = {};
  }

  // ===========================================================================
  // State Getters
  // ===========================================================================

  getState(): Readonly<EditState> {
    return { ...this.state };
  }

  getMode(): EditMode {
    return this.state.mode;
  }

  isEditing(): boolean {
    return this.state.isEditing;
  }

  getEditingCell(): CellRef | null {
    return this.state.editingCell ? { ...this.state.editingCell } : null;
  }

  getCurrentValue(): string {
    return this.state.currentValue;
  }

  getCursorPosition(): number {
    return this.state.cursorPosition;
  }

  // ===========================================================================
  // Edit Lifecycle
  // ===========================================================================

  /**
   * Start editing a cell
   * @param cell The cell to edit
   * @param initialValue The cell's current value
   * @param mode Initial edit mode ('edit' for F2, 'enter' for typing)
   * @param replaceContent If true, start with empty content (user typed a character)
   * @param initialChar If replaceContent, the character the user typed
   */
  startEditing(
    cell: CellRef,
    initialValue: string | number | boolean | null,
    mode: EditMode = 'enter',
    replaceContent: boolean = false,
    initialChar?: string
  ): void {
    const valueStr = initialValue === null ? '' : String(initialValue);

    this.state = {
      mode,
      isEditing: true,
      editingCell: { ...cell },
      originalValue: initialValue,
      currentValue: replaceContent ? (initialChar ?? '') : valueStr,
      cursorPosition: replaceContent ? (initialChar?.length ?? 0) : valueStr.length,
      textSelection: replaceContent ? null : { start: 0, end: valueStr.length },
      formulaBarFocused: false,
    };

    this.events.onEditStart?.(cell, this.state.currentValue);
    this.events.onModeChange?.(mode, 'navigate');
  }

  /**
   * End editing (confirm or cancel)
   */
  endEditing(confirm: boolean): { value: string; cell: CellRef } | null {
    if (!this.state.isEditing || !this.state.editingCell) {
      return null;
    }

    const result = {
      value: confirm ? this.state.currentValue : String(this.state.originalValue ?? ''),
      cell: { ...this.state.editingCell },
    };

    const previousMode = this.state.mode;
    this.events.onEditEnd?.(confirm, result.value);

    // Call onCommit if confirmed
    if (confirm) {
      this.events.onCommit?.(result.cell, result.value);
    }

    // Reset state
    this.state = this.createInitialState();
    this.events.onModeChange?.('navigate', previousMode);

    return confirm ? result : null;
  }

  /**
   * Cancel editing (equivalent to Escape)
   */
  cancelEditing(): void {
    this.endEditing(false);
  }

  /**
   * Confirm editing (equivalent to Enter without moving)
   */
  confirmEditing(): { value: string; cell: CellRef } | null {
    return this.endEditing(true);
  }

  // ===========================================================================
  // Mode Cycling (F2)
  // ===========================================================================

  /**
   * Cycle through edit modes (F2 behavior)
   * Excel-exact: Edit → Point (if formula) → Enter → Edit → ...
   * If not editing, F2 starts editing in 'edit' mode
   */
  cycleMode(): EditMode {
    if (!this.state.isEditing) {
      // Can't cycle if not editing - this should trigger startEditing instead
      return this.state.mode;
    }

    const previousMode = this.state.mode;
    const isFormula = this.state.currentValue.startsWith('=');

    // Cycle based on current mode (Excel-exact)
    switch (this.state.mode) {
      case 'edit':
        // Edit -> Point (if formula) or Enter (if not formula)
        this.state.mode = isFormula ? 'point' : 'enter';
        break;
      case 'point':
        // Point -> Enter
        this.state.mode = 'enter';
        break;
      case 'enter':
        // Enter -> Edit
        this.state.mode = 'edit';
        break;
      default:
        this.state.mode = 'edit';
    }

    this.events.onModeChange?.(this.state.mode, previousMode);
    return this.state.mode;
  }

  /**
   * Set mode directly (internal use or explicit transitions)
   */
  setMode(mode: EditMode): void {
    if (this.state.mode !== mode) {
      const previousMode = this.state.mode;
      this.state.mode = mode;
      this.events.onModeChange?.(mode, previousMode);
    }
  }

  // ===========================================================================
  // Explicit Mode Transitions (API Methods)
  // ===========================================================================

  /**
   * Enter Navigate mode.
   * Cancels any active editing and returns to grid navigation.
   */
  enterNavigate(): void {
    if (this.state.isEditing) {
      this.cancelEditing();
    } else if (this.state.mode !== 'navigate') {
      this.setMode('navigate');
    }
  }

  /**
   * Enter Edit mode (F2 behavior).
   * If not editing, starts editing the active cell with cursor at end.
   * If already editing, switches to Edit mode (cursor navigation).
   */
  enterEdit(cell?: CellRef, initialValue?: string | number | boolean | null): void {
    if (!this.state.isEditing) {
      if (cell !== undefined) {
        this.startEditing(cell, initialValue ?? null, 'edit', false);
      }
      // If no cell provided and not editing, this is a no-op
      // The caller should provide the active cell
    } else {
      // Already editing, switch to edit mode
      this.setMode('edit');
    }
  }

  /**
   * Enter Point mode (formula reference selection).
   * Only valid when editing a formula. Arrow keys will select cells.
   */
  enterPoint(): void {
    if (!this.state.isEditing) {
      return; // Can only point when editing
    }

    // Point mode makes most sense for formulas, but allow it regardless
    this.setMode('point');
  }

  /**
   * Commit the current edit value.
   * @param value Optional value to commit (uses current value if not provided)
   * @returns The committed result, or null if not editing
   */
  commit(value?: string): { cell: CellRef; value: string } | null {
    if (!this.state.isEditing || !this.state.editingCell) {
      return null;
    }

    // Update value if provided
    if (value !== undefined) {
      this.state.currentValue = value;
    }

    return this.endEditing(true);
  }

  /**
   * Cancel the current edit (alias for cancelEditing).
   */
  cancel(): void {
    this.cancelEditing();
  }

  // ===========================================================================
  // Value Updates
  // ===========================================================================

  /**
   * Update the current editor value
   */
  setValue(value: string): void {
    this.state.currentValue = value;
    this.events.onValueChange?.(value);

    // Auto-switch to point mode if typing a formula
    if (value.startsWith('=') && this.state.mode === 'enter') {
      // Don't auto-switch, let user decide
    }
  }

  /**
   * Insert text at cursor position
   */
  insertText(text: string): void {
    const { currentValue, cursorPosition, textSelection } = this.state;

    let newValue: string;
    let newCursor: number;

    if (textSelection && textSelection.start !== textSelection.end) {
      // Replace selection
      newValue =
        currentValue.slice(0, textSelection.start) +
        text +
        currentValue.slice(textSelection.end);
      newCursor = textSelection.start + text.length;
    } else {
      // Insert at cursor
      newValue =
        currentValue.slice(0, cursorPosition) +
        text +
        currentValue.slice(cursorPosition);
      newCursor = cursorPosition + text.length;
    }

    this.state.currentValue = newValue;
    this.state.cursorPosition = newCursor;
    this.state.textSelection = null;

    this.events.onValueChange?.(newValue);
    this.events.onCursorChange?.(newCursor, null);
  }

  /**
   * Delete character(s) at cursor
   */
  deleteText(direction: 'backward' | 'forward', count: number = 1): void {
    const { currentValue, cursorPosition, textSelection } = this.state;

    let newValue: string;
    let newCursor: number;

    if (textSelection && textSelection.start !== textSelection.end) {
      // Delete selection
      newValue =
        currentValue.slice(0, textSelection.start) +
        currentValue.slice(textSelection.end);
      newCursor = textSelection.start;
    } else if (direction === 'backward') {
      // Backspace
      const deleteStart = Math.max(0, cursorPosition - count);
      newValue =
        currentValue.slice(0, deleteStart) +
        currentValue.slice(cursorPosition);
      newCursor = deleteStart;
    } else {
      // Delete
      newValue =
        currentValue.slice(0, cursorPosition) +
        currentValue.slice(cursorPosition + count);
      newCursor = cursorPosition;
    }

    this.state.currentValue = newValue;
    this.state.cursorPosition = newCursor;
    this.state.textSelection = null;

    this.events.onValueChange?.(newValue);
    this.events.onCursorChange?.(newCursor, null);
  }

  // ===========================================================================
  // Cursor Management
  // ===========================================================================

  /**
   * Set cursor position
   */
  setCursorPosition(position: number): void {
    const clampedPosition = Math.max(0, Math.min(this.state.currentValue.length, position));
    this.state.cursorPosition = clampedPosition;
    this.state.textSelection = null;
    this.events.onCursorChange?.(clampedPosition, null);
  }

  /**
   * Set text selection
   */
  setTextSelection(start: number, end: number): void {
    const maxLen = this.state.currentValue.length;
    const selection = {
      start: Math.max(0, Math.min(maxLen, start)),
      end: Math.max(0, Math.min(maxLen, end)),
    };
    this.state.textSelection = selection;
    this.state.cursorPosition = selection.end;
    this.events.onCursorChange?.(selection.end, selection);
  }

  /**
   * Select all text
   */
  selectAll(): void {
    this.setTextSelection(0, this.state.currentValue.length);
  }

  /**
   * Move cursor by offset
   */
  moveCursor(offset: number, extendSelection: boolean = false): void {
    const newPosition = Math.max(
      0,
      Math.min(this.state.currentValue.length, this.state.cursorPosition + offset)
    );

    if (extendSelection) {
      const currentStart = this.state.textSelection?.start ?? this.state.cursorPosition;
      this.setTextSelection(currentStart, newPosition);
    } else {
      this.setCursorPosition(newPosition);
    }
  }

  /**
   * Move cursor to word boundary
   */
  moveCursorByWord(direction: 'left' | 'right', extendSelection: boolean = false): void {
    const { currentValue, cursorPosition } = this.state;

    let newPosition = cursorPosition;

    if (direction === 'left') {
      // Move left to previous word boundary
      newPosition = cursorPosition - 1;
      while (newPosition > 0 && /\s/.test(currentValue[newPosition])) {
        newPosition--;
      }
      while (newPosition > 0 && !/\s/.test(currentValue[newPosition - 1])) {
        newPosition--;
      }
    } else {
      // Move right to next word boundary
      newPosition = cursorPosition;
      while (newPosition < currentValue.length && !/\s/.test(currentValue[newPosition])) {
        newPosition++;
      }
      while (newPosition < currentValue.length && /\s/.test(currentValue[newPosition])) {
        newPosition++;
      }
    }

    if (extendSelection) {
      const currentStart = this.state.textSelection?.start ?? cursorPosition;
      this.setTextSelection(currentStart, newPosition);
    } else {
      this.setCursorPosition(newPosition);
    }
  }

  // ===========================================================================
  // Point Mode (Formula Reference Selection)
  // ===========================================================================

  /**
   * Insert a cell reference at cursor (when in Point mode)
   */
  insertCellReference(ref: string): void {
    if (this.state.mode !== 'point') {
      return;
    }

    this.insertText(ref);
    this.events.onInsertReference?.(ref);
  }

  /**
   * Insert a range reference at cursor (when in Point mode)
   */
  insertRangeReference(startRef: string, endRef: string): void {
    if (this.state.mode !== 'point') {
      return;
    }

    const rangeRef = `${startRef}:${endRef}`;
    this.insertText(rangeRef);
    this.events.onInsertReference?.(rangeRef);
  }

  // ===========================================================================
  // Formula Bar Integration
  // ===========================================================================

  /**
   * Set whether the formula bar is focused
   */
  setFormulaBarFocused(focused: boolean): void {
    this.state.formulaBarFocused = focused;
  }

  /**
   * Check if formula bar is focused
   */
  isFormulaBarFocused(): boolean {
    return this.state.formulaBarFocused;
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Check if current value is a formula
   */
  isFormula(): boolean {
    return this.state.currentValue.startsWith('=');
  }

  /**
   * Get the formula expression (without leading =)
   */
  getFormulaExpression(): string | null {
    if (!this.isFormula()) return null;
    return this.state.currentValue.slice(1);
  }

  // ===========================================================================
  // Intent Handling (SpreadsheetIntent Processing)
  // ===========================================================================

  /**
   * Handle a SpreadsheetIntent based on current edit mode.
   * This is the main entry point for processing keyboard intents.
   *
   * Mode-specific behavior:
   * - Navigate: Pass through navigation intents, handle F2/typing to start edit
   * - Edit: Arrow keys move cursor, most keys pass through to text editor
   * - Enter: Arrow keys confirm and navigate, typing goes to text
   * - Point: Arrow keys select cells for formula references
   *
   * @param intent The intent to handle
   * @returns Result indicating whether intent was handled and any side effects
   */
  handleKey(intent: SpreadsheetIntent): HandleKeyResult {
    const result: HandleKeyResult = { handled: false };

    switch (intent.type) {
      case 'navigate':
        return this.handleNavigateIntent(intent as NavigateIntent);

      case 'tabEnter':
        return this.handleTabEnterIntent(intent as TabEnterIntent);

      case 'edit':
        return this.handleEditIntent(intent as EditIntent);

      case 'escape':
        return this.handleEscapeIntent();

      case 'delete':
        return this.handleDeleteIntent(intent as DeleteIntent);

      case 'clipboard':
        return this.handleClipboardIntent(intent as ClipboardIntent);

      default:
        // Unknown or unhandled intent type
        return result;
    }
  }

  /**
   * Handle navigation intents (arrow keys).
   * Behavior depends on current mode.
   */
  private handleNavigateIntent(intent: NavigateIntent): HandleKeyResult {
    const { direction, jump, extend } = intent;
    const result: HandleKeyResult = { handled: false };

    switch (this.state.mode) {
      case 'navigate':
        // Not editing - let navigation pass through
        return result;

      case 'edit':
        // In edit mode, arrow keys move cursor within text
        if (direction === 'left' || direction === 'right') {
          if (jump) {
            // Ctrl+Arrow: move by word
            this.moveCursorByWord(direction, extend);
          } else {
            // Regular arrow: move by character
            this.moveCursor(direction === 'left' ? -1 : 1, extend);
          }
          result.handled = true;
        } else {
          // Up/Down in edit mode - could exit editing or stay (Excel stays)
          // For now, let it pass through (caller decides)
          result.handled = false;
        }
        break;

      case 'enter':
        // In enter mode, arrow keys confirm and navigate
        result.commitResult = this.endEditing(true);
        result.shouldNavigate = true;
        result.navigateDirection = direction;
        result.extendSelection = extend;
        result.handled = true;
        break;

      case 'point':
        // In point mode, arrow keys select cell references
        // Emit navigation event for caller to handle reference insertion
        this.events.onNavigate?.(direction, extend);
        result.handled = true;
        break;
    }

    return result;
  }

  /**
   * Handle Tab/Enter intents.
   * These typically confirm editing and navigate.
   */
  private handleTabEnterIntent(intent: TabEnterIntent): HandleKeyResult {
    const { key, reverse } = intent;
    const result: HandleKeyResult = { handled: false };

    if (!this.state.isEditing) {
      // Not editing - pass through for navigation
      return result;
    }

    // Confirm editing
    result.commitResult = this.endEditing(true);
    result.shouldNavigate = true;
    result.handled = true;

    // Set navigation direction based on key and shift
    if (key === 'enter') {
      result.navigateDirection = reverse ? 'up' : 'down';
    } else {
      // Tab
      result.navigateDirection = reverse ? 'left' : 'right';
    }

    return result;
  }

  /**
   * Handle edit intents (F2, start typing).
   */
  private handleEditIntent(intent: EditIntent): HandleKeyResult {
    const { action, initialValue, row, col } = intent;
    const result: HandleKeyResult = { handled: false };

    switch (action) {
      case 'start':
        if (!this.state.isEditing) {
          // Start editing if cell info provided
          if (row !== undefined && col !== undefined) {
            this.startEditing(
              { row, col },
              initialValue ?? null,
              'edit',
              false
            );
            result.handled = true;
          }
        } else {
          // Already editing - F2 cycles mode
          this.cycleMode();
          result.handled = true;
        }
        break;

      case 'confirm':
        if (this.state.isEditing) {
          result.commitResult = this.endEditing(true);
          result.handled = true;
        }
        break;

      case 'cancel':
        if (this.state.isEditing) {
          this.cancelEditing();
          result.handled = true;
        }
        break;
    }

    return result;
  }

  /**
   * Handle Escape intent.
   * Cancels editing or clears selection.
   */
  private handleEscapeIntent(): HandleKeyResult {
    const result: HandleKeyResult = { handled: false };

    if (this.state.isEditing) {
      this.cancelEditing();
      result.handled = true;
    }
    // If not editing, Escape may clear selection (caller handles)

    return result;
  }

  /**
   * Handle Delete/Backspace intents.
   */
  private handleDeleteIntent(intent: DeleteIntent): HandleKeyResult {
    const result: HandleKeyResult = { handled: false };

    if (!this.state.isEditing) {
      // Not editing - Delete clears cell contents (caller handles)
      return result;
    }

    // In editing mode, delete text
    if (intent.action === 'contents') {
      // Backspace: delete backward
      this.deleteText('backward', 1);
      result.handled = true;
    }

    return result;
  }

  /**
   * Handle clipboard intents (copy/cut/paste).
   */
  private handleClipboardIntent(_intent: ClipboardIntent): HandleKeyResult {
    const result: HandleKeyResult = { handled: false };

    if (!this.state.isEditing) {
      // Not editing - clipboard operations on cells (caller handles)
      return result;
    }

    // In editing mode, clipboard operates on text
    // These would be handled by the actual text input element
    // We just indicate we're in edit mode

    return result;
  }

  /**
   * Check if a character should trigger entering edit mode.
   * Printable characters (letters, numbers, punctuation) start editing.
   */
  shouldStartEditing(key: string): boolean {
    // Single printable character
    if (key.length === 1) {
      const code = key.charCodeAt(0);
      // Printable ASCII range: 32 (space) to 126 (~)
      return code >= 32 && code <= 126;
    }
    return false;
  }

  /**
   * Check if we're at a position that expects a cell reference.
   * Used to determine if we should auto-switch to point mode.
   */
  expectsCellReference(): boolean {
    if (!this.isFormula()) return false;

    const value = this.state.currentValue;
    const pos = this.state.cursorPosition;

    if (pos === 0) return false;

    // Check character before cursor
    const charBefore = value[pos - 1];
    if (charBefore === undefined) return false;

    // Operators and opening parentheses expect references
    return REF_TRIGGER_CHARS.has(charBefore);
  }
}
