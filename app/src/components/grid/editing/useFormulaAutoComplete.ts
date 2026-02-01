/**
 * useFormulaAutoComplete - React hook for formula auto-complete functionality
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                      FORMULA AUTO-COMPLETE HOOK                             │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │                                                                             │
 * │   User Types Formula                                                        │
 * │       │                                                                     │
 * │       │ value changes                                                       │
 * │       ▼                                                                     │
 * │   ┌─────────────────────────────────────────────────────────────────────┐   │
 * │   │              useFormulaAutoComplete Hook                            │   │
 * │   │  ┌─────────────────────────────────────────────────────────────┐   │   │
 * │   │  │  1. Debounce rapid typing (configurable delay)             │   │   │
 * │   │  │  2. Call FormulaAutoComplete.analyze()                     │   │   │
 * │   │  │  3. Get suggestions and argument hints                     │   │   │
 * │   │  │  4. Track selected suggestion for keyboard navigation      │   │   │
 * │   │  └─────────────────────────────────────────────────────────────┘   │   │
 * │   └───────────────────────────────────────────────────────────────────────┘ │
 * │             │                                                               │
 * │             ▼                                                               │
 * │   ┌───────────────────────────────────────────────────────────────────────┐ │
 * │   │              FormulaHintsPanel                                        │ │
 * │   │  - Function suggestions list with keyboard navigation                 │ │
 * │   │  - Argument hint with highlighted current parameter                   │ │
 * │   │  - Function description and examples                                  │ │
 * │   └───────────────────────────────────────────────────────────────────────┘ │
 * │                                                                             │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * Features:
 * - Debounced analysis for smooth rapid typing (no jank)
 * - rAF-based state updates to avoid layout thrashing
 * - Memory-safe cleanup on unmount
 * - Keyboard navigation of suggestions
 * - Accept suggestion with Enter/Tab
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FormulaAutoComplete } from '../../../../../engine/core/editing/FormulaAutoComplete';
import type {
  FormulaContext,
  FunctionSuggestion,
  ArgumentHint,
} from '../../../../../engine/core/editing/FormulaAutoComplete';

// =============================================================================
// Types
// =============================================================================

export interface FormulaAutoCompleteState {
  /** Whether suggestions should be visible */
  showSuggestions: boolean;
  /** List of function suggestions */
  suggestions: FunctionSuggestion[];
  /** Currently selected suggestion index */
  selectedIndex: number;
  /** Argument hint for current function (if any) */
  argumentHint: ArgumentHint | null;
  /** The formula context from analysis */
  context: FormulaContext | null;
  /** Whether we're currently analyzing (for loading states) */
  isAnalyzing: boolean;
}

export interface FormulaAutoCompleteActions {
  /** Move selection up in suggestions list */
  selectPrevious: () => void;
  /** Move selection down in suggestions list */
  selectNext: () => void;
  /** Set the selected index directly (for mouse hover) */
  setSelectedIndex: (index: number) => void;
  /** Accept the currently selected suggestion */
  acceptSuggestion: () => AcceptResult | null;
  /** Accept suggestion at specific index */
  acceptSuggestionAt: (index: number) => AcceptResult | null;
  /** Dismiss suggestions without accepting */
  dismiss: () => void;
  /** Force re-analyze (e.g., after external change) */
  forceAnalyze: () => void;
}

export interface AcceptResult {
  /** Text to insert (replaces the current token) */
  insertText: string;
  /** Cursor position offset from start of inserted text */
  cursorOffset: number;
  /** Length of text to replace (the current token length) */
  replaceLength: number;
  /** Position where replacement starts */
  replaceStart: number;
}

export interface UseFormulaAutoCompleteOptions {
  /** Formula text being edited */
  formula: string;
  /** Cursor position in the formula */
  cursorPosition: number;
  /** Whether auto-complete is enabled */
  enabled?: boolean;
  /** Debounce delay in milliseconds (default: 50ms for responsiveness) */
  debounceMs?: number;
  /** Minimum token length to show suggestions (default: 1) */
  minTokenLength?: number;
  /** Maximum suggestions to show (default: 8) */
  maxSuggestions?: number;
  /** Callback when a suggestion is accepted */
  onAccept?: (result: AcceptResult) => void;
}

