/**
 * FormulaBar - Excel-style formula bar above the grid
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                           FORMULA BAR                                   │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │                                                                         │
 * │   ┌──────────┬───────────────────────────────────────────────────────┐  │
 * │   │   A1     │ =SUM(B1:B10) + AVERAGE(C1:C10)                        │  │
 * │   │ Name Box │              Formula Input                             │  │
 * │   └──────────┴───────────────────────────────────────────────────────┘  │
 * │                                                                         │
 * │   Features:                                                             │
 * │   - Name box shows current cell address                                 │
 * │   - Formula input shows/edits cell content                              │
 * │   - Expands for multiline content                                       │
 * │   - Function hints and autocomplete                                     │
 * │   - Syncs with CellEditorOverlay (same EditModeManager)                 │
 * │                                                                         │
 * │   When editing:                                                         │
 * │   - Both FormulaBar and CellEditorOverlay show same content             │
 * │   - Focus can switch between them                                       │
 * │   - Changes sync immediately                                            │
 * │                                                                         │
 * └─────────────────────────────────────────────────────────────────────────┘
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
 * Defined at module level to avoid recreation on every render
 */
const POINT_MODE_TRIGGERS = new Set([
  '=', '+', '-', '*', '/', '(', ',', ':', '^', '&', '<', '>', ';'
]);

// REMOVED: MAX_EDIT_HISTORY, UNDO_DEBOUNCE_MS - no longer needed (no internal undo/redo)

// Editor styles (caret, selection) moved to index.css — themed via CSS custom properties

// =============================================================================
// Types
// =============================================================================

export interface FormulaBarProps {
  /** Edit state from useEditMode hook (legacy, will be replaced by EditSession) */
  state: EditModeState;
  /** Edit actions from useEditMode hook */
  actions: EditModeActions;
  /** EditModeManager instance for EditSession subscription (optional for migration) */
  manager?: EditModeManager;
  /** Active cell address for name box */
  activeCellAddress: string;
  /** Active cell value (when not editing) */
  activeCellValue?: string;
  /** Active cell reference for starting edit */
  activeCell?: { row: number; col: number } | null;
  /** Height of the formula bar */
  height?: number;
  /** Whether to show expand button for multiline */
  showExpandButton?: boolean;
  /** Callback when name box is clicked */
  onNameBoxClick?: () => void;
  /** Callback when formula bar receives focus */
  onFocus?: () => void;
  /** Callback when Enter is pressed */
  onEnter?: (shift: boolean) => void;
  /** Callback when Tab is pressed */
  onTab?: (shift: boolean) => void;
  /** Callback when escape pressed and edit cancelled */
  onCancel?: () => void;
  /** Function hints to display (legacy - use auto-complete instead) */
  functionHint?: FunctionHint | null;
  /** Whether to enable formula auto-complete (default: true) */
  enableAutoComplete?: boolean;
}

export interface FunctionHint {
  /** Function name */
  name: string;
  /** Function description */
  description: string;
  /** Argument descriptions */
  arguments: Array<{
    name: string;
    description: string;
    optional?: boolean;
  }>;
  /** Currently active argument index */
  activeArgumentIndex?: number;
}

// REMOVED: EditHistoryEntry interface - no longer needed (no internal undo/redo)

// =============================================================================
// REMOVED: useEditHistory hook
// =============================================================================
// Internal undo/redo has been removed - use browser's native undo/redo instead.
// EditSession in EditModeManager now tracks isDirty state.

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Name Box - Shows current cell address
 */
const NameBox: React.FC<{
  address: string;
  onClick?: () => void;
}> = memo(({ address, onClick }) => (
  <div
    className="formula-bar-namebox"
    role="button"
    tabIndex={0}
    aria-label={`Name box: ${address}`}
    onClick={onClick}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.();
      }
    }}
    style={{
      width: 60,
      minWidth: 60,
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRight: '1px solid var(--color-border-primary, #e2e8f0)',
      fontFamily: 'var(--font-family-ui, sans-serif)',
      fontSize: '12px',
      fontWeight: 500,
      color: 'var(--color-text-primary, #1e293b)',
      backgroundColor: 'var(--color-bg-secondary, #f8fafc)',
      cursor: 'pointer',
      userSelect: 'none',
    }}
  >
    {address}
  </div>
));

NameBox.displayName = 'NameBox';

