/**
 * TopBar - Application header with menu bar and Ribbon toolbar
 *
 * Layout:
 * ┌─────────────────────────────────────────────────┐
 * │ Logo │ File Edit View Insert Format Help │ Share │  ← MenuBar row
 * ├─────────────────────────────────────────────────┤
 * │ [Clipboard] │ [History] │ [Font] │ [Align] │ …  │  ← Ribbon row
 * └─────────────────────────────────────────────────┘
 *
 * The FormulaBar lives inside GridViewport (not here).
 */

import React, { useState, useCallback, useRef, useEffect, memo } from 'react';
import { Ribbon } from './ribbon';
import type { RibbonState } from './ribbon';
import type { SpreadsheetIntent } from './grid/IntentHandler';

// =============================================================================
// Types
// =============================================================================

export interface TopBarProps {
  /** Optional class name */
  className?: string;
  /** Ribbon state from parent */
  ribbonState?: RibbonState;
  /** Intent emitter for ribbon buttons */
  onIntent?: (intent: SpreadsheetIntent) => void;
  /** Format painter toggle callback */
  onFormatPainterToggle?: () => void;
}

/** Menu item structure */
interface MenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  /** Action key for dispatching via onIntent */
  action?: string;
}

/** Menu structure */
const MENUS: Record<string, MenuItem[]> = {
  File: [
    { label: 'New', shortcut: 'Ctrl+N', disabled: true },
    { label: 'Open', shortcut: 'Ctrl+O', disabled: true },
    { label: 'Save', shortcut: 'Ctrl+S', disabled: true },
    { label: 'Save As...', shortcut: 'Ctrl+Shift+S', disabled: true },
    { label: 'Export', disabled: true },
  ],
  Edit: [
    { label: 'Undo', shortcut: 'Ctrl+Z', action: 'undo' },
    { label: 'Redo', shortcut: 'Ctrl+Y', action: 'redo' },
    { label: 'Cut', shortcut: 'Ctrl+X', action: 'cut' },
    { label: 'Copy', shortcut: 'Ctrl+C', action: 'copy' },
    { label: 'Paste', shortcut: 'Ctrl+V', action: 'paste' },
  ],
  View: [
    { label: 'Zoom In', shortcut: 'Ctrl+=', disabled: true },
    { label: 'Zoom Out', shortcut: 'Ctrl+-', disabled: true },
    { label: 'Reset Zoom', shortcut: 'Ctrl+0', disabled: true },
    { label: 'Show Gridlines', disabled: true },
    { label: 'Show Headers', disabled: true },
  ],
  Insert: [
    { label: 'Rows Above', action: 'insertRowAbove' },
    { label: 'Rows Below', action: 'insertRowBelow' },
    { label: 'Columns Left', action: 'insertColLeft' },
    { label: 'Columns Right', action: 'insertColRight' },
    { label: 'Chart', disabled: true },
  ],
  Format: [
    { label: 'Bold', shortcut: 'Ctrl+B', action: 'bold' },
    { label: 'Italic', shortcut: 'Ctrl+I', action: 'italic' },
    { label: 'Underline', shortcut: 'Ctrl+U', action: 'underline' },
    { label: 'Number Format...', disabled: true },
    { label: 'Conditional Formatting...', disabled: true },
  ],
  Help: [
    { label: 'Documentation', disabled: true },
    { label: 'Keyboard Shortcuts', shortcut: 'Ctrl+/', action: 'keyboardShortcuts' },
    { label: 'About VectorSheet', disabled: true },
  ],
};

/** Menu names — hoisted so handleMenuKeyDown doesn't recreate on every render */
const MENU_KEYS = Object.keys(MENUS);

// =============================================================================
// Component
// =============================================================================

