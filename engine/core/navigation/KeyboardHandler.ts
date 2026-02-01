/**
 * VectorSheet Engine - Keyboard Handler (Production Grade)
 *
 * Thin translation layer between raw keyboard events and semantic intents.
 * This is an "input adapter" - it maps low-level browser events to high-level
 * spreadsheet commands without directly mutating any state.
 *
 * Architecture:
 * - Raw KeyboardEvent → KeyboardHandler → SpreadsheetIntent → Consumer
 * - Pure translation: no state mutation, no side effects
 * - Framework-agnostic: works with any UI framework
 * - Configurable: keybindings can be customized
 * - Replaceable: swap this layer without touching core logic
 *
 * Design Principles:
 * - Emit intents, not effects
 * - Single responsibility: translate, don't execute
 * - Composable: intents can be logged, replayed, tested
 * - Extensible: add new intents without modifying core
 */

import { Direction, EditMode } from '../types/index.js';

// =============================================================================
// Keyboard Event Interface (Framework-Agnostic)
// =============================================================================

/**
 * Framework-agnostic keyboard event interface.
 * Compatible with DOM KeyboardEvent but doesn't require it.
 */
export interface KeyboardEvent {
  /** The key value (e.g., 'a', 'Enter', 'ArrowUp') */
  readonly key: string;

  /** The physical key code (e.g., 'KeyA', 'Enter', 'ArrowUp') */
  readonly code: string;

  /** Ctrl key (or Cmd on Mac) pressed */
  readonly ctrlKey: boolean;

  /** Shift key pressed */
  readonly shiftKey: boolean;

  /** Alt key (Option on Mac) pressed */
  readonly altKey: boolean;

  /** Meta key (Cmd on Mac, Win on Windows) pressed */
  readonly metaKey: boolean;

  /** Prevent default browser behavior */
  preventDefault(): void;

  /** Stop event propagation */
  stopPropagation(): void;
}

/**
 * Mouse event for click-based intents.
 */
export interface MouseEvent {
  /** Row index of clicked cell */
  readonly row: number;

  /** Column index of clicked cell */
  readonly col: number;

  /** Ctrl key pressed during click */
  readonly ctrlKey: boolean;

  /** Shift key pressed during click */
  readonly shiftKey: boolean;

  /** Alt key pressed during click */
  readonly altKey: boolean;

  /** Meta key pressed during click */
  readonly metaKey: boolean;

  /** Mouse button: 0=left, 1=middle, 2=right */
  readonly button: number;
}

// =============================================================================
// Intent Types (Semantic Commands)
// =============================================================================

/**
 * Base intent interface.
 * All intents have a type for discrimination.
 */
export interface BaseIntent {
  readonly type: string;
  readonly timestamp: number;
}

/**
 * Navigation intent - move the active cell.
 */
export interface NavigateIntent extends BaseIntent {
  readonly type: 'navigate';
  readonly direction: Direction;
  readonly jump: boolean;      // Ctrl+Arrow: jump to data edge
  readonly extend: boolean;    // Shift: extend selection
}

/**
 * Page navigation intent - PageUp/PageDown.
 */
export interface PageIntent extends BaseIntent {
  readonly type: 'page';
  readonly direction: 'up' | 'down';
  readonly extend: boolean;
}

/**
 * Home/End navigation intent.
 */
export interface HomeEndIntent extends BaseIntent {
  readonly type: 'homeEnd';
  readonly target: 'home' | 'end';
  readonly documentLevel: boolean;  // Ctrl: go to start/end of document
  readonly extend: boolean;
}

/**
 * Tab/Enter navigation intent.
 */
export interface TabEnterIntent extends BaseIntent {
  readonly type: 'tabEnter';
  readonly key: 'tab' | 'enter';
  readonly reverse: boolean;   // Shift: go backward
}

/**
 * Go to specific cell intent.
 */
export interface GoToIntent extends BaseIntent {
  readonly type: 'goTo';
  readonly row: number;
  readonly col: number;
}

/**
 * Selection intent - modify selection.
 */
export interface SelectionIntent extends BaseIntent {
  readonly type: 'selection';
  readonly action: 'selectAll' | 'selectRow' | 'selectColumn' | 'clear' | 'add' | 'extend';
  readonly row?: number;
  readonly col?: number;
}

/**
 * Cell click intent - mouse selection.
 */
export interface CellClickIntent extends BaseIntent {
  readonly type: 'cellClick';
  readonly row: number;
  readonly col: number;
  readonly addToSelection: boolean;   // Ctrl+Click
  readonly extendSelection: boolean;  // Shift+Click
  readonly isDrag: boolean;           // Mouse drag
}

/**
 * Edit intent - start/confirm/cancel cell editing.
 */
export interface EditIntent extends BaseIntent {
  readonly type: 'edit';
  readonly action: 'start' | 'confirm' | 'cancel';
  readonly initialValue?: string;
  readonly row?: number;
  readonly col?: number;
}

