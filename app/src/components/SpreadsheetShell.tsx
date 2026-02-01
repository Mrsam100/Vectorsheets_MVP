/**
 * SpreadsheetShell - Main application shell
 *
 * Provides the overall layout structure for the spreadsheet application.
 * Contains: TopBar, GridViewport, and StatusBar.
 *
 * Layout:
 * ┌─────────────────────────────────────┐
 * │             TopBar                  │  <- Fixed height
 * ├─────────────────────────────────────┤
 * │                                     │
 * │          GridViewport               │  <- Fills remaining space
 * │                                     │
 * ├─────────────────────────────────────┤
 * │            StatusBar                │  <- Fixed height
 * └─────────────────────────────────────┘
 */

import React from 'react';
import { TopBar } from './TopBar';
import { GridViewport } from './GridViewport';
import { StatusBar } from './StatusBar';

export interface SpreadsheetShellProps {
  /** Optional class name for the shell container */
  className?: string;
}

export const SpreadsheetShell: React.FC<SpreadsheetShellProps> = ({
  className = '',
}) => {
  return (
    <div
      className={`spreadsheet-shell h-full w-full flex flex-col overflow-hidden bg-white ${className}`}
    >
      {/* Top Bar - Ribbon/Toolbar area */}
      <TopBar />

      {/* Main Grid Area - Takes all remaining space */}
      <main className="flex-1 min-h-0 relative">
        <GridViewport />
      </main>

      {/* Status Bar */}
      <StatusBar />
    </div>
  );
};

export default SpreadsheetShell;
