/**
 * KeyboardAdapter - Bridges engine's KeyboardHandler with UI's intent system
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                     KEYBOARD EVENT FLOW                                  │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │                                                                         │
 * │   DOM KeyboardEvent                                                     │
 * │       │                                                                 │
 * │       ▼                                                                 │
 * │   ┌───────────────────┐                                                 │
 * │   │ KeyboardAdapter   │  ← React hook, attaches to container            │
 * │   └─────────┬─────────┘                                                 │
 * │             │                                                           │
 * │             ▼                                                           │
 * │   ┌───────────────────┐                                                 │
 * │   │ KeyboardHandler   │  ← Engine's keyboard translator                 │
 * │   │ (from engine)     │  ← Maps keys to semantic intents               │
 * │   └─────────┬─────────┘                                                 │
 * │             │                                                           │
 * │             ▼                                                           │
 * │   ┌───────────────────┐                                                 │
 * │   │ KeyboardIntent    │  ← Normalized keyboard intent                   │
 * │   └─────────┬─────────┘                                                 │
 * │             │                                                           │
 * │             ▼                                                           │
 * │   ┌───────────────────┐                                                 │
 * │   │ onIntent()        │  ← Callback to parent (GridViewport)            │
 * │   └───────────────────┘                                                 │
 * │                                                                         │
 * │   SUPPORTED KEYS:                                                       │
 * │   ├── Arrow keys (navigate)                                             │
 * │   ├── Shift+Arrow (extend selection)                                    │
 * │   ├── Ctrl+Arrow (jump to edge)                                         │
 * │   ├── Tab / Shift+Tab (move right/left)                                 │
 * │   ├── Enter / Shift+Enter (move down/up)                                │
 * │   ├── Escape (cancel edit, clear selection)                             │
 * │   ├── Home/End (row navigation)                                         │
 * │   ├── Ctrl+Home/End (document navigation)                               │
 * │   ├── F2 (start editing)                                                │
 * │   └── Alphanumeric (start editing with value)                           │
 * │                                                                         │
 * │   DESIGN:                                                               │
 * │   - UI does not interpret keys                                          │
 * │   - KeyboardHandler is the only translator                              │
 * │   - Engine decides all movement                                         │
 * │                                                                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import { useRef, useEffect, useCallback } from 'react';
import {
  KeyboardHandler,
  type SpreadsheetIntent as EngineIntent,
  type NavigateIntent,
  type TabEnterIntent,
  type HomeEndIntent,
  type PageIntent,
  type EditIntent as EngineEditIntent,
  type SelectionIntent as EngineSelectionIntent,
  type DeleteIntent,
  type ClipboardIntent,
  type HistoryIntent,
  type FormatIntent,
} from '../../../../engine/core/navigation/KeyboardHandler';
import type { CellFormat } from '../../../../engine/core/types/index';

// =============================================================================
// Keyboard Intent Types (UI Layer)
// =============================================================================

/**
 * Base intent interface
 */
interface BaseKeyboardIntent {
  type: string;
  timestamp: number;
}

/**
 * Navigate to adjacent cell
 */
export interface NavigateCellIntent extends BaseKeyboardIntent {
  type: 'NavigateCell';
  direction: 'up' | 'down' | 'left' | 'right';
  jump: boolean;     // Ctrl: jump to data boundary
  extend: boolean;   // Shift: extend selection
}

/**
 * Navigate by page (PageUp/PageDown)
 */
export interface NavigatePageIntent extends BaseKeyboardIntent {
  type: 'NavigatePage';
  direction: 'up' | 'down';
  extend: boolean;
  /** Number of rows to jump. Defaults to 20 if not provided. */
  pageSize?: number;
}

/**
 * Navigate to row/document start/end
 */
export interface NavigateHomeEndIntent extends BaseKeyboardIntent {
  type: 'NavigateHomeEnd';
  target: 'home' | 'end';
  documentLevel: boolean;  // Ctrl: document level
  extend: boolean;
}

/**
 * Tab/Enter navigation (moves within entry area or to next cell)
 */
export interface TabEnterNavigateIntent extends BaseKeyboardIntent {
  type: 'TabEnterNavigate';
  key: 'tab' | 'enter';
  reverse: boolean;  // Shift: go backward
}

/**
 * Start cell editing
 */
export interface StartEditIntent extends BaseKeyboardIntent {
  type: 'StartEdit';
  row?: number;
  col?: number;
  initialValue?: string;  // Character that triggered edit
}

/**
 * Confirm cell edit
 */
export interface ConfirmEditIntent extends BaseKeyboardIntent {
  type: 'ConfirmEdit';
}

/**
 * Cancel cell edit
 */
export interface CancelEditIntent extends BaseKeyboardIntent {
  type: 'CancelEdit';
}

/**
 * Escape pressed (cancel current operation)
 */
export interface EscapePressedIntent extends BaseKeyboardIntent {
  type: 'EscapePressed';
}

