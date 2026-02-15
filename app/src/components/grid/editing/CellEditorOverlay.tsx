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
  useSyncExternalStore,
} from 'react';
import type { EditModeState, EditModeActions } from './useEditMode';
import { useFormulaAutoComplete } from './useFormulaAutoComplete';
import type { AcceptResult } from './useFormulaAutoComplete';
import { FormulaHintsPanel } from './FormulaHintsPanel';
import type { EditModeManager } from '../../../../../engine/core/editing/EditModeManager';

// =============================================================================
// Constants
// =============================================================================

/**
 * Characters that trigger Point mode in formulas (Excel-exact behavior)
 */
const POINT_MODE_TRIGGERS = new Set([
  '=', '+', '-', '*', '/', '(', ',', ':', '^', '&', '<', '>', ';'
]);

// REMOVED: MAX_EDIT_HISTORY, UNDO_DEBOUNCE_MS - no longer needed (no internal undo/redo)

// =============================================================================
// Types
// =============================================================================

export interface CellEditorOverlayProps {
  /** Edit state from useEditMode hook (legacy, will be replaced by EditSession) */
  state: EditModeState;
  /** Edit actions from useEditMode hook */
  actions: EditModeActions;
  /** EditModeManager instance for EditSession subscription (optional for migration) */
  manager?: EditModeManager;
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
  /** Height of virtual keyboard in CSS px (0 when closed) */
  keyboardHeight?: number;
}

// REMOVED: EditHistoryEntry interface - no longer needed (no internal undo/redo)

// =============================================================================
// Styles (injected once)
// =============================================================================

// Editor styles (caret, selection, focus pulse) moved to index.css — themed via CSS custom properties

// =============================================================================
// REMOVED: useEditHistory hook
// =============================================================================
// Internal undo/redo has been removed - use browser's native undo/redo instead.
// EditSession in EditModeManager now tracks isDirty state.

// =============================================================================
// Component
// =============================================================================

