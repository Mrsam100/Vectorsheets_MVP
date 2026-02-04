/**
 * FormulaHintsPanel - Auto-complete suggestions and argument hints for formulas
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                        FORMULA HINTS PANEL                                  │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │                                                                             │
 * │   ┌─────────────────────────────────────────────────────────────────────┐   │
 * │   │ Argument Hint (when inside function)                                │   │
 * │   │ ┌─────────────────────────────────────────────────────────────────┐ │   │
 * │   │ │ SUM(«number1», [number2], ...)                                  │ │   │
 * │   │ │                                                                  │ │   │
 * │   │ │ number1: The first number or range                              │ │   │
 * │   │ └─────────────────────────────────────────────────────────────────┘ │   │
 * │   └─────────────────────────────────────────────────────────────────────┘   │
 * │                                                                             │
 * │   ┌─────────────────────────────────────────────────────────────────────┐   │
 * │   │ Suggestions List (when typing function name)                        │   │
 * │   │ ┌─────────────────────────────────────────────────────────────────┐ │   │
 * │   │ │ [selected] SUM                                                  │ │   │
 * │   │ │            Adds all the numbers in a range of cells             │ │   │
 * │   │ ├─────────────────────────────────────────────────────────────────┤ │   │
 * │   │ │ SUMIF                                                           │ │   │
 * │   │ │ Sums cells that meet a criterion                                │ │   │
 * │   │ ├─────────────────────────────────────────────────────────────────┤ │   │
 * │   │ │ SUMIFS                                                          │ │   │
 * │   │ │ Sums cells that meet multiple criteria                          │ │   │
 * │   │ └─────────────────────────────────────────────────────────────────┘ │   │
 * │   └─────────────────────────────────────────────────────────────────────┘   │
 * │                                                                             │
 * │   Keyboard:                                                                 │
 * │   - Up/Down: Navigate suggestions                                          │
 * │   - Tab/Enter: Accept selected suggestion                                   │
 * │   - Escape: Dismiss                                                         │
 * │                                                                             │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * Features:
 * - Virtualized list for many suggestions (if needed)
 * - Keyboard accessible with ARIA attributes
 * - Mouse click to select suggestion
 * - Highlighted current argument in signature
 * - Recent functions marked with indicator
 */

import React, { memo, useRef, useLayoutEffect, useCallback } from 'react';
import type {
  FormulaAutoCompleteState,
  FormulaAutoCompleteActions,
} from './useFormulaAutoComplete';

// =============================================================================
// Types
// =============================================================================

export interface FormulaHintsPanelProps {
  /** State from useFormulaAutoComplete */
  state: FormulaAutoCompleteState;
  /** Actions from useFormulaAutoComplete */
  actions: FormulaAutoCompleteActions;
  /** Position for the panel (absolute) */
  position?: { x: number; y: number };
  /** Whether to show above the anchor point */
  showAbove?: boolean;
  /** Maximum height for the suggestions list */
  maxHeight?: number;
  /** Z-index for the panel */
  zIndex?: number;
  /** Custom class name */
  className?: string;
  /** Width of the panel (default: auto, min 250px) */
  width?: number | 'auto';
}

// =============================================================================
// Styles
// =============================================================================

const styles = {
  container: {
    position: 'absolute' as const,
    overflow: 'hidden',
    minWidth: '250px',
    maxWidth: '400px',
  },
  suggestionsList: {
    maxHeight: '200px',
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
  },
  suggestionItem: {
    transition: 'background-color 0.1s ease',
  },
};

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Renders the argument hint with highlighted current argument
 */
