/**
 * TopBar - Application header with toolbar/ribbon placeholder
 *
 * Currently provides:
 * - Application branding
 * - Menu bar placeholder
 * - Formula bar
 *
 * Future: Will contain ribbon tabs, quick access toolbar, etc.
 */

import React, { useState } from 'react';

export interface TopBarProps {
  /** Optional class name */
  className?: string;
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

export const TopBar: React.FC<TopBarProps> = ({ className = '' }) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [cellAddress, setCellAddress] = useState('A1');
  const [formulaValue, setFormulaValue] = useState('');

  const handleMenuClick = (menu: string) => {
    setActiveMenu(activeMenu === menu ? null : menu);
  };

  const handleMenuBlur = () => {
    // Delay to allow click events on menu items
    setTimeout(() => setActiveMenu(null), 150);
  };

  return (
    <header className={`topbar flex flex-col border-b border-gray-200 bg-white ${className}`}>
      {/* Title Bar / Menu Bar */}
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
        <nav className="flex items-center gap-0.5 relative" onBlur={handleMenuBlur}>
          {Object.keys(MENUS).map((menu) => (
            <div key={menu} className="relative">
              <button
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  activeMenu === menu
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                onClick={() => handleMenuClick(menu)}
              >
                {menu}
              </button>

              {/* Dropdown Menu */}
              {activeMenu === menu && (
                <div className="absolute top-full left-0 mt-0.5 w-56 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
                  {MENUS[menu].map((item, idx) => (
                    <button
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

      {/* Formula Bar */}
      <div className="flex items-center h-7 px-2 gap-2 bg-white">
        {/* Cell Address Box */}
        <div className="relative">
          <input
            type="text"
            value={cellAddress}
            onChange={(e) => setCellAddress(e.target.value.toUpperCase())}
            className="w-20 h-5 px-2 text-xs font-mono text-center border border-gray-300 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            aria-label="Cell address"
          />
        </div>

        {/* Function button */}
        <button
          className="flex items-center justify-center w-6 h-5 text-gray-500 hover:bg-gray-100 rounded"
          title="Insert function"
        >
          <FunctionIcon className="w-3.5 h-3.5" />
        </button>

        {/* Formula Input */}
        <div className="flex-1 relative">
          <input
            type="text"
            value={formulaValue}
            onChange={(e) => setFormulaValue(e.target.value)}
            placeholder="Enter value or formula"
            className="w-full h-5 px-2 text-xs font-mono border border-gray-300 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            aria-label="Formula bar"
          />
        </div>
      </div>
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

const FunctionIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <text x="4" y="18" fontSize="16" fontFamily="serif" fontStyle="italic">
      fx
    </text>
  </svg>
);

export default TopBar;