export const CellEditorOverlay: React.FC<CellEditorOverlayProps> = memo(({
  state,
  actions,
  manager,
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
  keyboardHeight = 0,
}) => {
  // =============================================================================
  // EditSession Subscription (New Pattern - React 18)
  // =============================================================================

  // Subscribe to EditSession from EditModeManager (single source of truth)
  const editSession = useSyncExternalStore(
    manager?.subscribe ?? (() => () => {}), // Subscribe function
    manager?.getSnapshot ?? (() => null)     // Get current snapshot
  );

  // TODO: Use editSession for composition state, cursor sync, and dirty tracking
  // For now, just ensure it's available for future use
  void editSession;

  // =============================================================================
  // Refs and Local State
  // =============================================================================

  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRefs = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const [inputWidth, setInputWidth] = useState(cellPosition.width);
  const selectionBeforeResizeRef = useRef<{ start: number; end: number } | null>(null);
  const cursorSyncRafRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const hasCommittedRef = useRef(false);
  const lastModeCycleRef = useRef(0);

  // IME composition tracking (TODO: migrate to EditSession.isComposing)
  const isComposingRef = useRef(false);

  // Ref for state to avoid stale closures in stable callbacks
  const stateRef = useRef(state);
  stateRef.current = state;

  // REMOVED: useEditHistory hook - EditSession now tracks isDirty
  // NOTE: Internal undo/redo removed - use browser's native undo/redo (Ctrl+Z/Ctrl+Y)

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

  // Cleanup timeouts and rAFs on unmount
  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach((id) => clearTimeout(id));
      timeoutRefs.current.clear();
      if (cursorSyncRafRef.current) {
        cancelAnimationFrame(cursorSyncRafRef.current);
        cursorSyncRafRef.current = null;
      }
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
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

  // Reset commit guard when editing starts
  useEffect(() => {
    if (state.isEditing) {
      hasCommittedRef.current = false;
    }
  }, [state.isEditing]);

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
  // PERFORMANCE: Only check on edit start (state.isEditing change), not on every cursor move
  // Removed cellPosition from deps to avoid getBoundingClientRect() in hot path (60+ calls/sec)
  useEffect(() => {
    if (state.isEditing && onScrollIntoView && containerRef.current) {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const effectiveViewportHeight = window.innerHeight - keyboardHeight;
        const viewportWidth = window.innerWidth;

        const isOffScreen =
          rect.top < 0 ||
          rect.left < 0 ||
          rect.bottom > effectiveViewportHeight ||
          rect.right > viewportWidth;

        if (isOffScreen) {
          onScrollIntoView({
            x: cellPosition.x,
            y: cellPosition.y,
            width: inputWidth,
            height: cellPosition.height,
          });
        }
      });
    }

    return () => {
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [state.isEditing, onScrollIntoView, keyboardHeight]); // cellPosition removed - only scroll check on edit start

  // Measure text and adjust width (preserving selection)
  // PERFORMANCE: Debounced to 50ms to avoid offsetWidth reads on every keystroke
  useEffect(() => {
    if (measureRef.current) {
      const measureWidth = () => {
        if (!measureRef.current) return;

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
      };

      // Debounce measurement to max 20Hz (50ms) to reduce layout reads
      const timeoutId = setTimeout(measureWidth, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [state.value, cellPosition.width, minWidth, maxWidth, zoom, inputWidth, safeTimeout]);

  // Handle input change with Point mode trigger
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (isComposingRef.current) return;

    const newValue = e.target.value;
    const oldValue = stateRef.current.value;
    const cursorPos = e.target.selectionStart ?? newValue.length;

    actions.setValue(newValue);

    // Check for Point mode trigger (Excel-like formula editing)
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
  }, [actions]);

  // IME composition handlers
  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback((e: React.CompositionEvent<HTMLInputElement>) => {
    isComposingRef.current = false;
    const value = (e.target as HTMLInputElement).value;
    actions.setValue(value);
  }, [actions]);

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
        if (!hasCommittedRef.current) {
          const enterResult = actions.confirmEdit();
          if (enterResult) {
            hasCommittedRef.current = true;
            onEnter?.(e.shiftKey);
            onClose?.();
          }
        }
        break;

      case 'Tab':
        e.preventDefault();
        if (!hasCommittedRef.current) {
          const tabResult = actions.confirmEdit();
          if (tabResult) {
            hasCommittedRef.current = true;
            onTab?.(e.shiftKey);
            onClose?.();
          }
        }
        break;

      case 'Escape':
        e.preventDefault();
        if (!hasCommittedRef.current) {
          hasCommittedRef.current = true;
          actions.cancelEdit();
          onClose?.();
        }
        break;

      case 'F2': {
        e.preventDefault();
        const now = performance.now();
        if (now - lastModeCycleRef.current > 200) {
          lastModeCycleRef.current = now;
          actions.cycleMode();
        }
        break;
      }

      case 'ArrowLeft':
        if (currentState.mode === 'edit') {
          // rAF collapses rapid key-repeat into one cursor sync per frame
          if (cursorSyncRafRef.current) cancelAnimationFrame(cursorSyncRafRef.current);
          cursorSyncRafRef.current = requestAnimationFrame(() => {
            cursorSyncRafRef.current = null;
            if (inputRef.current) {
              actions.setCursorPosition(inputRef.current.selectionStart ?? 0);
            }
          });
        } else if (currentState.mode === 'enter') {
          e.preventDefault();
          if (!hasCommittedRef.current) {
            hasCommittedRef.current = true;
            actions.confirmEdit();
            onArrowNav?.('left');
            onClose?.();
          }
        } else if (currentState.mode === 'point') {
          e.preventDefault();
          onArrowNav?.('left');
        }
        break;

      case 'ArrowRight':
        if (currentState.mode === 'edit') {
          if (cursorSyncRafRef.current) cancelAnimationFrame(cursorSyncRafRef.current);
          cursorSyncRafRef.current = requestAnimationFrame(() => {
            cursorSyncRafRef.current = null;
            if (inputRef.current) {
              actions.setCursorPosition(inputRef.current.selectionStart ?? 0);
            }
          });
        } else if (currentState.mode === 'enter') {
          e.preventDefault();
          if (!hasCommittedRef.current) {
            hasCommittedRef.current = true;
            actions.confirmEdit();
            onArrowNav?.('right');
            onClose?.();
          }
        } else if (currentState.mode === 'point') {
          e.preventDefault();
          onArrowNav?.('right');
        }
        break;

      case 'ArrowUp':
        if (currentState.mode === 'enter' || currentState.mode === 'point') {
          e.preventDefault();
          if (currentState.mode === 'enter') {
            if (!hasCommittedRef.current) {
              hasCommittedRef.current = true;
              actions.confirmEdit();
              onArrowNav?.('up');
              onClose?.();
            }
          } else {
            onArrowNav?.('up');
          }
        }
        break;

      case 'ArrowDown':
        if (currentState.mode === 'enter' || currentState.mode === 'point') {
          e.preventDefault();
          if (currentState.mode === 'enter') {
            if (!hasCommittedRef.current) {
              hasCommittedRef.current = true;
              actions.confirmEdit();
              onArrowNav?.('down');
              onClose?.();
            }
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

      // REMOVED: Internal undo/redo (Ctrl+Z, Ctrl+Y) - use browser's native undo/redo instead
      // Browser's contentEditable undo/redo will work automatically with the input element
    }
  }, [actions, onEnter, onTab, onClose, onArrowNav,
    autoCompleteState.showSuggestions, autoCompleteActions]);

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

  // Handle blur - guards against IME composition and stale double-fires
  const handleBlur = useCallback((e: React.FocusEvent) => {
    // Don't process blur during IME composition — wait for compositionend
    if (isComposingRef.current) return;

    const relatedTarget = e.relatedTarget as HTMLElement | null;

    // Check if blur is due to clicking an element that preserves edit
    if (relatedTarget?.dataset?.editComponent || relatedTarget?.dataset?.cellEditor) {
      return;
    }

    // NEW: Check if clicking a toolbar button or dropdown that preserves edit
    const preserveEditElement = relatedTarget?.closest('[data-preserve-edit]');
    if (preserveEditElement) {
      // Toolbar/formatting button clicked - preserve edit session
      return;
    }

    safeTimeout(() => {
      // Re-check composition (may have started between blur and timeout)
      if (isComposingRef.current) return;
      // Guard against double-commit (Enter/Tab/Escape may have already committed)
      if (hasCommittedRef.current) return;

      // Check if focus moved to a preserve-edit element
      const activePreserveEdit = document.activeElement?.closest('[data-preserve-edit]');
      if (activePreserveEdit) {
        return;
      }

      if (!document.activeElement?.closest('[data-edit-component]') &&
          !document.activeElement?.closest('[data-cell-editor]')) {
        hasCommittedRef.current = true;
        actions.confirmEdit();
        onClose?.();
      }
    }, 100); // 100ms delay to ensure toolbar onClick handlers fire first
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
  const borderColor = state.mode === 'point' ? 'var(--color-mode-point)' : 'var(--color-mode-edit)';

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
          maxLength={32767}
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
            backgroundColor: 'var(--color-bg-primary)',
            boxShadow: 'var(--shadow-md)',
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
              backgroundColor: 'var(--color-bg-primary)',
              padding: `${Math.round(1 * zoom)}px ${Math.round(4 * zoom)}px`,
              borderRadius: `${Math.round(2 * zoom)}px`,
              boxShadow: 'var(--shadow-sm)',
              textTransform: 'uppercase',
              fontWeight: 500,
              letterSpacing: '0.5px',
            }}
          >
            {state.mode === 'point' ? 'Point' : 'Enter'}
          </div>
        )}

        {/* REMOVED: Internal undo/redo UI - use browser's native undo/redo instead */}

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