/**
 * Clipboard intent - copy/cut/paste.
 */
export interface ClipboardIntent extends BaseIntent {
  readonly type: 'clipboard';
  readonly action: 'copy' | 'cut' | 'paste';
}

/**
 * History intent - undo/redo.
 */
export interface HistoryIntent extends BaseIntent {
  readonly type: 'history';
  readonly action: 'undo' | 'redo';
}

/**
 * Delete intent - delete cell contents.
 */
export interface DeleteIntent extends BaseIntent {
  readonly type: 'delete';
  readonly action: 'contents' | 'row' | 'column' | 'cells';
}

/**
 * Format intent - apply formatting.
 */
export interface FormatIntent extends BaseIntent {
  readonly type: 'format';
  readonly action: 'bold' | 'italic' | 'underline' | 'strikethrough';
}

/**
 * Dialog intent - open dialogs.
 */
export interface DialogIntent extends BaseIntent {
  readonly type: 'dialog';
  readonly dialog: 'find' | 'replace' | 'goto' | 'format' | 'print';
}

/**
 * File intent - file operations.
 */
export interface FileIntent extends BaseIntent {
  readonly type: 'file';
  readonly action: 'save' | 'open' | 'new' | 'print';
}

/**
 * Escape intent - cancel current operation.
 */
export interface EscapeIntent extends BaseIntent {
  readonly type: 'escape';
}

/**
 * Unknown intent - for unmapped keys.
 */
export interface UnknownIntent extends BaseIntent {
  readonly type: 'unknown';
  readonly key: string;
  readonly code: string;
  readonly modifiers: ModifierState;
}

/**
 * Union type of all intents.
 */
export type SpreadsheetIntent =
  | NavigateIntent
  | PageIntent
  | HomeEndIntent
  | TabEnterIntent
  | GoToIntent
  | SelectionIntent
  | CellClickIntent
  | EditIntent
  | ClipboardIntent
  | HistoryIntent
  | DeleteIntent
  | FormatIntent
  | DialogIntent
  | FileIntent
  | EscapeIntent
  | UnknownIntent;

/**
 * Intent type discriminator.
 */
export type IntentType = SpreadsheetIntent['type'];

/**
 * Intent definition without timestamp (for keybindings).
 * This preserves the discriminated union structure.
 */
export type IntentDefinition =
  | Omit<NavigateIntent, 'timestamp'>
  | Omit<PageIntent, 'timestamp'>
  | Omit<HomeEndIntent, 'timestamp'>
  | Omit<TabEnterIntent, 'timestamp'>
  | Omit<GoToIntent, 'timestamp'>
  | Omit<SelectionIntent, 'timestamp'>
  | Omit<CellClickIntent, 'timestamp'>
  | Omit<EditIntent, 'timestamp'>
  | Omit<ClipboardIntent, 'timestamp'>
  | Omit<HistoryIntent, 'timestamp'>
  | Omit<DeleteIntent, 'timestamp'>
  | Omit<FormatIntent, 'timestamp'>
  | Omit<DialogIntent, 'timestamp'>
  | Omit<FileIntent, 'timestamp'>
  | Omit<EscapeIntent, 'timestamp'>
  | Omit<UnknownIntent, 'timestamp'>;

// =============================================================================
// Modifier State
// =============================================================================

/**
 * Modifier key state.
 */
export interface ModifierState {
  readonly ctrl: boolean;   // Ctrl or Cmd
  readonly shift: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
}

/**
 * Extract modifier state from an event.
 */
export function getModifiers(event: KeyboardEvent | MouseEvent): ModifierState {
  return {
    ctrl: event.ctrlKey || event.metaKey,  // Treat Cmd as Ctrl on Mac
    shift: event.shiftKey,
    alt: event.altKey,
    meta: event.metaKey,
  };
}

// =============================================================================
// Keybinding Configuration
// =============================================================================

/**
 * Key combination for keybinding.
 */
export interface KeyCombo {
  readonly key: string;
  readonly ctrl?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
}

/**
 * Keybinding entry.
 */
export interface Keybinding {
  readonly combo: KeyCombo;
  readonly intent: IntentDefinition;
  readonly when?: 'navigation' | 'editing' | 'always';
}

/**
 * Default keybindings - Excel-compatible.
 */
