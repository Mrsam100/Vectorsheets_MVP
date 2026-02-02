/**
 * SpreadsheetShell - Main application shell
 *
 * Orchestration hub that connects the Ribbon to the GridViewport.
 *
 * Data flow:
 * - GridViewport.onActiveCellChange → reads cell format → updates ribbonState
 * - GridViewport.onSelectionChange → updates ribbonState.hasSelection
 * - Ribbon.onIntent → processes format/clipboard/undoRedo → delegates to parent callbacks
 *
 * Layout:
 * ┌─────────────────────────────────────┐
 * │        TopBar (Menu + Ribbon)       │  ← Fixed height
 * ├─────────────────────────────────────┤
 * │                                     │
 * │          GridViewport               │  ← Fills remaining space
 * │                                     │
 * ├─────────────────────────────────────┤
 * │            StatusBar                │  ← Fixed height
 * └─────────────────────────────────────┘
 */

import React, { useCallback, useRef, useState } from 'react';
import { TopBar } from './TopBar';
import { GridViewport } from './GridViewport';
import type { GridViewportHandle } from './GridViewport';
import { StatusBar } from './StatusBar';
import { DEFAULT_RIBBON_STATE, type RibbonState } from './ribbon';
import type { SpreadsheetIntent } from './grid/IntentHandler';
import type { SelectionState } from './grid';
import type { CellFormat } from '../../../engine/core/types/index';

// =============================================================================
// Types
// =============================================================================

export interface SpreadsheetShellProps {
  /** Optional class name for the shell container */
  className?: string;
  /** Called when ribbon requests format application */
  onApplyFormat?: (format: Partial<CellFormat>, selection: SelectionState) => void;
  /** Called when ribbon requests undo/redo */
  onUndoRedo?: (action: 'undo' | 'redo') => void;
  /** Called when ribbon requests clipboard action */
  onClipboard?: (action: 'copy' | 'cut' | 'paste') => void;
  /** Get cell format for a given cell (for ribbon state reflection) */
  getCellFormat?: (row: number, col: number) => Partial<CellFormat>;
  /** Format painter toggle callback */
  onFormatPainterToggle?: () => void;
}

// =============================================================================
// Component
// =============================================================================

export const SpreadsheetShell: React.FC<SpreadsheetShellProps> = ({
  className = '',
  onApplyFormat,
  onUndoRedo,
  onClipboard,
  getCellFormat,
  onFormatPainterToggle,
}) => {
  const gridRef = useRef<GridViewportHandle>(null);
  const selectionRef = useRef<SelectionState>({ activeCell: { row: 0, col: 0 }, ranges: [] });

  const [ribbonState, setRibbonState] = useState<RibbonState>({
    ...DEFAULT_RIBBON_STATE,
    hasSelection: true, // Cell A1 is active on mount
  });

  // =========================================================================
  // GridViewport → Ribbon State Sync
  // =========================================================================

  const handleActiveCellChange = useCallback(
    (row: number, col: number) => {
      const format = getCellFormat?.(row, col) ?? {};
      setRibbonState((prev) => ({
        ...prev,
        activeCellFormat: format,
        hasSelection: true,
      }));
    },
    [getCellFormat],
  );

  const handleSelectionChange = useCallback((selection: SelectionState) => {
    selectionRef.current = selection;
    setRibbonState((prev) => ({
      ...prev,
      hasSelection: selection.activeCell !== null || selection.ranges.length > 0,
    }));
  }, []);

  // =========================================================================
  // Helpers
  // =========================================================================

  /** Re-read active cell format from engine and sync ribbon state */
  const refreshRibbonFormat = useCallback(() => {
    const cell = selectionRef.current.activeCell;
    if (cell && getCellFormat) {
      const format = getCellFormat(cell.row, cell.col);
      setRibbonState((prev) => ({
        ...prev,
        activeCellFormat: format,
      }));
    }
  }, [getCellFormat]);

  // =========================================================================
  // Ribbon Intent Processing
  // =========================================================================

  const handleRibbonIntent = useCallback(
    (intent: SpreadsheetIntent) => {
      switch (intent.type) {
        case 'ApplyFormat': {
          const format = (intent as { format: Partial<CellFormat> }).format;
          onApplyFormat?.(format, selectionRef.current);
          // Optimistically update ribbon state for immediate visual feedback
          setRibbonState((prev) => ({
            ...prev,
            activeCellFormat: { ...prev.activeCellFormat, ...format },
          }));
          gridRef.current?.refresh();
          break;
        }

        case 'UndoRedo': {
          const action = (intent as { action: 'undo' | 'redo' }).action;
          onUndoRedo?.(action);
          gridRef.current?.refresh();
          // Re-read format — undo/redo may have changed the active cell's format
          refreshRibbonFormat();
          break;
        }

        case 'ClipboardAction': {
          const action = (intent as { action: 'copy' | 'cut' | 'paste' }).action;
          onClipboard?.(action);
          if (action === 'paste') {
            gridRef.current?.refresh();
            // Re-read format — paste may overwrite cell format
            refreshRibbonFormat();
          }
          break;
        }

        default:
          break;
      }
    },
    [onApplyFormat, onUndoRedo, onClipboard, refreshRibbonFormat],
  );

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div
      className={`spreadsheet-shell h-full w-full flex flex-col overflow-hidden bg-white ${className}`}
    >
      {/* Top Bar - Menu + Ribbon */}
      <TopBar
        ribbonState={ribbonState}
        onIntent={handleRibbonIntent}
        onFormatPainterToggle={onFormatPainterToggle}
      />

      {/* Main Grid Area - Takes all remaining space */}
      <main className="flex-1 min-h-0 relative">
        <GridViewport
          ref={gridRef}
          onActiveCellChange={handleActiveCellChange}
          onSelectionChange={handleSelectionChange}
        />
      </main>

      {/* Status Bar */}
      <StatusBar />
    </div>
  );
};

export default SpreadsheetShell;
