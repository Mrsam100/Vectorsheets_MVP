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

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { TopBar } from './TopBar';
import { GridViewport } from './GridViewport';
import type { GridViewportHandle } from './GridViewport';
import { StatusBar } from './StatusBar';
import { FindReplaceDialog } from './FindReplaceDialog';
import { SortDialog, type SortRule } from './SortDialog';
import { FilterDropdown } from './grid/FilterDropdown';
import { DataValidationDialog, type ValidationRuleConfig } from './DataValidationDialog';
import { ErrorBanner, type ErrorBannerVariant } from './ErrorBanner';
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog';
import { OnboardingOverlay } from './OnboardingOverlay';
import { DevPerfOverlay } from './DevPerfOverlay';
import { useToast } from './ToastProvider';
import { useOnboarding } from '../hooks/useOnboarding';
import { useFilterState, predicateToValueSet } from '../hooks/useFilterState';
import type { FilterDataStore } from '../hooks/useFilterState';
import type { FilterManager } from '../../../engine/core/filtering/FilterManager';
import type { UndoRedoManager } from '../../../engine/core/history/UndoRedoManager';
import { DEFAULT_RIBBON_STATE, type RibbonState } from './ribbon';
import type { SheetTabInfo } from './SheetTabs';
import type { SpreadsheetIntent } from './grid/IntentHandler';
import type { SelectionState } from './grid';
import type { CellFormat } from '../../../engine/core/types/index';
import type { FindOptions } from '../../../engine/core/operations/FindReplace';
import { A11yProvider } from './A11yProvider';

// =============================================================================
// Utilities
// =============================================================================