const ArgumentHintDisplay = memo(({
  hint,
}: {
  hint: NonNullable<FormulaAutoCompleteState['argumentHint']>;
}) => {
  // Parse the highlighted signature (uses « » markers)
  const renderSignature = () => {
    const sig = hint.highlightedSignature;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let key = 0;

    // Find all highlighted sections marked with « »
    const regex = /«([^»]+)»/g;
    let match;

    while ((match = regex.exec(sig)) !== null) {
      // Add text before the highlight
      if (match.index > lastIndex) {
        parts.push(
          <span key={key++}>{sig.slice(lastIndex, match.index)}</span>
        );
      }

      // Add the highlighted part
      parts.push(
        <span key={key++} className="formula-hints-highlight">
          {match[1]}
        </span>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < sig.length) {
      parts.push(<span key={key++}>{sig.slice(lastIndex)}</span>);
    }

    return parts;
  };

  return (
    <div className="formula-hints-arg" role="tooltip" aria-live="polite">
      <div className="formula-hints-signature" style={{ fontSize: '12px', lineHeight: '1.4', whiteSpace: 'pre-wrap' as any, wordBreak: 'break-word' as any }}>{renderSignature()}</div>
      {hint.currentArg && (
        <div className="formula-hints-arg-desc" style={{ marginTop: '4px', fontSize: '11px', lineHeight: '1.3' }}>
          <span className="formula-hints-arg-name">{hint.currentArg.name}</span>
          {hint.currentArg.optional && ' (optional)'}
          {': '}
          {hint.currentArg.description}
        </div>
      )}
    </div>
  );
});

ArgumentHintDisplay.displayName = 'ArgumentHintDisplay';

/**
 * Renders a single suggestion item
 */
const SuggestionItem = memo(({
  suggestion,
  isSelected,
  index,
  onSelect,
  onAccept,
}: {
  suggestion: FormulaAutoCompleteState['suggestions'][0];
  isSelected: boolean;
  index: number;
  onSelect: (index: number) => void;
  onAccept: (index: number) => void;
}) => {
  const itemRef = useRef<HTMLDivElement>(null);

  // Scroll into view when selected - use useLayoutEffect to prevent visual flicker
  useLayoutEffect(() => {
    if (isSelected && itemRef.current) {
      itemRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'auto',
      });
    }
  }, [isSelected]);

  const handleMouseEnter = useCallback(() => {
    onSelect(index);
  }, [index, onSelect]);

  const handleClick = useCallback(() => {
    onAccept(index);
  }, [index, onAccept]);

  return (
    <div
      ref={itemRef}
      role="option"
      aria-selected={isSelected}
      className={`formula-hints-item ${isSelected ? 'formula-hints-item-selected' : ''}`}
      onMouseEnter={handleMouseEnter}
      onClick={handleClick}
      data-index={index}
    >
      <div className="formula-hints-item-name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {suggestion.name}
        {suggestion.isRecent && <span className="formula-hints-badge">Recent</span>}
      </div>
      <div className="formula-hints-desc" style={{ fontSize: '11px', marginTop: '2px', lineHeight: '1.3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{suggestion.description}</div>
      <div className="formula-hints-sig" style={{ fontSize: '10px', marginTop: '2px' }}>{suggestion.signature}</div>
    </div>
  );
});

SuggestionItem.displayName = 'SuggestionItem';

// =============================================================================
// Main Component
// =============================================================================

/**
 * FormulaHintsPanel - Displays auto-complete suggestions and argument hints
 *
 * Usage:
 * ```tsx
 * const { state, actions } = useFormulaAutoComplete({
 *   formula: editState.value,
 *   cursorPosition: editState.cursorPosition,
 *   enabled: editState.isFormula,
 * });
 *
 * <FormulaHintsPanel
 *   state={state}
 *   actions={actions}
 *   position={{ x: cellX, y: cellY + cellHeight }}
 * />
 * ```
 */
export const FormulaHintsPanel: React.FC<FormulaHintsPanelProps> = memo(({
  state,
  actions,
  position = { x: 0, y: 0 },
  showAbove = false,
  maxHeight = 200,
  zIndex = 1000,
  className,
  width = 'auto',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle selection via mouse hover
  const handleSelect = useCallback((index: number) => {
    actions.setSelectedIndex(index);
  }, [actions]);

  // Handle accepting a suggestion via mouse click
  const handleAccept = useCallback((index: number) => {
    actions.acceptSuggestionAt(index);
  }, [actions]);

  // Don't render if nothing to show
  const hasContent = state.showSuggestions || state.argumentHint;
  if (!hasContent) {
    return null;
  }

  // Calculate position
  const containerStyle: React.CSSProperties = {
    ...styles.container,
    left: position.x,
    top: showAbove ? 'auto' : position.y,
    bottom: showAbove ? `calc(100% - ${position.y}px)` : 'auto',
    zIndex,
    width: width === 'auto' ? undefined : width,
  };

  return (
    <div
      ref={containerRef}
      className={`formula-hints-panel ${className || ''}`}
      style={containerStyle}
      role={state.showSuggestions ? "listbox" : undefined}
      aria-label="Formula auto-complete"
      data-formula-hints="true"
    >
      {/* Argument Hint */}
      {state.argumentHint && (
        <ArgumentHintDisplay hint={state.argumentHint} />
      )}

      {/* Suggestions List */}
      {state.showSuggestions && state.suggestions.length > 0 && (
        <>
          <div
            style={{ ...styles.suggestionsList, maxHeight }}
            role="presentation"
          >
            {state.suggestions.map((suggestion, index) => (
              <SuggestionItem
                key={suggestion.name}
                suggestion={suggestion}
                isSelected={index === state.selectedIndex}
                index={index}
                onSelect={handleSelect}
                onAccept={handleAccept}
              />
            ))}
          </div>

          {/* Footer with keyboard hints */}
          <div className="formula-hints-footer" style={{ fontSize: '10px', display: 'flex', justifyContent: 'space-between' }}>
            <span>
              <span className="formula-hints-kbd">Tab</span>
              <span className="formula-hints-kbd">Enter</span> Accept
            </span>
            <span>
              <span className="formula-hints-kbd">Esc</span> Dismiss
            </span>
          </div>
        </>
      )}
    </div>
  );
});

FormulaHintsPanel.displayName = 'FormulaHintsPanel';

// =============================================================================
// Exports
// =============================================================================

export default FormulaHintsPanel;