export interface UseFormulaAutoCompleteReturn {
  state: FormulaAutoCompleteState;
  actions: FormulaAutoCompleteActions;
}

// =============================================================================
// Singleton Auto-Complete Instance
// =============================================================================

let autoCompleteInstance: FormulaAutoComplete | null = null;

function getAutoComplete(): FormulaAutoComplete {
  if (!autoCompleteInstance) {
    autoCompleteInstance = new FormulaAutoComplete();
  }
  return autoCompleteInstance;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * React hook for formula auto-complete functionality
 *
 * Usage:
 * ```tsx
 * const { state, actions } = useFormulaAutoComplete({
 *   formula: editState.value,
 *   cursorPosition: editState.cursorPosition,
 *   enabled: editState.isFormula,
 *   onAccept: (result) => {
 *     // Insert the accepted text
 *     editActions.setValue(
 *       formula.slice(0, result.replaceStart) +
 *       result.insertText +
 *       formula.slice(result.replaceStart + result.replaceLength)
 *     );
 *     editActions.setCursorPosition(result.replaceStart + result.cursorOffset);
 *   },
 * });
 *
 * // Handle keyboard in editor
 * const handleKeyDown = (e) => {
 *   if (state.showSuggestions) {
 *     if (e.key === 'ArrowDown') { actions.selectNext(); e.preventDefault(); }
 *     if (e.key === 'ArrowUp') { actions.selectPrevious(); e.preventDefault(); }
 *     if (e.key === 'Tab' || e.key === 'Enter') {
 *       const result = actions.acceptSuggestion();
 *       if (result) e.preventDefault();
 *     }
 *     if (e.key === 'Escape') { actions.dismiss(); e.preventDefault(); }
 *   }
 * };
 * ```
 */
export function useFormulaAutoComplete(
  options: UseFormulaAutoCompleteOptions
): UseFormulaAutoCompleteReturn {
  const {
    formula,
    cursorPosition,
    enabled = true,
    debounceMs = 50,
    minTokenLength = 1,
    maxSuggestions = 8,
    onAccept,
  } = options;

  // State
  const [state, setState] = useState<FormulaAutoCompleteState>({
    showSuggestions: false,
    suggestions: [],
    selectedIndex: 0,
    argumentHint: null,
    context: null,
    isAnalyzing: false,
  });

  // Refs for cleanup and stale closure prevention
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const onAcceptRef = useRef(onAccept);
  const latestFormulaRef = useRef(formula);
  const latestCursorRef = useRef(cursorPosition);
  const isMountedRef = useRef(true);
  const stateRef = useRef(state);

  // Keep refs updated
  onAcceptRef.current = onAccept;
  latestFormulaRef.current = formula;
  latestCursorRef.current = cursorPosition;
  stateRef.current = state;

  // Get the auto-complete instance
  const autoComplete = useMemo(() => getAutoComplete(), []);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  // Core analysis function
  const performAnalysis = useCallback(() => {
    if (!isMountedRef.current) return;

    const currentFormula = latestFormulaRef.current;
    const currentCursor = latestCursorRef.current;

    // Analyze the formula
    const context = autoComplete.analyze(currentFormula, currentCursor);

    // Don't show suggestions if not a formula or inside a string
    if (!context.isFormula || context.insideString) {
      setState((prev) => ({
        ...prev,
        showSuggestions: false,
        suggestions: [],
        selectedIndex: 0,
        argumentHint: null,
        context,
        isAnalyzing: false,
      }));
      return;
    }

    // Get suggestions
    const allSuggestions = autoComplete.suggest(context);
    const suggestions = allSuggestions.slice(0, maxSuggestions);

    // Get argument hint
    const argumentHint = autoComplete.getArgumentHint(context);

    // Determine if we should show suggestions
    const showSuggestions =
      suggestions.length > 0 &&
      context.currentToken.length >= minTokenLength &&
      context.typingFunctionName;

    // Update state using rAF to batch with rendering
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
    }

    rafIdRef.current = requestAnimationFrame(() => {
      if (!isMountedRef.current) return;
      rafIdRef.current = null;

      setState((prev) => ({
        showSuggestions,
        suggestions,
        // Reset selection if suggestions changed significantly
        selectedIndex:
          prev.suggestions.length !== suggestions.length ||
          (prev.suggestions[0]?.name !== suggestions[0]?.name)
            ? 0
            : Math.min(prev.selectedIndex, Math.max(0, suggestions.length - 1)),
        argumentHint,
        context,
        isAnalyzing: false,
      }));
    });
  }, [autoComplete, maxSuggestions, minTokenLength]);

  // Debounced analysis effect
  useEffect(() => {
    if (!enabled) {
      // Clear state when disabled
      setState({
        showSuggestions: false,
        suggestions: [],
        selectedIndex: 0,
        argumentHint: null,
        context: null,
        isAnalyzing: false,
      });
      return;
    }

    // Not a formula - clear suggestions but still analyze for context
    if (!formula.startsWith('=')) {
      setState((prev) => ({
        ...prev,
        showSuggestions: false,
        suggestions: [],
        argumentHint: null,
        isAnalyzing: false,
      }));
      return;
    }

    // Mark as analyzing
    setState((prev) => ({ ...prev, isAnalyzing: true }));

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the analysis
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      performAnalysis();
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [formula, cursorPosition, enabled, debounceMs, performAnalysis]);

  // Actions - using refs to avoid stale closure issues
  const actions = useMemo<FormulaAutoCompleteActions>(() => ({
    selectPrevious: () => {
      setState((prev) => {
        if (!prev.showSuggestions || prev.suggestions.length === 0) return prev;
        const newIndex =
          (prev.selectedIndex - 1 + prev.suggestions.length) %
          prev.suggestions.length;
        return { ...prev, selectedIndex: newIndex };
      });
    },

    selectNext: () => {
      setState((prev) => {
        if (!prev.showSuggestions || prev.suggestions.length === 0) return prev;
        const newIndex = (prev.selectedIndex + 1) % prev.suggestions.length;
        return { ...prev, selectedIndex: newIndex };
      });
    },

    setSelectedIndex: (index: number) => {
      setState((prev) => {
        if (!prev.showSuggestions || index < 0 || index >= prev.suggestions.length) {
          return prev;
        }
        return { ...prev, selectedIndex: index };
      });
    },

    acceptSuggestion: () => {
      // Use ref to get current state (avoids stale closure)
      const currentState = stateRef.current;
      if (
        !currentState.showSuggestions ||
        currentState.suggestions.length === 0 ||
        !currentState.context
      ) {
        return null;
      }

      const suggestion = currentState.suggestions[currentState.selectedIndex];
      if (!suggestion) return null;

      const result: AcceptResult = {
        insertText: suggestion.insertText,
        cursorOffset: suggestion.cursorOffset,
        replaceLength: currentState.context.currentToken.length,
        replaceStart: currentState.context.tokenStartPos,
      };

      // Call the onAccept callback
      onAcceptRef.current?.(result);

      // Dismiss suggestions
      setState((prev) => ({
        ...prev,
        showSuggestions: false,
        suggestions: [],
        selectedIndex: 0,
      }));

      return result;
    },

    acceptSuggestionAt: (index: number) => {
      // Use ref to get current state (avoids stale closure)
      const currentState = stateRef.current;
      if (
        !currentState.showSuggestions ||
        index < 0 ||
        index >= currentState.suggestions.length ||
        !currentState.context
      ) {
        return null;
      }

      const suggestion = currentState.suggestions[index];
      if (!suggestion) return null;

      const result: AcceptResult = {
        insertText: suggestion.insertText,
        cursorOffset: suggestion.cursorOffset,
        replaceLength: currentState.context.currentToken.length,
        replaceStart: currentState.context.tokenStartPos,
      };

      // Call the onAccept callback
      onAcceptRef.current?.(result);

      // Dismiss suggestions
      setState((prev) => ({
        ...prev,
        showSuggestions: false,
        suggestions: [],
        selectedIndex: 0,
      }));

      return result;
    },

    dismiss: () => {
      setState((prev) => ({
        ...prev,
        showSuggestions: false,
        selectedIndex: 0,
      }));
    },

    forceAnalyze: () => {
      performAnalysis();
    },
  }), [performAnalysis]); // Removed state from deps - using stateRef instead

  return { state, actions };
}

// =============================================================================
// Exports
// =============================================================================

export { FormulaAutoComplete };
export type { FormulaContext, FunctionSuggestion, ArgumentHint };
