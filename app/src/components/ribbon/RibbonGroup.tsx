/**
 * RibbonGroup - Groups related buttons with a label.
 * RibbonSeparator - Vertical divider between groups.
 */

import React, { memo } from 'react';

// =============================================================================
// RibbonGroup
// =============================================================================

export interface RibbonGroupProps {
  /** Group label (displayed below the buttons in smaller text) */
  label: string;
  /** Children (RibbonButton, RibbonDropdown, etc.) */
  children: React.ReactNode;
}

export const RibbonGroup: React.FC<RibbonGroupProps> = memo(({ label, children }) => (
  <div className="ribbon-group" role="group" aria-label={label}>
    {children}
  </div>
));

RibbonGroup.displayName = 'RibbonGroup';

// =============================================================================
// RibbonSeparator
// =============================================================================

export const RibbonSeparator: React.FC = memo(() => (
  <div className="ribbon-separator" role="separator" aria-orientation="vertical" />
));

RibbonSeparator.displayName = 'RibbonSeparator';
