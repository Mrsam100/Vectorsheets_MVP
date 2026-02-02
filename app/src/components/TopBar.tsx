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

import React, { useState, useCallback, useRef, useEffect } from 'react';
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
}

/** Menu structure */
const MENUS: Record<string, MenuItem[]> = {
  File: [
    { label: 'New', shortcut: 'Ctrl+N' },
    { label: 'Open', shortcut: 'Ctrl+O' },
    { label: 'Save', shortcut: 'Ctrl+S' },
    { label: 'Save As...', shortcut: 'Ctrl+Shift+S' },
    { label: 'Export', disabled: true },
  ],
  Edit: [
    { label: 'Undo', shortcut: 'Ctrl+Z' },
    { label: 'Redo', shortcut: 'Ctrl+Y' },
    { label: 'Cut', shortcut: 'Ctrl+X' },
    { label: 'Copy', shortcut: 'Ctrl+C' },
    { label: 'Paste', shortcut: 'Ctrl+V' },
  ],
  View: [
    { label: 'Zoom In', shortcut: 'Ctrl+=' },
    { label: 'Zoom Out', shortcut: 'Ctrl+-' },
    { label: 'Reset Zoom', shortcut: 'Ctrl+0' },
    { label: 'Show Gridlines' },
    { label: 'Show Headers' },
  ],
  Insert: [
    { label: 'Rows Above' },
    { label: 'Rows Below' },
    { label: 'Columns Left' },
    { label: 'Columns Right' },
    { label: 'Chart', disabled: true },
  ],
  Format: [
    { label: 'Bold', shortcut: 'Ctrl+B' },
    { label: 'Italic', shortcut: 'Ctrl+I' },
    { label: 'Underline', shortcut: 'Ctrl+U' },
    { label: 'Number Format...' },
    { label: 'Conditional Formatting...' },
  ],
  Help: [
    { label: 'Documentation' },
    { label: 'Keyboard Shortcuts' },
    { label: 'About VectorSheet' },
  ],
};

// =============================================================================
// Component
// =============================================================================

export const TopBar: React.FC<TopBarProps> = ({
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

  // Hover-to-open: when one menu is already open, hovering another opens it
  const handleMenuMouseEnter = useCallback((menu: string) => {
    if (activeMenu && activeMenu !== menu) {
      setActiveMenu(menu);
    }
  }, [activeMenu]);

  const handleMenuBlur = useCallback(() => {
    // Delay to allow click events on menu items to fire first
    clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => setActiveMenu(null), 150);
  }, []);

  // Close menus on Escape key
  const handleMenuKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && activeMenu) {
      setActiveMenu(null);
      e.stopPropagation();
    }
  }, [activeMenu]);

  return (
    <header className={`topbar flex flex-col border-b border-gray-200 bg-white ${className}`}>
      {/* Menu Bar */}
      <div className="flex items-center h-10 px-2 border-b border-gray-100 bg-gray-50/50">
        {/* Logo / Brand */}
        <div className="flex items-center gap-2 mr-4">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">V</span>
          </div>
          <span className="text-sm font-semibold text-gray-700 hidden sm:inline">
            VectorSheet
          </span>
        </div>

        {/* Menu Bar */}
        <nav className="flex items-center gap-0.5 relative" onBlur={handleMenuBlur} onKeyDown={handleMenuKeyDown}>
          {Object.keys(MENUS).map((menu) => (
            <div key={menu} className="relative">
              <button
                type="button"
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  activeMenu === menu
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                onClick={() => handleMenuClick(menu)}
                onMouseEnter={() => handleMenuMouseEnter(menu)}
              >
                {menu}
              </button>

              {/* Dropdown Menu */}
              {activeMenu === menu && (
                <div className="absolute top-full left-0 mt-0.5 w-56 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
                  {MENUS[menu].map((item, idx) => (
                    <button
                      type="button"
                      key={idx}
                      className={`w-full px-3 py-1.5 text-left text-sm flex items-center justify-between ${
                        item.disabled
                          ? 'text-gray-400 cursor-not-allowed'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                      disabled={item.disabled}
                    >
                      <span>{item.label}</span>
                      {item.shortcut && (
                        <span className="text-xs text-gray-400 ml-4">
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
          <button className="icon-btn" title="Share">
            <ShareIcon className="w-4 h-4 text-gray-500" />
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

export default TopBar;
