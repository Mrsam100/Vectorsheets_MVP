/**
 * SpreadsheetContainer - Engine Integration Layer
 *
 * This component creates and manages the SpreadsheetEngine instance,
 * wires up all callbacks, and passes them to SpreadsheetShell.
 *
 * Architecture:
 * App.tsx → SpreadsheetContainer (engine layer) → SpreadsheetShell (UI layer)
 */

import React, { useCallback, useRef, useSyncExternalStore } from 'react';
import { SpreadsheetShell } from './SpreadsheetShell';
import { SpreadsheetEngine } from '../../../engine/core/SpreadsheetEngine';
import type { CellFormat } from '../../../engine/core/types';
import type { SelectionState } from './grid';
import type { FilterDataStore } from '../hooks/useFilterState';
import { EngineDimensionProvider } from '../adapters/EngineDimensionProvider';

export const SpreadsheetContainer: React.FC = () => {
  // Create engine instance (singleton per container)
  const engineRef = useRef<SpreadsheetEngine | null>(null);
  const renderCountRef = useRef(0);

  if (!engineRef.current) {
    engineRef.current = new SpreadsheetEngine({
      viewportWidth: 1200,
      viewportHeight: 800,
      defaultRowHeight: 21,
      defaultColumnWidth: 100,
    });
    console.log('[SpreadsheetContainer] Engine created');
  }

  const engine = engineRef.current;

  // Subscribe to engine state changes (React 18 pattern)
  // This triggers re-render whenever engine.notifyListeners() is called
  const engineVersion = useSyncExternalStore(
    engine.subscribe,
    () => engine.getVersion()
  );

  // Track renders
  renderCountRef.current++;
  console.log(`[SpreadsheetContainer] 🔄 Render #${renderCountRef.current}, Engine v${engineVersion}`);

  // ===========================================================================
  // Cell Value Management
  // ===========================================================================

  const handleCommit = useCallback(
    (row: number, col: number, value: string) => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('[1] ✍️ COMMIT START:', { row, col, value });
      console.log('[2] 📊 Engine version BEFORE:', engine.getVersion());
      console.log('[3] 📄 Cell BEFORE:', engine.getCell(row, col));

      // Use public API to set cell value
      engine.setCellValue(row, col, value);
      // Engine will automatically notify subscribers via notifyListeners()

      console.log('[4] 📊 Engine version AFTER:', engine.getVersion());
      console.log('[5] 📄 Cell AFTER:', engine.getCell(row, col));
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    },
    [engine]
  );

  const handleGetCellValue = useCallback(
    (row: number, col: number): string => {
      // Use public API to get display value (handles formulas)
      const displayValue = engine.getCellDisplayValue(row, col);
      return String(displayValue ?? '');
    },
    [engine]
  );

  // ===========================================================================
  // Formatting Management
  // ===========================================================================

  const handleApplyFormat = useCallback(
    (format: Partial<CellFormat>, selection: SelectionState) => {
      console.log('[SpreadsheetContainer] Applying format:', format, selection);

      // Apply to active cell
      const { activeCell, ranges } = selection;

      if (activeCell) {
        const existingFormat = engine.getCell(activeCell.row, activeCell.col)?.format || {};
        engine.setCellFormat(activeCell.row, activeCell.col, {
          ...existingFormat,
          ...format,
        });
      }

      // Apply to all selected ranges
      for (const range of ranges) {
        for (let row = range.startRow; row <= range.endRow; row++) {
          for (let col = range.startCol; col <= range.endCol; col++) {
            const existingFormat = engine.getCell(row, col)?.format || {};
            engine.setCellFormat(row, col, {
              ...existingFormat,
              ...format,
            });
          }
        }
      }
      // Engine will automatically notify subscribers via notifyListeners()
    },
    [engine]
  );

  const handleGetCellFormat = useCallback(
    (row: number, col: number): Partial<CellFormat> => {
      const cell = engine.getCell(row, col);
      return cell?.format || {};
    },
    [engine]
  );

  // ===========================================================================
  // Clipboard Operations
  // ===========================================================================

  const handleClipboard = useCallback(
    (action: 'copy' | 'cut' | 'paste') => {
      console.log('[SpreadsheetContainer] Clipboard action:', action);
      // TODO: Implement clipboard operations with ClipboardManager
      // For now, just log
    },
    []
  );

  // ===========================================================================
  // Undo/Redo Operations
  // ===========================================================================

  const handleUndoRedo = useCallback(
    (action: 'undo' | 'redo') => {
      console.log('[SpreadsheetContainer] Undo/Redo action:', action);

      const undoRedoManager = engine.getUndoRedoManager();

      if (action === 'undo') {
        undoRedoManager.undo();
      } else {
        undoRedoManager.redo();
      }
      // Undo/redo commands will trigger engine.notifyListeners() when they revert/apply
    },
    [engine]
  );

  // ===========================================================================
  // Format Painter
  // ===========================================================================

  const handleFormatPainterToggle = useCallback(() => {
    console.log('[SpreadsheetContainer] Format painter toggle');
    // TODO: Implement format painter toggle
  }, []);

  // ===========================================================================
  // Create FilterDataStore wrapper
  // ===========================================================================

  const filterDataStore: FilterDataStore = {
    getCell: (row: number, col: number) => {
      const cell = engine.getCell(row, col);
      return cell ? { value: cell.value } : null;
    },
    getUsedRange: () => engine.getUsedRange(),
  };

  // ===========================================================================
  // Create DimensionProvider for rendering
  // ===========================================================================

  // Create fresh dimensionProvider on EVERY render (tied to engineVersion)
  // This ensures GridViewport always gets latest engine data
  // EngineDimensionProvider is a lightweight wrapper, safe to recreate
  const dimensionProvider = new EngineDimensionProvider(engine);
  console.log('[SpreadsheetContainer] 🔧 Created DimensionProvider (render #' + renderCountRef.current + ', engine v' + engineVersion + ')');

  // Log sample cells to verify fresh data
  console.log('[SpreadsheetContainer] 📋 Sample cells from dimensionProvider:');
  for (let i = 0; i < 3; i++) {
    const cell = dimensionProvider.getCell(i, 0);
    console.log(`  [${i},0]:`, cell?.value ?? '(empty)');
  }

  // ===========================================================================
  // Render
  // ===========================================================================

  return (
    <SpreadsheetShell
      dimensionProvider={dimensionProvider}
      onCommit={handleCommit}
      getCellValue={handleGetCellValue}
      onApplyFormat={handleApplyFormat}
      getCellFormat={handleGetCellFormat}
      onClipboard={handleClipboard}
      onUndoRedo={handleUndoRedo}
      onFormatPainterToggle={handleFormatPainterToggle}
      filterManager={engine.getFilterManager()}
      dataStore={filterDataStore}
      undoRedoManager={engine.getUndoRedoManager()}
    />
  );
};
