/**
 * CellEditorOverlay - Production-grade in-cell editor
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                       CELL EDITOR OVERLAY                                   │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │                                                                             │
 * │   ┌─────────────────────────────────────────────────────────────────────┐   │
 * │   │ Grid Cell                                                           │   │
 * │   │  ┌───────────────────────────────────────────────────────────────┐  │   │
 * │   │  │ CellEditorOverlay                                             │  │   │
 * │   │  │                                                               │  │   │
 * │   │  │  - Positioned exactly over cell                               │  │   │
 * │   │  │  - Expands width as content grows                             │  │   │
 * │   │  │  - Captures all keyboard input                                │  │   │
 * │   │  │  - Supports IME composition                                   │  │   │
 * │   │  │  - Text selection and caret                                   │  │   │
 * │   │  │  - Formula auto-complete suggestions                          │  │   │
 * │   │  │  - Internal undo/redo during edit                             │  │   │
 * │   │  │  - Scroll-into-view support                                   │  │   │
 * │   │  │  - Zoom-aware positioning                                     │  │   │
 * │   │  │                                                               │  │   │
 * │   │  └───────────────────────────────────────────────────────────────┘  │   │
 * │   └─────────────────────────────────────────────────────────────────────┘   │
 * │                                                                             │
 * │   Modes:                                                                    │
 * │   - Edit: Cursor visible, arrow keys move in text                          │
 * │   - Enter: All text selected, typing replaces                              │
 * │   - Point: Selecting cell references for formulas                          │
 * │                                                                             │
 * │   Edge Cases Handled:                                                       │
 * │   - Merged cells (uses merged cell bounds)                                  │
 * │   - Formatted cells (preserves display formatting)                          │
 * │   - Editing during scroll (scroll-into-view)                                │
 * │   - Zoom != 1 (scales font and dimensions)                                  │
 * │                                                                             │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  memo,
  useLayoutEffect,
} from 'react';
import type { EditModeState, EditModeActions } from './useEditMode';
import { useFormulaAutoComplete } from './useFormulaAutoComplete';
import type { AcceptResult } from './useFormulaAutoComplete';
import { FormulaHintsPanel } from './FormulaHintsPanel';

// =============================================================================
// Constants
// =============================================================================

/**
 * Characters that trigger Point mode in formulas (Excel-exact behavior)
 */
const POINT_MODE_TRIGGERS = new Set([
  '=', '+', '-', '*', '/', '(', ',', ':', '^', '&', '<', '>', ';'
]);

/**
 * Maximum undo history entries during edit
 */
const MAX_EDIT_HISTORY = 100;

/**
 * Debounce delay for adding to undo history (ms)
 */
const UNDO_DEBOUNCE_MS = 300;

// =============================================================================
// Types
// =============================================================================

export interface CellEditorOverlayProps {
  /** Edit state from useEditMode hook */
  state: EditModeState;
  /** Edit actions from useEditMode hook */
  actions: EditModeActions;
  /** Cell position in pixels (relative to scroll container) */
  cellPosition: { x: number; y: number; width: number; height: number };
  /** Minimum width for the editor */
  minWidth?: number;
  /** Maximum width for the editor (0 = unlimited) */
  maxWidth?: number;
  /** Z-index for the overlay */
  zIndex?: number;
  /** Called when editor wants to close */
  onClose?: () => void;
  /** Whether this editor is active (vs formula bar) */
  isActive?: boolean;
  /** Callback when Enter is pressed */
  onEnter?: (shift: boolean) => void;
  /** Callback when Tab is pressed */
  onTab?: (shift: boolean) => void;
  /** Callback when arrow navigation occurs */
  onArrowNav?: (direction: 'up' | 'down' | 'left' | 'right') => void;
  /** Whether to enable formula auto-complete (default: true) */
  enableAutoComplete?: boolean;
  /** Current zoom level (1.0 = 100%) */
  zoom?: number;
  /** Request scroll to bring editor into view */
  onScrollIntoView?: (bounds: { x: number; y: number; width: number; height: number }) => void;
  /** Whether editing a merged cell (affects sizing) */
  isMergedCell?: boolean;
}

