/**
 * UndoRedoControls - Undo/Redo state sync hook and standalone control component
 *
 * Bridges the engine's UndoRedoManager to React state. Provides:
 * - useUndoRedoSync: Hook that subscribes to UndoRedoManager.onStateChange
 * - UndoRedoControls: Standalone Undo/Redo button pair with tooltips
 *
 * Both can be used independently or together. The Ribbon already has its own
 * Undo/Redo buttons — this component provides a reusable alternative and
 * the hook that feeds canUndo/canRedo into RibbonState.
 */

import React, { memo, useState, useEffect, useCallback } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface UndoRedoSyncState {
  canUndo: boolean;
  canRedo: boolean;
  undoDescription: string | null;
  redoDescription: string | null;
}

const DEFAULT_STATE: UndoRedoSyncState = {
  canUndo: false,
  canRedo: false,
  undoDescription: null,
  redoDescription: null,
};

// =============================================================================
// Hook: useUndoRedoSync
// =============================================================================

/**
 * Subscribes to an UndoRedoManager's state changes and returns reactive state.
 *
 * @param getState  - Reads current state from the engine (called once on mount)
 * @param subscribe - Subscribes to state changes; returns an unsubscribe function
 * @returns Current undo/redo state
 */
export function useUndoRedoSync(
  getState?: () => UndoRedoSyncState,
  subscribe?: (callback: (state: UndoRedoSyncState) => void) => (() => void),
): UndoRedoSyncState {
  const [state, setState] = useState<UndoRedoSyncState>(
    () => getState?.() ?? DEFAULT_STATE,
  );

  useEffect(() => {
    // Re-read current state whenever subscription or getter changes
    // (e.g., engine reconnect). Both must be in the same effect to avoid
    // a frame of stale state between two separate effects.
    if (getState) {
      setState(getState());
    }
    if (!subscribe) return;
    const unsubscribe = subscribe((newState) => {
      setState(newState);
    });
    return unsubscribe;
  }, [subscribe, getState]);

  return state;
}

// =============================================================================
// Component: UndoRedoControls
// =============================================================================

export interface UndoRedoControlsProps {
  canUndo: boolean;
  canRedo: boolean;
  undoDescription?: string | null;
  redoDescription?: string | null;
  onUndo: () => void;
  onRedo: () => void;
  disabled?: boolean;
}

const UndoRedoControlsInner: React.FC<UndoRedoControlsProps> = ({
  canUndo,
  canRedo,
  undoDescription,
  redoDescription,
  onUndo,
  onRedo,
  disabled = false,
}) => {
  const undoTooltip = undoDescription
    ? `Undo: ${undoDescription} (Ctrl+Z)`
    : 'Undo (Ctrl+Z)';
  const redoTooltip = redoDescription
    ? `Redo: ${redoDescription} (Ctrl+Y)`
    : 'Redo (Ctrl+Y)';

  const handleUndo = useCallback(() => {
    if (canUndo && !disabled) onUndo();
  }, [canUndo, disabled, onUndo]);

  const handleRedo = useCallback(() => {
    if (canRedo && !disabled) onRedo();
  }, [canRedo, disabled, onRedo]);

  return (
    <div className="undo-redo-controls" role="group" aria-label="Undo/Redo">
      <button
        type="button"
        className="ribbon-btn"
        title={undoTooltip}
        aria-label={undoTooltip}
        disabled={disabled || !canUndo}
        onClick={handleUndo}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h7a3 3 0 110 6H8" />
          <path d="M6 3L3 6l3 3" />
        </svg>
      </button>
      <button
        type="button"
        className="ribbon-btn"
        title={redoTooltip}
        aria-label={redoTooltip}
        disabled={disabled || !canRedo}
        onClick={handleRedo}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 6H6a3 3 0 100 6h2" />
          <path d="M10 3l3 3-3 3" />
        </svg>
      </button>
    </div>
  );
};

UndoRedoControlsInner.displayName = 'UndoRedoControls';

export const UndoRedoControls = memo(UndoRedoControlsInner);
export default UndoRedoControls;