const DEFAULT_KEYBINDINGS: readonly Keybinding[] = [
  // Navigation - Arrow keys
  { combo: { key: 'ArrowUp' }, intent: { type: 'navigate', direction: 'up', jump: false, extend: false }, when: 'navigation' },
  { combo: { key: 'ArrowDown' }, intent: { type: 'navigate', direction: 'down', jump: false, extend: false }, when: 'navigation' },
  { combo: { key: 'ArrowLeft' }, intent: { type: 'navigate', direction: 'left', jump: false, extend: false }, when: 'navigation' },
  { combo: { key: 'ArrowRight' }, intent: { type: 'navigate', direction: 'right', jump: false, extend: false }, when: 'navigation' },

  // Navigation - Ctrl+Arrow (jump)
  { combo: { key: 'ArrowUp', ctrl: true }, intent: { type: 'navigate', direction: 'up', jump: true, extend: false }, when: 'navigation' },
  { combo: { key: 'ArrowDown', ctrl: true }, intent: { type: 'navigate', direction: 'down', jump: true, extend: false }, when: 'navigation' },
  { combo: { key: 'ArrowLeft', ctrl: true }, intent: { type: 'navigate', direction: 'left', jump: true, extend: false }, when: 'navigation' },
  { combo: { key: 'ArrowRight', ctrl: true }, intent: { type: 'navigate', direction: 'right', jump: true, extend: false }, when: 'navigation' },

  // Navigation - Shift+Arrow (extend)
  { combo: { key: 'ArrowUp', shift: true }, intent: { type: 'navigate', direction: 'up', jump: false, extend: true }, when: 'navigation' },
  { combo: { key: 'ArrowDown', shift: true }, intent: { type: 'navigate', direction: 'down', jump: false, extend: true }, when: 'navigation' },
  { combo: { key: 'ArrowLeft', shift: true }, intent: { type: 'navigate', direction: 'left', jump: false, extend: true }, when: 'navigation' },
  { combo: { key: 'ArrowRight', shift: true }, intent: { type: 'navigate', direction: 'right', jump: false, extend: true }, when: 'navigation' },

  // Navigation - Ctrl+Shift+Arrow (jump + extend)
  { combo: { key: 'ArrowUp', ctrl: true, shift: true }, intent: { type: 'navigate', direction: 'up', jump: true, extend: true }, when: 'navigation' },
  { combo: { key: 'ArrowDown', ctrl: true, shift: true }, intent: { type: 'navigate', direction: 'down', jump: true, extend: true }, when: 'navigation' },
  { combo: { key: 'ArrowLeft', ctrl: true, shift: true }, intent: { type: 'navigate', direction: 'left', jump: true, extend: true }, when: 'navigation' },
  { combo: { key: 'ArrowRight', ctrl: true, shift: true }, intent: { type: 'navigate', direction: 'right', jump: true, extend: true }, when: 'navigation' },

  // Page navigation
  { combo: { key: 'PageUp' }, intent: { type: 'page', direction: 'up', extend: false }, when: 'navigation' },
  { combo: { key: 'PageDown' }, intent: { type: 'page', direction: 'down', extend: false }, when: 'navigation' },
  { combo: { key: 'PageUp', shift: true }, intent: { type: 'page', direction: 'up', extend: true }, when: 'navigation' },
  { combo: { key: 'PageDown', shift: true }, intent: { type: 'page', direction: 'down', extend: true }, when: 'navigation' },

  // Home/End
  { combo: { key: 'Home' }, intent: { type: 'homeEnd', target: 'home', documentLevel: false, extend: false }, when: 'navigation' },
  { combo: { key: 'End' }, intent: { type: 'homeEnd', target: 'end', documentLevel: false, extend: false }, when: 'navigation' },
  { combo: { key: 'Home', ctrl: true }, intent: { type: 'homeEnd', target: 'home', documentLevel: true, extend: false }, when: 'navigation' },
  { combo: { key: 'End', ctrl: true }, intent: { type: 'homeEnd', target: 'end', documentLevel: true, extend: false }, when: 'navigation' },
  { combo: { key: 'Home', shift: true }, intent: { type: 'homeEnd', target: 'home', documentLevel: false, extend: true }, when: 'navigation' },
  { combo: { key: 'End', shift: true }, intent: { type: 'homeEnd', target: 'end', documentLevel: false, extend: true }, when: 'navigation' },
  { combo: { key: 'Home', ctrl: true, shift: true }, intent: { type: 'homeEnd', target: 'home', documentLevel: true, extend: true }, when: 'navigation' },
  { combo: { key: 'End', ctrl: true, shift: true }, intent: { type: 'homeEnd', target: 'end', documentLevel: true, extend: true }, when: 'navigation' },

  // Tab/Enter
  { combo: { key: 'Tab' }, intent: { type: 'tabEnter', key: 'tab', reverse: false }, when: 'always' },
  { combo: { key: 'Tab', shift: true }, intent: { type: 'tabEnter', key: 'tab', reverse: true }, when: 'always' },
  { combo: { key: 'Enter' }, intent: { type: 'tabEnter', key: 'enter', reverse: false }, when: 'navigation' },
  { combo: { key: 'Enter', shift: true }, intent: { type: 'tabEnter', key: 'enter', reverse: true }, when: 'navigation' },

  // Selection
  { combo: { key: 'a', ctrl: true }, intent: { type: 'selection', action: 'selectAll' }, when: 'navigation' },

  // Edit
  { combo: { key: 'F2' }, intent: { type: 'edit', action: 'start' }, when: 'navigation' },
  { combo: { key: 'Escape' }, intent: { type: 'escape' }, when: 'always' },

  // Clipboard
  { combo: { key: 'c', ctrl: true }, intent: { type: 'clipboard', action: 'copy' }, when: 'navigation' },
  { combo: { key: 'x', ctrl: true }, intent: { type: 'clipboard', action: 'cut' }, when: 'navigation' },
  { combo: { key: 'v', ctrl: true }, intent: { type: 'clipboard', action: 'paste' }, when: 'always' },

  // History
  { combo: { key: 'z', ctrl: true }, intent: { type: 'history', action: 'undo' }, when: 'always' },
  { combo: { key: 'y', ctrl: true }, intent: { type: 'history', action: 'redo' }, when: 'always' },
  { combo: { key: 'z', ctrl: true, shift: true }, intent: { type: 'history', action: 'redo' }, when: 'always' },

  // Delete
  { combo: { key: 'Delete' }, intent: { type: 'delete', action: 'contents' }, when: 'navigation' },
  { combo: { key: 'Backspace' }, intent: { type: 'delete', action: 'contents' }, when: 'navigation' },

  // Formatting
  { combo: { key: 'b', ctrl: true }, intent: { type: 'format', action: 'bold' }, when: 'always' },
  { combo: { key: 'i', ctrl: true }, intent: { type: 'format', action: 'italic' }, when: 'always' },
  { combo: { key: 'u', ctrl: true }, intent: { type: 'format', action: 'underline' }, when: 'always' },

  // Dialogs
  { combo: { key: 'f', ctrl: true }, intent: { type: 'dialog', dialog: 'find' }, when: 'always' },
  { combo: { key: 'h', ctrl: true }, intent: { type: 'dialog', dialog: 'replace' }, when: 'navigation' },
  { combo: { key: 'g', ctrl: true }, intent: { type: 'dialog', dialog: 'goto' }, when: 'navigation' },

  // File operations
  { combo: { key: 's', ctrl: true }, intent: { type: 'file', action: 'save' }, when: 'always' },
  { combo: { key: 'p', ctrl: true }, intent: { type: 'file', action: 'print' }, when: 'always' },
  { combo: { key: 'o', ctrl: true }, intent: { type: 'file', action: 'open' }, when: 'navigation' },
  { combo: { key: 'n', ctrl: true }, intent: { type: 'file', action: 'new' }, when: 'navigation' },
];

