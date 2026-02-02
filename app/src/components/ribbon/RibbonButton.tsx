/**
 * RibbonButton - Base button and toggle variant for the Ribbon toolbar.
 *
 * - RibbonButton: standard click action (Cut, Copy, Paste, Undo, Redo)
 * - RibbonToggleButton: togglable state with aria-pressed (Bold, Italic, Align)
 *
 * Both are memo'd for performance during rapid ribbon state updates.
 */

import React, { memo } from 'react';

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
}

export const RibbonButton: React.FC<RibbonButtonProps> = memo(
  ({ icon, tooltip, disabled = false, onClick, ariaLabel }) => (
    <button
      type="button"
      className="ribbon-btn"
      title={tooltip}
      aria-label={ariaLabel ?? tooltip}
      disabled={disabled}
      onClick={onClick}
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
  ({ icon, tooltip, disabled = false, onClick, ariaLabel, pressed }) => (
    <button
      type="button"
      className="ribbon-btn"
      title={tooltip}
      aria-label={ariaLabel ?? tooltip}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </button>
  ),
);

RibbonToggleButton.displayName = 'RibbonToggleButton';
