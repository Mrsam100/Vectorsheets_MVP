/**
 * RibbonOverflowMenu - Overflow trigger + popover for ribbon groups
 * hidden at narrow viewport widths.
 *
 * Follows the same click-outside / Escape dismiss pattern as RibbonColorPicker.
 * The CSS class `.ribbon-overflow-trigger` is hidden by default and shown
 * via container queries when groups need to overflow.
 */

import React, { memo, useState, useRef, useEffect, useCallback } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface RibbonOverflowMenuProps {
  /** Overflowed controls to render inside the popover */
  children: React.ReactNode;
}

// =============================================================================
// Component
// =============================================================================

export const RibbonOverflowMenu: React.FC<RibbonOverflowMenuProps> = memo(
  ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    // Close on click outside or Escape
    useEffect(() => {
      if (!isOpen) return;

      const handleClickOutside = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setIsOpen(false);
          triggerRef.current?.focus();
        }
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsOpen(false);
          triggerRef.current?.focus();
          e.stopPropagation();
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown, true);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown, true);
      };
    }, [isOpen]);

    const toggleOpen = useCallback(() => {
      setIsOpen((prev) => !prev);
    }, []);

    return (
      <div ref={containerRef} className="ribbon-overflow-trigger relative">
        <button
          ref={triggerRef}
          className="ribbon-btn"
          onClick={toggleOpen}
          aria-expanded={isOpen}
          aria-haspopup="true"
          aria-label="More formatting options"
          title="More options"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="3" cy="7" r="1.2" fill="currentColor" />
            <circle cx="7" cy="7" r="1.2" fill="currentColor" />
            <circle cx="11" cy="7" r="1.2" fill="currentColor" />
          </svg>
        </button>

        {isOpen && (
          <div
            className="ribbon-overflow-panel"
            role="group"
            aria-label="Overflow formatting options"
          >
            {children}
          </div>
        )}
      </div>
    );
  },
);

RibbonOverflowMenu.displayName = 'RibbonOverflowMenu';
