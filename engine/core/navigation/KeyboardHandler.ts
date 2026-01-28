/**
 * VectorSheet Engine - Keyboard Handler
 *
 * Central keyboard event handler that routes to appropriate actions.
 * Implements Excel-compatible keyboard shortcuts.
 */

import { Direction, EditMode } from '../types/index.js';
import { NavigationManager } from './NavigationManager.js';
import { SelectionManager } from '../selection/SelectionManager.js';

export interface KeyboardEvent {
  key: string;
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  preventDefault: () => void;
  stopPropagation: () => void;
}

export interface KeyboardHandlerCallbacks {
  /** Called when cell editing should start */
  onStartEdit?: (row: number, col: number, initialValue?: string) => void;
  /** Called when cell editing should end */
  onEndEdit?: (confirm: boolean) => void;
  /** Called when selection changes */
  onSelectionChange?: (selection: ReturnType<SelectionManager['getSelection']>) => void;
  /** Called to delete selected content */
  onDelete?: () => void;
  /** Called for copy operation */
  onCopy?: () => void;
  /** Called for cut operation */
  onCut?: () => void;
  /** Called for paste operation */
  onPaste?: () => void;
  /** Called for undo */
  onUndo?: () => void;
  /** Called for redo */
  onRedo?: () => void;
  /** Called to toggle bold */
  onBold?: () => void;
  /** Called to toggle italic */
  onItalic?: () => void;
  /** Called to toggle underline */
  onUnderline?: () => void;
  /** Called for find dialog */
  onFind?: () => void;
  /** Called for save */
  onSave?: () => void;
  /** Called for print */
  onPrint?: () => void;
}

export class KeyboardHandler {
  private navigation: NavigationManager;
  private selection: SelectionManager;
  private callbacks: KeyboardHandlerCallbacks;

  /** Current edit mode */
  private editMode: EditMode = 'navigate';

  /** Is currently editing a cell */
  private isEditing: boolean = false;

  constructor(
    navigation: NavigationManager,
    selection: SelectionManager,
    callbacks: KeyboardHandlerCallbacks = {}
  ) {
    this.navigation = navigation;
    this.selection = selection;
    this.callbacks = callbacks;
  }

  /**
   * Set callbacks
   */
  setCallbacks(callbacks: Partial<KeyboardHandlerCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Set editing state
   */
  setEditing(isEditing: boolean): void {
    this.isEditing = isEditing;
    this.editMode = isEditing ? 'edit' : 'navigate';
  }

  /**
   * Handle keydown event
   * Returns true if the event was handled
   */
  handleKeyDown(event: KeyboardEvent): boolean {
    // Destructure but we primarily delegate to sub-handlers

    // In edit mode, most keys should go to the cell editor
    if (this.isEditing) {
      return this.handleEditModeKey(event);
    }

    // Navigation mode
    return this.handleNavigationModeKey(event);
  }

  // ===========================================================================
  // Navigation Mode Key Handling
  // ===========================================================================

  private handleNavigationModeKey(event: KeyboardEvent): boolean {
    const { key, ctrlKey, shiftKey, altKey, metaKey } = event;
    const ctrl = ctrlKey || metaKey;

    // Arrow keys
    if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
      event.preventDefault();
      this.handleArrowKey(key, ctrl, shiftKey);
      return true;
    }

    // Enter
    if (key === 'Enter') {
      event.preventDefault();
      if (altKey) {
        // Alt+Enter in edit mode would add newline
        this.startEditing('\n');
      } else {
        this.navigation.enterKey(shiftKey);
        this.syncSelection();
      }
      return true;
    }

    // Tab
    if (key === 'Tab') {
      event.preventDefault();
      this.navigation.tabKey(shiftKey);
      this.syncSelection();
      return true;
    }

    // Page Up/Down
    if (key === 'PageUp') {
      event.preventDefault();
      this.navigation.pageUp(shiftKey);
      this.syncSelection();
      return true;
    }

    if (key === 'PageDown') {
      event.preventDefault();
      this.navigation.pageDown(shiftKey);
      this.syncSelection();
      return true;
    }

    // Home/End
    if (key === 'Home') {
      event.preventDefault();
      this.navigation.home(ctrl, shiftKey);
      this.syncSelection();
      return true;
    }

    if (key === 'End') {
      event.preventDefault();
      this.navigation.end(ctrl, shiftKey);
      this.syncSelection();
      return true;
    }

    // Delete/Backspace - clear cell contents
    if (key === 'Delete' || key === 'Backspace') {
      event.preventDefault();
      this.callbacks.onDelete?.();
      return true;
    }

    // F2 - Edit cell
    if (key === 'F2') {
      event.preventDefault();
      this.startEditing();
      return true;
    }

    // Escape - Clear selection to single cell or cancel
    if (key === 'Escape') {
      event.preventDefault();
      // Could clear multi-selection back to single cell
      return true;
    }

    // Ctrl+A - Select all/current region
    if (ctrl && key.toLowerCase() === 'a') {
      event.preventDefault();
      this.navigation.ctrlA();
      this.syncSelection();
      return true;
    }

    // Ctrl+C - Copy
    if (ctrl && key.toLowerCase() === 'c') {
      event.preventDefault();
      this.callbacks.onCopy?.();
      return true;
    }

    // Ctrl+X - Cut
    if (ctrl && key.toLowerCase() === 'x') {
      event.preventDefault();
      this.callbacks.onCut?.();
      return true;
    }

    // Ctrl+V - Paste
    if (ctrl && key.toLowerCase() === 'v') {
      event.preventDefault();
      this.callbacks.onPaste?.();
      return true;
    }

    // Ctrl+Z - Undo
    if (ctrl && key.toLowerCase() === 'z' && !shiftKey) {
      event.preventDefault();
      this.callbacks.onUndo?.();
      return true;
    }

    // Ctrl+Y or Ctrl+Shift+Z - Redo
    if ((ctrl && key.toLowerCase() === 'y') || (ctrl && shiftKey && key.toLowerCase() === 'z')) {
      event.preventDefault();
      this.callbacks.onRedo?.();
      return true;
    }

    // Ctrl+B - Bold
    if (ctrl && key.toLowerCase() === 'b') {
      event.preventDefault();
      this.callbacks.onBold?.();
      return true;
    }

    // Ctrl+I - Italic
    if (ctrl && key.toLowerCase() === 'i') {
      event.preventDefault();
      this.callbacks.onItalic?.();
      return true;
    }

    // Ctrl+U - Underline
    if (ctrl && key.toLowerCase() === 'u') {
      event.preventDefault();
      this.callbacks.onUnderline?.();
      return true;
    }

    // Ctrl+F - Find
    if (ctrl && key.toLowerCase() === 'f') {
      event.preventDefault();
      this.callbacks.onFind?.();
      return true;
    }

    // Ctrl+S - Save
    if (ctrl && key.toLowerCase() === 's') {
      event.preventDefault();
      this.callbacks.onSave?.();
      return true;
    }

    // Ctrl+P - Print
    if (ctrl && key.toLowerCase() === 'p') {
      event.preventDefault();
      this.callbacks.onPrint?.();
      return true;
    }

    // Typing a character - start editing with that character
    if (this.isTypingCharacter(key) && !ctrl && !altKey) {
      event.preventDefault();
      this.startEditing(key);
      return true;
    }

    // = key - start formula
    if (key === '=' && !ctrl && !altKey) {
      event.preventDefault();
      this.startEditing('=');
      return true;
    }

    return false;
  }

