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

import {
  CellRef,
  EditMode,
  Direction,
  FormattedText,
  CharacterFormat,
  isFormattedText,
} from '../types/index.js';
import {
  ensureFormattedText,
  insertText as rtInsertText,
  deleteText as rtDeleteText,
  applyFormat as rtApplyFormat,
  getFormatAtPosition,
  formattedTextToString,
} from '../types/richtext.js';
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
  originalValue: string | number | boolean | FormattedText | null;
  /** Current editor value (supports rich text for character-level formatting) */
  currentValue: string | FormattedText;
  /** Cursor position in text */
  cursorPosition: number;
  /** Selection range in text (start, end) with optional format for toolbar state */
  textSelection: { start: number; end: number; format?: CharacterFormat } | null;
  /** Is the formula bar focused (vs in-cell editor) */
  formulaBarFocused: boolean;
  /** Pending character format to apply on next insert (for toolbar buttons) */
  pendingFormat?: Partial<CharacterFormat>;
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
  commitResult?: { cell: CellRef; value: string | FormattedText } | null;
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

  getCurrentValue(): string | FormattedText {
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
    initialValue: string | number | boolean | FormattedText | null,
    mode: EditMode = 'enter',
    replaceContent: boolean = false,
    initialChar?: string
  ): void {
    // Convert initial value to string or FormattedText
    let currentValue: string | FormattedText;
    let plainText: string;

    if (isFormattedText(initialValue)) {
      // Keep as FormattedText if it has character formatting
      currentValue = initialValue;
      plainText = initialValue.text;
    } else {
      // Convert to string
      plainText = initialValue === null ? '' : String(initialValue);
      currentValue = plainText;
    }

    if (replaceContent) {
      currentValue = initialChar ?? '';
      plainText = initialChar ?? '';
    }

    const textLength = typeof currentValue === 'string' ? currentValue.length : currentValue.text.length;

    this.state = {
      mode,
      isEditing: true,
      editingCell: { ...cell },
      originalValue: initialValue,
      currentValue: replaceContent ? (initialChar ?? '') : currentValue,
      cursorPosition: replaceContent ? (initialChar?.length ?? 0) : textLength,
      textSelection: replaceContent ? null : { start: 0, end: textLength },
      formulaBarFocused: false,
    };

    this.events.onEditStart?.(cell, plainText);
    this.events.onModeChange?.(mode, 'navigate');
  }

  /**
   * End editing (confirm or cancel)
   */
  endEditing(confirm: boolean): { value: string | FormattedText; cell: CellRef } | null {
    if (!this.state.isEditing || !this.state.editingCell) {
      return null;
    }

    let finalValue: string | FormattedText;

    if (confirm) {
      finalValue = this.state.currentValue;
    } else {
      // Cancelled: restore original value
      const original = this.state.originalValue;
      if (isFormattedText(original)) {
        finalValue = original;
      } else {
        finalValue = String(original ?? '');
      }
    }

    const result = {
      value: finalValue,
      cell: { ...this.state.editingCell },
    };

    const previousMode = this.state.mode;
    const plainText = isFormattedText(finalValue) ? finalValue.text : finalValue;
    this.events.onEditEnd?.(confirm, plainText);

    // Call onCommit if confirmed
    if (confirm) {
      this.events.onCommit?.(result.cell, plainText);
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
  confirmEditing(): { value: string | FormattedText; cell: CellRef } | null {
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
    const plainText = this.getPlainTextValue();
    const isFormula = plainText.startsWith('=');

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
  commit(value?: string | FormattedText): { cell: CellRef; value: string | FormattedText } | null {
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
   * Accepts string or FormattedText
   */
  setValue(value: string | FormattedText): void {
    this.state.currentValue = value;
    const plainText = isFormattedText(value) ? value.text : value;
    this.events.onValueChange?.(plainText);

    // Auto-switch to point mode if typing a formula
    if (plainText.startsWith('=') && this.state.mode === 'enter') {
      // Don't auto-switch, let user decide
    }
  }

  /**
   * Insert text at cursor position
   * Handles both plain string and FormattedText values
   */
  insertText(text: string): void {
    const { currentValue, cursorPosition, textSelection } = this.state;

    // If currentValue is FormattedText, use rich text operations
    if (isFormattedText(currentValue)) {
      let newFt: FormattedText;
      let newCursor: number;

      if (textSelection && textSelection.start !== textSelection.end) {
        // Replace selection: delete then insert
        newFt = rtDeleteText(currentValue, textSelection.start, textSelection.end);
        newFt = rtInsertText(newFt, textSelection.start, text);
        newCursor = textSelection.start + text.length;
      } else {
        // Insert at cursor
        newFt = rtInsertText(currentValue, cursorPosition, text);
        newCursor = cursorPosition + text.length;
      }

      this.state.currentValue = newFt;
      this.state.cursorPosition = newCursor;
      this.state.textSelection = null;

      this.events.onValueChange?.(formattedTextToString(newFt));
      this.events.onCursorChange?.(newCursor, null);
    } else {
      // Plain string
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
  }

  /**
   * Delete character(s) at cursor
   * Handles both plain string and FormattedText values
   */
  deleteText(direction: 'backward' | 'forward', count: number = 1): void {
    const { currentValue, cursorPosition, textSelection } = this.state;

    // If currentValue is FormattedText, use rich text operations
    if (isFormattedText(currentValue)) {
      let newFt: FormattedText;
      let newCursor: number;

      if (textSelection && textSelection.start !== textSelection.end) {
        // Delete selection
        newFt = rtDeleteText(currentValue, textSelection.start, textSelection.end);
        newCursor = textSelection.start;
      } else if (direction === 'backward') {
        // Backspace
        const deleteStart = Math.max(0, cursorPosition - count);
        newFt = rtDeleteText(currentValue, deleteStart, cursorPosition);
        newCursor = deleteStart;
      } else {
        // Delete
        newFt = rtDeleteText(currentValue, cursorPosition, cursorPosition + count);
        newCursor = cursorPosition;
      }

      this.state.currentValue = newFt;
      this.state.cursorPosition = newCursor;
      this.state.textSelection = null;

      this.events.onValueChange?.(formattedTextToString(newFt));
      this.events.onCursorChange?.(newCursor, null);
    } else {
      // Plain string
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
  }

  // ===========================================================================
  // Cursor Management
  // ===========================================================================

  /**
   * Get the text length of the current value
   * Works for both string and FormattedText
   */
  private getTextLength(): number {
    const { currentValue } = this.state;
    return typeof currentValue === 'string' ? currentValue.length : currentValue.text.length;
  }

  /**
   * Set cursor position
   */
  setCursorPosition(position: number): void {
    const clampedPosition = Math.max(0, Math.min(this.getTextLength(), position));
    this.state.cursorPosition = clampedPosition;
    this.state.textSelection = null;
    this.events.onCursorChange?.(clampedPosition, null);
  }

  /**
   * Set text selection
   */
  setTextSelection(start: number, end: number): void {
    const maxLen = this.getTextLength();
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
    this.setTextSelection(0, this.getTextLength());
  }

  /**
   * Move cursor by offset
   */
  moveCursor(offset: number, extendSelection: boolean = false): void {
    const newPosition = Math.max(
      0,
      Math.min(this.getTextLength(), this.state.cursorPosition + offset)
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
    const plainText = isFormattedText(currentValue) ? currentValue.text : currentValue;
    const textLength = plainText.length;

    let newPosition = cursorPosition;

    if (direction === 'left') {
      // Move left to previous word boundary
      newPosition = cursorPosition - 1;
      while (newPosition > 0 && /\s/.test(plainText[newPosition])) {
        newPosition--;
      }
      while (newPosition > 0 && !/\s/.test(plainText[newPosition - 1])) {
        newPosition--;
      }
    } else {
      // Move right to next word boundary
      newPosition = cursorPosition;
      while (newPosition < textLength && !/\s/.test(plainText[newPosition])) {
        newPosition++;
      }
      while (newPosition < textLength && /\s/.test(plainText[newPosition])) {
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
  // Character-Level Formatting (Rich Text Support)
  // ===========================================================================

  /**
   * Insert text with optional character format.
   * If pendingFormat is set, applies it to the inserted text.
   * For FormattedText values, preserves existing formatting.
   */
  insertTextWithFormat(text: string, format?: Partial<CharacterFormat>): void {
    const { currentValue, cursorPosition, textSelection, pendingFormat } = this.state;

    // Determine format to apply
    const formatToApply = format ?? pendingFormat;

    // If currentValue is FormattedText or has format to apply, use rich text operations
    if (isFormattedText(currentValue) || formatToApply) {
      const ft = isFormattedText(currentValue)
        ? currentValue
        : ensureFormattedText(currentValue);

      // Handle selection replacement or insertion
      let newFt: FormattedText;
      let newCursor: number;

      if (textSelection && textSelection.start !== textSelection.end) {
        // Replace selection: delete then insert
        newFt = rtDeleteText(ft, textSelection.start, textSelection.end);
        newFt = rtInsertText(newFt, textSelection.start, text);
        newCursor = textSelection.start + text.length;

        // Apply format if specified
        if (formatToApply) {
          newFt = rtApplyFormat(newFt, textSelection.start, newCursor, formatToApply);
        }
      } else {
        // Insert at cursor
        newFt = rtInsertText(ft, cursorPosition, text);
        newCursor = cursorPosition + text.length;

        // Apply format if specified
        if (formatToApply) {
          newFt = rtApplyFormat(newFt, cursorPosition, newCursor, formatToApply);
        }
      }

      this.state.currentValue = newFt;
      this.state.cursorPosition = newCursor;
      this.state.textSelection = null;

      this.events.onValueChange?.(formattedTextToString(newFt));
      this.events.onCursorChange?.(newCursor, null);
    } else {
      // Plain string: use existing insertText method
      this.insertText(text);
    }

    // Clear pending format after use
    this.state.pendingFormat = undefined;
  }

  /**
   * Apply character format to current text selection.
   * Converts plain string to FormattedText if needed.
   * Excel-compatible: Toggles format when no selection (e.g., Bold on/off).
   */
  applyCharacterFormat(format: Partial<CharacterFormat>): void {
    const { currentValue, textSelection, cursorPosition } = this.state;

    if (!textSelection || textSelection.start === textSelection.end) {
      // No selection: TOGGLE format in pending state (Excel behavior)
      const currentPending = this.state.pendingFormat ?? {};

      // Get current format at cursor for toggle logic
      let currentFormat: CharacterFormat | undefined;
      if (isFormattedText(currentValue) && cursorPosition > 0) {
        currentFormat = getFormatAtPosition(currentValue, cursorPosition - 1);
      }

      const newPending = { ...currentPending };

      // Toggle each format property
      for (const [key, value] of Object.entries(format) as Array<[keyof CharacterFormat, any]>) {
        const existingValue = currentPending[key] ?? currentFormat?.[key];

        if (existingValue === value) {
          // Same value -> toggle off (remove from pending)
          delete newPending[key];
        } else {
          // Different value -> toggle on (set in pending)
          newPending[key] = value;
        }
      }

      this.state.pendingFormat = Object.keys(newPending).length > 0 ? newPending : undefined;
      return;
    }

    // With selection: apply format to selection
    // Convert to FormattedText if needed
    const ft = isFormattedText(currentValue)
      ? currentValue
      : ensureFormattedText(currentValue);

    // Apply format to selection
    const newFt = rtApplyFormat(ft, textSelection.start, textSelection.end, format);

    this.state.currentValue = newFt;
    this.events.onValueChange?.(formattedTextToString(newFt));

    // Update selection format for toolbar state
    const selectionFormat = getFormatAtPosition(newFt, textSelection.start);
    this.state.textSelection = { ...textSelection, format: selectionFormat };
  }

  /**
   * Get character format at current cursor position or selection.
   * Returns the format for toolbar state synchronization.
   */
  getCurrentFormat(): CharacterFormat | undefined {
    const { currentValue, cursorPosition, textSelection } = this.state;

    if (!isFormattedText(currentValue)) {
      return undefined;
    }

    // Use selection start if there's a selection, otherwise cursor position
    const position = textSelection ? textSelection.start : cursorPosition;
    return getFormatAtPosition(currentValue, position);
  }

  /**
   * Get the plain text value (for display/commit).
   * Extracts text from FormattedText if needed.
   */
  getPlainTextValue(): string {
    const { currentValue } = this.state;
    if (isFormattedText(currentValue)) {
      return currentValue.text;
    }
    return currentValue;
  }

  /**
   * Check if current value has character-level formatting.
   */
  hasCharacterFormatting(): boolean {
    return isFormattedText(this.state.currentValue);
  }

  /**
   * Check if a specific format is currently active (pending or at cursor).
   * Used by UI to show format buttons as pressed/unpressed.
   * Excel-compatible behavior.
   */
  isFormatActive(formatKey: keyof CharacterFormat, value: any): boolean {
    const { currentValue, cursorPosition, textSelection, pendingFormat } = this.state;

    // Check pending format first (highest priority)
    if (pendingFormat && formatKey in pendingFormat) {
      return pendingFormat[formatKey] === value;
    }

    // If there's a selection, check format at selection start
    if (textSelection && textSelection.start !== textSelection.end) {
      if (isFormattedText(currentValue)) {
        const format = getFormatAtPosition(currentValue, textSelection.start);
        return format?.[formatKey] === value;
      }
      return false;
    }

    // No selection: check format at cursor
    if (isFormattedText(currentValue) && cursorPosition > 0) {
      const format = getFormatAtPosition(currentValue, cursorPosition - 1);
      return format?.[formatKey] === value;
    }

    return false;
  }

  /**
   * Get all active formats at current cursor/selection.
   * Returns merged format from pending + cursor position.
   * Used by UI for toolbar state synchronization.
   */
  getActiveFormat(): CharacterFormat | undefined {
    const { currentValue, cursorPosition, textSelection, pendingFormat } = this.state;

    let baseFormat: CharacterFormat | undefined;

    // Get format at cursor/selection
    if (textSelection && textSelection.start !== textSelection.end) {
      if (isFormattedText(currentValue)) {
        baseFormat = getFormatAtPosition(currentValue, textSelection.start);
      }
    } else if (isFormattedText(currentValue) && cursorPosition > 0) {
      baseFormat = getFormatAtPosition(currentValue, cursorPosition - 1);
    }

    // Merge with pending format (pending overrides base)
    if (pendingFormat) {
      return { ...baseFormat, ...pendingFormat };
    }

    return baseFormat;
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
    const plainText = this.getPlainTextValue();
    return plainText.startsWith('=');
  }

  /**
   * Get the formula expression (without leading =)
   */
  getFormulaExpression(): string | null {
    if (!this.isFormula()) return null;
    const plainText = this.getPlainTextValue();
    return plainText.slice(1);
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

    const plainText = this.getPlainTextValue();
    const pos = this.state.cursorPosition;

    if (pos === 0) return false;

    // Check character before cursor
    const charBefore = plainText[pos - 1];
    if (charBefore === undefined) return false;

    // Operators and opening parentheses expect references
    return REF_TRIGGER_CHARS.has(charBefore);
  }
}