/**
 * Select all cells
 */
export interface SelectAllCellsIntent extends BaseKeyboardIntent {
  type: 'SelectAllCells';
}

/**
 * Delete cell contents
 */
export interface DeleteContentsIntent extends BaseKeyboardIntent {
  type: 'DeleteContents';
}

/**
 * Clipboard operations
 */
export interface ClipboardActionIntent extends BaseKeyboardIntent {
  type: 'ClipboardAction';
  action: 'copy' | 'cut' | 'paste';
}

/**
 * Apply cell formatting (Bold, Italic, font changes, etc.)
 */
export interface ApplyFormatIntent extends BaseKeyboardIntent {
  type: 'ApplyFormat';
  format: Partial<CellFormat>;
}

/**
 * Undo / Redo
 */
export interface UndoRedoIntent extends BaseKeyboardIntent {
  type: 'UndoRedo';
  action: 'undo' | 'redo';
}

/**
 * Open Find/Replace dialog
 */
export interface OpenFindReplaceIntent extends BaseKeyboardIntent {
  type: 'OpenFindReplace';
  mode: 'find' | 'replace';
}

/**
 * Union of all keyboard intents
 */
export type KeyboardIntent =
  | NavigateCellIntent
  | NavigatePageIntent
  | NavigateHomeEndIntent
  | TabEnterNavigateIntent
  | StartEditIntent
  | ConfirmEditIntent
  | CancelEditIntent
  | EscapePressedIntent
  | SelectAllCellsIntent
  | DeleteContentsIntent
  | ClipboardActionIntent
  | ApplyFormatIntent
  | UndoRedoIntent
  | OpenFindReplaceIntent;

// =============================================================================
// Intent Creation Helpers
// =============================================================================

function createIntent<T extends KeyboardIntent>(
  intent: Omit<T, 'timestamp'>
): T {
  return { ...intent, timestamp: Date.now() } as T;
}

// =============================================================================
// Engine Intent to UI Intent Converter
// =============================================================================

/**
 * Convert engine's intent to UI's keyboard intent
 * Returns null for intents that shouldn't be forwarded to UI
 */
function convertEngineIntent(engineIntent: EngineIntent): KeyboardIntent | null {
  switch (engineIntent.type) {
    case 'navigate': {
      const nav = engineIntent as NavigateIntent;
      return createIntent<NavigateCellIntent>({
        type: 'NavigateCell',
        direction: nav.direction,
        jump: nav.jump,
        extend: nav.extend,
      });
    }

    case 'page': {
      const page = engineIntent as PageIntent;
      return createIntent<NavigatePageIntent>({
        type: 'NavigatePage',
        direction: page.direction,
        extend: page.extend,
      });
    }

    case 'homeEnd': {
      const homeEnd = engineIntent as HomeEndIntent;
      return createIntent<NavigateHomeEndIntent>({
        type: 'NavigateHomeEnd',
        target: homeEnd.target,
        documentLevel: homeEnd.documentLevel,
        extend: homeEnd.extend,
      });
    }

    case 'tabEnter': {
      const tabEnter = engineIntent as TabEnterIntent;
      return createIntent<TabEnterNavigateIntent>({
        type: 'TabEnterNavigate',
        key: tabEnter.key,
        reverse: tabEnter.reverse,
      });
    }

    case 'edit': {
      const edit = engineIntent as EngineEditIntent;
      if (edit.action === 'start') {
        return createIntent<StartEditIntent>({
          type: 'StartEdit',
          row: edit.row,
          col: edit.col,
          initialValue: edit.initialValue,
        });
      } else if (edit.action === 'confirm') {
        return createIntent<ConfirmEditIntent>({
          type: 'ConfirmEdit',
        });
      } else if (edit.action === 'cancel') {
        return createIntent<CancelEditIntent>({
          type: 'CancelEdit',
        });
      }
      return null;
    }

    case 'selection': {
      const sel = engineIntent as EngineSelectionIntent;
      if (sel.action === 'selectAll') {
        return createIntent<SelectAllCellsIntent>({
          type: 'SelectAllCells',
        });
      }
      return null;
    }

    case 'escape': {
      return createIntent<EscapePressedIntent>({
        type: 'EscapePressed',
      });
    }

    case 'delete': {
      const del = engineIntent as DeleteIntent;
      if (del.action === 'contents') {
        return createIntent<DeleteContentsIntent>({
          type: 'DeleteContents',
        });
      }
      return null;
    }

    case 'clipboard': {
      const clip = engineIntent as ClipboardIntent;
      return createIntent<ClipboardActionIntent>({
        type: 'ClipboardAction',
        action: clip.action,
      });
    }

    case 'history': {
      const hist = engineIntent as HistoryIntent;
      return createIntent<UndoRedoIntent>({
        type: 'UndoRedo',
        action: hist.action,
      });
    }

    case 'format': {
      const fmt = engineIntent as FormatIntent;
      const formatMap: Record<string, Partial<CellFormat>> = {
        bold: { bold: true },
        italic: { italic: true },
        underline: { underline: 1 },
        strikethrough: { strikethrough: true },
      };
      const format = formatMap[fmt.action];
      if (format) {
        return createIntent<ApplyFormatIntent>({ type: 'ApplyFormat', format });
      }
      return null;
    }

    // Intents not forwarded to UI (handled elsewhere or not implemented)
    case 'goTo':
    case 'cellClick':
    case 'dialog':
    case 'file':
    case 'unknown':
      return null;

    default:
      return null;
  }
}