  // ===========================================================================
  // Arrow Key Handling
  // ===========================================================================

  private handleArrowKey(key: string, ctrl: boolean, shift: boolean): void {
    const direction = this.keyToDirection(key);

    if (ctrl && shift) {
      // Ctrl+Shift+Arrow: Extend selection to data region edge
      this.navigation.ctrlShiftArrow(direction);
    } else if (ctrl) {
      // Ctrl+Arrow: Jump to data region edge
      this.navigation.ctrlArrow(direction);
    } else if (shift) {
      // Shift+Arrow: Extend selection by one cell
      this.navigation.extendSelection(direction);
    } else {
      // Arrow: Move by one cell
      this.navigation.moveActiveCell(direction);
    }

    this.syncSelection();
  }

  private keyToDirection(key: string): Direction {
    switch (key) {
      case 'ArrowUp': return 'up';
      case 'ArrowDown': return 'down';
      case 'ArrowLeft': return 'left';
      case 'ArrowRight': return 'right';
      default: return 'down';
    }
  }

  // ===========================================================================
  // Edit Mode Key Handling
  // ===========================================================================

  private handleEditModeKey(event: KeyboardEvent): boolean {
    const { key, shiftKey } = event;

    // Enter - Confirm edit and move
    if (key === 'Enter' && !event.altKey) {
      event.preventDefault();
      this.callbacks.onEndEdit?.(true);
      this.setEditing(false);
      this.navigation.enterKey(shiftKey);
      this.syncSelection();
      return true;
    }

    // Tab - Confirm edit and move
    if (key === 'Tab') {
      event.preventDefault();
      this.callbacks.onEndEdit?.(true);
      this.setEditing(false);
      this.navigation.tabKey(shiftKey);
      this.syncSelection();
      return true;
    }

    // Escape - Cancel edit
    if (key === 'Escape') {
      event.preventDefault();
      this.callbacks.onEndEdit?.(false);
      this.setEditing(false);
      return true;
    }

    // F2 - Toggle edit mode (could cycle through modes)
    if (key === 'F2') {
      // In a full implementation, this would cycle Edit -> Point -> Enter modes
      return true;
    }

    // Arrow keys in edit mode - let them pass through to text input
    // (In a full implementation, this depends on edit mode: edit, point, or enter)
    if (key.startsWith('Arrow')) {
      // In 'edit' mode, arrows move cursor in text
      // In 'point' mode, arrows would select cell references
      // In 'enter' mode, arrows would confirm and move
      return false; // Let browser handle text cursor
    }

    // Let other keys pass through to the text input
    return false;
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  private isTypingCharacter(key: string): boolean {
    // Single character that's not a control key
    return key.length === 1 &&
           !key.match(/[\x00-\x1F]/) && // Not control characters
           key !== ' '; // Space could be special
  }

  private startEditing(initialValue?: string): void {
    const cell = this.navigation.getActiveCell();
    this.setEditing(true);
    this.callbacks.onStartEdit?.(cell.row, cell.col, initialValue);
  }

  private syncSelection(): void {
    const navSelection = this.navigation.getSelection();
    this.selection.setSelection(navSelection);
    this.callbacks.onSelectionChange?.(navSelection);
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Get current edit mode
   */
  getEditMode(): EditMode {
    return this.editMode;
  }

  /**
   * Check if currently editing
   */
  getIsEditing(): boolean {
    return this.isEditing;
  }

  /**
   * Programmatically trigger navigation
   */
  navigate(direction: Direction, ctrl: boolean = false, shift: boolean = false): void {
    this.handleArrowKey(`Arrow${direction.charAt(0).toUpperCase()}${direction.slice(1)}`, ctrl, shift);
  }
}