const TopBarInner: React.FC<TopBarProps> = ({
  className = '',
  ribbonState,
  onIntent,
  onFormatPainterToggle,
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Cancel pending blur timeout on unmount
  useEffect(() => () => { clearTimeout(blurTimerRef.current); }, []);

  const handleMenuClick = (menu: string) => {
    setActiveMenu(activeMenu === menu ? null : menu);
  };

  // Dispatch menu item actions via onIntent
  const handleMenuItemClick = useCallback((action: string | undefined) => {
    if (!action || !onIntent) return;
    setActiveMenu(null);
    switch (action) {
      case 'undo':
        onIntent({ type: 'UndoRedo', action: 'undo' } as SpreadsheetIntent);
        break;
      case 'redo':
        onIntent({ type: 'UndoRedo', action: 'redo' } as SpreadsheetIntent);
        break;
      case 'cut':
        onIntent({ type: 'ClipboardAction', action: 'cut' } as SpreadsheetIntent);
        break;
      case 'copy':
        onIntent({ type: 'ClipboardAction', action: 'copy' } as SpreadsheetIntent);
        break;
      case 'paste':
        onIntent({ type: 'ClipboardAction', action: 'paste' } as SpreadsheetIntent);
        break;
      case 'bold':
        onIntent({ type: 'ApplyFormat', format: { bold: !ribbonState?.activeCellFormat?.bold } } as SpreadsheetIntent);
        break;
      case 'italic':
        onIntent({ type: 'ApplyFormat', format: { italic: !ribbonState?.activeCellFormat?.italic } } as SpreadsheetIntent);
        break;
      case 'underline':
        onIntent({ type: 'ApplyFormat', format: { underline: ribbonState?.activeCellFormat?.underline ? 0 : 1 } } as SpreadsheetIntent);
        break;
      case 'insertRowAbove':
        onIntent({ type: 'InsertRows', row: -1, count: 1, timestamp: Date.now() } as SpreadsheetIntent);
        break;
      case 'insertRowBelow':
        onIntent({ type: 'InsertRows', row: -2, count: 1, timestamp: Date.now() } as SpreadsheetIntent);
        break;
      case 'insertColLeft':
        onIntent({ type: 'InsertColumns', col: -1, count: 1, timestamp: Date.now() } as SpreadsheetIntent);
        break;
      case 'insertColRight':
        onIntent({ type: 'InsertColumns', col: -2, count: 1, timestamp: Date.now() } as SpreadsheetIntent);
        break;
      case 'keyboardShortcuts':
        onIntent({ type: 'OpenKeyboardShortcuts', timestamp: Date.now() } as unknown as SpreadsheetIntent);
        break;
    }
  }, [onIntent, ribbonState]);

  // Hover-to-open: when one menu is already open, hovering another opens it
  const handleMenuMouseEnter = useCallback((menu: string) => {
    clearTimeout(blurTimerRef.current); // Cancel pending blur from leaving previous menu
    if (activeMenu && activeMenu !== menu) {
      setActiveMenu(menu);
    }
  }, [activeMenu]);

  const handleMenuBlur = useCallback((e: React.FocusEvent) => {
    // If focus moved to another element inside the nav, do not close
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    // Delay to allow click events on menu items to fire first
    clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => setActiveMenu(null), 150);
  }, []);

  // Keyboard navigation for menubar (WAI-ARIA menubar pattern)
  const pendingFocusRef = useRef(false);

  const handleMenuKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && activeMenu) {
      // Restore focus to the trigger button that owns the open menu
      const nav = e.currentTarget as HTMLElement;
      const idx = MENU_KEYS.indexOf(activeMenu);
      setActiveMenu(null);
      if (idx >= 0) {
        const buttons = nav.querySelectorAll<HTMLButtonElement>(':scope > div > button');
        buttons[idx]?.focus();
      }
      e.stopPropagation();
      return;
    }

    // ArrowLeft/Right: navigate between top-level menu buttons
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const buttons = Array.from(
        (e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>(':scope > div > button')
      );
      const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (idx === -1) return;
      const next = e.key === 'ArrowRight'
        ? (idx + 1) % buttons.length
        : (idx - 1 + buttons.length) % buttons.length;
      buttons[next].focus();
      if (activeMenu) {
        setActiveMenu(MENU_KEYS[next]);
        pendingFocusRef.current = true;
      }
      return;
    }

    // ArrowDown: open menu and focus first item, or navigate within open dropdown
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (activeMenu) {
        const menuEl = (e.currentTarget as HTMLElement).querySelector('[role="menu"]');
        if (menuEl) {
          const items = Array.from(menuEl.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
          const currentIdx = items.indexOf(document.activeElement as HTMLButtonElement);
          if (currentIdx === -1) {
            items[0]?.focus();
          } else {
            items[(currentIdx + 1) % items.length]?.focus();
          }
        }
      } else {
        // Open the focused menu and focus first item
        const buttons = Array.from(
          (e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>(':scope > div > button')
        );
        const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (idx >= 0 && idx < MENU_KEYS.length) {
          setActiveMenu(MENU_KEYS[idx]);
          pendingFocusRef.current = true;
        }
      }
      return;
    }

    // ArrowUp: navigate within open dropdown
    if (e.key === 'ArrowUp' && activeMenu) {
      e.preventDefault();
      const menuEl = (e.currentTarget as HTMLElement).querySelector('[role="menu"]');
      if (menuEl) {
        const items = Array.from(menuEl.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
        const currentIdx = items.indexOf(document.activeElement as HTMLButtonElement);
        if (currentIdx <= 0) {
          items[items.length - 1]?.focus();
        } else {
          items[currentIdx - 1]?.focus();
        }
      }
      return;
    }

    // Home/End within open dropdown
    if ((e.key === 'Home' || e.key === 'End') && activeMenu) {
      e.preventDefault();
      const menuEl = (e.currentTarget as HTMLElement).querySelector('[role="menu"]');
      if (menuEl) {
        const items = Array.from(menuEl.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
        if (items.length > 0) {
          (e.key === 'Home' ? items[0] : items[items.length - 1]).focus();
        }
      }
    }
  }, [activeMenu]);

  // Focus first dropdown item after menu opens via keyboard (ArrowDown / ArrowLeft/Right)
  useEffect(() => {
    if (!activeMenu || !pendingFocusRef.current) return;
    pendingFocusRef.current = false;
    const rafId = requestAnimationFrame(() => {
      const menuEl = document.querySelector<HTMLElement>(`[role="menu"][aria-label="${activeMenu} menu"]`);
      if (menuEl) {
        const firstItem = menuEl.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)');
        firstItem?.focus();
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [activeMenu]);

  return (
    <header className={`topbar flex flex-col border-b ${className}`}>
      {/* Menu Bar */}
      <div className="topbar-menubar flex items-center h-10 px-2 border-b">
        {/* Logo / Brand */}
        <div className="flex items-center gap-2 mr-4">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
            <span className="text-xs font-bold" style={{ color: 'var(--color-text-on-accent)' }}>V</span>
          </div>
          <span className="topbar-brand-text text-sm font-semibold hidden sm:inline">
            VectorSheet
          </span>
        </div>

        {/* Menu Bar */}
        <nav className="flex items-center gap-0.5 relative" role="menubar" aria-label="Application menu" onBlur={handleMenuBlur} onKeyDown={handleMenuKeyDown}>
          {Object.keys(MENUS).map((menu) => (
            <div key={menu} className="relative">
              <button
                type="button"
                role="menuitem"
                aria-haspopup="true"
                aria-expanded={activeMenu === menu}
                className={`topbar-menu-trigger px-3 py-1 text-sm rounded transition-colors`}
                onClick={() => handleMenuClick(menu)}
                onMouseEnter={() => handleMenuMouseEnter(menu)}
              >
                {menu}
              </button>

              {/* Dropdown Menu */}
              {activeMenu === menu && (
                <div className="topbar-dropdown absolute top-full left-0 mt-0.5 w-56 rounded-md py-1 z-50" role="menu" aria-label={`${menu} menu`}>
                  {MENUS[menu].map((item) => (
                    <button
                      type="button"
                      role="menuitem"
                      key={item.label}
                      className={`topbar-menu-item w-full px-3 py-1.5 text-left text-sm flex items-center justify-between ${
                        item.disabled ? 'cursor-not-allowed' : ''
                      }`}
                      disabled={item.disabled}
                      aria-disabled={item.disabled || undefined}
                      onClick={item.action ? () => handleMenuItemClick(item.action) : undefined}
                    >
                      <span>{item.label}</span>
                      {item.shortcut && (
                        <span className="topbar-shortcut text-xs ml-4">
                          {item.shortcut}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right side actions (placeholder) */}
        <div className="flex items-center gap-2">
          <button className="icon-btn" title="Share" aria-label="Share" style={{ color: 'var(--color-text-muted)' }}>
            <ShareIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Ribbon Toolbar */}
      {ribbonState && onIntent && (
        <Ribbon
          state={ribbonState}
          onIntent={onIntent}
          onFormatPainterToggle={onFormatPainterToggle}
        />
      )}
    </header>
  );
};

// Simple icon components
const ShareIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
    />
  </svg>
);

TopBarInner.displayName = 'TopBar';

export const TopBar = memo(TopBarInner);
export default TopBar;