// =============================================================================
// Intent Listener Types
// =============================================================================

/**
 * Callback for intent events.
 */
export type IntentListener = (intent: SpreadsheetIntent) => void;

/**
 * Callback for specific intent type.
 */
export type TypedIntentListener<T extends SpreadsheetIntent> = (intent: T) => void;

// =============================================================================
// Keyboard Handler Configuration
// =============================================================================

/**
 * Configuration for KeyboardHandler.
 */
export interface KeyboardHandlerConfig {
  /** Custom keybindings (merged with defaults) */
  keybindings?: readonly Keybinding[];

  /** Replace default keybindings entirely */
  replaceDefaults?: boolean;

  /** Characters that start editing (default: alphanumeric, =, etc.) */
  editTriggerChars?: RegExp;

  /** Whether to treat meta (Cmd) as ctrl */
  metaAsCtrl?: boolean;
}

// =============================================================================
// Keyboard Handler Class
// =============================================================================

/**
 * Production-grade keyboard handler.
 *
 * This is a pure translation layer that converts raw keyboard events
 * into semantic intents. It does not execute actions or mutate state.
 *
 * Usage:
 * ```typescript
 * const handler = new KeyboardHandler();
 *
 * // Subscribe to all intents
 * handler.subscribe((intent) => {
 *   switch (intent.type) {
 *     case 'navigate':
 *       navigationManager.move(intent.direction, { extend: intent.extend });
 *       break;
 *     case 'clipboard':
 *       clipboardManager[intent.action]();
 *       break;
 *     // ... handle other intents
 *   }
 * });
 *
 * // Or subscribe to specific intent types
 * handler.on('navigate', (intent) => {
 *   console.log('Navigate:', intent.direction);
 * });
 *
 * // Process a keyboard event
 * element.addEventListener('keydown', (e) => {
 *   handler.handleKeyDown(e);
 * });
 * ```
 */
export class KeyboardHandler {
  private readonly config: Required<KeyboardHandlerConfig>;
  private readonly keybindings: Map<string, Keybinding>;
  private readonly listeners: Set<IntentListener> = new Set();
  private readonly typedListeners: Map<IntentType, Set<IntentListener>> = new Map();

  /** Current mode: navigation or editing */
  private mode: 'navigation' | 'editing' = 'navigation';

