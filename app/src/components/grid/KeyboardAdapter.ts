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
} from '../../../../engine/core/navigation/KeyboardHandler';

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
  | ClipboardActionIntent;

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

    // Intents not forwarded to UI (handled elsewhere or not implemented)
    case 'goTo':
    case 'cellClick':
    case 'history':
    case 'format':
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
  const { onIntent, containerRef, isEditing = false, enabled = true } = options;
  const handlerRef = useRef<KeyboardHandler | null>(null);
  const onIntentRef = useRef(onIntent);

  // Keep onIntent ref up to date
  onIntentRef.current = onIntent;

  // Initialize KeyboardHandler
  useEffect(() => {
    const handler = new KeyboardHandler({
      metaAsCtrl: true,  // Treat Cmd as Ctrl on Mac
    });

    // Subscribe to engine intents and convert to UI intents
    handler.subscribe((engineIntent) => {
      const uiIntent = convertEngineIntent(engineIntent);
      if (uiIntent) {
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
