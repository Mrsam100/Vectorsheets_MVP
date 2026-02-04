/**
 * KeyboardShortcutsDialog - Modal listing all keyboard shortcuts
 *
 * Follows the SortDialog/DataValidationDialog pattern:
 * - Fixed, centered, z-index 350 with backdrop
 * - Focus trap via useFocusTrap
 * - onKeyDownCapture stops propagation to grid
 * - Close on Escape
 * - Triggered by Ctrl+/ or Help menu
 */

import React, { useRef, useCallback, memo } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

// =============================================================================
// Types
// =============================================================================

export interface KeyboardShortcutsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutEntry {
  keys: string;
  description: string;
}

interface ShortcutCategory {
  name: string;
  shortcuts: ShortcutEntry[];
}

// =============================================================================
// Shortcut Data
// =============================================================================

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    name: 'Navigation',
    shortcuts: [
      { keys: 'Arrow Keys', description: 'Move active cell' },
      { keys: 'Ctrl+Arrow', description: 'Jump to edge of data region' },
      { keys: 'Home', description: 'Move to column A' },
      { keys: 'Ctrl+Home', description: 'Move to cell A1' },
      { keys: 'Ctrl+End', description: 'Move to last used cell' },
      { keys: 'Page Up/Down', description: 'Scroll one page' },
      { keys: 'Tab', description: 'Move to next cell' },
      { keys: 'Shift+Tab', description: 'Move to previous cell' },
      { keys: 'Enter', description: 'Move down (or confirm edit)' },
      { keys: 'Shift+Enter', description: 'Move up (or confirm edit)' },
    ],
  },
  {
    name: 'Selection',
    shortcuts: [
      { keys: 'Shift+Arrow', description: 'Extend selection' },
      { keys: 'Ctrl+Shift+Arrow', description: 'Extend to data edge' },
      { keys: 'Ctrl+A', description: 'Select all cells' },
      { keys: 'Shift+Space', description: 'Select entire row' },
      { keys: 'Ctrl+Space', description: 'Select entire column' },
      { keys: 'Shift+Click', description: 'Extend selection to cell' },
      { keys: 'Ctrl+Click', description: 'Add cell to selection' },
    ],
  },
  {
    name: 'Editing',
    shortcuts: [
      { keys: 'F2', description: 'Enter edit mode / cycle mode' },
      { keys: 'Escape', description: 'Cancel edit' },
      { keys: 'Delete', description: 'Clear cell contents' },
      { keys: 'Backspace', description: 'Clear and enter edit mode' },
      { keys: 'Ctrl+Z', description: 'Undo' },
      { keys: 'Ctrl+Y', description: 'Redo' },
      { keys: 'Ctrl+Shift+Z', description: 'Redo (alternative)' },
    ],
  },
  {
    name: 'Formatting',
    shortcuts: [
      { keys: 'Ctrl+B', description: 'Toggle bold' },
      { keys: 'Ctrl+I', description: 'Toggle italic' },
      { keys: 'Ctrl+U', description: 'Toggle underline' },
    ],
  },
  {
    name: 'Clipboard',
    shortcuts: [
      { keys: 'Ctrl+C', description: 'Copy' },
      { keys: 'Ctrl+X', description: 'Cut' },
      { keys: 'Ctrl+V', description: 'Paste' },
    ],
  },
  {
    name: 'Tools',
    shortcuts: [
      { keys: 'Ctrl+F', description: 'Find' },
      { keys: 'Ctrl+H', description: 'Find and Replace' },
      { keys: 'Ctrl+/', description: 'Keyboard shortcuts' },
      { keys: 'Ctrl+=', description: 'Zoom in' },
      { keys: 'Ctrl+-', description: 'Zoom out' },
      { keys: 'Ctrl+0', description: 'Reset zoom' },
    ],
  },
];

// =============================================================================
// Component
// =============================================================================

export const KeyboardShortcutsDialog: React.FC<KeyboardShortcutsDialogProps> = memo(
  ({ isOpen, onClose }) => {
    const dialogRef = useRef<HTMLDivElement>(null);

    useFocusTrap({
      containerRef: dialogRef,
      enabled: isOpen,
      onEscape: onClose,
    });

    const handleKeyDownCapture = useCallback((e: React.KeyboardEvent) => {
      // Stop propagation so grid doesn't process keyboard events
      e.stopPropagation();
    }, []);

    if (!isOpen) return null;

    return (
      <>
        {/* Backdrop */}
        <div
          className="dialog-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Dialog */}
        <div
          ref={dialogRef}
          className="shortcuts-dialog"
          role="dialog"
          aria-label="Keyboard Shortcuts"
          aria-modal="true"
          onKeyDownCapture={handleKeyDownCapture}
        >
          {/* Header */}
          <div className="shortcuts-dialog-header">
            <h2 className="shortcuts-dialog-title">Keyboard Shortcuts</h2>
            <button
              type="button"
              className="shortcuts-dialog-close-btn"
              onClick={onClose}
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="shortcuts-dialog-body">
            {SHORTCUT_CATEGORIES.map((category) => (
              <div key={category.name} className="shortcuts-dialog-category">
                <h3 className="shortcuts-dialog-category-title">{category.name}</h3>
                <div className="shortcuts-dialog-grid">
                  {category.shortcuts.map((shortcut) => (
                    <React.Fragment key={shortcut.keys}>
                      <kbd className="shortcuts-dialog-key">{shortcut.keys}</kbd>
                      <span className="shortcuts-dialog-desc">{shortcut.description}</span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="shortcuts-dialog-actions">
            <button
              type="button"
              className="dialog-btn dialog-btn-primary"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </>
    );
  },
);

KeyboardShortcutsDialog.displayName = 'KeyboardShortcutsDialog';
export default KeyboardShortcutsDialog;