  /**
   * Create a new KeyboardHandler.
   *
   * @param config - Handler configuration
   */
  constructor(config: KeyboardHandlerConfig = {}) {
    this.config = {
      keybindings: config.keybindings ?? [],
      replaceDefaults: config.replaceDefaults ?? false,
      editTriggerChars: config.editTriggerChars ?? /^[a-zA-Z0-9=+\-*/.'"]$/,
      metaAsCtrl: config.metaAsCtrl ?? true,
    };

    // Build keybinding lookup map
    this.keybindings = new Map();
    this.initializeKeybindings();
  }

  // ===========================================================================
  // Keybinding Initialization
  // ===========================================================================

  private initializeKeybindings(): void {
    // Add default keybindings unless replaced
    if (!this.config.replaceDefaults) {
      for (const binding of DEFAULT_KEYBINDINGS) {
        const key = this.comboToKey(binding.combo);
        this.keybindings.set(key, binding);
      }
    }

    // Add custom keybindings (overrides defaults)
    for (const binding of this.config.keybindings) {
      const key = this.comboToKey(binding.combo);
      this.keybindings.set(key, binding);
    }
  }

  /**
   * Convert a key combo to a lookup key string.
   */
  private comboToKey(combo: KeyCombo): string {
    const parts: string[] = [];
    if (combo.ctrl) parts.push('ctrl');
    if (combo.shift) parts.push('shift');
    if (combo.alt) parts.push('alt');
    parts.push(combo.key.toLowerCase());
    return parts.join('+');
  }

  /**
   * Convert an event to a lookup key string.
   */
  private eventToKey(event: KeyboardEvent): string {
    const parts: string[] = [];
    const ctrl = event.ctrlKey || (this.config.metaAsCtrl && event.metaKey);
    if (ctrl) parts.push('ctrl');
    if (event.shiftKey) parts.push('shift');
    if (event.altKey) parts.push('alt');
    parts.push(event.key.toLowerCase());
    return parts.join('+');
  }

  // ===========================================================================
  // Mode Control
  // ===========================================================================

  /**
   * Set the current input mode.
   * In 'editing' mode, most keys pass through to the text editor.
   */
  setMode(mode: 'navigation' | 'editing'): void {
    this.mode = mode;
  }

  /**
   * Get the current input mode.
   */
  getMode(): 'navigation' | 'editing' {
    return this.mode;
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  /**
   * Handle a keydown event.
   * Returns true if the event was handled (intent was emitted).
   *
   * @param event - The keyboard event
   * @returns Whether the event was handled
   */
  handleKeyDown(event: KeyboardEvent): boolean {
    // Try to find a matching keybinding
    const key = this.eventToKey(event);
    const binding = this.keybindings.get(key);

    if (binding) {
      // Check if binding applies to current mode
      if (this.shouldApplyBinding(binding)) {
        event.preventDefault();
        event.stopPropagation();
        this.emit({ ...binding.intent, timestamp: Date.now() } as SpreadsheetIntent);
        return true;
      }
    }

    // In navigation mode, typing characters starts editing
    if (this.mode === 'navigation' && this.isEditTrigger(event)) {
      event.preventDefault();
      event.stopPropagation();
      this.emit({
        type: 'edit',
        action: 'start',
        initialValue: event.key,
        timestamp: Date.now(),
      });
      return true;
    }

    // In editing mode with Enter (without modifiers), confirm edit
    if (this.mode === 'editing' && event.key === 'Enter' && !event.altKey) {
      const ctrl = event.ctrlKey || (this.config.metaAsCtrl && event.metaKey);
      if (!ctrl) {
        event.preventDefault();
        this.emit({
          type: 'edit',
          action: 'confirm',
          timestamp: Date.now(),
        });
        // Also emit navigation intent for Enter behavior
        this.emit({
          type: 'tabEnter',
          key: 'enter',
          reverse: event.shiftKey,
          timestamp: Date.now(),
        });
        return true;
      }
    }

    // In editing mode with Escape, cancel edit
    if (this.mode === 'editing' && event.key === 'Escape') {
      event.preventDefault();
      this.emit({
        type: 'edit',
        action: 'cancel',
        timestamp: Date.now(),
      });
      return true;
    }

    // In editing mode with Tab, confirm and navigate
    if (this.mode === 'editing' && event.key === 'Tab') {
      event.preventDefault();
      this.emit({
        type: 'edit',
        action: 'confirm',
        timestamp: Date.now(),
      });
      this.emit({
        type: 'tabEnter',
        key: 'tab',
        reverse: event.shiftKey,
        timestamp: Date.now(),
      });
      return true;
    }

    // Unhandled
    return false;
  }

  /**
   * Handle a mouse click on a cell.
   *
   * @param event - The mouse event with cell coordinates
   * @returns The generated intent
   */
  handleCellClick(event: MouseEvent): CellClickIntent {
    const modifiers = getModifiers(event);

    const intent: CellClickIntent = {
      type: 'cellClick',
      row: event.row,
      col: event.col,
      addToSelection: modifiers.ctrl,
      extendSelection: modifiers.shift,
      isDrag: false,
      timestamp: Date.now(),
    };

    this.emit(intent);
    return intent;
  }

  /**
   * Handle mouse drag during selection.
   *
   * @param row - Current row under mouse
   * @param col - Current column under mouse
   * @returns The generated intent
   */
  handleCellDrag(row: number, col: number): CellClickIntent {
    const intent: CellClickIntent = {
      type: 'cellClick',
      row,
      col,
      addToSelection: false,
      extendSelection: true,
      isDrag: true,
      timestamp: Date.now(),
    };

    this.emit(intent);
    return intent;
  }

  /**
   * Handle double-click on a cell (start editing).
   *
   * @param row - Row of double-clicked cell
   * @param col - Column of double-clicked cell
   * @returns The generated intent
   */
  handleCellDoubleClick(row: number, col: number): EditIntent {
    const intent: EditIntent = {
      type: 'edit',
      action: 'start',
      row,
      col,
      timestamp: Date.now(),
    };

    this.emit(intent);
    return intent;
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Check if a binding should apply to the current mode.
   */
  private shouldApplyBinding(binding: Keybinding): boolean {
    if (binding.when === 'always') return true;
    if (binding.when === 'navigation' && this.mode === 'navigation') return true;
    if (binding.when === 'editing' && this.mode === 'editing') return true;
    return false;
  }

  /**
   * Check if a key event should trigger editing.
   */
  private isEditTrigger(event: KeyboardEvent): boolean {
    // Don't trigger on modifier keys alone
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
      return false;
    }

    // Don't trigger if modifiers are held (except shift for capitals)
    const ctrl = event.ctrlKey || (this.config.metaAsCtrl && event.metaKey);
    if (ctrl || event.altKey) {
      return false;
    }

    // Check if character matches the edit trigger pattern
    return this.config.editTriggerChars.test(event.key);
  }

  // ===========================================================================
  // Event Emission
  // ===========================================================================

  /**
   * Emit an intent to all subscribers.
   */
  private emit(intent: SpreadsheetIntent): void {
    // Notify global listeners
    for (const listener of this.listeners) {
      try {
        listener(intent);
      } catch (error) {
        console.error('Intent listener error:', error);
      }
    }

    // Notify typed listeners
    const typedSet = this.typedListeners.get(intent.type);
    if (typedSet) {
      for (const listener of typedSet) {
        try {
          listener(intent);
        } catch (error) {
          console.error('Typed intent listener error:', error);
        }
      }
    }
  }

  // ===========================================================================
  // Subscription API
  // ===========================================================================

  /**
   * Subscribe to all intents.
   *
   * @param listener - Callback for intent events
   * @returns Unsubscribe function
   */
  subscribe(listener: IntentListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Subscribe to a specific intent type.
   *
   * @param type - The intent type to listen for
   * @param listener - Callback for matching intents
   * @returns Unsubscribe function
   */
  on<T extends IntentType>(
    type: T,
    listener: TypedIntentListener<Extract<SpreadsheetIntent, { type: T }>>
  ): () => void {
    let set = this.typedListeners.get(type);
    if (!set) {
      set = new Set();
      this.typedListeners.set(type, set);
    }
    set.add(listener as IntentListener);
    return () => set!.delete(listener as IntentListener);
  }

  /**
   * Remove all listeners.
   */
  removeAllListeners(): void {
    this.listeners.clear();
    this.typedListeners.clear();
  }

  // ===========================================================================
  // Keybinding Management
  // ===========================================================================

  /**
   * Add or update a keybinding.
   *
   * @param binding - The keybinding to add
   */
  addKeybinding(binding: Keybinding): void {
    const key = this.comboToKey(binding.combo);
    this.keybindings.set(key, binding);
  }

  /**
   * Remove a keybinding.
   *
   * @param combo - The key combination to remove
   * @returns Whether a binding was removed
   */
  removeKeybinding(combo: KeyCombo): boolean {
    const key = this.comboToKey(combo);
    return this.keybindings.delete(key);
  }

  /**
   * Get all current keybindings.
   */
  getKeybindings(): readonly Keybinding[] {
    return Array.from(this.keybindings.values());
  }

  /**
   * Reset keybindings to defaults.
   */
  resetKeybindings(): void {
    this.keybindings.clear();
    this.initializeKeybindings();
  }

  // ===========================================================================
  // Programmatic Intent Emission
  // ===========================================================================

  /**
   * Programmatically emit an intent.
   * Useful for testing or triggering actions from code.
   *
   * @param intent - The intent to emit (timestamp will be added)
   */
  emitIntent(intent: IntentDefinition): void {
    this.emit({ ...intent, timestamp: Date.now() } as SpreadsheetIntent);
  }

  // ===========================================================================
  // Legacy Compatibility Layer
  // ===========================================================================

  // These methods maintain backward compatibility with existing code.
  // They create adapters to work with the old callback-based API.

  private legacyNavigation: LegacyNavigationAdapter | null = null;
  private legacySelection: LegacySelectionAdapter | null = null;
  private legacyCallbacks: KeyboardHandlerCallbacks = {};
  private legacyEditMode: EditMode = 'navigate';
  private legacyIsEditing: boolean = false;

  /**
   * Legacy constructor compatibility.
   * @deprecated Use the new constructor with config object
   */
  static createLegacy(
    navigation: LegacyNavigationAdapter,
    selection: LegacySelectionAdapter,
    callbacks: KeyboardHandlerCallbacks = {}
  ): KeyboardHandler {
    const handler = new KeyboardHandler();
    handler.legacyNavigation = navigation;
    handler.legacySelection = selection;
    handler.legacyCallbacks = callbacks;
    handler.setupLegacySubscriptions();
    return handler;
  }

  /**
   * Set legacy callbacks.
   * @deprecated Use subscribe() instead
   */
  setCallbacks(callbacks: Partial<KeyboardHandlerCallbacks>): void {
    this.legacyCallbacks = { ...this.legacyCallbacks, ...callbacks };
  }

  /**
   * Set editing state.
   * @deprecated Use setMode() instead
   */
  setEditing(isEditing: boolean): void {
    this.legacyIsEditing = isEditing;
    this.legacyEditMode = isEditing ? 'edit' : 'navigate';
    this.setMode(isEditing ? 'editing' : 'navigation');
  }

  /**
   * Get current edit mode.
   * @deprecated Use getMode() instead
   */
  getEditMode(): EditMode {
    return this.legacyEditMode;
  }

  /**
   * Check if currently editing.
   * @deprecated Use getMode() === 'editing' instead
   */
  getIsEditing(): boolean {
    return this.legacyIsEditing;
  }

  /**
   * Programmatic navigation.
   * @deprecated Use emitIntent() instead
   */
  navigate(direction: Direction, ctrl: boolean = false, shift: boolean = false): void {
    this.emitIntent({
      type: 'navigate',
      direction,
      jump: ctrl,
      extend: shift,
    });
  }

  /**
   * Set up legacy subscription handlers.
   */
  private setupLegacySubscriptions(): void {
    this.subscribe((intent) => {
      switch (intent.type) {
        case 'navigate':
          this.handleLegacyNavigate(intent);
          break;
        case 'page':
          this.handleLegacyPage(intent);
          break;
        case 'homeEnd':
          this.handleLegacyHomeEnd(intent);
          break;
        case 'tabEnter':
          this.handleLegacyTabEnter(intent);
          break;
        case 'selection':
          this.handleLegacySelection(intent);
          break;
        case 'edit':
          this.handleLegacyEdit(intent);
          break;
        case 'clipboard':
          this.handleLegacyClipboard(intent);
          break;
        case 'history':
          this.handleLegacyHistory(intent);
          break;
        case 'delete':
          this.legacyCallbacks.onDelete?.();
          break;
        case 'format':
          this.handleLegacyFormat(intent);
          break;
        case 'dialog':
          if (intent.dialog === 'find') this.legacyCallbacks.onFind?.();
          break;
        case 'file':
          if (intent.action === 'save') this.legacyCallbacks.onSave?.();
          if (intent.action === 'print') this.legacyCallbacks.onPrint?.();
          break;
        case 'escape':
          if (this.legacyIsEditing) {
            this.legacyCallbacks.onEndEdit?.(false);
            this.setEditing(false);
          }
          break;
      }
    });
  }

  private handleLegacyNavigate(intent: NavigateIntent): void {
    if (!this.legacyNavigation) return;

    if (intent.jump && intent.extend) {
      this.legacyNavigation.ctrlShiftArrow?.(intent.direction);
    } else if (intent.jump) {
      this.legacyNavigation.ctrlArrow?.(intent.direction);
    } else if (intent.extend) {
      this.legacyNavigation.extendSelection?.(intent.direction);
    } else {
      this.legacyNavigation.moveActiveCell?.(intent.direction);
    }
    this.syncLegacySelection();
  }

  private handleLegacyPage(intent: PageIntent): void {
    if (!this.legacyNavigation) return;

    if (intent.direction === 'up') {
      this.legacyNavigation.pageUp?.(intent.extend);
    } else {
      this.legacyNavigation.pageDown?.(intent.extend);
    }
    this.syncLegacySelection();
  }

  private handleLegacyHomeEnd(intent: HomeEndIntent): void {
    if (!this.legacyNavigation) return;

    if (intent.target === 'home') {
      this.legacyNavigation.home?.(intent.documentLevel, intent.extend);
    } else {
      this.legacyNavigation.end?.(intent.documentLevel, intent.extend);
    }
    this.syncLegacySelection();
  }

  private handleLegacyTabEnter(intent: TabEnterIntent): void {
    if (!this.legacyNavigation) return;

    if (intent.key === 'tab') {
      this.legacyNavigation.tabKey?.(intent.reverse);
    } else {
      this.legacyNavigation.enterKey?.(intent.reverse);
    }
    this.syncLegacySelection();
  }

  private handleLegacySelection(intent: SelectionIntent): void {
    if (!this.legacyNavigation) return;

    if (intent.action === 'selectAll') {
      this.legacyNavigation.ctrlA?.();
    }
    this.syncLegacySelection();
  }

  private handleLegacyEdit(intent: EditIntent): void {
    if (intent.action === 'start') {
      const cell = this.legacyNavigation?.getActiveCell?.() ?? { row: 0, col: 0 };
      this.setEditing(true);
      this.legacyCallbacks.onStartEdit?.(
        intent.row ?? cell.row,
        intent.col ?? cell.col,
        intent.initialValue
      );
    } else if (intent.action === 'confirm') {
      this.legacyCallbacks.onEndEdit?.(true);
      this.setEditing(false);
    } else if (intent.action === 'cancel') {
      this.legacyCallbacks.onEndEdit?.(false);
      this.setEditing(false);
    }
  }

  private handleLegacyClipboard(intent: ClipboardIntent): void {
    switch (intent.action) {
      case 'copy': this.legacyCallbacks.onCopy?.(); break;
      case 'cut': this.legacyCallbacks.onCut?.(); break;
      case 'paste': this.legacyCallbacks.onPaste?.(); break;
    }
  }

  private handleLegacyHistory(intent: HistoryIntent): void {
    if (intent.action === 'undo') {
      this.legacyCallbacks.onUndo?.();
    } else {
      this.legacyCallbacks.onRedo?.();
    }
  }

  private handleLegacyFormat(intent: FormatIntent): void {
    switch (intent.action) {
      case 'bold': this.legacyCallbacks.onBold?.(); break;
      case 'italic': this.legacyCallbacks.onItalic?.(); break;
      case 'underline': this.legacyCallbacks.onUnderline?.(); break;
    }
  }

  private syncLegacySelection(): void {
    if (!this.legacyNavigation || !this.legacySelection) return;

    const navSelection = this.legacyNavigation.getSelection?.();
    if (navSelection) {
      this.legacySelection.setSelection?.(navSelection);
      this.legacyCallbacks.onSelectionChange?.(navSelection);
    }
  }
}

// =============================================================================
// Legacy Adapter Interfaces
// =============================================================================

/**
 * Legacy NavigationManager interface for backward compatibility.
 * @deprecated Use the new intent-based system
 */
export interface LegacyNavigationAdapter {
  moveActiveCell?(direction: Direction, options?: { skipHidden?: boolean }): unknown;
  ctrlArrow?(direction: Direction): unknown;
  extendSelection?(direction: Direction): unknown;
  ctrlShiftArrow?(direction: Direction): unknown;
  pageUp?(shift?: boolean): unknown;
  pageDown?(shift?: boolean): unknown;
  home?(ctrl?: boolean, shift?: boolean): unknown;
  end?(ctrl?: boolean, shift?: boolean): unknown;
  tabKey?(shift?: boolean): unknown;
  enterKey?(shift?: boolean): unknown;
  ctrlA?(): unknown;
  getActiveCell?(): { row: number; col: number };
  getSelection?(): unknown;
}

/**
 * Legacy SelectionManager interface for backward compatibility.
 * @deprecated Use the new intent-based system
 */
export interface LegacySelectionAdapter {
  setSelection?(selection: unknown): void;
}

/**
 * Legacy callback interface.
 * @deprecated Use subscribe() with intent handlers
 */
export interface KeyboardHandlerCallbacks {
  onStartEdit?: (row: number, col: number, initialValue?: string) => void;
  onEndEdit?: (confirm: boolean) => void;
  onSelectionChange?: (selection: unknown) => void;
  onDelete?: () => void;
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onBold?: () => void;
  onItalic?: () => void;
  onUnderline?: () => void;
  onFind?: () => void;
  onSave?: () => void;
  onPrint?: () => void;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a KeyboardHandler with default configuration.
 */
export function createKeyboardHandler(config?: KeyboardHandlerConfig): KeyboardHandler {
  return new KeyboardHandler(config);
}

/**
 * Create intent-to-action dispatcher.
 * Maps intents to handler functions for easy integration.
 */
export function createIntentDispatcher(
  handlers: Partial<Record<IntentType, (intent: SpreadsheetIntent) => void>>
): IntentListener {
  return (intent: SpreadsheetIntent) => {
    const handler = handlers[intent.type];
    if (handler) {
      handler(intent);
    }
  };
}
