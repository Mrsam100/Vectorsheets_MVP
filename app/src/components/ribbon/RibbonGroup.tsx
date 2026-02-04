/**
 * RibbonGroup - Groups related buttons with a label.
 * RibbonSeparator - Vertical divider between groups.
 *
 * `priority` / `beforePriority` drive CSS container-query overflow:
 * lower-priority groups hide first at narrow widths.
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
  /** Overflow priority (1 = keep visible longest, 5 = overflow first) */
  priority?: number;
}

export const RibbonGroup: React.FC<RibbonGroupProps> = memo(({ label, children, priority }) => (
  <div
    className="ribbon-group"
    role="group"
    aria-label={label}
    data-ribbon-priority={priority}
  >
    {children}
  </div>
));

RibbonGroup.displayName = 'RibbonGroup';

// =============================================================================
// RibbonSeparator
// =============================================================================

export interface RibbonSeparatorProps {
  /** Priority of the group that follows this separator (hidden together) */
  beforePriority?: number;
}

export const RibbonSeparator: React.FC<RibbonSeparatorProps> = memo(({ beforePriority }) => (
  <div
    className="ribbon-separator"
    role="separator"
    aria-orientation="vertical"
    data-before-priority={beforePriority}
  />
));

RibbonSeparator.displayName = 'RibbonSeparator';