/** Convert 0-based column index to Excel-style name (0→A, 25→Z, 26→AA, ...) */
function columnIndexToName(col: number): string {
  let name = '';
  let c = col;
  do {
    name = String.fromCharCode(65 + (c % 26)) + name;
    c = Math.floor(c / 26) - 1;
  } while (c >= 0);
  return name;
}

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
  /** Filter manager from engine (for filter UI integration) */
  filterManager?: FilterManager;
  /** Data store from engine (for filter UI integration) */
  dataStore?: FilterDataStore;
  /** Undo/redo manager from engine (for filter undo support) */
  undoRedoManager?: UndoRedoManager;
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
  filterManager,
  dataStore,
  undoRedoManager,
}) => {
  const gridRef = useRef<GridViewportHandle>(null);
  const selectionRef = useRef<SelectionState>({ activeCell: { row: 0, col: 0 }, ranges: [] });

  const [ribbonState, setRibbonState] = useState<RibbonState>({
    ...DEFAULT_RIBBON_STATE,
    hasSelection: true, // Cell A1 is active on mount
  });

  // New UX subsystem state
  const { toast } = useToast();
  const onboarding = useOnboarding();
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false);
  const [devPerfVisible, setDevPerfVisible] = useState(false);
  const [errorBanner, setErrorBanner] = useState<{
    message: string | null;
    title?: string;
    variant: ErrorBannerVariant;
    visible: boolean;
  }>({ message: null, variant: 'formula-error', visible: false });

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
      // Clear error banner on cell change (future: derive from engine cell error state)
      setErrorBanner((prev) => prev.visible ? { ...prev, visible: false } : prev);
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
      // Shell-level intents not in the core SpreadsheetIntent union
      const intentType = (intent as { type: string }).type;
      if (intentType === 'OpenKeyboardShortcuts') {
        setShortcutsDialogOpen(true);
        return;
      }

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
          toast(action === 'undo' ? 'Undo' : 'Redo', 'info');
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
          toast(
            action === 'copy' ? 'Copied to clipboard' :
            action === 'cut' ? 'Cut to clipboard' : 'Pasted from clipboard',
            'success',
          );
          break;
        }

        case 'InsertRows': {
          const { row: _row, count: _count } = intent as { row: number; count: number; type: string };
          // Forward to GridViewport via its ref
          gridRef.current?.refresh();
          // Engine stub — insert rows via menu
          break;
        }

        case 'InsertColumns': {
          const { col: _col, count: _count } = intent as { col: number; count: number; type: string };
          gridRef.current?.refresh();
          // Engine stub — insert columns via menu
          break;
        }

        case 'DeleteRows': {
          const { startRow: _startRow, endRow: _endRow } = intent as { startRow: number; endRow: number; type: string };
          gridRef.current?.refresh();
          refreshRibbonFormat();
          // Engine stub — delete rows via menu
          break;
        }

        case 'DeleteColumns': {
          const { startCol: _startCol, endCol: _endCol } = intent as { startCol: number; endCol: number; type: string };
          gridRef.current?.refresh();
          refreshRibbonFormat();
          // Engine stub — delete columns via menu
          break;
        }

        default:
          break;
      }
    },
    [onApplyFormat, onUndoRedo, onClipboard, refreshRibbonFormat, toast],
  );

  // =========================================================================
  // Sheet Tab State (temporary — moves to engine workbook manager later)
  // =========================================================================

  const [sheets, setSheets] = useState<SheetTabInfo[]>([
    { id: 'sheet-1', name: 'Sheet1', isActive: true },
  ]);
  const nextSheetId = useRef(2);

  // =========================================================================
  // Sheet Tab Callbacks
  // =========================================================================

  const handleActivateSheet = useCallback((id: string) => {
    setSheets((prev) => prev.map((s) => ({ ...s, isActive: s.id === id })));
    // Future: engine.setActiveSheet(id); gridRef.current?.refresh();
    gridRef.current?.focus();
  }, []);

  const handleAddSheet = useCallback(() => {
    setSheets((prev) => {
      // Find a unique sheet name that doesn't collide with existing names
      let num = nextSheetId.current++;
      const existingNames = new Set(prev.map((s) => s.name.toLowerCase()));
      while (existingNames.has(`sheet${num}`.toLowerCase())) {
        num = nextSheetId.current++;
      }
      const newSheet: SheetTabInfo = {
        id: `sheet-${num}`,
        name: `Sheet${num}`,
        isActive: true,
      };
      return [...prev.map((s) => ({ ...s, isActive: false })), newSheet];
    });
  }, []);

  const handleRenameSheet = useCallback((id: string, newName: string) => {
    setSheets((prev) => {
      // Reject empty/whitespace-only names
      const trimmed = newName.trim();
      if (!trimmed) return prev;
      // Reject duplicate names (case-insensitive match, excluding the sheet being renamed)
      const lower = trimmed.toLowerCase();
      const duplicate = prev.some((s) => s.id !== id && s.name.toLowerCase() === lower);
      if (duplicate) return prev;
      return prev.map((s) => (s.id === id ? { ...s, name: trimmed } : s));
    });
  }, []);

  const handleDeleteSheet = useCallback((id: string) => {
    setSheets((prev) => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex((s) => s.id === id);
      const wasActive = prev[idx]?.isActive;
      const filtered = prev.filter((s) => s.id !== id);
      if (wasActive && filtered.length > 0) {
        const newActiveIdx = Math.min(idx, filtered.length - 1);
        filtered[newActiveIdx] = { ...filtered[newActiveIdx], isActive: true };
      }
      return filtered;
    });
    gridRef.current?.focus();
  }, []);

  const handleReorderSheet = useCallback((id: string, newIndex: number) => {
    setSheets((prev) => {
      const arr = [...prev];
      const oldIdx = arr.findIndex((s) => s.id === id);
      if (oldIdx === -1) return prev;
      // Clamp to valid range
      const clamped = Math.max(0, Math.min(arr.length - 1, newIndex));
      if (oldIdx === clamped) return prev;
      const [item] = arr.splice(oldIdx, 1);
      arr.splice(clamped, 0, item);
      return arr;
    });
  }, []);

  // =========================================================================
  // Grid Context Menu Callbacks
  // =========================================================================

  const handleInsertRows = useCallback((_row: number, _count: number) => {
    // Engine stub — insert rows from context menu
    gridRef.current?.refresh();
  }, []);

  const handleDeleteRows = useCallback((_startRow: number, _endRow: number) => {
    // Engine stub — delete rows from context menu
    gridRef.current?.refresh();
  }, []);

  const handleInsertColumns = useCallback((_col: number, _count: number) => {
    // Engine stub — insert columns from context menu
    gridRef.current?.refresh();
  }, []);

  const handleDeleteColumns = useCallback((_startCol: number, _endCol: number) => {
    // Engine stub — delete columns from context menu
    gridRef.current?.refresh();
  }, []);

  const handleMergeCells = useCallback(() => {
    // Engine stub — merge cells
    gridRef.current?.refresh();
  }, []);

  const handleUnmergeCells = useCallback(() => {
    // Engine stub — unmerge cells
    gridRef.current?.refresh();
  }, []);

  const handleShowFormatDialog = useCallback(() => {
    // Engine stub — show format dialog
  }, []);

  const handleDeleteContents = useCallback(() => {
    // Engine stub — delete cell contents
    gridRef.current?.refresh();
    refreshRibbonFormat();
  }, [refreshRibbonFormat]);

  const handleClipboardFromGrid = useCallback((action: 'copy' | 'cut' | 'paste') => {
    onClipboard?.(action);
    if (action === 'paste') {
      gridRef.current?.refresh();
      refreshRibbonFormat();
    }
    toast(
      action === 'copy' ? 'Copied to clipboard' :
      action === 'cut' ? 'Cut to clipboard' : 'Pasted from clipboard',
      'success',
    );
  }, [onClipboard, refreshRibbonFormat, toast]);

  // =========================================================================
  // Undo/Redo & Format from Grid (keyboard shortcuts)
  // =========================================================================

  const handleUndoRedoFromGrid = useCallback((action: 'undo' | 'redo') => {
    onUndoRedo?.(action);
    gridRef.current?.refresh();
    refreshRibbonFormat();
    toast(action === 'undo' ? 'Undo' : 'Redo', 'info');
  }, [onUndoRedo, refreshRibbonFormat, toast]);

  const handleApplyFormatFromGrid = useCallback((format: Partial<CellFormat>) => {
    onApplyFormat?.(format, selectionRef.current);
    setRibbonState((prev) => ({
      ...prev,
      activeCellFormat: { ...prev.activeCellFormat, ...format },
    }));
    gridRef.current?.refresh();
  }, [onApplyFormat]);

  // =========================================================================
  // Find/Replace State
  // =========================================================================

  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [findReplaceMode, setFindReplaceMode] = useState<'find' | 'replace'>('find');
  const [findMatchCount, setFindMatchCount] = useState(0);
  const [findCurrentIndex, setFindCurrentIndex] = useState(-1);

  // =========================================================================
  // Find/Replace Callbacks
  // =========================================================================

  const handleOpenFindReplace = useCallback((mode: 'find' | 'replace') => {
    // Mutual exclusion: close other panels
    setSortDialogOpen(false);
    filterState?.closeFilter();
    setValidationDialogOpen(false);
    setShortcutsDialogOpen(false);
    setFindReplaceMode(mode);
    setFindReplaceOpen(true);
  }, []);

  const handleCloseFindReplace = useCallback(() => {
    setFindReplaceOpen(false);
    setFindMatchCount(0);
    setFindCurrentIndex(-1);
    // Return keyboard focus to the grid
    gridRef.current?.focus();
  }, []);

  const handleFind = useCallback((_query: string, _options: FindOptions) => {
    // Engine stub — find operation
    // Future: const result = engine.findReplace.findAll(query, options);
    // setFindMatchCount(result.count);
    // setFindCurrentIndex(result.count > 0 ? 0 : -1);
    setFindMatchCount(0);
    setFindCurrentIndex(-1);
  }, []);

  const handleFindNext = useCallback(() => {
    // Engine stub — find next match
    // Future: const match = engine.findReplace.findNext();
    // if (match) gridRef.current?.scrollToCell(match.cell.row, match.cell.col);
    // setFindCurrentIndex(engine.findReplace.getState().currentIndex);
  }, []);

  const handleFindPrevious = useCallback(() => {
    // Engine stub — find previous match
    // Future: const match = engine.findReplace.findPrevious();
    // if (match) gridRef.current?.scrollToCell(match.cell.row, match.cell.col);
    // setFindCurrentIndex(engine.findReplace.getState().currentIndex);
  }, []);

  const handleReplaceCurrent = useCallback((_value: string) => {
    // Engine stub — replace current match
    // Future: engine.findReplace.replaceCurrent(value);
    // gridRef.current?.refresh();
  }, []);

  const handleReplaceAll = useCallback((_query: string, _options: FindOptions, _value: string) => {
    // Engine stub — replace all matches
    // Future: const result = engine.findReplace.replaceAll(query, _options, value);
    // gridRef.current?.refresh();
    // setFindMatchCount(0);
    // setFindCurrentIndex(-1);
  }, []);

  // =========================================================================
  // Sort Dialog State & Callbacks
  // =========================================================================

  const [sortDialogOpen, setSortDialogOpen] = useState(false);

  const handleOpenSortDialog = useCallback(() => {
    // Flush any active cell edit (focus grid → blur editor → confirmEdit)
    gridRef.current?.focus();
    // Mutual exclusion: close other panels
    setFindReplaceOpen(false);
    filterState?.closeFilter();
    setValidationDialogOpen(false);
    setShortcutsDialogOpen(false);
    setSortDialogOpen(true);
  }, []);

  const handleCloseSortDialog = useCallback(() => {
    setSortDialogOpen(false);
    gridRef.current?.focus();
  }, []);

  const handleApplySort = useCallback((_rules: SortRule[], _hasHeader: boolean) => {
    // Engine stub — apply sort
    setSortDialogOpen(false);
    gridRef.current?.refresh();
    gridRef.current?.focus();
    toast('Sort applied', 'success');
  }, [toast]);

  // =========================================================================
  // Filter State Integration
  // =========================================================================

  // Integrate useFilterState if engine props provided, otherwise use stubs
  const filterState = filterManager && dataStore
    ? useFilterState({ filterManager, dataStore, undoRedoManager })
    : null;

  const handleOpenFilterDropdown = useCallback((column: number, anchorRect: { x: number; y: number; width: number; height: number }) => {
    // Flush any active cell edit (focus grid → blur editor → confirmEdit)
    gridRef.current?.focus();
    // Mutual exclusion: close other panels
    setFindReplaceOpen(false);
    setSortDialogOpen(false);
    setValidationDialogOpen(false);
    setShortcutsDialogOpen(false);

    if (filterState) {
      // Use real filter state
      filterState.openFilter(column, new DOMRect(anchorRect.x, anchorRect.y, anchorRect.width, anchorRect.height));
    }
  }, [filterState]);

  const handleCloseFilterDropdown = useCallback(() => {
    if (filterState) {
      filterState.closeFilter();
    }
    gridRef.current?.focus();
  }, [filterState]);

  const handleApplyFilter = useCallback((column: number, selectedValues: Set<string>, includeBlanks: boolean) => {
    if (filterState) {
      try {
        // Use real filter state
        filterState.applyFilter(column, selectedValues, includeBlanks);
        gridRef.current?.refresh();
        gridRef.current?.focus();
        toast('Filter applied', 'success');
      } catch (error) {
        console.error('Failed to apply filter:', error);
        toast('Failed to apply filter', 'error');
      }
    }
  }, [filterState, toast]);

  const handleClearFilter = useCallback((column: number) => {
    if (filterState) {
      // Use real filter state
      filterState.clearFilter(column);
      gridRef.current?.refresh();
      gridRef.current?.focus();
    }
  }, [filterState]);

  const handleClearAllFilters = useCallback(() => {
    if (filterState) {
      filterState.clearAllFilters();
      gridRef.current?.refresh();
      gridRef.current?.focus();
      toast('All filters cleared', 'success');
    }
  }, [filterState, toast]);

  // =========================================================================
  // Data Validation Dialog State & Callbacks
  // =========================================================================

  const [validationDialogOpen, setValidationDialogOpen] = useState(false);

  const handleOpenDataValidation = useCallback(() => {
    // Flush any active cell edit (focus grid → blur editor → confirmEdit)
    gridRef.current?.focus();
    // Mutual exclusion: close other panels
    setFindReplaceOpen(false);
    setSortDialogOpen(false);
    filterState?.closeFilter();
    setShortcutsDialogOpen(false);
    setValidationDialogOpen(true);
  }, []);

  const handleCloseDataValidation = useCallback(() => {
    setValidationDialogOpen(false);
    gridRef.current?.focus();
  }, []);

  const handleApplyValidation = useCallback((_rule: ValidationRuleConfig) => {
    // Engine stub — apply data validation
    setValidationDialogOpen(false);
    gridRef.current?.focus();
  }, []);

  const handleRemoveValidation = useCallback(() => {
    // Engine stub — remove data validation
    setValidationDialogOpen(false);
    gridRef.current?.focus();
  }, []);

  // =========================================================================
  // Keyboard Shortcuts Dialog & Dev Perf Overlay
  // =========================================================================

  const handleCloseShortcutsDialog = useCallback(() => {
    setShortcutsDialogOpen(false);
    gridRef.current?.focus();
  }, []);

  // Global keyboard shortcuts: Ctrl+/ → Keyboard Shortcuts, Ctrl+Shift+P → DevPerf
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+/ or Ctrl+? → Keyboard Shortcuts Dialog
      if ((e.ctrlKey || e.metaKey) && (e.key === '/' || e.key === '?')) {
        e.preventDefault();
        // Mutual exclusion
        setFindReplaceOpen(false);
        setSortDialogOpen(false);
        filterState?.closeFilter();
        setValidationDialogOpen(false);
        setShortcutsDialogOpen((prev) => !prev);
        return;
      }

      // Ctrl+Shift+P → Dev Performance Overlay (dev only)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setDevPerfVisible((prev) => !prev);
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <A11yProvider>
    <div
      className={`spreadsheet-shell h-full w-full flex flex-col overflow-hidden ${className}`}
      style={{ backgroundColor: 'var(--color-bg-primary)' }}
    >
      {/* Skip navigation link */}
      <a className="skip-nav" href="#grid-main">
        Skip to spreadsheet
      </a>

      {/* Top Bar - Menu + Ribbon */}
      <TopBar
        ribbonState={ribbonState}
        onIntent={handleRibbonIntent}
        onFormatPainterToggle={onFormatPainterToggle}
      />

      {/* Error / Validation Banner */}
      <ErrorBanner
        message={errorBanner.message}
        title={errorBanner.title}
        variant={errorBanner.variant}
        visible={errorBanner.visible}
      />

      {/* Main Grid Area - Takes all remaining space */}
      <main id="grid-main" tabIndex={-1} className="flex-1 min-h-0 relative">
        <GridViewport
          ref={gridRef}
          onActiveCellChange={handleActiveCellChange}
          onSelectionChange={handleSelectionChange}
          onInsertRows={handleInsertRows}
          onDeleteRows={handleDeleteRows}
          onInsertColumns={handleInsertColumns}
          onDeleteColumns={handleDeleteColumns}
          onMergeCells={handleMergeCells}
          onUnmergeCells={handleUnmergeCells}
          onShowFormatDialog={handleShowFormatDialog}
          onDeleteContents={handleDeleteContents}
          onClipboard={handleClipboardFromGrid}
          onUndoRedo={handleUndoRedoFromGrid}
          onApplyFormat={handleApplyFormatFromGrid}
          onOpenFindReplace={handleOpenFindReplace}
          onOpenSortDialog={handleOpenSortDialog}
          onOpenFilterDropdown={handleOpenFilterDropdown}
          isColumnFiltered={filterState?.isColumnFiltered}
          onClearAllFilters={filterState ? handleClearAllFilters : undefined}
          onOpenDataValidation={handleOpenDataValidation}
        />
      </main>

      {/* Find/Replace Dialog — always mounted so internal state (query) persists */}
      <FindReplaceDialog
        isOpen={findReplaceOpen}
        mode={findReplaceMode}
        matchCount={findMatchCount}
        currentMatchIndex={findCurrentIndex}
        onFind={handleFind}
        onFindNext={handleFindNext}
        onFindPrevious={handleFindPrevious}
        onReplaceCurrent={handleReplaceCurrent}
        onReplaceAll={handleReplaceAll}
        onClose={handleCloseFindReplace}
      />

      {/* Sort Dialog */}
      <SortDialog
        isOpen={sortDialogOpen}
        columnCount={26}
        getColumnName={columnIndexToName}
        onApply={handleApplySort}
        onClose={handleCloseSortDialog}
      />

      {/* Filter Dropdown */}
      {filterState?.dropdownState.isOpen && filterState.dropdownState.column !== null && (
        <FilterDropdown
          isOpen={filterState.dropdownState.isOpen}
          column={filterState.dropdownState.column}
          anchorRect={{
            x: filterState.dropdownState.anchorRect?.x ?? 0,
            y: filterState.dropdownState.anchorRect?.y ?? 0,
            width: filterState.dropdownState.anchorRect?.width ?? 0,
            height: filterState.dropdownState.anchorRect?.height ?? 0,
          }}
          columnName={columnIndexToName(filterState.dropdownState.column)}
          uniqueValues={filterState.getUniqueValues(filterState.dropdownState.column)}
          currentFilter={(() => {
            const predicate = filterState.activeFilters.get(filterState.dropdownState.column!);
            const valueSet = predicateToValueSet(predicate);
            if (!valueSet) return null;

            // CRITICAL: Add empty string to Set if blanks should be included
            // FilterDropdown checks currentFilter.has('') to determine blanks checkbox state
            if (valueSet.includeBlanks) {
              const result = new Set(valueSet.values);
              result.add('');
              return result;
            }
            return valueSet.values;
          })()}
          onApply={(col, values, blanks) => {
            handleApplyFilter(col, values, blanks);
          }}
          onClear={(col) => {
            handleClearFilter(col);
          }}
          onClose={handleCloseFilterDropdown}
        />
      )}

      {/* Data Validation Dialog */}
      <DataValidationDialog
        isOpen={validationDialogOpen}
        initialRule={null}
        onApply={handleApplyValidation}
        onRemove={handleRemoveValidation}
        onClose={handleCloseDataValidation}
      />

      {/* Status Bar */}
      <StatusBar
        sheets={sheets}
        onActivateSheet={handleActivateSheet}
        onAddSheet={handleAddSheet}
        onRenameSheet={handleRenameSheet}
        onDeleteSheet={handleDeleteSheet}
        onReorderSheet={handleReorderSheet}
        totalRows={filterState?.getTotalRowCount()}
        filteredRows={filterState?.getFilteredRowCount()}
        onClearAllFilters={filterState ? handleClearAllFilters : undefined}
      />

      {/* Keyboard Shortcuts Dialog */}
      <KeyboardShortcutsDialog
        isOpen={shortcutsDialogOpen}
        onClose={handleCloseShortcutsDialog}
      />

      {/* Onboarding Overlay */}
      {onboarding.isActive && <OnboardingOverlay onboarding={onboarding} />}

      {/* Dev Performance Overlay (tree-shaken in production) */}
      {!import.meta.env.PROD && <DevPerfOverlay visible={devPerfVisible} />}
    </div>
    </A11yProvider>
  );
};

export default SpreadsheetShell;