/**
 * Function Hint Tooltip
 */
const FunctionHintTooltip: React.FC<{
  hint: FunctionHint;
}> = memo(({ hint }) => (
  <div
    className="formula-bar-function-hint"
    style={{
      position: 'absolute',
      top: '100%',
      left: 60,
      marginTop: 4,
      padding: '8px 12px',
      backgroundColor: 'var(--color-bg-surface)',
      border: '1px solid var(--color-border-primary, #e2e8f0)',
      borderRadius: 4,
      boxShadow: 'var(--shadow-dropdown)',
      zIndex: 1000,
      maxWidth: 400,
      fontFamily: 'var(--font-family-ui, sans-serif)',
      fontSize: '12px',
    }}
  >
    {/* Function signature */}
    <div style={{ fontWeight: 600, marginBottom: 4 }}>
      <span style={{ color: 'var(--color-accent)' }}>{hint.name}</span>
      <span style={{ color: 'var(--color-text-secondary)' }}>(</span>
      {hint.arguments.map((arg, i) => (
        <span key={arg.name}>
          {i > 0 && <span style={{ color: 'var(--color-text-secondary)' }}>, </span>}
          <span
            style={{
              color: i === hint.activeArgumentIndex ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              fontWeight: i === hint.activeArgumentIndex ? 600 : 400,
              textDecoration: arg.optional ? 'underline dotted' : 'none',
            }}
          >
            {arg.name}
          </span>
        </span>
      ))}
      <span style={{ color: 'var(--color-text-secondary)' }}>)</span>
    </div>

    {/* Function description */}
    <div style={{ color: 'var(--color-text-secondary)', marginBottom: 4 }}>
      {hint.description}
    </div>

    {/* Active argument description */}
    {hint.activeArgumentIndex !== undefined && hint.arguments[hint.activeArgumentIndex] && (
      <div style={{ color: 'var(--color-accent)', fontStyle: 'italic' }}>
        {hint.arguments[hint.activeArgumentIndex].name}:{' '}
        {hint.arguments[hint.activeArgumentIndex].description}
      </div>
    )}
  </div>
));

FunctionHintTooltip.displayName = 'FunctionHintTooltip';

// =============================================================================
// Main Component
// =============================================================================

/**
 * FormulaBar - Formula input bar with name box
 *
 * Usage:
 * ```tsx
 * const { state, actions } = useEditMode({ ... });
 *
 * <FormulaBar
 *   state={state}
 *   actions={actions}
 *   activeCellAddress={formatCellAddress(activeRow, activeCol)}
 *   activeCellValue={getCellDisplayValue(activeRow, activeCol)}
 *   onEnter={(shift) => navigate(shift ? 'up' : 'down')}
 * />
 * ```
 */