/**
 * Internal history entry for undo/redo during edit
 */
interface EditHistoryEntry {
  value: string;
  cursorPosition: number;
  selection: { start: number; end: number } | null;
}

// =============================================================================
// Styles (injected once)
// =============================================================================

const STYLE_ID = 'cell-editor-overlay-styles';

function ensureStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .cell-editor-input {
      caret-color: #1a73e8;
    }

    .cell-editor-input:focus {
      outline: none;
    }

    .cell-editor-input::selection {
      background-color: rgba(26, 115, 232, 0.3);
    }

    .cell-editor-overlay[data-mode="point"] .cell-editor-input {
      caret-color: #34a853;
    }

    .cell-editor-overlay[data-mode="point"] .cell-editor-input::selection {
      background-color: rgba(52, 168, 83, 0.3);
    }

    @keyframes cellEditorFocusPulse {
      0%, 100% { box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.2), 0 2px 8px rgba(0, 0, 0, 0.15); }
      50% { box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.3), 0 2px 8px rgba(0, 0, 0, 0.15); }
    }

    .cell-editor-input:focus {
      animation: cellEditorFocusPulse 2s ease-in-out infinite;
    }

    .cell-editor-mode-indicator {
      animation: fadeIn 0.15s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(2px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Internal undo/redo history for edit session
 */
function useEditHistory(initialValue: string, enabled: boolean) {
  const [history, setHistory] = useState<EditHistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const lastValueRef = useRef(initialValue);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use refs to avoid stale closures in callbacks
  const historyRef = useRef(history);
  const historyIndexRef = useRef(historyIndex);
  historyRef.current = history;
  historyIndexRef.current = historyIndex;

  // Reset history when editing starts
  useEffect(() => {
    if (enabled) {
      const initialEntry = {
        value: initialValue,
        cursorPosition: initialValue.length,
        selection: null,
      };
      setHistory([initialEntry]);
      setHistoryIndex(0);
      lastValueRef.current = initialValue;
      historyRef.current = [initialEntry];
      historyIndexRef.current = 0;
    }
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [enabled, initialValue]);

  const pushHistory = useCallback((entry: EditHistoryEntry) => {
    if (!enabled) return;

    // Debounce rapid changes
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;

      // Skip if value unchanged
      if (entry.value === lastValueRef.current) return;
      lastValueRef.current = entry.value;

      // Use refs to get current values (avoid stale closure)
      const currentIndex = historyIndexRef.current;

      setHistory((prev) => {
        // Truncate future history if we're not at the end
        const newHistory = prev.slice(0, currentIndex + 1);
        newHistory.push(entry);

        // Limit history size
        if (newHistory.length > MAX_EDIT_HISTORY) {
          newHistory.shift();
        }

        historyRef.current = newHistory;
        return newHistory;
      });
      setHistoryIndex((prev) => {
        const newIndex = Math.min(prev + 1, MAX_EDIT_HISTORY - 1);
        historyIndexRef.current = newIndex;
        return newIndex;
      });
    }, UNDO_DEBOUNCE_MS);
  }, [enabled]);

  const undo = useCallback((): EditHistoryEntry | null => {
    const currentIndex = historyIndexRef.current;
    const currentHistory = historyRef.current;

    if (!enabled || currentIndex <= 0) return null;

    const newIndex = currentIndex - 1;
    const entry = currentHistory[newIndex];
    if (!entry) return null; // Safety check

    setHistoryIndex(newIndex);
    historyIndexRef.current = newIndex;
    lastValueRef.current = entry.value;
    return entry;
  }, [enabled]);

  const redo = useCallback((): EditHistoryEntry | null => {
    const currentIndex = historyIndexRef.current;
    const currentHistory = historyRef.current;

    if (!enabled || currentIndex >= currentHistory.length - 1) return null;

    const newIndex = currentIndex + 1;
    const entry = currentHistory[newIndex];
    if (!entry) return null; // Safety check

    setHistoryIndex(newIndex);
    historyIndexRef.current = newIndex;
    lastValueRef.current = entry.value;
    return entry;
  }, [enabled]);

  return {
    pushHistory,
    undo,
    redo,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1
  };
}

// =============================================================================
// Component
// =============================================================================

export const CellEditorOverlay: React.FC<CellEditorOverlayProps> = memo(({
  state,
  actions,
  cellPosition,
  minWidth = 50,
  maxWidth = 0,
  zIndex = 100,
  onClose,
  isActive = true,
  onEnter,
  onTab,
  onArrowNav,
  enableAutoComplete = true,
  zoom = 1.0,
  onScrollIntoView,
  isMergedCell = false,
}) => {
  // Ensure styles are injected
  useLayoutEffect(() => {
    ensureStyles();
  }, []);

  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRefs = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const [inputWidth, setInputWidth] = useState(cellPosition.width);
  const isComposingRef = useRef(false);
  const selectionBeforeResizeRef = useRef<{ start: number; end: number } | null>(null);

  // Ref for state to avoid stale closures in stable callbacks
  const stateRef = useRef(state);
  stateRef.current = state;

  // Internal undo/redo history
  const { pushHistory, undo, redo, canUndo, canRedo } = useEditHistory(
    state.value,
    state.isEditing
  );

  // Formula auto-complete
  const handleAutoCompleteAccept = useCallback((result: AcceptResult) => {
    const currentValue = stateRef.current.value;
    const newValue =
      currentValue.slice(0, result.replaceStart) +
      result.insertText +
      currentValue.slice(result.replaceStart + result.replaceLength);

    actions.setValue(newValue);
    actions.setCursorPosition(result.replaceStart + result.cursorOffset);
  }, [actions]);

  const {
    state: autoCompleteState,
    actions: autoCompleteActions,
  } = useFormulaAutoComplete({
    formula: state.value,
    cursorPosition: state.cursorPosition,
    enabled: enableAutoComplete && state.isEditing && state.isFormula,
    debounceMs: 50,
    onAccept: handleAutoCompleteAccept,
  });

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach((id) => clearTimeout(id));
      timeoutRefs.current.clear();
    };
  }, []);

  const safeTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timeoutRefs.current.delete(id);
      fn();
    }, ms);
    timeoutRefs.current.add(id);
    return id;
  }, []);

  // Track initial focus state
  const hasInitialFocusRef = useRef(false);

  // Focus input when editing starts
  useEffect(() => {
    if (state.isEditing && isActive && inputRef.current) {
      inputRef.current.focus();

      if (!hasInitialFocusRef.current) {
        hasInitialFocusRef.current = true;
        if (state.textSelection) {
          inputRef.current.setSelectionRange(
            state.textSelection.start,
            state.textSelection.end
          );
        } else {
          inputRef.current.setSelectionRange(
            state.cursorPosition,
            state.cursorPosition
          );
        }
      }
    } else {
      hasInitialFocusRef.current = false;
    }
  }, [state.isEditing, isActive]);

  // Request scroll-into-view when editor might be off-screen
  useEffect(() => {
    if (state.isEditing && onScrollIntoView && containerRef.current) {
      // Check if editor is visible in viewport
      const rect = containerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      const isOffScreen =
        rect.top < 0 ||
        rect.left < 0 ||
        rect.bottom > viewportHeight ||
        rect.right > viewportWidth;

      if (isOffScreen) {
        onScrollIntoView({
          x: cellPosition.x,
          y: cellPosition.y,
          width: inputWidth,
          height: cellPosition.height,
        });
      }
    }
  }, [state.isEditing, cellPosition, inputWidth, onScrollIntoView]);

  // Measure text and adjust width (preserving selection)
  useEffect(() => {
    if (measureRef.current) {
      // Save selection before resize
      if (inputRef.current) {
        selectionBeforeResizeRef.current = {
          start: inputRef.current.selectionStart ?? 0,
          end: inputRef.current.selectionEnd ?? 0,
        };
      }

      const measuredWidth = measureRef.current.offsetWidth;
      const padding = 8;
      const scaledPadding = padding * zoom;
      const newWidth = Math.max(
        minWidth * zoom,
        cellPosition.width,
        measuredWidth + scaledPadding
      );

      const finalWidth = maxWidth > 0 ? Math.min(newWidth, maxWidth * zoom) : newWidth;

      if (finalWidth !== inputWidth) {
        setInputWidth(finalWidth);

        // Restore selection after resize
        safeTimeout(() => {
          if (inputRef.current && selectionBeforeResizeRef.current) {
            inputRef.current.setSelectionRange(
              selectionBeforeResizeRef.current.start,
              selectionBeforeResizeRef.current.end
            );
          }
        }, 0);
      }
    }
  }, [state.value, cellPosition.width, minWidth, maxWidth, zoom, inputWidth, safeTimeout]);

  // Handle input change with Point mode trigger and undo history
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (isComposingRef.current) return;

    const newValue = e.target.value;
    const oldValue = stateRef.current.value;
    const cursorPos = e.target.selectionStart ?? newValue.length;

    actions.setValue(newValue);

    // Push to undo history
    pushHistory({
      value: newValue,
      cursorPosition: cursorPos,
      selection: null,
    });

    // Check for Point mode trigger
    if (
      newValue.startsWith('=') &&
      newValue.length > oldValue.length &&
      stateRef.current.mode === 'edit' &&
      cursorPos > 0
    ) {
      const addedChar = newValue[cursorPos - 1];
      if (addedChar !== undefined && POINT_MODE_TRIGGERS.has(addedChar)) {
        actions.setMode('point');
      }
    }
  }, [actions, pushHistory]);

  // IME composition handlers
  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback((e: React.CompositionEvent<HTMLInputElement>) => {
    isComposingRef.current = false;
    const value = (e.target as HTMLInputElement).value;
    actions.setValue(value);
    pushHistory({
      value,
      cursorPosition: (e.target as HTMLInputElement).selectionStart ?? value.length,
      selection: null,
    });
  }, [actions, pushHistory]);

  // Handle key events - uses refs for state to keep callback stable
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isComposingRef.current) return;

    const input = inputRef.current;
    if (!input) return;

    const currentState = stateRef.current;

    // Auto-complete navigation
    if (autoCompleteState.showSuggestions) {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          autoCompleteActions.selectPrevious();
          return;
        case 'ArrowDown':
          e.preventDefault();
          autoCompleteActions.selectNext();
          return;
        case 'Tab':
        case 'Enter': {
          const accepted = autoCompleteActions.acceptSuggestion();
          if (accepted) {
            e.preventDefault();
            return;
          }
          break;
        }
        case 'Escape':
          e.preventDefault();
          autoCompleteActions.dismiss();
          return;
      }
    }

    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        actions.confirmEdit();
        onEnter?.(e.shiftKey);
        onClose?.();
        break;

      case 'Tab':
        e.preventDefault();
        actions.confirmEdit();
        onTab?.(e.shiftKey);
        onClose?.();
        break;

      case 'Escape':
        e.preventDefault();
        actions.cancelEdit();
        onClose?.();
        break;

      case 'F2':
        e.preventDefault();
        actions.cycleMode();
        break;

      case 'ArrowLeft':
        if (currentState.mode === 'edit') {
          safeTimeout(() => {
            if (inputRef.current) {
              actions.setCursorPosition(inputRef.current.selectionStart ?? 0);
            }
          }, 0);
        } else if (currentState.mode === 'enter') {
          e.preventDefault();
          actions.confirmEdit();
          onArrowNav?.('left');
          onClose?.();
        } else if (currentState.mode === 'point') {
          e.preventDefault();
          onArrowNav?.('left');
        }
        break;

      case 'ArrowRight':
        if (currentState.mode === 'edit') {
          safeTimeout(() => {
            if (inputRef.current) {
              actions.setCursorPosition(inputRef.current.selectionStart ?? 0);
            }
          }, 0);
        } else if (currentState.mode === 'enter') {
          e.preventDefault();
          actions.confirmEdit();
          onArrowNav?.('right');
          onClose?.();
        } else if (currentState.mode === 'point') {
          e.preventDefault();
          onArrowNav?.('right');
        }
        break;

      case 'ArrowUp':
        if (currentState.mode === 'enter' || currentState.mode === 'point') {
          e.preventDefault();
          if (currentState.mode === 'enter') {
            actions.confirmEdit();
            onArrowNav?.('up');
            onClose?.();
          } else {
            onArrowNav?.('up');
          }
        }
        break;

      case 'ArrowDown':
        if (currentState.mode === 'enter' || currentState.mode === 'point') {
          e.preventDefault();
          if (currentState.mode === 'enter') {
            actions.confirmEdit();
            onArrowNav?.('down');
            onClose?.();
          } else {
            onArrowNav?.('down');
          }
        }
        break;

      case 'Home':
        if (currentState.mode === 'edit') {
          e.preventDefault();
          if (e.shiftKey) {
            actions.setTextSelection(0, currentState.cursorPosition);
          } else {
            actions.setCursorPosition(0);
          }
        }
        break;

      case 'End':
        if (currentState.mode === 'edit') {
          e.preventDefault();
          if (e.shiftKey) {
            actions.setTextSelection(currentState.cursorPosition, currentState.value.length);
          } else {
            actions.setCursorPosition(currentState.value.length);
          }
        }
        break;

      case 'a':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          actions.selectAll();
        }
        break;

      case 'z':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (e.shiftKey) {
            const entry = redo();
            if (entry) {
              actions.setValue(entry.value);
              actions.setCursorPosition(entry.cursorPosition);
            }
          } else {
            const entry = undo();
            if (entry) {
              actions.setValue(entry.value);
              actions.setCursorPosition(entry.cursorPosition);
            }
          }
        }
        break;

      case 'y':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const entry = redo();
          if (entry) {
            actions.setValue(entry.value);
            actions.setCursorPosition(entry.cursorPosition);
          }
        }
        break;
    }
  }, [actions, onEnter, onTab, onClose, onArrowNav, safeTimeout,
    autoCompleteState.showSuggestions, autoCompleteActions, undo, redo]);

  // Sync selection changes
  const handleSelect = useCallback(() => {
    const input = inputRef.current;
    if (!input || isComposingRef.current || !stateRef.current.isEditing) return;

    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;

    if (start !== end) {
      actions.setTextSelection(start, end);
    } else {
      actions.setCursorPosition(start);
    }
  }, [actions]);

  // Handle blur
  const handleBlur = useCallback((e: React.FocusEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (relatedTarget?.dataset?.editComponent || relatedTarget?.dataset?.cellEditor) {
      return;
    }

    safeTimeout(() => {
      if (!document.activeElement?.closest('[data-edit-component]') &&
          !document.activeElement?.closest('[data-cell-editor]')) {
        actions.confirmEdit();
        onClose?.();
      }
    }, 0);
  }, [actions, onClose, safeTimeout]);

  // Don't render if not editing
  if (!state.isEditing) {
    return null;
  }

  // Calculate scaled dimensions for zoom
  const scaledFontSize = Math.round(12 * zoom);
  const scaledPadding = Math.round(4 * zoom);
  const scaledBorderWidth = Math.max(1, Math.round(2 * zoom));

  // Border color based on mode
  const borderColor = state.mode === 'point' ? '#34a853' : '#1a73e8';

  // Editor styles
  const editorStyle: React.CSSProperties = {
    position: 'absolute',
    left: cellPosition.x,
    top: cellPosition.y,
    minWidth: inputWidth,
    height: cellPosition.height,
    zIndex,
    boxSizing: 'border-box',
  };

  return (
    <>
      {/* Hidden measurement span */}
      <span
        ref={measureRef}
        style={{
          position: 'absolute',
          visibility: 'hidden',
          whiteSpace: 'pre',
          fontFamily: 'Arial, sans-serif',
          fontSize: `${scaledFontSize}px`,
          padding: `0 ${scaledPadding}px`,
        }}
        aria-hidden="true"
      >
        {state.value || ' '}
      </span>

      {/* Editor container */}
      <div
        ref={containerRef}
        className="cell-editor-overlay"
        style={editorStyle}
        data-edit-component="cell-editor"
        data-mode={state.mode}
        data-merged={isMergedCell}
      >
        <input
          ref={inputRef}
          type="text"
          className="cell-editor-input"
          value={state.value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onSelect={handleSelect}
          onBlur={handleBlur}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-cell-editor="true"
          data-edit-component="cell-editor-input"
          aria-label={`Editing cell ${state.editingCell ? `column ${state.editingCell.col + 1}, row ${state.editingCell.row + 1}` : ''}`}
          style={{
            width: '100%',
            height: '100%',
            border: `${scaledBorderWidth}px solid ${borderColor}`,
            borderRadius: 0,
            outline: 'none',
            padding: `0 ${scaledPadding}px`,
            fontFamily: 'Arial, sans-serif',
            fontSize: `${scaledFontSize}px`,
            lineHeight: `${Math.max(16 * zoom, cellPosition.height - scaledBorderWidth * 2)}px`,
            backgroundColor: 'white',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            boxSizing: 'border-box',
          }}
        />

        {/* Mode indicator */}
        {state.mode !== 'edit' && (
          <div
            className="cell-editor-mode-indicator"
            style={{
              position: 'absolute',
              top: -18 * zoom,
              left: 0,
              fontSize: `${Math.round(10 * zoom)}px`,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              color: borderColor,
              backgroundColor: 'white',
              padding: `${Math.round(1 * zoom)}px ${Math.round(4 * zoom)}px`,
              borderRadius: `${Math.round(2 * zoom)}px`,
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
              textTransform: 'uppercase',
              fontWeight: 500,
              letterSpacing: '0.5px',
            }}
          >
            {state.mode === 'point' ? 'Point' : 'Enter'}
          </div>
        )}

        {/* Undo/Redo indicator (subtle) */}
        {(canUndo || canRedo) && (
          <div
            style={{
              position: 'absolute',
              top: -18 * zoom,
              right: 0,
              fontSize: `${Math.round(9 * zoom)}px`,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              color: '#888',
              backgroundColor: 'white',
              padding: `${Math.round(1 * zoom)}px ${Math.round(3 * zoom)}px`,
              borderRadius: `${Math.round(2 * zoom)}px`,
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
            }}
          >
            {canUndo && <span title="Undo: Ctrl+Z">↶</span>}
            {canUndo && canRedo && ' '}
            {canRedo && <span title="Redo: Ctrl+Y">↷</span>}
          </div>
        )}

        {/* Formula auto-complete */}
        {enableAutoComplete && state.isFormula && (
          <FormulaHintsPanel
            state={autoCompleteState}
            actions={autoCompleteActions}
            position={{ x: 0, y: cellPosition.height + 2 }}
            zIndex={zIndex + 1}
          />
        )}
      </div>
    </>
  );
});

CellEditorOverlay.displayName = 'CellEditorOverlay';

export default CellEditorOverlay;