// =============================================================================
// React Hook
// =============================================================================

export interface UseKeyboardAdapterOptions {
  /** Callback when keyboard intent is emitted */
  onIntent: (intent: KeyboardIntent) => void;
  /** Container element ref for attaching listeners */
  containerRef: React.RefObject<HTMLElement>;
  /** Current edit mode */
  isEditing?: boolean;
  /** Whether keyboard handling is enabled */
  enabled?: boolean;
  /** Number of visible rows in viewport (used for PageUp/Down). */
  visibleRows?: number;
}

/**
 * React hook for keyboard input handling
 *
 * Usage:
 * ```tsx
 * const keyboardAdapter = useKeyboardAdapter({
 *   onIntent: handleKeyboardIntent,
 *   containerRef,
 *   isEditing: false,
 * });
 *
 * // Call when edit mode changes
 * useEffect(() => {
 *   keyboardAdapter.setEditMode(isEditing);
 * }, [isEditing]);
 * ```
 */
export function useKeyboardAdapter(options: UseKeyboardAdapterOptions) {
  const { onIntent, containerRef, isEditing = false, enabled = true, visibleRows } = options;
  const handlerRef = useRef<KeyboardHandler | null>(null);
  const onIntentRef = useRef(onIntent);
  const visibleRowsRef = useRef(visibleRows);

  // Keep refs up to date
  onIntentRef.current = onIntent;
  visibleRowsRef.current = visibleRows;

  // Initialize KeyboardHandler
  useEffect(() => {
    const handler = new KeyboardHandler({
      metaAsCtrl: true,  // Treat Cmd as Ctrl on Mac
    });

    // Subscribe to engine intents and convert to UI intents
    handler.subscribe((engineIntent) => {
      const uiIntent = convertEngineIntent(engineIntent);
      if (uiIntent) {
        // Inject dynamic page size for NavigatePage intents
        if (uiIntent.type === 'NavigatePage' && visibleRowsRef.current) {
          (uiIntent as NavigatePageIntent).pageSize = visibleRowsRef.current;
        }
        onIntentRef.current(uiIntent);
      }
    });

    handlerRef.current = handler;

    return () => {
      handler.removeAllListeners();
      handlerRef.current = null;
    };
  }, []);

  // Update edit mode when it changes
  useEffect(() => {
    handlerRef.current?.setMode(isEditing ? 'editing' : 'navigation');
  }, [isEditing]);

  // Attach keyboard listeners to container
  useEffect(() => {
    const container = containerRef.current;
    const handler = handlerRef.current;
    if (!container || !handler || !enabled) return;

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      // Skip IME composition events (CJK input methods generate intermediate keydowns)
      if (e.isComposing || e.keyCode === 229) return;

      // Don't handle if target is an input/textarea (unless it's our cell editor)
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Allow if it's marked as our cell editor
        if (!target.dataset.cellEditor) {
          return;
        }
      }

      // Intercept Ctrl+F / Ctrl+H before engine — these are UI-only shortcuts
      // that must preventDefault to block the browser's native Find dialog.
      // If user is editing a cell, confirm the edit first (matches Excel behaviour).
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        if (e.key === 'f' || e.key === 'h') {
          e.preventDefault();
          e.stopPropagation();
          // Commit any active cell edit before opening Find
          if (handlerRef.current?.getMode() === 'editing') {
            onIntentRef.current(createIntent<ConfirmEditIntent>({
              type: 'ConfirmEdit',
            }));
          }
          onIntentRef.current(createIntent<OpenFindReplaceIntent>({
            type: 'OpenFindReplace',
            mode: e.key === 'h' ? 'replace' : 'find',
          }));
          return;
        }
      }

      // Let KeyboardHandler process the event
      handler.handleKeyDown(e);
    };

    container.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, [containerRef, enabled]);

  // Public API
  const setEditMode = useCallback((editing: boolean) => {
    handlerRef.current?.setMode(editing ? 'editing' : 'navigation');
  }, []);

  const getEditMode = useCallback(() => {
    return handlerRef.current?.getMode() ?? 'navigation';
  }, []);

  return {
    setEditMode,
    getEditMode,
  };
}

// =============================================================================
// Exports
// =============================================================================

export { KeyboardHandler };