export const FormulaBar: React.FC<FormulaBarProps> = memo(({
  state,
  actions,
  manager,
  activeCellAddress,
  activeCellValue = '',
  activeCell,
  height = 28,
  showExpandButton = false,
  onNameBoxClick,
  onFocus,
  onEnter,
  onTab,
  onCancel,
  functionHint,
  enableAutoComplete = true,
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
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref mirrors state to avoid stale closures in rapid-fire callbacks
  const stateRef = useRef(state);
  stateRef.current = state;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  // IME composition tracking (TODO: migrate to EditSession.isComposing)
  const isComposingRef = useRef(false);
  const hasCommittedRef = useRef(false);

  // REMOVED: useEditHistory hook - EditSession now tracks isDirty
  // NOTE: Internal undo/redo removed - use browser's native undo/redo (Ctrl+Z/Ctrl+Y)

  // Formula auto-complete hook
  const handleAutoCompleteAccept = useCallback((result: AcceptResult) => {
    // Replace the current token with the accepted suggestion
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
    enabled: enableAutoComplete && state.isEditing && state.isFormula && isFocused,
    debounceMs: 50,
    onAccept: handleAutoCompleteAccept,
  });

  // Reset commit guard when editing starts
  useEffect(() => {
    if (state.isEditing) {
      hasCommittedRef.current = false;
    }
  }, [state.isEditing]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  // Display value: editing value or cell value
  const displayValue = state.isEditing ? state.value : activeCellValue;

  // Track if we've synced selection after focus to avoid re-running on cursor changes
  const hasSyncedSelectionRef = useRef(false);

  // Sync selection when focus comes to formula bar
  // Note: Only run when isFocused or isEditing changes, NOT on cursor/selection changes
  // This prevents fighting with user input and flickering
  useEffect(() => {
    if (isFocused && state.isEditing && inputRef.current) {
      // Only sync selection once when focus arrives
      if (!hasSyncedSelectionRef.current) {
        hasSyncedSelectionRef.current = true;
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
      // Reset when focus leaves or editing ends
      hasSyncedSelectionRef.current = false;
    }
  }, [isFocused, state.isEditing]); // Intentionally exclude cursor/selection to avoid re-running

  // Handle input change with Point mode trigger detection
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (isComposingRef.current) return;

    const newValue = e.target.value;
    const oldValue = stateRef.current.value;
    const currentMode = stateRef.current.mode;
    const cursorPos = e.target.selectionStart ?? newValue.length;

    actions.setValue(newValue);

    // Check for Point mode trigger (operator typed in a formula)
    if (
      newValue.startsWith('=') &&
      newValue.length > oldValue.length &&
      currentMode === 'edit' &&
      cursorPos > 0
    ) {
      const addedChar = newValue[cursorPos - 1];

      if (addedChar !== undefined && POINT_MODE_TRIGGERS.has(addedChar)) {
        actions.setMode('point');
      }
    }
  }, [actions]);

  // Handle focus — uses stateRef to avoid re-creating closure on every isEditing change
  const handleFocus = useCallback(() => {
    setIsFocused(true);
    actions.setFormulaBarFocused(true);

    // If not editing but have an active cell, start editing
    if (!stateRef.current.isEditing && activeCell) {
      actions.startEditing(activeCell, activeCellValue);
    }

    onFocus?.();
  }, [activeCell, actions, activeCellValue, onFocus]);

  // Handle blur - guards against IME composition and stale double-fires
  const handleBlur = useCallback((e: React.FocusEvent) => {
    setIsFocused(false);
    actions.setFormulaBarFocused(false);

    // Don't process blur during IME composition — wait for compositionend
    if (isComposingRef.current) return;

    // Check if focus moved to cell editor or another edit component
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (relatedTarget?.dataset?.editComponent || relatedTarget?.dataset?.cellEditor) {
      return;
    }

    // If clicking outside, confirm edit after small delay
    // to allow click handling on other elements
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
    }
    blurTimeoutRef.current = setTimeout(() => {
      blurTimeoutRef.current = null;
      // Re-check composition (may have started between blur and timeout)
      if (isComposingRef.current) return;
      // Guard against double-commit (Enter/Tab/Escape may have already committed)
      if (hasCommittedRef.current) return;
      if (!document.activeElement?.closest('[data-edit-component]') &&
          !document.activeElement?.closest('[data-cell-editor]')) {
        if (stateRef.current.isEditing) {
          hasCommittedRef.current = true;
          actions.confirmEdit();
        }
      }
    }, 0);
  }, [actions]);

  // Handle composition events (IME) - uses ref for synchronous guard
  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback((e: React.CompositionEvent<HTMLInputElement>) => {
    isComposingRef.current = false;
    const value = (e.target as HTMLInputElement).value;
    actions.setValue(value);
  }, [actions]);

  // Handle key events - uses refs for IME guard, hasCommittedRef for repeat guard
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isComposingRef.current) return;

    // Handle auto-complete navigation first when suggestions are visible
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
          // Accept the selected suggestion
          const accepted = autoCompleteActions.acceptSuggestion();
          if (accepted) {
            e.preventDefault();
            return;
          }
          // If no suggestion accepted, fall through to normal behavior
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
        if (stateRef.current.isEditing && !hasCommittedRef.current) {
          hasCommittedRef.current = true;
          actions.confirmEdit();
          onEnter?.(e.shiftKey);
        }
        break;

      case 'Tab':
        e.preventDefault();
        if (stateRef.current.isEditing && !hasCommittedRef.current) {
          hasCommittedRef.current = true;
          actions.confirmEdit();
          onTab?.(e.shiftKey);
        }
        break;

      case 'Escape':
        e.preventDefault();
        if (stateRef.current.isEditing && !hasCommittedRef.current) {
          hasCommittedRef.current = true;
          actions.cancelEdit();
          onCancel?.();
        }
        break;

      case 'F2':
        e.preventDefault();
        if (stateRef.current.isEditing) {
          actions.cycleMode();
        }
        break;

      case 'a':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          actions.selectAll();
        }
        break;
    }
  }, [actions, onEnter, onTab, onCancel, autoCompleteState.showSuggestions, autoCompleteActions]);

  // Sync selection changes from native input
  const handleSelect = useCallback(() => {
    const input = inputRef.current;
    if (!input || isComposingRef.current || !state.isEditing) return;

    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;

    if (start !== end) {
      actions.setTextSelection(start, end);
    } else {
      actions.setCursorPosition(start);
    }
  }, [actions, state.isEditing]);

  // Handle expand toggle
  const handleExpandToggle = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  // Container styles
  const containerStyle: React.CSSProperties = {
    height: isExpanded ? 'auto' : height,
    minHeight: height,
    display: 'flex',
    alignItems: 'stretch',
    borderBottom: '1px solid var(--color-border-primary, #e2e8f0)',
    backgroundColor: 'var(--color-bg-primary, #ffffff)',
    position: 'relative',
  };

  // Input container styles
  const inputContainerStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    padding: '0 8px',
    position: 'relative',
  };

  // Input styles
  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: isExpanded ? 'auto' : '100%',
    minHeight: isExpanded ? 60 : 'auto',
    border: 'none',
    outline: 'none',
    fontFamily: 'var(--font-family-cell, Arial, sans-serif)',
    fontSize: '12px',
    color: 'var(--color-text-primary, #1e293b)',
    backgroundColor: 'transparent',
    resize: isExpanded ? 'vertical' : 'none',
  };

  // Mode indicator color
  const getModeIndicatorColor = () => {
    if (!state.isEditing) return 'transparent';
    switch (state.mode) {
      case 'edit': return 'var(--color-mode-edit)';
      case 'enter': return 'var(--color-mode-enter)';
      case 'point': return 'var(--color-mode-point)';
      default: return 'transparent';
    }
  };

  return (
    <div
      className="formula-bar"
      style={containerStyle}
      data-edit-component="formula-bar"
      data-mode={state.isEditing ? state.mode : undefined}
    >
      {/* Name Box */}
      <NameBox address={activeCellAddress} onClick={onNameBoxClick} />

      {/* Function button (fx) */}
      <div
        className="formula-bar-fx"
        style={{
          width: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRight: '1px solid var(--color-border-primary, #e2e8f0)',
          fontStyle: 'italic',
          fontWeight: 600,
          fontSize: '11px',
          color: 'var(--color-text-secondary, #64748b)',
          cursor: 'pointer',
        }}
        title="Insert function"
      >
        fx
      </div>

      {/* Mode indicator bar */}
      <div
        className="formula-bar-mode-indicator"
        style={{
          width: 3,
          backgroundColor: getModeIndicatorColor(),
          transition: 'background-color 150ms ease',
        }}
      />

      {/* Input container */}
      <div style={inputContainerStyle}>
        <input
          ref={inputRef}
          type="text"
          className="formula-bar-input"
          value={displayValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onSelect={handleSelect}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          maxLength={32767}
          placeholder={state.isEditing ? '' : 'Select a cell to see its value'}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-cell-editor="true"
          data-edit-component="formula-bar-input"
          aria-label="Formula bar"
          style={inputStyle}
        />

        {/* Expand button */}
        {showExpandButton && (
          <button
            className="formula-bar-expand"
            onClick={handleExpandToggle}
            style={{
              width: 20,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-secondary, #64748b)',
              fontSize: '10px',
            }}
            title={isExpanded ? 'Collapse formula bar' : 'Expand formula bar'}
          >
            {isExpanded ? '▲' : '▼'}
          </button>
        )}
      </div>

      {/* Legacy function hint tooltip (kept for backwards compatibility) */}
      {functionHint && state.isEditing && state.isFormula && !enableAutoComplete && (
        <FunctionHintTooltip hint={functionHint} />
      )}

      {/* Formula auto-complete hints panel */}
      {enableAutoComplete && state.isEditing && state.isFormula && isFocused && (
        <FormulaHintsPanel
          state={autoCompleteState}
          actions={autoCompleteActions}
          position={{ x: 85, y: height + 4 }}
          zIndex={1000}
        />
      )}
    </div>
  );
});

FormulaBar.displayName = 'FormulaBar';

// =============================================================================
// Exports
// =============================================================================

export default FormulaBar;
