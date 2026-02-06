/**
 * RibbonButton - Base button and toggle variant for the Ribbon toolbar.
 *
 * - RibbonButton: standard click action (Cut, Copy, Paste, Undo, Redo)
 * - RibbonToggleButton: togglable state with aria-pressed (Bold, Italic, Align)
 *
 * Both are memo'd for performance during rapid ribbon state updates.
 */

import React, { memo } from 'react';

/** Prevent mousedown from stealing focus from the cell editor */
function preventFocusSteal(e: React.MouseEvent) {
  e.preventDefault();
}

// =============================================================================
// Base Button
// =============================================================================

export interface RibbonButtonProps {
  /** Icon element (inline SVG) */
  icon: React.ReactNode;
  /** Tooltip text */
  tooltip: string;
  /** Whether button is disabled */
  disabled?: boolean;
  /** Click handler */
  onClick: () => void;
  /** Override aria-label (defaults to tooltip) */
  ariaLabel?: string;
  /** Whether this button preserves edit session (default: true for formatting, false for structural) */
  preserveEdit?: boolean;
}

export const RibbonButton: React.FC<RibbonButtonProps> = memo(
  ({ icon, tooltip, disabled = false, onClick, ariaLabel, preserveEdit = false }) => (
    <button
      type="button"
      className="ribbon-btn"
      title={tooltip}
      aria-label={ariaLabel ?? tooltip}
      disabled={disabled}
      onClick={onClick}
      onMouseDown={preserveEdit ? preventFocusSteal : undefined}
      data-preserve-edit={preserveEdit || undefined}
    >
      {icon}
    </button>
  ),
);

RibbonButton.displayName = 'RibbonButton';

// =============================================================================
// Toggle Button
// =============================================================================

export interface RibbonToggleButtonProps extends RibbonButtonProps {
  /** Whether the toggle is currently pressed/active */
  pressed: boolean;
}

export const RibbonToggleButton: React.FC<RibbonToggleButtonProps> = memo(
  ({ icon, tooltip, disabled = false, onClick, ariaLabel, pressed, preserveEdit = true }) => (
    <button
      type="button"
      className={`ribbon-btn${pressed ? ' ribbon-btn-active' : ''}`}
      title={tooltip}
      aria-label={ariaLabel ?? tooltip}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      onMouseDown={preserveEdit ? preventFocusSteal : undefined}
      data-preserve-edit={preserveEdit || undefined}
    >
      {icon}
    </button>
  ),
);

RibbonToggleButton.displayName = 'RibbonToggleButton';
